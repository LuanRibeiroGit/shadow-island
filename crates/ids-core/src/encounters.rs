//! Monster encounters. A monster appears only when Claude Code reports a real tool
//! failure (`PostToolUseFailure`, not an interrupt). It is defeated only when the
//! same agent later succeeds at the *same* action (same tool + same privacy-safe
//! detail, e.g. `npm test` or `main.rs`). If the agent finishes without that
//! confirmation, the monster retreats: we never claim a bug was fixed.

use rusqlite::{params, Connection, Row};
use serde::Serialize;

use crate::error::CoreResult;
use crate::model::ActivityCategory;
use crate::normalize::NormalizedEvent;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Monster {
    BugMonster,
    ErrorGoblin,
    DependencyDragon,
    TestPhantom,
    ConflictSkeleton,
    SecurityBeast,
}

impl Monster {
    pub fn as_str(self) -> &'static str {
        match self {
            Monster::BugMonster => "bug_monster",
            Monster::ErrorGoblin => "error_goblin",
            Monster::DependencyDragon => "dependency_dragon",
            Monster::TestPhantom => "test_phantom",
            Monster::ConflictSkeleton => "conflict_skeleton",
            Monster::SecurityBeast => "security_beast",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum EncounterStatus {
    Active,
    /// Same action later succeeded: confirmed by a real event.
    Defeated,
    /// Agent stopped without a confirming success.
    Retreated,
}

impl EncounterStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            EncounterStatus::Active => "active",
            EncounterStatus::Defeated => "defeated",
            EncounterStatus::Retreated => "retreated",
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Encounter {
    pub id: i64,
    pub agent_id: String,
    pub session_id: String,
    pub monster: String,
    pub signature: String,
    pub status: String,
    pub opened_at: i64,
    pub closed_at: Option<i64>,
}

pub const COLS: &str = "id, agent_id, session_id, monster, signature, status, opened_at, closed_at";

pub fn row_to_encounter(r: &Row<'_>) -> rusqlite::Result<Encounter> {
    Ok(Encounter {
        id: r.get(0)?,
        agent_id: r.get(1)?,
        session_id: r.get(2)?,
        monster: r.get(3)?,
        signature: r.get(4)?,
        status: r.get(5)?,
        opened_at: r.get(6)?,
        closed_at: r.get(7)?,
    })
}

/// Pick a monster from the failing action. Uses only the category, the safe detail
/// and well-known markers in the error text (the text itself is not stored).
pub fn monster_for(ev: &NormalizedEvent) -> Monster {
    let text = ev.failure_text.as_deref().unwrap_or("").to_ascii_lowercase();
    let detail = ev.detail.as_deref().unwrap_or("").to_ascii_lowercase();
    let has = |ks: &[&str]| ks.iter().any(|k| text.contains(k));
    if has(&["conflict", "merge conflict", "<<<<<<<"]) {
        Monster::ConflictSkeleton
    } else if has(&["vulnerab", "cve-", "security", "audit"]) {
        Monster::SecurityBeast
    } else if has(&["cannot find module", "module not found", "no matching version", "could not resolve", "unresolved import", "modulenotfounderror", "dependency"])
        || ["install", "add"].iter().any(|k| detail.ends_with(k))
    {
        Monster::DependencyDragon
    } else if ev.category == Some(ActivityCategory::Testing) {
        Monster::TestPhantom
    } else if ev.category == Some(ActivityCategory::Building) {
        Monster::ErrorGoblin
    } else {
        Monster::BugMonster
    }
}

pub fn signature(ev: &NormalizedEvent) -> String {
    format!("{}:{}", ev.tool_name.as_deref().unwrap_or("?"), ev.detail.as_deref().unwrap_or(""))
}

pub fn open(conn: &Connection, agent_id: &str, session_id: &str, ev: &NormalizedEvent, at: i64) -> CoreResult<Encounter> {
    let sig = signature(ev);
    // One active monster per agent+signature: repeated failures keep the same fight.
    if let Ok(existing) = conn.query_row(
        &format!("SELECT {COLS} FROM encounters WHERE agent_id = ?1 AND signature = ?2 AND status = 'active'"),
        params![agent_id, sig],
        row_to_encounter,
    ) {
        return Ok(existing);
    }
    let monster = monster_for(ev);
    conn.execute(
        "INSERT INTO encounters(agent_id, session_id, monster, signature, status, opened_at) VALUES (?1, ?2, ?3, ?4, 'active', ?5)",
        params![agent_id, session_id, monster.as_str(), sig, at],
    )?;
    let id = conn.last_insert_rowid();
    Ok(conn.query_row(&format!("SELECT {COLS} FROM encounters WHERE id = ?1"), params![id], row_to_encounter)?)
}

/// A successful tool call: defeat a matching active monster if there is one.
pub fn on_success(conn: &Connection, agent_id: &str, ev: &NormalizedEvent, at: i64) -> CoreResult<Vec<Encounter>> {
    close_where(conn, "agent_id = ?1 AND signature = ?2 AND status = 'active'", params![agent_id, signature(ev)], EncounterStatus::Defeated, at)
}

/// The agent stopped: remaining monsters retreat (not defeated).
pub fn on_agent_end(conn: &Connection, agent_id: &str, at: i64) -> CoreResult<Vec<Encounter>> {
    close_where(conn, "agent_id = ?1 AND status = 'active'", params![agent_id], EncounterStatus::Retreated, at)
}

fn close_where(conn: &Connection, filter: &str, p: impl rusqlite::Params, status: EncounterStatus, at: i64) -> CoreResult<Vec<Encounter>> {
    let ids: Vec<i64> = {
        let mut stmt = conn.prepare(&format!("SELECT id FROM encounters WHERE {filter}"))?;
        let rows = stmt.query_map(p, |r| r.get(0))?;
        rows.collect::<Result<_, _>>()?
    };
    let mut out = Vec::new();
    for id in ids {
        conn.execute(
            "UPDATE encounters SET status = ?2, closed_at = ?3 WHERE id = ?1",
            params![id, status.as_str(), at],
        )?;
        out.push(conn.query_row(&format!("SELECT {COLS} FROM encounters WHERE id = ?1"), params![id], row_to_encounter)?);
    }
    Ok(out)
}

pub fn active_for_agent(conn: &Connection, agent_id: &str) -> CoreResult<bool> {
    Ok(conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM encounters WHERE agent_id = ?1 AND status = 'active')",
        params![agent_id],
        |r| r.get(0),
    )?)
}
