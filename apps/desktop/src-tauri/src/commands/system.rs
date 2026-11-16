//! Settings, platform info, diagnostics, export and backup.

use std::path::PathBuf;

use ids_core::db::now_ms;
use ids_core::db::queries::{self as q, Filter};
use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, State};

use super::{conn, err, CmdResult};
use crate::platform::{Capabilities, PlatformInfo};
use crate::state::AppState;
use crate::{settings, windows};

pub const SETTINGS_EVENT: &str = "ids://settings";

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> CmdResult<Value> {
    Ok(state.settings.lock().map_err(|_| "lock")?.clone())
}

#[tauri::command]
pub fn save_settings(app: AppHandle, state: State<'_, AppState>, value: Value) -> CmdResult<()> {
    let value = settings::validate(&value)?;
    let before = state.backend_settings();
    {
        // Settings are written through the read connection handle's own short
        // write (WAL, busy_timeout) to keep the engine thread free of UI concerns.
        let c = conn(&state)?;
        q::set_setting(&c, settings::SETTINGS_KEY, &value.to_string(), now_ms()).map_err(err)?;
    }
    *state.settings.lock().map_err(|_| "lock")? = value.clone();
    crate::apply_settings(&app, Some(&before));
    let _ = app.emit(SETTINGS_EVENT, value);
    Ok(())
}

#[tauri::command]
pub fn save_character(app: AppHandle, state: State<'_, AppState>, id: String, data: Value) -> CmdResult<()> {
    if id.is_empty() || id.len() > 200 || data.to_string().len() > 16 * 1024 {
        return Err("personagem inválido".into());
    }
    q::set_character(&*conn(&state)?, &id, &data.to_string(), now_ms()).map_err(err)?;
    let _ = app.emit("ids://characters", ());
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemInfo {
    pub version: String,
    pub platform: PlatformInfo,
    pub capabilities: Capabilities,
    pub data_dir: String,
    pub db_path: String,
    pub log_path: String,
    pub db_size_bytes: u64,
    pub autostart_enabled: Option<bool>,
    pub debug_build: bool,
}

#[tauri::command]
pub fn system_info(app: AppHandle, state: State<'_, AppState>) -> CmdResult<SystemInfo> {
    use tauri_plugin_autostart::ManagerExt;
    Ok(SystemInfo {
        version: app.package_info().version.to_string(),
        platform: state.adapter.info().clone(),
        capabilities: state.adapter.capabilities().clone(),
        data_dir: state.data_dir.to_string_lossy().to_string(),
        db_path: state.db_path.to_string_lossy().to_string(),
        log_path: state.log_path.to_string_lossy().to_string(),
        db_size_bytes: std::fs::metadata(&state.db_path).map(|m| m.len()).unwrap_or(0),
        autostart_enabled: app.autolaunch().is_enabled().ok(),
        debug_build: cfg!(debug_assertions),
    })
}

/// Errors thrown in the webviews, so a blank window can be diagnosed from the log
/// file. Text is truncated; the logger's redaction still applies.
#[tauri::command]
pub fn log_client_error(window: tauri::Window, message: String) {
    let msg: String = message.chars().take(600).collect();
    log::error!("ui[{}]: {}", window.label(), msg);
}

#[tauri::command]
pub fn read_logs(state: State<'_, AppState>, lines: Option<usize>) -> CmdResult<Vec<String>> {
    Ok(crate::logging::tail(&state.log_path, lines.unwrap_or(200).min(2000)))
}

fn exports_dir(app: &AppHandle, state: &AppState) -> PathBuf {
    app.path().download_dir().ok().filter(|d| d.exists()).unwrap_or_else(|| state.data_dir.join("exports"))
}

/// Export metadata (sessions, agents, missions, events, usage) as JSON. Returns the
/// path of the written file.
#[tauri::command]
pub fn export_data(app: AppHandle, state: State<'_, AppState>) -> CmdResult<String> {
    let c = conn(&state)?;
    let all = Filter { limit: Some(1000), ..Default::default() };
    let doc = serde_json::json!({
        "app": "Ilha das Sombras",
        "version": app.package_info().version.to_string(),
        "exportedAt": now_ms(),
        "projects": q::projects(&c).map_err(err)?,
        "sessions": q::sessions(&c, &all).map_err(err)?,
        "agents": q::agents(&c, &all).map_err(err)?,
        "missions": q::missions(&c, &all).map_err(err)?,
        "events": q::events(&c, &all).map_err(err)?,
    });
    let dir = exports_dir(&app, &state);
    std::fs::create_dir_all(&dir).map_err(err)?;
    let path = dir.join(format!("ilha-das-sombras-export-{}.json", now_ms()));
    std::fs::write(&path, serde_json::to_vec_pretty(&doc).map_err(err)?).map_err(err)?;
    Ok(path.to_string_lossy().to_string())
}

/// Consistent copy of the database (`VACUUM INTO`). Returns the backup path.
#[tauri::command]
pub fn backup_database(app: AppHandle, state: State<'_, AppState>) -> CmdResult<String> {
    let dir = exports_dir(&app, &state);
    std::fs::create_dir_all(&dir).map_err(err)?;
    let path = dir.join(format!("ilha-das-sombras-backup-{}.db", now_ms()));
    conn(&state)?.execute("VACUUM INTO ?1", [path.to_string_lossy().as_ref()]).map_err(err)?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn toggle_castle(app: AppHandle) {
    windows::toggle_castle(&app);
}
