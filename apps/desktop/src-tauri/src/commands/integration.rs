//! Claude Code integration: status, install (plan -> apply), remove, diagnostics.

use ids_core::db::now_ms;
use ids_core::db::queries as q;
use ids_core::hooks_install::{self as hi, HookCommand, IntegrationStatus, Plan};
use serde::Serialize;
use std::sync::atomic::Ordering;
use tauri::State;

use super::{conn, err, CmdResult};
use crate::collector::{spool, CollectorSnapshot};
use crate::state::AppState;

fn hook_command(state: &AppState) -> HookCommand {
    HookCommand { executable: state.hook_executable(), data_dir: state.data_dir.clone() }
}

fn settings_path(state: &AppState) -> CmdResult<std::path::PathBuf> {
    state.adapter.claude_settings_path().ok_or_else(|| "pasta do usuário não encontrada".to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IntegrationInfo {
    pub status: IntegrationStatus,
    pub hook_executable: String,
    pub hook_executable_exists: bool,
    pub collector: CollectorSnapshot,
    pub db: q::DbDiagnostics,
    pub events: Vec<&'static str>,
}

pub fn collector_snapshot(state: &AppState) -> CollectorSnapshot {
    let port = state.collector.lock().ok().and_then(|c| c.as_ref().map(|c| c.port));
    let last = state.stats.last_received_at.load(Ordering::Relaxed);
    CollectorSnapshot {
        running: port.is_some(),
        port,
        received: state.stats.received.load(Ordering::Relaxed),
        rejected: state.stats.rejected.load(Ordering::Relaxed),
        duplicates: state.stats.duplicates.load(Ordering::Relaxed),
        replayed: state.stats.replayed.load(Ordering::Relaxed),
        last_error: state.stats.last_error.lock().ok().and_then(|g| g.clone()),
        last_received_at: (last > 0).then_some(last),
        spool_bytes: spool::spool_size(&state.data_dir),
    }
}

#[tauri::command]
pub fn integration_info(state: State<'_, AppState>) -> CmdResult<IntegrationInfo> {
    let exe = state.hook_executable();
    Ok(IntegrationInfo {
        status: hi::status(&settings_path(&state)?, &hook_command(&state)),
        hook_executable_exists: exe.exists(),
        hook_executable: exe.to_string_lossy().to_string(),
        collector: collector_snapshot(&state),
        db: q::diagnostics(&*conn(&state)?, now_ms()).map_err(err)?,
        events: ids_core::event::HookEventName::installable().to_vec(),
    })
}

/// Step 1: compute the change and show it to the user. Writes nothing.
#[tauri::command]
pub fn integration_plan(state: State<'_, AppState>, action: String) -> CmdResult<Plan> {
    let path = settings_path(&state)?;
    match action.as_str() {
        "install" => {
            if !state.hook_executable().exists() {
                return Err(format!("O programa de integração não foi encontrado em {}", state.hook_executable().display()));
            }
            hi::plan_install(&path, &hook_command(&state)).map_err(err)
        }
        "remove" => hi::plan_remove(&path).map_err(err),
        _ => Err("ação inválida".into()),
    }
}

/// Step 2: apply after explicit confirmation. The plan is recomputed here and must
/// match what the user reviewed (`expected_after`), so nothing unseen is written.
#[tauri::command]
pub fn integration_apply(state: State<'_, AppState>, action: String, expected_after: String) -> CmdResult<Option<String>> {
    let plan = integration_plan(state.clone(), action)?;
    if plan.after != expected_after {
        return Err("O settings.json mudou desde a revisão. Revise novamente.".into());
    }
    let backup = hi::apply(&plan, &state.data_dir.join("backups"), now_ms()).map_err(err)?;
    log::info!("integration settings updated ({} events changed)", plan.changed_events.len());
    Ok(backup.map(|b| b.to_string_lossy().to_string()))
}
