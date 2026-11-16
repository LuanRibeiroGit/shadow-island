//! Game State Manager / ingestion engine. Applies normalized events to agents,
//! sessions, missions, encounters and usage, persists everything in one SQLite
//! transaction per event, and returns the list of changes for the UI.

use std::collections::{HashMap, HashSet, VecDeque};
use std::path::{Path, PathBuf};

use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;

use crate::agents::{self, main_key, sub_key, Agent, AgentManager};
use crate::classify::specialty_for_agent_type;
use crate::db::{self, now_ms};
use crate::encounters::{self, Encounter};
use crate::error::CoreResult;
use crate::event::{Envelope, HookEventName};
use crate::missions::{self, Mission, MissionKind, MissionStatus};
use crate::model::{AgentSpecialty, AgentState};
use crate::normalize::{normalize, NormalizeOptions, NormalizedEvent};
use crate::usage;

#[derive(Debug, Clone, Default)]
pub struct EngineConfig {
    pub normalize: NormalizeOptions,
    /// Directories transcripts may be read from (default: `~/.claude`).
    pub transcript_roots: Vec<PathBuf>,
    /// User overrides: subagent type name -> specialty.
    pub specialty_overrides: HashMap<String, AgentSpecialty>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    pub project_id: Option<i64>,
    pub project_name: Option<String>,
    pub cwd: Option<String>,
    pub model: Option<String>,
    pub source: Option<String>,
    pub title: Option<String>,
    pub started_at: i64,
    pub ended_at: Option<i64>,
    pub end_reason: Option<String>,
    pub last_event_at: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EventRecord {
    pub id: i64,
    pub session_id: String,
    pub agent_id: Option<String>,
    pub mission_id: Option<i64>,
    pub event_name: String,
    pub tool_name: Option<String>,
    pub category: Option<String>,
    pub detail: Option<String>,
    pub is_failure: bool,
    pub fired_at: i64,
}

/// A change the UI should apply. Serialized as `{ "type": "...", ...payload }`.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Update {
    Agent { agent: Agent },
    Session { session: Session },
    Mission { mission: Mission },
    Encounter { encounter: Encounter },
    Event { event: EventRecord },
    Usage { session_id: String },
    /// The user removed an agent from the crew.
    AgentRemoved { id: String },
}

#[derive(Debug, Default)]
pub struct IngestOutcome {
    pub duplicate: bool,
    pub updates: Vec<Update>,
}

pub struct Engine {
    conn: Connection,
    agents: AgentManager,
    cfg: EngineConfig,
    /// FIFO of `Agent` tool descriptions waiting for their `SubagentStart`, keyed by
    /// (session, subagent type).
    pending_spawns: HashMap<(String, String), VecDeque<String>>,
    /// Recently finished tool_use_ids per agent, to ignore a `PreToolUse` delivered
    /// after its `PostToolUse` (async hooks may arrive out of order).
    finished_tools: VecDeque<String>,
    finished_set: HashSet<String>,
}

const FINISHED_TOOLS_CAP: usize = 512;

impl Engine {
    pub fn open(path: &Path, cfg: EngineConfig) -> CoreResult<Self> {
        Self::with_connection(db::open(path)?, cfg)
    }

    pub fn in_memory(cfg: EngineConfig) -> CoreResult<Self> {
        Self::with_connection(db::open_in_memory()?, cfg)
    }

    pub fn with_connection(conn: Connection, cfg: EngineConfig) -> CoreResult<Self> {
        let mut agents = AgentManager::new();
        agents.load_active(&conn)?;
        Ok(Self {
            conn,
            agents,
            cfg,
            pending_spawns: HashMap::new(),
            finished_tools: VecDeque::new(),
            finished_set: HashSet::new(),
        })
    }

    pub fn conn(&self) -> &Connection {
        &self.conn
    }

    pub fn config_mut(&mut self) -> &mut EngineConfig {
        &mut self.cfg
    }

