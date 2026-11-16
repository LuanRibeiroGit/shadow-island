//! Read-side queries used by the UI (dashboard, history, diagnostics). All of them
//! run on a separate read connection (WAL), never on the engine's write connection.

use rusqlite::{params, params_from_iter, Connection, OptionalExtension, ToSql};
use serde::{Deserialize, Serialize};

use crate::agents::{row_to_agent, Agent, COLS as AGENT_COLS};
use crate::encounters::{row_to_encounter, Encounter, COLS as ENC_COLS};
use crate::engine::{EventRecord, Session};
use crate::error::CoreResult;
use crate::missions::{row_to_mission, Mission, COLS as MISSION_COLS};

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Filter {
    pub from: Option<i64>,
    pub to: Option<i64>,
    pub project_id: Option<i64>,
    pub session_id: Option<String>,
    pub agent_id: Option<String>,
    /// Mission status, or for events: "failure".
    pub status: Option<String>,
    /// Activity category (events) or mission kind (missions).
    pub category: Option<String>,
    pub event_name: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

struct Where {
    clauses: Vec<String>,
    values: Vec<Box<dyn ToSql>>,
}

impl Where {
    fn new() -> Self {
        Self { clauses: vec![], values: vec![] }
    }
    fn add(&mut self, clause: &str, v: impl ToSql + 'static) {
        self.values.push(Box::new(v));
        self.clauses.push(clause.replace('?', &format!("?{}", self.values.len())));
    }
    fn sql(&self) -> String {
        if self.clauses.is_empty() {
            String::new()
        } else {
            format!("WHERE {}", self.clauses.join(" AND "))
        }
    }
}

fn page(f: &Filter, default: i64) -> (i64, i64) {
    (f.limit.unwrap_or(default).clamp(1, 1000), f.offset.unwrap_or(0).max(0))
}

#[derive(Debug, Clone, Serialize, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TokenTotals {
    pub input: i64,
    pub output: i64,
    pub cache_creation: i64,
    pub cache_read: i64,
    /// Number of usage records (API responses) behind these totals. 0 means the
    /// numbers are unavailable rather than zero.
    pub records: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelUsage {
    pub model: Option<String>,
    pub tokens: TokenTotals,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentStats {
    pub tool_count: i64,
    pub tool_failures: i64,
    pub tasks_completed: i64,
    pub errors: i64,
    pub monsters_defeated: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentDetail {
    pub agent: Agent,
    pub stats: Option<AgentStats>,
    pub usage_by_model: Vec<ModelUsage>,
    pub recent_events: Vec<EventRecord>,
    pub missions: Vec<Mission>,
    pub encounters: Vec<Encounter>,
    pub session: Option<Session>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSummary {
    pub session: Session,
    pub agent_count: i64,
    pub event_count: i64,
    pub error_count: i64,
    pub tokens: TokenTotals,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionDetail {
    pub summary: SessionSummary,
    pub agents: Vec<Agent>,
    pub missions: Vec<Mission>,
    pub timeline: Vec<EventRecord>,
    pub usage_by_model: Vec<ModelUsage>,
    pub usage_by_agent: Vec<(String, TokenTotals)>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Overview {
    pub active_agents: i64,
    pub active_sessions: i64,
    pub waiting_agents: i64,
    pub missions_completed: i64,
    pub missions_in_progress: i64,
    pub errors: i64,
    /// Sum of closed + open activity segments, in ms (calculated locally).
    pub active_time_ms: i64,
    pub tokens: TokenTotals,
    pub usage_by_model: Vec<ModelUsage>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageBucket {
    pub bucket_start: i64,
    pub model: Option<String>,
    pub tokens: TokenTotals,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LabeledTokens {
    pub id: String,
    pub label: String,
    pub model: Option<String>,
    pub tokens: TokenTotals,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Distribution {
    pub key: String,
    pub count: i64,
    pub duration_ms: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: i64,
    pub path: String,
    pub name: String,
    pub first_seen: i64,
    pub last_seen: i64,
}

const TOKENS_SQL: &str = "COALESCE(SUM(input_tokens),0), COALESCE(SUM(output_tokens),0), COALESCE(SUM(cache_creation_tokens),0), COALESCE(SUM(cache_read_tokens),0), COUNT(*)";

fn tokens_at(r: &rusqlite::Row<'_>, i: usize) -> rusqlite::Result<TokenTotals> {
    Ok(TokenTotals { input: r.get(i)?, output: r.get(i + 1)?, cache_creation: r.get(i + 2)?, cache_read: r.get(i + 3)?, records: r.get(i + 4)? })
}

fn session_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<Session> {
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
}

const SESSION_SELECT: &str = "SELECT s.id, s.project_id, p.name, s.cwd, s.model, s.source, s.title, s.started_at, s.ended_at, s.end_reason, s.last_event_at FROM sessions s LEFT JOIN projects p ON p.id = s.project_id";

fn event_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<EventRecord> {
    Ok(EventRecord {
        id: r.get(0)?,
        session_id: r.get(1)?,
        agent_id: r.get(2)?,
        mission_id: r.get(3)?,
        event_name: r.get(4)?,
        tool_name: r.get(5)?,
        category: r.get(6)?,
        detail: r.get(7)?,
        is_failure: r.get(8)?,
        fired_at: r.get(9)?,
    })
}

const EVENT_COLS: &str = "e.id, e.session_id, e.agent_id, e.mission_id, e.event_name, e.tool_name, e.category, e.detail, e.is_failure, e.fired_at";

pub fn active_agents(conn: &Connection) -> CoreResult<Vec<Agent>> {
    let mut st = conn.prepare(&format!("SELECT {AGENT_COLS} FROM agents WHERE ended_at IS NULL ORDER BY started_at"))?;
    let rows = st.query_map([], row_to_agent)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// Agents that ended recently (for the "completed" area / history strip).
pub fn recent_agents(conn: &Connection, limit: i64) -> CoreResult<Vec<Agent>> {
    let mut st = conn.prepare(&format!("SELECT {AGENT_COLS} FROM agents WHERE ended_at IS NOT NULL ORDER BY ended_at DESC LIMIT ?1"))?;
    let rows = st.query_map(params![limit.clamp(1, 500)], row_to_agent)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn agents(conn: &Connection, f: &Filter) -> CoreResult<Vec<Agent>> {
    let mut w = Where::new();
    if let Some(s) = &f.session_id {
        w.add("a.session_id = ?", s.clone());
    }
    if let Some(p) = f.project_id {
        w.add("s.project_id = ?", p);
    }
    if let Some(from) = f.from {
        w.add("a.updated_at >= ?", from);
    }
    if let Some(to) = f.to {
        w.add("a.started_at <= ?", to);
    }
    let (limit, offset) = page(f, 200);
    let cols = AGENT_COLS.split(", ").map(|c| format!("a.{}", c.trim())).collect::<Vec<_>>().join(", ");
    let sql = format!(
        "SELECT {cols} FROM agents a JOIN sessions s ON s.id = a.session_id {} ORDER BY a.started_at DESC LIMIT {limit} OFFSET {offset}",
        w.sql()
    );
    let mut st = conn.prepare(&sql)?;
    let rows = st.query_map(params_from_iter(w.values.iter()), row_to_agent)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

fn usage_by_model(conn: &Connection, filter_sql: &str, p: &[&dyn ToSql]) -> CoreResult<Vec<ModelUsage>> {
    let mut st = conn.prepare(&format!("SELECT model, {TOKENS_SQL} FROM usage_records {filter_sql} GROUP BY model ORDER BY model"))?;
    let rows = st.query_map(p, |r| Ok(ModelUsage { model: r.get(0)?, tokens: tokens_at(r, 1)? }))?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn agent_detail(conn: &Connection, id: &str) -> CoreResult<Option<AgentDetail>> {
    let Some(agent) = conn.query_row(&format!("SELECT {AGENT_COLS} FROM agents WHERE id = ?1"), params![id], row_to_agent).optional()? else {
        return Ok(None);
    };
    let stats = conn
        .query_row(
            "SELECT tool_count, tool_failures, tasks_completed, errors, monsters_defeated FROM agent_statistics WHERE agent_id = ?1",
            params![id],
            |r| Ok(AgentStats { tool_count: r.get(0)?, tool_failures: r.get(1)?, tasks_completed: r.get(2)?, errors: r.get(3)?, monsters_defeated: r.get(4)? }),
        )
        .optional()?;
    let usage = usage_by_model(conn, "WHERE agent_id = ?1", &[&id])?;
    let mut st = conn.prepare(&format!("SELECT {EVENT_COLS} FROM events e WHERE e.agent_id = ?1 ORDER BY e.fired_at DESC, e.id DESC LIMIT 50"))?;
    let recent_events = st.query_map(params![id], event_row)?.collect::<Result<_, _>>()?;
    let mut st = conn.prepare(&format!("SELECT {MISSION_COLS} FROM missions WHERE agent_id = ?1 ORDER BY started_at DESC LIMIT 50"))?;
    let missions = st.query_map(params![id], row_to_mission)?.collect::<Result<_, _>>()?;
    let mut st = conn.prepare(&format!("SELECT {ENC_COLS} FROM encounters WHERE agent_id = ?1 ORDER BY opened_at DESC LIMIT 50"))?;
    let encounters = st.query_map(params![id], row_to_encounter)?.collect::<Result<_, _>>()?;
    let session = conn.query_row(&format!("{SESSION_SELECT} WHERE s.id = ?1"), params![agent.session_id], session_row).optional()?;
    Ok(Some(AgentDetail { agent, stats, usage_by_model: usage, recent_events, missions, encounters, session }))
}

pub fn sessions(conn: &Connection, f: &Filter) -> CoreResult<Vec<SessionSummary>> {
    let mut w = Where::new();
    if let Some(p) = f.project_id {
        w.add("s.project_id = ?", p);
    }
    if let Some(from) = f.from {
        w.add("s.last_event_at >= ?", from);
    }
    if let Some(to) = f.to {
        w.add("s.started_at <= ?", to);
    }
    match f.status.as_deref() {
        Some("active") => w.clauses.push("s.ended_at IS NULL".into()),
        Some("ended") => w.clauses.push("s.ended_at IS NOT NULL".into()),
        _ => {}
    }
    if let Some(a) = &f.agent_id {
        w.add("EXISTS(SELECT 1 FROM agents a WHERE a.session_id = s.id AND a.id = ?)", a.clone());
    }
    let (limit, offset) = page(f, 100);
    let sql = format!(
        "SELECT s.id, s.project_id, p.name, s.cwd, s.model, s.source, s.title, s.started_at, s.ended_at, s.end_reason, s.last_event_at,
                (SELECT COUNT(*) FROM agents a WHERE a.session_id = s.id),
                (SELECT COUNT(*) FROM events e WHERE e.session_id = s.id),
                (SELECT COUNT(*) FROM events e WHERE e.session_id = s.id AND e.is_failure = 1),
                COALESCE(u.i,0), COALESCE(u.o,0), COALESCE(u.cc,0), COALESCE(u.cr,0), COALESCE(u.n,0)
         FROM sessions s
         LEFT JOIN projects p ON p.id = s.project_id
         LEFT JOIN (SELECT session_id, SUM(input_tokens) i, SUM(output_tokens) o, SUM(cache_creation_tokens) cc,
                           SUM(cache_read_tokens) cr, COUNT(*) n FROM usage_records GROUP BY session_id) u ON u.session_id = s.id
         {} ORDER BY s.last_event_at DESC LIMIT {limit} OFFSET {offset}",
        w.sql()
    );
    let mut st = conn.prepare(&sql)?;
    let rows = st.query_map(params_from_iter(w.values.iter()), |r| {
        Ok(SessionSummary {
            session: session_row(r)?,
            agent_count: r.get(11)?,
            event_count: r.get(12)?,
            error_count: r.get(13)?,
            tokens: tokens_at(r, 14)?,
        })
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn session_detail(conn: &Connection, id: &str) -> CoreResult<Option<SessionDetail>> {
    let f = Filter { session_id: None, limit: Some(1000), ..Default::default() };
    let Some(summary) = sessions(conn, &f)?.into_iter().find(|s| s.session.id == id) else {
        return Ok(None);
    };
    let mut st = conn.prepare(&format!("SELECT {AGENT_COLS} FROM agents WHERE session_id = ?1 ORDER BY started_at"))?;
    let agents = st.query_map(params![id], row_to_agent)?.collect::<Result<_, _>>()?;
    let mut st = conn.prepare(&format!("SELECT {MISSION_COLS} FROM missions WHERE session_id = ?1 ORDER BY started_at"))?;
    let missions = st.query_map(params![id], row_to_mission)?.collect::<Result<_, _>>()?;
    let mut st = conn.prepare(&format!("SELECT {EVENT_COLS} FROM events e WHERE e.session_id = ?1 ORDER BY e.fired_at, e.id LIMIT 2000"))?;
    let timeline = st.query_map(params![id], event_row)?.collect::<Result<_, _>>()?;
    let usage = usage_by_model(conn, "WHERE session_id = ?1", &[&id])?;
    let mut st = conn.prepare(&format!("SELECT agent_id, {TOKENS_SQL} FROM usage_records WHERE session_id = ?1 GROUP BY agent_id"))?;
    let usage_by_agent = st
        .query_map(params![id], |r| Ok((r.get::<_, Option<String>>(0)?.unwrap_or_default(), tokens_at(r, 1)?)))?
        .collect::<Result<_, _>>()?;
    Ok(Some(SessionDetail { summary, agents, missions, timeline, usage_by_model: usage, usage_by_agent }))
}

pub fn events(conn: &Connection, f: &Filter) -> CoreResult<Vec<EventRecord>> {
    let mut w = Where::new();
    if let Some(s) = &f.session_id {
        w.add("e.session_id = ?", s.clone());
    }
    if let Some(a) = &f.agent_id {
        w.add("e.agent_id = ?", a.clone());
    }
    if let Some(p) = f.project_id {
        w.add("s.project_id = ?", p);
    }
    if let Some(from) = f.from {
        w.add("e.fired_at >= ?", from);
    }
    if let Some(to) = f.to {
        w.add("e.fired_at <= ?", to);
    }
    if let Some(c) = &f.category {
        w.add("e.category = ?", c.clone());
    }
    if let Some(n) = &f.event_name {
        w.add("e.event_name = ?", n.clone());
    }
    if f.status.as_deref() == Some("failure") {
        w.clauses.push("e.is_failure = 1".into());
    }
    let (limit, offset) = page(f, 200);
    let sql = format!(
        "SELECT {EVENT_COLS} FROM events e JOIN sessions s ON s.id = e.session_id {} ORDER BY e.fired_at DESC, e.id DESC LIMIT {limit} OFFSET {offset}",
        w.sql()
    );
    let mut st = conn.prepare(&sql)?;
    let rows = st.query_map(params_from_iter(w.values.iter()), event_row)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn missions(conn: &Connection, f: &Filter) -> CoreResult<Vec<Mission>> {
    let mut w = Where::new();
    if let Some(s) = &f.session_id {
        w.add("session_id = ?", s.clone());
    }
    if let Some(a) = &f.agent_id {
        w.add("agent_id = ?", a.clone());
    }
    if let Some(p) = f.project_id {
        w.add("project_id = ?", p);
    }
    if let Some(st) = &f.status {
        w.add("status = ?", st.clone());
    }
    if let Some(k) = &f.category {
        w.add("kind = ?", k.clone());
    }
    if let Some(from) = f.from {
        w.add("started_at >= ?", from);
    }
    if let Some(to) = f.to {
        w.add("started_at <= ?", to);
    }
    let (limit, offset) = page(f, 200);
    let sql = format!("SELECT {MISSION_COLS} FROM missions {} ORDER BY started_at DESC, id DESC LIMIT {limit} OFFSET {offset}", w.sql());
    let mut st = conn.prepare(&sql)?;
    let rows = st.query_map(params_from_iter(w.values.iter()), row_to_mission)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn active_encounters(conn: &Connection) -> CoreResult<Vec<Encounter>> {
    let mut st = conn.prepare(&format!("SELECT {ENC_COLS} FROM encounters WHERE status = 'active' ORDER BY opened_at"))?;
    let rows = st.query_map([], row_to_encounter)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn projects(conn: &Connection) -> CoreResult<Vec<Project>> {
    let mut st = conn.prepare("SELECT id, path, name, first_seen, last_seen FROM projects ORDER BY last_seen DESC")?;
    let rows = st.query_map([], |r| Ok(Project { id: r.get(0)?, path: r.get(1)?, name: r.get(2)?, first_seen: r.get(3)?, last_seen: r.get(4)? }))?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn overview(conn: &Connection, from: Option<i64>, now: i64) -> CoreResult<Overview> {
    let from = from.unwrap_or(0);
    let one = |sql: &str| -> CoreResult<i64> { Ok(conn.query_row(sql, params![from], |r| r.get(0))?) };
    let tokens = conn.query_row(&format!("SELECT {TOKENS_SQL} FROM usage_records WHERE recorded_at >= ?1"), params![from], |r| tokens_at(r, 0))?;
    let active_time_ms: i64 = conn.query_row(
        "SELECT COALESCE(SUM(COALESCE(ended_at, ?2) - MAX(started_at, ?1)), 0) FROM activity_history
         WHERE state NOT IN ('IDLE','WAITING','SUCCESS','ERROR') AND COALESCE(ended_at, ?2) >= ?1",
        params![from, now],
        |r| r.get(0),
    )?;
    Ok(Overview {
        active_agents: one("SELECT COUNT(*) FROM agents WHERE ended_at IS NULL AND ?1 >= 0")?,
        active_sessions: one("SELECT COUNT(*) FROM sessions WHERE ended_at IS NULL AND ?1 >= 0")?,
        waiting_agents: one("SELECT COUNT(*) FROM agents WHERE ended_at IS NULL AND state = 'WAITING' AND ?1 >= 0")?,
        missions_completed: one("SELECT COUNT(*) FROM missions WHERE status = 'completed' AND completed_at >= ?1")?,
        missions_in_progress: one("SELECT COUNT(*) FROM missions WHERE status IN ('in_progress','waiting') AND ?1 >= 0")?,
        errors: one("SELECT COUNT(*) FROM events WHERE is_failure = 1 AND fired_at >= ?1")?,
        active_time_ms: active_time_ms.max(0),
        tokens,
        usage_by_model: usage_by_model(conn, "WHERE recorded_at >= ?1", &[&from])?,
    })
}

/// Token usage grouped in fixed-size time buckets and by model.
pub fn usage_timeseries(conn: &Connection, from: i64, to: i64, bucket_ms: i64) -> CoreResult<Vec<UsageBucket>> {
    let bucket_ms = bucket_ms.max(60_000);
    let mut st = conn.prepare(&format!(
        "SELECT (recorded_at / ?3) * ?3 AS b, model, {TOKENS_SQL} FROM usage_records
         WHERE recorded_at >= ?1 AND recorded_at <= ?2 GROUP BY b, model ORDER BY b"
    ))?;
    let rows = st.query_map(params![from, to, bucket_ms], |r| Ok(UsageBucket { bucket_start: r.get(0)?, model: r.get(1)?, tokens: tokens_at(r, 2)? }))?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn tokens_by_session(conn: &Connection, from: i64, limit: i64) -> CoreResult<Vec<LabeledTokens>> {
    let mut st = conn.prepare(&format!(
        "SELECT u.session_id, COALESCE(p.name, s.cwd, u.session_id), u.model, {TOKENS_SQL}
         FROM usage_records u JOIN sessions s ON s.id = u.session_id LEFT JOIN projects p ON p.id = s.project_id
         WHERE u.recorded_at >= ?1 GROUP BY u.session_id, u.model ORDER BY SUM(u.input_tokens + u.output_tokens) DESC LIMIT ?2"
    ))?;
    let rows = st.query_map(params![from, limit.clamp(1, 200)], |r| {
        Ok(LabeledTokens { id: r.get(0)?, label: r.get(1)?, model: r.get(2)?, tokens: tokens_at(r, 3)? })
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn tokens_by_agent(conn: &Connection, from: i64, limit: i64) -> CoreResult<Vec<LabeledTokens>> {
    let mut st = conn.prepare(&format!(
        "SELECT u.agent_id, COALESCE(a.name, u.agent_id), u.model, {TOKENS_SQL}
         FROM usage_records u LEFT JOIN agents a ON a.id = u.agent_id
         WHERE u.recorded_at >= ?1 AND u.agent_id IS NOT NULL GROUP BY u.agent_id, u.model
         ORDER BY SUM(u.input_tokens + u.output_tokens) DESC LIMIT ?2"
    ))?;
    let rows = st.query_map(params![from, limit.clamp(1, 200)], |r| {
        Ok(LabeledTokens { id: r.get(0)?, label: r.get(1)?, model: r.get(2)?, tokens: tokens_at(r, 3)? })
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// Time spent per visual state (calculated from activity segments).
pub fn state_distribution(conn: &Connection, from: i64, now: i64) -> CoreResult<Vec<Distribution>> {
    let mut st = conn.prepare(
        "SELECT state, COUNT(*), COALESCE(SUM(COALESCE(ended_at, ?2) - MAX(started_at, ?1)), 0)
         FROM activity_history WHERE COALESCE(ended_at, ?2) >= ?1 GROUP BY state ORDER BY 3 DESC",
    )?;
    let rows = st.query_map(params![from, now], |r| Ok(Distribution { key: r.get(0)?, count: r.get(1)?, duration_ms: r.get::<_, i64>(2)?.max(0) }))?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// Tool calls per activity category (counted from PreToolUse events).
pub fn category_distribution(conn: &Connection, from: i64) -> CoreResult<Vec<Distribution>> {
    let mut st = conn.prepare(
        "SELECT category, COUNT(*), COALESCE(SUM(CAST(json_extract(data, '$.durationMs') AS INTEGER)), 0)
         FROM events WHERE category IS NOT NULL AND event_name IN ('PostToolUse','PostToolUseFailure') AND fired_at >= ?1
         GROUP BY category ORDER BY 2 DESC",
    )?;
    let rows = st.query_map(params![from], |r| Ok(Distribution { key: r.get(0)?, count: r.get(1)?, duration_ms: r.get(2)? }))?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// Events per time bucket (activity over time).
pub fn activity_timeseries(conn: &Connection, from: i64, to: i64, bucket_ms: i64) -> CoreResult<Vec<Distribution>> {
    let bucket_ms = bucket_ms.max(60_000);
    let mut st = conn.prepare(
        "SELECT CAST((fired_at / ?3) * ?3 AS TEXT), COUNT(*), SUM(is_failure) FROM events
         WHERE fired_at >= ?1 AND fired_at <= ?2 AND event_name = 'PreToolUse' GROUP BY fired_at / ?3 ORDER BY 1",
    )?;
    let rows = st.query_map(params![from, to, bucket_ms], |r| Ok(Distribution { key: r.get(0)?, count: r.get(1)?, duration_ms: r.get::<_, Option<i64>>(2)?.unwrap_or(0) }))?;
    Ok(rows.collect::<Result<_, _>>()?)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DbDiagnostics {
    pub schema_version: i64,
    pub events: i64,
    pub sessions: i64,
    pub agents: i64,
    pub usage_records: i64,
    pub last_event_at: Option<i64>,
    pub events_last_hour: i64,
}

pub fn diagnostics(conn: &Connection, now: i64) -> CoreResult<DbDiagnostics> {
    let c = |sql: &str| -> CoreResult<i64> { Ok(conn.query_row(sql, [], |r| r.get(0))?) };
    Ok(DbDiagnostics {
        schema_version: crate::db::schema_version(conn)?,
        events: c("SELECT COUNT(*) FROM events")?,
        sessions: c("SELECT COUNT(*) FROM sessions")?,
        agents: c("SELECT COUNT(*) FROM agents")?,
        usage_records: c("SELECT COUNT(*) FROM usage_records")?,
        last_event_at: conn.query_row("SELECT MAX(received_at) FROM events", [], |r| r.get(0))?,
        events_last_hour: conn.query_row("SELECT COUNT(*) FROM events WHERE received_at >= ?1", params![now - 3_600_000], |r| r.get(0))?,
    })
}

/// Settings key/value (JSON) storage.
pub fn get_setting(conn: &Connection, key: &str) -> CoreResult<Option<String>> {
    Ok(conn.query_row("SELECT value FROM settings WHERE key = ?1", params![key], |r| r.get(0)).optional()?)
}

pub fn set_setting(conn: &Connection, key: &str, value: &str, now: i64) -> CoreResult<()> {
    conn.execute(
        "INSERT INTO settings(key, value, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        params![key, value, now],
    )?;
    Ok(())
}

pub fn characters(conn: &Connection) -> CoreResult<Vec<(String, String)>> {
    let mut st = conn.prepare("SELECT id, data FROM characters")?;
    let rows = st.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn set_character(conn: &Connection, id: &str, data: &str, now: i64) -> CoreResult<()> {
    conn.execute(
        "INSERT INTO characters(id, data, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
        params![id, data, now],
    )?;
    Ok(())
}

/// Delete history older than `before` (retention). Active sessions are kept.
pub fn prune(conn: &Connection, before: i64) -> CoreResult<usize> {
    Ok(conn.execute("DELETE FROM sessions WHERE ended_at IS NOT NULL AND last_event_at < ?1", params![before])?)
}
