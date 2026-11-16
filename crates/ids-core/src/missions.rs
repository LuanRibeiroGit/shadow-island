//! Missions are built only from real units of work reported by Claude Code:
//! - `prompt`:   one user prompt -> ends on `Stop` (completed) or `StopFailure` (error)
//! - `task`:     `TaskCreated` -> `TaskCompleted`
//! - `subagent`: `SubagentStart` -> `SubagentStop`
//! Progress is a status, never an invented percentage.

use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::Serialize;

use crate::error::CoreResult;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum MissionStatus {
    NotStarted,
    InProgress,
    Waiting,
    Completed,
    Error,
    /// The session ended before Claude Code reported completion.
    Interrupted,
}

impl MissionStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            MissionStatus::NotStarted => "not_started",
            MissionStatus::InProgress => "in_progress",
            MissionStatus::Waiting => "waiting",
            MissionStatus::Completed => "completed",
            MissionStatus::Error => "error",
            MissionStatus::Interrupted => "interrupted",
        }
    }
    pub fn parse(s: &str) -> Self {
        match s {
            "not_started" => MissionStatus::NotStarted,
            "waiting" => MissionStatus::Waiting,
            "completed" => MissionStatus::Completed,
            "error" => MissionStatus::Error,
            "interrupted" => MissionStatus::Interrupted,
            _ => MissionStatus::InProgress,
        }
    }
    pub fn is_open(self) -> bool {
        matches!(self, MissionStatus::NotStarted | MissionStatus::InProgress | MissionStatus::Waiting)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum MissionKind {
    Prompt,
    Task,
    Subagent,
}

impl MissionKind {
    pub fn as_str(self) -> &'static str {
        match self {
            MissionKind::Prompt => "prompt",
            MissionKind::Task => "task",
            MissionKind::Subagent => "subagent",
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Mission {
    pub id: i64,
    pub session_id: String,
    pub agent_id: Option<String>,
    pub project_id: Option<i64>,
    pub kind: String,
    pub external_id: String,
    pub title: String,
    pub description: Option<String>,
    pub status: MissionStatus,
    pub started_at: i64,
    pub completed_at: Option<i64>,
}

pub const COLS: &str =
    "id, session_id, agent_id, project_id, kind, external_id, title, description, status, started_at, completed_at";

pub fn row_to_mission(r: &Row<'_>) -> rusqlite::Result<Mission> {
    Ok(Mission {
        id: r.get(0)?,
        session_id: r.get(1)?,
        agent_id: r.get(2)?,
        project_id: r.get(3)?,
        kind: r.get(4)?,
        external_id: r.get(5)?,
        title: r.get(6)?,
        description: r.get(7)?,
        status: MissionStatus::parse(&r.get::<_, String>(8)?),
        started_at: r.get(9)?,
        completed_at: r.get(10)?,
    })
}

#[allow(clippy::too_many_arguments)]
pub fn open(
    conn: &Connection,
    session_id: &str,
    agent_id: Option<&str>,
    project_id: Option<i64>,
    kind: MissionKind,
    external_id: &str,
    title: &str,
    description: Option<&str>,
    at: i64,
) -> CoreResult<Mission> {
    conn.execute(
        "INSERT INTO missions(session_id, agent_id, project_id, kind, external_id, title, description, status, started_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'in_progress', ?8)
         ON CONFLICT(session_id, kind, external_id) DO UPDATE SET
            status = CASE WHEN missions.status IN ('completed','error','interrupted') THEN missions.status ELSE 'in_progress' END,
            title = excluded.title",
        params![session_id, agent_id, project_id, kind.as_str(), external_id, title, description, at],
    )?;
    get(conn, session_id, kind, external_id).map(|m| m.expect("mission just inserted"))
}

pub fn get(conn: &Connection, session_id: &str, kind: MissionKind, external_id: &str) -> CoreResult<Option<Mission>> {
    Ok(conn
        .query_row(
            &format!("SELECT {COLS} FROM missions WHERE session_id = ?1 AND kind = ?2 AND external_id = ?3"),
            params![session_id, kind.as_str(), external_id],
            row_to_mission,
        )
        .optional()?)
}

/// Close a mission with a final status. Returns the updated mission when it existed
/// and was still open.
pub fn close(conn: &Connection, session_id: &str, kind: MissionKind, external_id: &str, status: MissionStatus, at: i64) -> CoreResult<Option<Mission>> {
    let n = conn.execute(
        "UPDATE missions SET status = ?4, completed_at = ?5
         WHERE session_id = ?1 AND kind = ?2 AND external_id = ?3 AND status IN ('not_started','in_progress','waiting')",
        params![session_id, kind.as_str(), external_id, status.as_str(), at],
    )?;
    if n == 0 {
        return Ok(None);
    }
    get(conn, session_id, kind, external_id)
}

pub fn set_status(conn: &Connection, id: i64, status: MissionStatus) -> CoreResult<()> {
    conn.execute(
        "UPDATE missions SET status = ?2 WHERE id = ?1 AND status IN ('not_started','in_progress','waiting')",
        params![id, status.as_str()],
    )?;
    Ok(())
}

/// Latest open prompt mission of a session (the "current quest").
pub fn current_prompt(conn: &Connection, session_id: &str) -> CoreResult<Option<Mission>> {
    Ok(conn
        .query_row(
            &format!(
                "SELECT {COLS} FROM missions WHERE session_id = ?1 AND kind = 'prompt'
                 AND status IN ('not_started','in_progress','waiting') ORDER BY started_at DESC, id DESC LIMIT 1"
            ),
            params![session_id],
            row_to_mission,
        )
        .optional()?)
}

pub fn by_id(conn: &Connection, id: i64) -> CoreResult<Option<Mission>> {
    Ok(conn
        .query_row(&format!("SELECT {COLS} FROM missions WHERE id = ?1"), params![id], row_to_mission)
        .optional()?)
}

/// Mark every open mission of a session as interrupted (session ended).
pub fn interrupt_session(conn: &Connection, session_id: &str, at: i64) -> CoreResult<Vec<Mission>> {
    let mut stmt = conn.prepare(&format!(
        "UPDATE missions SET status = 'interrupted', completed_at = ?2
         WHERE session_id = ?1 AND status IN ('not_started','in_progress','waiting') RETURNING {COLS}"
    ))?;
    let rows = stmt.query_map(params![session_id, at], row_to_mission)?;
    Ok(rows.collect::<Result<_, _>>()?)
}