    /// The user changed an agent's function. Returns the updated agent, or `None`
    /// when no such agent exists.
    pub fn set_agent_specialty(&mut self, id: &str, specialty: AgentSpecialty) -> CoreResult<Option<Agent>> {
        let at = now_ms();
        if let Some(a) = self.agents.get_mut(id) {
            a.specialty = specialty;
            a.updated_at = a.updated_at.max(at);
        }
        self.conn.execute(
            "UPDATE agents SET specialty = ?2, updated_at = MAX(updated_at, ?3) WHERE id = ?1",
            params![id, specialty.as_str(), at],
        )?;
        Ok(self
            .conn
            .query_row(&format!("SELECT {} FROM agents WHERE id = ?1", agents::COLS), params![id], agents::row_to_agent)
            .optional()?)
    }

    /// The user removed an agent: its row and per-agent statistics go away; events
    /// and usage it produced stay in the session history. Returns whether it existed.
    pub fn delete_agent(&mut self, id: &str) -> CoreResult<bool> {
        self.agents.forget(id);
        Ok(self.conn.execute("DELETE FROM agents WHERE id = ?1", params![id])? > 0)
    }

    pub fn active_agents(&self) -> Vec<Agent> {
        let mut v: Vec<Agent> = self.agents.active().cloned().collect();
        v.sort_by(|a, b| a.started_at.cmp(&b.started_at));
        v
    }

