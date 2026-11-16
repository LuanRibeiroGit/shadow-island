//! Read-only data for the castle, overlay, dashboard, missions and history.

use ids_core::agents::Agent;
use ids_core::db::now_ms;
use ids_core::db::queries::{self as q, Filter};
use ids_core::encounters::Encounter;
use ids_core::engine::EventRecord;
use ids_core::missions::Mission;
use serde::Serialize;
use tauri::State;

use super::{conn, err, CmdResult};
use crate::state::AppState;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub agents: Vec<Agent>,
    pub recent_agents: Vec<Agent>,
    pub sessions: Vec<q::SessionSummary>,
    pub missions: Vec<Mission>,
    pub encounters: Vec<Encounter>,
    pub events: Vec<EventRecord>,
    pub now: i64,
}

/// Everything a window needs on start; afterwards it applies `ids://updates`.
#[tauri::command]
pub fn get_snapshot(state: State<'_, AppState>) -> CmdResult<Snapshot> {
    let c = conn(&state)?;
    let active = Filter { status: Some("active".into()), limit: Some(50), ..Default::default() };
    let mut missions = q::missions(&c, &Filter { status: Some("in_progress".into()), limit: Some(100), ..Default::default() }).map_err(err)?;
    missions.extend(q::missions(&c, &Filter { status: Some("waiting".into()), limit: Some(100), ..Default::default() }).map_err(err)?);
    Ok(Snapshot {
        agents: q::active_agents(&c).map_err(err)?,
        recent_agents: q::recent_agents(&c, 12).map_err(err)?,
        sessions: q::sessions(&c, &active).map_err(err)?,
        missions,
        encounters: q::active_encounters(&c).map_err(err)?,
        events: q::events(&c, &Filter { limit: Some(60), ..Default::default() }).map_err(err)?,
        now: now_ms(),
    })
}

#[tauri::command]
pub fn get_agent_detail(state: State<'_, AppState>, id: String) -> CmdResult<Option<q::AgentDetail>> {
    q::agent_detail(&*conn(&state)?, &id).map_err(err)
}

#[tauri::command]
pub fn list_agents(state: State<'_, AppState>, filter: Filter) -> CmdResult<Vec<Agent>> {
    q::agents(&*conn(&state)?, &filter).map_err(err)
}

#[tauri::command]
pub fn list_sessions(state: State<'_, AppState>, filter: Filter) -> CmdResult<Vec<q::SessionSummary>> {
    q::sessions(&*conn(&state)?, &filter).map_err(err)
}

#[tauri::command]
pub fn get_session_detail(state: State<'_, AppState>, id: String) -> CmdResult<Option<q::SessionDetail>> {
    q::session_detail(&*conn(&state)?, &id).map_err(err)
}

#[tauri::command]
pub fn list_events(state: State<'_, AppState>, filter: Filter) -> CmdResult<Vec<EventRecord>> {
    q::events(&*conn(&state)?, &filter).map_err(err)
}

#[tauri::command]
pub fn list_missions(state: State<'_, AppState>, filter: Filter) -> CmdResult<Vec<Mission>> {
    q::missions(&*conn(&state)?, &filter).map_err(err)
}

#[tauri::command]
pub fn list_projects(state: State<'_, AppState>) -> CmdResult<Vec<q::Project>> {
    q::projects(&*conn(&state)?).map_err(err)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Dashboard {
    pub overview: q::Overview,
    pub usage_series: Vec<q::UsageBucket>,
    pub activity_series: Vec<q::Distribution>,
    pub by_session: Vec<q::LabeledTokens>,
    pub by_agent: Vec<q::LabeledTokens>,
    pub states: Vec<q::Distribution>,
    pub categories: Vec<q::Distribution>,
    pub from: i64,
    pub to: i64,
    pub bucket_ms: i64,
}

/// Dashboard data for the last `period_days` days (0 = all time).
#[tauri::command]
pub fn get_dashboard(state: State<'_, AppState>, period_days: u32) -> CmdResult<Dashboard> {
    let c = conn(&state)?;
    let now = now_ms();
    let from = if period_days == 0 { 0 } else { now - period_days as i64 * 86_400_000 };
    let bucket_ms = if period_days == 1 { 3_600_000 } else { 86_400_000 };
    Ok(Dashboard {
        overview: q::overview(&c, Some(from), now).map_err(err)?,
        usage_series: q::usage_timeseries(&c, from, now, bucket_ms).map_err(err)?,
        activity_series: q::activity_timeseries(&c, from, now, bucket_ms).map_err(err)?,
        by_session: q::tokens_by_session(&c, from, 30).map_err(err)?,
        by_agent: q::tokens_by_agent(&c, from, 30).map_err(err)?,
        states: q::state_distribution(&c, from, now).map_err(err)?,
        categories: q::category_distribution(&c, from).map_err(err)?,
        from,
        to: now,
        bucket_ms,
    })
}

#[tauri::command]
pub fn get_characters(state: State<'_, AppState>) -> CmdResult<Vec<(String, serde_json::Value)>> {
    let rows = q::characters(&*conn(&state)?).map_err(err)?;
    Ok(rows.into_iter().filter_map(|(id, d)| serde_json::from_str(&d).ok().map(|v| (id, v))).collect())
}
