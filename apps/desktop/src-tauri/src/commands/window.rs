//! Window commands used by the castle and the overlay.

use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Emitter, LogicalPosition, Manager, State, WebviewWindow};

use super::CmdResult;
use crate::platform::Rect;
use crate::roam::{is_roamer, lane_after_move, lane_window};
use crate::state::AppState;
use crate::windows;

#[tauri::command]
pub fn show_castle(app: AppHandle, route: Option<String>) -> CmdResult<()> {
    windows::show_castle(&app);
    if let Some(route) = route.filter(|r| r.len() < 256) {
        let _ = app.emit_to(windows::CASTLE, "ids://navigate", route);
    }
    Ok(())
}

#[tauri::command]
pub fn set_overlay_visible(app: AppHandle, state: State<'_, AppState>, visible: bool) -> CmdResult<()> {
    if visible && state.backend_settings().desktop.roam && windows::roamers_shown(&app) {
        return Ok(());
    }
    windows::set_overlay_visible(&app, visible);
    Ok(())
}

/// The overlay reports where its characters/panels are so the rest of the strip
/// stays click-through.
#[tauri::command]
pub fn set_overlay_hitboxes(window: WebviewWindow, state: State<'_, AppState>, boxes: Vec<Rect>) -> CmdResult<()> {
    if boxes.len() > 64 {
        return Err("too many hitboxes".into());
    }
    state.overlay_hitboxes.lock().map_err(|_| "lock")?.insert(window.label().to_string(), boxes);
    Ok(())
}

/// The overlay reports how wide its souls are, so the strip can shrink to them.
#[tauri::command]
pub fn set_overlay_content_width(app: AppHandle, state: State<'_, AppState>, width: u32) -> CmdResult<()> {
    let width = width.clamp(48, 8192);
    {
        let mut w = state.overlay_content_width.lock().map_err(|_| "lock")?;
        if *w == Some(width) {
            return Ok(());
        }
        *w = Some(width);
    }
    if let Some(w) = app.get_webview_window(windows::OVERLAY) {
        let desktop = state.backend_settings().desktop;
        if !desktop.roam && desktop.auto_width {
            windows::position_overlay(&app, &w);
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn sync_roamers(app: AppHandle, agents: Vec<String>, width: u32, height: u32) -> CmdResult<()> {
    if agents.len() > 64 || agents.iter().any(|a| a.is_empty() || a.len() > 256) {
        return Err("invalid crew".into());
    }
    windows::sync_roamers(&app, agents, width.clamp(48, 1024), height.clamp(32, 1024));
    Ok(())
}

#[tauri::command]
pub fn claim_road_fight(state: State<'_, AppState>, stagger_ms: u64) -> CmdResult<bool> {
    let now = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0);
    Ok(state.roamers.lock().map_err(|_| "lock")?.claim_fight(now, stagger_ms.min(60_000)))
}

#[tauri::command]
pub fn overlay_area(app: AppHandle, window: WebviewWindow, state: State<'_, AppState>) -> CmdResult<serde_json::Value> {
    let actual = windows::window_rect(&window).ok_or("overlay has no size yet")?;
    let area = windows::roam_area(&app).ok_or("no monitor")?;
    let (lane, peers) = {
        let reg = state.roamers.lock().map_err(|_| "lock")?;
        (reg.rect(window.label()), reg.peers(window.label()))
    };
    let rect = lane.map(|l| lane_window(l, actual.height)).unwrap_or(actual);
    Ok(serde_json::json!({ "name": area.name, "window": rect, "monitor": area.monitor, "work": area.work, "peers": peers }))
}

#[tauri::command]
pub fn move_overlay(window: WebviewWindow, state: State<'_, AppState>, x: i32, y: i32) -> CmdResult<Vec<Rect>> {
    window.set_position(LogicalPosition::new(x as f64, y as f64)).map_err(|e| e.to_string())?;
    let label = window.label();
    if !is_roamer(label) {
        return Ok(Vec::new());
    }
    let actual = windows::window_rect(&window).map(|r| r.height).unwrap_or(0);
    let mut reg = state.roamers.lock().map_err(|_| "lock")?;
    if let Some(lane) = reg.rect(label) {
        reg.set_rect(label, lane_after_move(lane, x, y, actual));
    }
    Ok(reg.peers(label))
}

#[tauri::command]
pub fn overlay_info(app: AppHandle, state: State<'_, AppState>) -> CmdResult<serde_json::Value> {
    let visible = app.get_webview_window(windows::OVERLAY).and_then(|w| w.is_visible().ok()).unwrap_or(false);
    Ok(serde_json::json!({
        "visible": visible,
        "clickThrough": state.adapter.capabilities().click_through,
        "transparent": state.adapter.capabilities().transparent_windows,
    }))
}

/// Monitors the overlay can be placed on (name, size and whether it is the primary one).
#[tauri::command]
pub fn list_monitors(app: AppHandle) -> CmdResult<Vec<serde_json::Value>> {
    let w = app.get_webview_window(windows::CASTLE).or_else(|| app.get_webview_window(windows::OVERLAY)).ok_or("no window")?;
    let primary = w.primary_monitor().ok().flatten().and_then(|m| m.name().cloned());
    Ok(w
        .available_monitors()
        .unwrap_or_default()
        .iter()
        .filter_map(|m| {
            let name = m.name()?.clone();
            let s = m.size();
            Some(serde_json::json!({ "name": name, "width": s.width, "height": s.height, "primary": primary.as_deref() == Some(name.as_str()) }))
        })
        .collect())
}

#[tauri::command]
pub fn quit_app(app: AppHandle) {
    windows::quit(&app);
}