    /// Ingest one envelope. Duplicates (same envelope id) are ignored.
    pub fn ingest(&mut self, env: &Envelope) -> CoreResult<IngestOutcome> {
        let exists: bool = self.conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM events WHERE envelope_id = ?1)",
            params![env.id],
            |r| r.get(0),
        )?;
        if exists {
            return Ok(IngestOutcome { duplicate: true, updates: vec![] });
        }
        let ev = normalize(env, &self.cfg.normalize);
        let mut updates = Vec::new();
        self.conn.execute_batch("BEGIN IMMEDIATE")?;
        match self.apply(&ev, &mut updates) {
            Ok(()) => self.conn.execute_batch("COMMIT")?,
            Err(e) => {
                let _ = self.conn.execute_batch("ROLLBACK");
                // In-memory cache may now be ahead of the DB: reload it.
                self.agents = AgentManager::new();
                self.agents.load_active(&self.conn)?;
                return Err(e);
            }
        }
        Ok(IngestOutcome { duplicate: false, updates })
    }

    fn apply(&mut self, ev: &NormalizedEvent, out: &mut Vec<Update>) -> CoreResult<()> {
        let at = if ev.fired_at_ms > 0 { ev.fired_at_ms } else { now_ms() };
        let session = self.ensure_session(ev, at)?;
        let project_id = session.project_id;

        // Resolve the agent this event belongs to.
        let main = self.agents.ensure_main(&self.conn, &ev.session_id, ev.cwd.as_deref(), at)?.id.clone();
        let target = match (&ev.kind, &ev.agent_id) {
            (HookEventName::SessionStart | HookEventName::SessionEnd, _) => main.clone(),
            (HookEventName::SubagentStop, Some(id)) if !self.agent_known(&ev.session_id, id)? && ev.agent_type.as_deref().unwrap_or("").is_empty() => {
                // Internal agents (prompt suggestions, /btw) also fire SubagentStop with
                // an empty agent_type and no SubagentStart: log only.
                self.log_event(ev, Some(&main), None, at, out)?;
                return Ok(());
            }
            (_, Some(id)) => {
                let specialty = self.specialty_for(ev.agent_type.as_deref());
                self.agents
                    .ensure_sub(&self.conn, &ev.session_id, id, ev.agent_type.as_deref(), specialty, ev.cwd.as_deref(), at)?
                    .id
                    .clone()
            }
            (_, None) => main.clone(),
        };

        let mut mission_for_event: Option<i64> = None;
        let mut touched_agents: Vec<String> = vec![target.clone()];
        let ended = self.agents.get(&target).map(|a| a.ended_at.is_some()).unwrap_or(false);
        let revives = matches!(ev.kind, HookEventName::SessionStart | HookEventName::SubagentStart | HookEventName::UserPromptSubmit);
        if ended && !revives {
            // Late event for an agent that already finished: record it, change nothing.
            self.log_event(ev, Some(&target), None, at, out)?;
            self.agents.forget(&target);
            return Ok(());
        }

        match ev.kind {
            HookEventName::SessionStart => {
                let a = self.agents.get_mut(&target).expect("agent ensured");
                a.ended_at = None;
                agents::transition(&self.conn, a, AgentState::Idle, None, at)?;
            }
            HookEventName::SessionEnd => {
                for key in self.agents.session_agents(&ev.session_id) {
                    self.finish_agent(&key, at, None, out)?;
                    if key != target {
                        touched_agents.push(key);
                    }
                }
                for m in missions::interrupt_session(&self.conn, &ev.session_id, at)? {
                    out.push(Update::Mission { mission: m });
                }
            }
            HookEventName::UserPromptSubmit => {
                let title = ev.prompt_excerpt.clone().unwrap_or_else(|| "Nova missão".to_string());
                let m = missions::open(&self.conn, &ev.session_id, Some(&target), project_id, MissionKind::Prompt, &ev.envelope_id, &title, None, at)?;
                mission_for_event = Some(m.id);
                let a = self.agents.get_mut(&target).expect("agent ensured");
                a.ended_at = None;
                a.task = Some(title);
                agents::transition(&self.conn, a, AgentState::Running, None, at)?;
                out.push(Update::Mission { mission: m });
            }
            HookEventName::PreToolUse => {
                if let Some(id) = &ev.tool_use_id {
                    if self.finished_set.contains(id) {
                        self.log_event(ev, Some(&target), None, at, out)?;
                        return Ok(());
                    }
                }
                if let (Some(t), Some(d)) = (&ev.spawn_subagent_type, &ev.spawn_description) {
                    self.pending_spawns.entry((ev.session_id.clone(), t.clone())).or_default().push_back(d.clone());
                }
                let cat = ev.category.unwrap_or(crate::model::ActivityCategory::Other);
                let in_combat = encounters::active_for_agent(&self.conn, &target)?;
                let a = self.agents.get_mut(&target).expect("agent ensured");
                a.current_tool = ev.tool_name.clone();
                a.detail = ev.detail.clone();
                let state = if in_combat { AgentState::Combat } else { cat.working_state() };
                agents::transition(&self.conn, a, state, Some(cat), at)?;
                self.conn.execute("UPDATE agent_statistics SET tool_count = tool_count + 1 WHERE agent_id = ?1", params![target])?;
            }
            HookEventName::PostToolUse => {
                self.remember_finished(ev);
                for e in encounters::on_success(&self.conn, &target, ev, at)? {
                    self.conn.execute("UPDATE agent_statistics SET monsters_defeated = monsters_defeated + 1 WHERE agent_id = ?1", params![target])?;
                    out.push(Update::Encounter { encounter: e });
                }
                let in_combat = encounters::active_for_agent(&self.conn, &target)?;
                let a = self.agents.get_mut(&target).expect("agent ensured");
                a.current_tool = None;
                if a.state == AgentState::Combat && !in_combat {
                    let cat = a.activity;
                    let st = cat.map(|c| c.working_state()).unwrap_or(AgentState::Running);
                    agents::transition(&self.conn, a, st, cat, at)?;
                }
                if ev.tool_name.as_deref() == Some("Agent") {
                    self.ingest_usage(ev, &target, out);
                }
            }
            HookEventName::PostToolUseFailure => {
                self.remember_finished(ev);
                let a = self.agents.get_mut(&target).expect("agent ensured");
                a.current_tool = None;
                if ev.is_failure {
                    let cat = a.activity;
                    agents::transition(&self.conn, a, AgentState::Combat, cat, at)?;
                    self.conn.execute(
                        "UPDATE agent_statistics SET tool_failures = tool_failures + 1 WHERE agent_id = ?1",
                        params![target],
                    )?;
                    let e = encounters::open(&self.conn, &target, &ev.session_id, ev, at)?;
                    out.push(Update::Encounter { encounter: e });
                }
            }
            HookEventName::SubagentStart => {
                let desc = ev
                    .agent_type
                    .as_ref()
                    .and_then(|t| self.pending_spawns.get_mut(&(ev.session_id.clone(), t.clone())))
                    .and_then(VecDeque::pop_front);
                let title = desc.clone().or_else(|| ev.agent_type.clone()).unwrap_or_else(|| "Subagente".into());
                let m = missions::open(
                    &self.conn,
                    &ev.session_id,
                    Some(&target),
                    project_id,
                    MissionKind::Subagent,
                    ev.agent_id.as_deref().unwrap_or(""),
                    &title,
                    ev.agent_type.as_deref(),
                    at,
                )?;
                mission_for_event = Some(m.id);
                out.push(Update::Mission { mission: m });
                let a = self.agents.get_mut(&target).expect("agent ensured");
                a.ended_at = None;
                if desc.is_some() || a.task.is_none() {
                    a.task = Some(title);
                }
                agents::transition(&self.conn, a, AgentState::Running, None, at)?;
            }
            HookEventName::SubagentStop => {
                if let Some(m) = missions::close(&self.conn, &ev.session_id, MissionKind::Subagent, ev.agent_id.as_deref().unwrap_or(""), MissionStatus::Completed, at)? {
                    mission_for_event = Some(m.id);
                    out.push(Update::Mission { mission: m });
                }
                self.ingest_usage(ev, &target, out);
                self.finish_agent(&target, at, Some(AgentState::Success), out)?;
                touched_agents.clear();
            }
            HookEventName::Stop => {
                if let Some(m) = missions::current_prompt(&self.conn, &ev.session_id)? {
                    if let Some(m) = missions::close(&self.conn, &ev.session_id, MissionKind::Prompt, &m.external_id, MissionStatus::Completed, at)? {
                        mission_for_event = Some(m.id);
                        out.push(Update::Mission { mission: m });
                    }
                }
                self.ingest_usage(ev, &target, out);
                for e in encounters::on_agent_end(&self.conn, &target, at)? {
                    out.push(Update::Encounter { encounter: e });
                }
                let state = if ev.has_background_work { AgentState::Waiting } else { AgentState::Success };
                let a = self.agents.get_mut(&target).expect("agent ensured");
                a.current_tool = None;
                agents::transition(&self.conn, a, state, None, at)?;
            }
            HookEventName::StopFailure => {
                if let Some(m) = missions::current_prompt(&self.conn, &ev.session_id)? {
                    if let Some(m) = missions::close(&self.conn, &ev.session_id, MissionKind::Prompt, &m.external_id, MissionStatus::Error, at)? {
                        mission_for_event = Some(m.id);
                        out.push(Update::Mission { mission: m });
                    }
                }
                self.conn.execute("UPDATE agent_statistics SET errors = errors + 1 WHERE agent_id = ?1", params![target])?;
                self.ingest_usage(ev, &target, out);
                let a = self.agents.get_mut(&target).expect("agent ensured");
                a.current_tool = None;
                agents::transition(&self.conn, a, AgentState::Error, None, at)?;
            }
            HookEventName::Notification => {
                let waiting = matches!(
                    ev.notification_type.as_deref(),
                    Some("permission_prompt" | "elicitation_dialog" | "elicitation_url_dialog" | "agent_needs_input")
                );
                let a = self.agents.get_mut(&target).expect("agent ensured");
                if waiting {
                    let cat = a.activity;
                    agents::transition(&self.conn, a, AgentState::Waiting, cat, at)?;
                } else if ev.notification_type.as_deref() == Some("idle_prompt") {
                    agents::transition(&self.conn, a, AgentState::Idle, None, at)?;
                }
                if waiting {
                    if let Some(m) = missions::current_prompt(&self.conn, &ev.session_id)? {
                        missions::set_status(&self.conn, m.id, MissionStatus::Waiting)?;
                        if let Some(m) = missions::by_id(&self.conn, m.id)? {
                            out.push(Update::Mission { mission: m });
                        }
                    }
                }
            }
            HookEventName::TaskCreated => {
                if let Some(task_id) = &ev.task_id {
                    let title = ev.task_subject.clone().unwrap_or_else(|| "Tarefa".into());
                    let m = missions::open(&self.conn, &ev.session_id, Some(&target), project_id, MissionKind::Task, task_id, &title, None, at)?;
                    mission_for_event = Some(m.id);
                    out.push(Update::Mission { mission: m });
                }
            }
            HookEventName::TaskCompleted => {
                if let Some(task_id) = &ev.task_id {
                    if missions::get(&self.conn, &ev.session_id, MissionKind::Task, task_id)?.is_none() {
                        let title = ev.task_subject.clone().unwrap_or_else(|| "Tarefa".into());
                        missions::open(&self.conn, &ev.session_id, Some(&target), project_id, MissionKind::Task, task_id, &title, None, at)?;
                    }
                    if let Some(m) = missions::close(&self.conn, &ev.session_id, MissionKind::Task, task_id, MissionStatus::Completed, at)? {
                        mission_for_event = Some(m.id);
                        self.conn.execute("UPDATE agent_statistics SET tasks_completed = tasks_completed + 1 WHERE agent_id = ?1", params![target])?;
                        out.push(Update::Mission { mission: m });
                    }
                }
            }
            _ => {}
        }

        // Main agent mission pointer for events without their own mission.
        if mission_for_event.is_none() {
            mission_for_event = missions::current_prompt(&self.conn, &ev.session_id)?.map(|m| m.id);
        }

        for key in touched_agents {
            if let Some(a) = self.agents.get_mut(&key) {
                a.updated_at = at.max(a.updated_at);
                a.last_event = Some(ev.event_name.clone());
                let snapshot = a.clone();
                agents::persist(&self.conn, &snapshot)?;
                out.push(Update::Agent { agent: snapshot });
            }
        }
        self.log_event(ev, Some(&target), mission_for_event, at, out)?;
        if let Some(s) = self.session(&ev.session_id)? {
            out.push(Update::Session { session: s });
        }
        Ok(())
    }

    fn agent_known(&self, session_id: &str, agent_id: &str) -> CoreResult<bool> {
        let key = sub_key(session_id, agent_id);
        if self.agents.get(&key).is_some() {
            return Ok(true);
        }
        Ok(self.conn.query_row("SELECT EXISTS(SELECT 1 FROM agents WHERE id = ?1)", params![key], |r| r.get(0))?)
    }

    fn specialty_for(&self, agent_type: Option<&str>) -> AgentSpecialty {
        let Some(t) = agent_type else { return AgentSpecialty::General };
        if let Some(s) = self.cfg.specialty_overrides.get(t) {
            return *s;
        }
        specialty_for_agent_type(t)
    }

    fn remember_finished(&mut self, ev: &NormalizedEvent) {
        if let Some(id) = &ev.tool_use_id {
            if self.finished_set.insert(id.clone()) {
                self.finished_tools.push_back(id.clone());
                if self.finished_tools.len() > FINISHED_TOOLS_CAP {
                    if let Some(old) = self.finished_tools.pop_front() {
                        self.finished_set.remove(&old);
                    }
                }
            }
        }
    }

    fn finish_agent(&mut self, key: &str, at: i64, final_state: Option<AgentState>, out: &mut Vec<Update>) -> CoreResult<()> {
        for e in encounters::on_agent_end(&self.conn, key, at)? {
            out.push(Update::Encounter { encounter: e });
        }
        if let Some(a) = self.agents.get_mut(key) {
            if let Some(st) = final_state {
                agents::transition(&self.conn, a, st, None, at)?;
            } else if a.state != AgentState::Success && a.state != AgentState::Error {
                agents::transition(&self.conn, a, AgentState::Idle, None, at)?;
            }
            agents::close_activity(&self.conn, key, at)?;
            a.current_tool = None;
            a.ended_at = Some(at);
            a.updated_at = at.max(a.updated_at);
            let snapshot = a.clone();
            agents::persist(&self.conn, &snapshot)?;
            if !snapshot.is_main {
                self.conn.execute(
                    "UPDATE agent_statistics SET tasks_completed = tasks_completed + 1 WHERE agent_id = ?1 AND ?2",
                    params![key, final_state == Some(AgentState::Success)],
                )?;
            }
            out.push(Update::Agent { agent: snapshot });
        }
        self.agents.forget(key);
        Ok(())
    }

    fn ingest_usage(&mut self, ev: &NormalizedEvent, agent_key: &str, out: &mut Vec<Update>) {
        let (path, key) = match (&ev.agent_transcript_path, &ev.agent_id) {
            (Some(p), Some(_)) => (p.clone(), agent_key.to_string()),
            _ => match &ev.transcript_path {
                Some(p) => (p.clone(), main_key(&ev.session_id)),
                None => return,
            },
        };
        let path = expand_tilde(&path);
        if !usage::is_allowed_path(&path, &self.cfg.transcript_roots) {
            log::debug!("transcript outside allowed roots, skipped");
            return;
        }
        match usage::ingest_transcript(&self.conn, &path, &ev.session_id, &key, now_ms()) {
            Ok(n) if n > 0 => out.push(Update::Usage { session_id: ev.session_id.clone() }),
            Ok(_) => {}
            Err(e) => log::warn!("transcript usage read failed: {e}"),
        }
    }

    fn ensure_session(&mut self, ev: &NormalizedEvent, at: i64) -> CoreResult<Session> {
        let project_id = match ev.cwd.as_deref() {
            Some(cwd) => Some(self.ensure_project(cwd, at)?),
            None => None,
        };
        self.conn.execute(
            "INSERT INTO sessions(id, project_id, cwd, model, source, title, started_at, last_event_at, transcript_path)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7, ?8)
             ON CONFLICT(id) DO UPDATE SET
                project_id = COALESCE(sessions.project_id, excluded.project_id),
                cwd = COALESCE(sessions.cwd, excluded.cwd),
                model = COALESCE(excluded.model, sessions.model),
                title = COALESCE(excluded.title, sessions.title),
                started_at = MIN(sessions.started_at, excluded.started_at),
                last_event_at = MAX(sessions.last_event_at, excluded.last_event_at),
                transcript_path = COALESCE(sessions.transcript_path, excluded.transcript_path)",
            params![
                ev.session_id,
                project_id,
                ev.cwd,
                ev.model,
                if ev.kind == HookEventName::SessionStart { ev.source.clone() } else { None },
                ev.session_title,
                at,
                ev.transcript_path
            ],
        )?;
        match ev.kind {
            HookEventName::SessionStart => {
                self.conn.execute(
                    "UPDATE sessions SET ended_at = NULL, end_reason = NULL, source = COALESCE(?2, source) WHERE id = ?1",
                    params![ev.session_id, ev.source],
                )?;
            }
            HookEventName::SessionEnd => {
                self.conn.execute(
                    "UPDATE sessions SET ended_at = ?2, end_reason = ?3 WHERE id = ?1",
                    params![ev.session_id, at, ev.source],
                )?;
            }
            HookEventName::UserPromptSubmit => {
                // A prompt in an ended session means it was resumed.
                self.conn.execute("UPDATE sessions SET ended_at = NULL, end_reason = NULL WHERE id = ?1", params![ev.session_id])?;
            }
            _ => {}
        }
        Ok(self.session(&ev.session_id)?.expect("session upserted"))
    }

    fn ensure_project(&self, cwd: &str, at: i64) -> CoreResult<i64> {
        let name = cwd.trim_end_matches(['/', '\\']).rsplit(['/', '\\']).next().filter(|s| !s.is_empty()).unwrap_or(cwd);
        self.conn.execute(
            "INSERT INTO projects(path, name, first_seen, last_seen) VALUES (?1, ?2, ?3, ?3)
             ON CONFLICT(path) DO UPDATE SET last_seen = MAX(projects.last_seen, excluded.last_seen)",
            params![cwd, name, at],
        )?;
        Ok(self.conn.query_row("SELECT id FROM projects WHERE path = ?1", params![cwd], |r| r.get(0))?)
    }

    pub fn session(&self, id: &str) -> CoreResult<Option<Session>> {
        Ok(self
            .conn
            .query_row(
                "SELECT s.id, s.project_id, p.name, s.cwd, s.model, s.source, s.title, s.started_at, s.ended_at, s.end_reason, s.last_event_at
                 FROM sessions s LEFT JOIN projects p ON p.id = s.project_id WHERE s.id = ?1",
                params![id],
                |r| {
                    Ok(Session {
                        id: r.get(0)?,
                        project_id: r.get(1)?,
                        project_name: r.get(2)?,
                        cwd: r.get(3)?,
                        model: r.get(4)?,
                        source: r.get(5)?,
                        title: r.get(6)?,
                        started_at: r.get(7)?,
                        ended_at: r.get(8)?,
                        end_reason: r.get(9)?,
                        last_event_at: r.get(10)?,
                    })
                },
            )
            .optional()?)
    }

    fn log_event(&self, ev: &NormalizedEvent, agent: Option<&str>, mission: Option<i64>, at: i64, out: &mut Vec<Update>) -> CoreResult<()> {
        let data = serde_json::json!({
            "agentType": ev.agent_type,
            "notificationType": ev.notification_type,
            "taskId": ev.task_id,
            "taskSubject": ev.task_subject,
            "source": ev.source,
            "errorKind": ev.error_kind,
            "durationMs": ev.duration_ms,
            "isInterrupt": ev.is_interrupt,
            "model": ev.model,
        });
        self.conn.execute(
            "INSERT INTO events(envelope_id, session_id, agent_id, mission_id, event_name, tool_name, tool_use_id, category, detail,
                                is_failure, fired_at, received_at, data)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            params![
                ev.envelope_id,
                ev.session_id,
                agent,
                mission,
                ev.event_name,
                ev.tool_name,
                ev.tool_use_id,
                ev.category.map(|c| c.as_str()),
                ev.detail,
                ev.is_failure,
                at,
                now_ms(),
                data.to_string()
            ],
        )?;
        out.push(Update::Event {
            event: EventRecord {
                id: self.conn.last_insert_rowid(),
                session_id: ev.session_id.clone(),
                agent_id: agent.map(str::to_string),
                mission_id: mission,
                event_name: ev.event_name.clone(),
                tool_name: ev.tool_name.clone(),
                category: ev.category.map(|c| c.as_str().to_string()),
                detail: ev.detail.clone(),
                is_failure: ev.is_failure,
                fired_at: at,
            },
        });
        Ok(())
    }
}

fn expand_tilde(p: &str) -> PathBuf {
    if let Some(rest) = p.strip_prefix("~/").or_else(|| p.strip_prefix("~\\")) {
        if let Some(home) = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")) {
            return PathBuf::from(home).join(rest);
        }
    }
    PathBuf::from(p)
}
