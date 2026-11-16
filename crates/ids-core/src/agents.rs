//! Agent Manager: one record per real agent (main agent of a session, or subagent).
//!
//! Identity rules (see docs/adr/0002-agent-identity.md):
//! - main agent key   = `{session_id}#main`
//! - subagent key     = `{session_id}#{agent_id}` (agent_id from hook input)
//! Events carrying `agent_id` belong to that subagent; events without it belong to
//! the main agent. This makes duplicates impossible for the same agent.

use std::collections::HashMap;

use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::Serialize;

use crate::error::CoreResult;
use crate::model::{ActivityCategory, AgentSpecialty, AgentState, Room};

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Agent {
    pub id: String,
    pub session_id: String,
    pub parent_id: Option<String>,
    pub agent_id: Option<String>,
    pub agent_type: Option<String>,
    pub specialty: AgentSpecialty,
    pub is_main: bool,
    pub name: String,
    pub cwd: Option<String>,
    pub state: AgentState,
    pub activity: Option<ActivityCategory>,
    pub current_tool: Option<String>,
    pub detail: Option<String>,
    pub task: Option<String>,
    pub room: Room,
    pub started_at: i64,
    pub updated_at: i64,
    pub ended_at: Option<i64>,
    pub last_event: Option<String>,
}

pub fn main_key(session_id: &str) -> String {
    format!("{session_id}#main")
}

pub fn sub_key(session_id: &str, agent_id: &str) -> String {
    format!("{session_id}#{agent_id}")
}

/// Original names for the spectral crew. Picked deterministically from the agent
/// key so the same agent always gets the same name.
const NAMES: &[&str] = &[
    "Vesperina", "Morvan", "Lúgubre", "Ondina", "Corvalho", "Brumelia", "Tálio", "Sombrino",
    "Nevoá", "Aurelio Pálido", "Lanterneira", "Cinzano", "Velária", "Grimaldo", "Marésia", "Ossandro",
    "Lumínia", "Bruno das Brumas", "Ébano", "Serafina Fria",
];

pub fn name_for(key: &str, is_main: bool) -> String {
    if is_main {
        return "Guardiã da Lanterna".to_string();
    }
    let h = key.bytes().fold(0u32, |acc, b| acc.wrapping_mul(31).wrapping_add(b as u32));
    NAMES[(h as usize) % NAMES.len()].to_string()
}

/// In-memory cache of agents that have not ended, backed by the `agents` table.
#[derive(Default)]
pub struct AgentManager {
    active: HashMap<String, Agent>,
    /// Max agents kept in memory; ended agents are evicted first.
    capacity: usize,
}

impl AgentManager {
    pub fn new() -> Self {
        Self { active: HashMap::new(), capacity: 256 }
    }

    /// Load agents that were active when the app last stopped.
    pub fn load_active(&mut self, conn: &Connection) -> CoreResult<()> {
        let mut stmt = conn.prepare(&format!("SELECT {COLS} FROM agents WHERE ended_at IS NULL ORDER BY updated_at DESC LIMIT 256"))?;
        let rows = stmt.query_map([], row_to_agent)?;
        for a in rows {
            let a = a?;
            self.active.insert(a.id.clone(), a);
        }
        Ok(())
    }

    pub fn get(&self, key: &str) -> Option<&Agent> {
        self.active.get(key)
    }

    pub fn get_mut(&mut self, key: &str) -> Option<&mut Agent> {
        self.active.get_mut(key)
    }

    pub fn active(&self) -> impl Iterator<Item = &Agent> {
        self.active.values()
    }

    pub fn session_agents(&self, session_id: &str) -> Vec<String> {
        self.active.values().filter(|a| a.session_id == session_id).map(|a| a.id.clone()).collect()
    }

    /// Get or create the main agent of a session.
    pub fn ensure_main(&mut self, conn: &Connection, session_id: &str, cwd: Option<&str>, at: i64) -> CoreResult<&mut Agent> {
        let key = main_key(session_id);
        self.ensure(conn, key, session_id, None, None, None, cwd, at, true)
    }

    /// Get or create a subagent.
    pub fn ensure_sub(
        &mut self,
        conn: &Connection,
        session_id: &str,
        agent_id: &str,
        agent_type: Option<&str>,
        specialty: AgentSpecialty,
        cwd: Option<&str>,
        at: i64,
    ) -> CoreResult<&mut Agent> {
        let key = sub_key(session_id, agent_id);
        let parent = Some(main_key(session_id));
        let agent = self.ensure(conn, key, session_id, Some(agent_id), agent_type, parent, cwd, at, false)?;
        if agent.specialty == AgentSpecialty::General && specialty != AgentSpecialty::General {
            agent.specialty = specialty;
        }
        Ok(agent)
    }

    #[allow(clippy::too_many_arguments)]
    fn ensure(
        &mut self,
        conn: &Connection,
        key: String,
        session_id: &str,
        agent_id: Option<&str>,
        agent_type: Option<&str>,
        parent_id: Option<String>,
        cwd: Option<&str>,
        at: i64,
        is_main: bool,
    ) -> CoreResult<&mut Agent> {
        if !self.active.contains_key(&key) {
            let existing = conn
                .query_row(&format!("SELECT {COLS} FROM agents WHERE id = ?1"), params![key], row_to_agent)
                .optional()?;
            let agent = match existing {
                // Loaded as-is (possibly ended); the engine decides whether an event
                // revives it (start events) or is just a late delivery.
                Some(a) => a,
                None => Agent {
                    id: key.clone(),
                    session_id: session_id.to_string(),
                    parent_id,
                    agent_id: agent_id.map(str::to_string),
                    agent_type: agent_type.filter(|t| !t.is_empty()).map(str::to_string),
                    specialty: AgentSpecialty::General,
                    is_main,
                    name: name_for(&key, is_main),
                    cwd: cwd.map(str::to_string),
                    state: AgentState::Idle,
                    activity: None,
                    current_tool: None,
                    detail: None,
                    task: None,
                    room: if is_main { Room::Throne } else { Room::Barracks },
                    started_at: at,
                    updated_at: at,
                    ended_at: None,
                    last_event: None,
                },
            };
            self.evict_if_needed();
            self.active.insert(key.clone(), agent);
            let a = &self.active[&key];
            persist(conn, a)?;
            conn.execute("INSERT OR IGNORE INTO agent_statistics(agent_id) VALUES (?1)", params![a.id])?;
        }
        Ok(self.active.get_mut(&key).expect("just inserted"))
    }

    /// Remove an ended agent from memory (it stays in the database / history).
    pub fn forget(&mut self, key: &str) {
        self.active.remove(key);
    }

    fn evict_if_needed(&mut self) {
        if self.active.len() < self.capacity {
            return;
        }
        if let Some(oldest) = self.active.values().min_by_key(|a| a.updated_at).map(|a| a.id.clone()) {
            self.active.remove(&oldest);
        }
    }
}

/// Set a new visual state and keep `activity_history` segments consistent.
pub fn transition(conn: &Connection, agent: &mut Agent, state: AgentState, activity: Option<ActivityCategory>, at: i64) -> CoreResult<bool> {
    let changed = agent.state != state || agent.activity != activity;
    if changed {
        conn.execute(
            "UPDATE activity_history SET ended_at = ?2 WHERE agent_id = ?1 AND ended_at IS NULL",
            params![agent.id, at],
        )?;
        conn.execute(
            "INSERT INTO activity_history(agent_id, session_id, state, category, started_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![agent.id, agent.session_id, state.as_str(), activity.map(|c| c.as_str()), at],
        )?;
        agent.state = state;
        agent.activity = activity;
    }
    if !agent.is_main {
        agent.room = Room::for_state(state);
    }
    Ok(changed)
}

pub fn close_activity(conn: &Connection, agent_id: &str, at: i64) -> CoreResult<()> {
    conn.execute(
        "UPDATE activity_history SET ended_at = ?2 WHERE agent_id = ?1 AND ended_at IS NULL",
        params![agent_id, at],
    )?;
    Ok(())
}

pub fn persist(conn: &Connection, a: &Agent) -> CoreResult<()> {
    conn.execute(
        "INSERT INTO agents(id, session_id, parent_id, agent_id, agent_type, specialty, is_main, name, cwd, state, activity,
                            current_tool, detail, task, room, started_at, updated_at, ended_at, last_event)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)
         ON CONFLICT(id) DO UPDATE SET
            agent_type = excluded.agent_type, specialty = excluded.specialty, name = excluded.name, cwd = excluded.cwd,
            state = excluded.state, activity = excluded.activity, current_tool = excluded.current_tool,
            detail = excluded.detail, task = excluded.task, room = excluded.room, updated_at = excluded.updated_at,
            ended_at = excluded.ended_at, last_event = excluded.last_event",
        params![
            a.id,
            a.session_id,
            a.parent_id,
            a.agent_id,
            a.agent_type,
            a.specialty.as_str(),
            a.is_main,
            a.name,
            a.cwd,
            a.state.as_str(),
            a.activity.map(|c| c.as_str()),
            a.current_tool,
            a.detail,
            a.task,
            a.room.as_str(),
            a.started_at,
            a.updated_at,
            a.ended_at,
            a.last_event,
        ],
    )?;
    Ok(())
}

pub const COLS: &str = "id, session_id, parent_id, agent_id, agent_type, specialty, is_main, name, cwd, state, activity, \
                        current_tool, detail, task, room, started_at, updated_at, ended_at, last_event";

pub fn row_to_agent(r: &Row<'_>) -> rusqlite::Result<Agent> {
    let state: String = r.get(9)?;
    let activity: Option<String> = r.get(10)?;
    let room: String = r.get(14)?;
    Ok(Agent {
        id: r.get(0)?,
        session_id: r.get(1)?,
        parent_id: r.get(2)?,
        agent_id: r.get(3)?,
        agent_type: r.get(4)?,
        specialty: AgentSpecialty::parse(&r.get::<_, String>(5)?),
        is_main: r.get(6)?,
        name: r.get(7)?,
        cwd: r.get(8)?,
        state: AgentState::parse(&state).unwrap_or(AgentState::Idle),
        activity: activity.and_then(|a| parse_category(&a)),
        current_tool: r.get(11)?,
        detail: r.get(12)?,
        task: r.get(13)?,
        room: parse_room(&room),
        started_at: r.get(15)?,
        updated_at: r.get(16)?,
        ended_at: r.get(17)?,
        last_event: r.get(18)?,
    })
}

pub fn parse_category(s: &str) -> Option<ActivityCategory> {
    use ActivityCategory::*;
    Some(match s {
        "reading" => Reading,
        "searching" => Searching,
        "web_research" => WebResearch,
        "editing" => Editing,
        "building" => Building,
        "testing" => Testing,
        "version_control" => VersionControl,
        "shell" => Shell,
        "delegating" => Delegating,
        "planning" => Planning,
        "asking" => Asking,
        "mcp" => Mcp,
        "other" => Other,
        _ => return None,
    })
}

pub fn parse_room(s: &str) -> Room {
    match s {
        "throne" => Room::Throne,
        "library" => Room::Library,
        "forge" => Room::Forge,
        "laboratory" => Room::Laboratory,
        "watchtower" => Room::Watchtower,
        "treasury" => Room::Treasury,
        _ => Room::Barracks,
    }
}
