//! Window commands used by the castle and the overlay.

use tauri::{AppHandle, Emitter, Manager, State};

use super::CmdResult;
use crate::platform::Rect;
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
pub fn set_overlay_visible(app: AppHandle, visible: bool) -> CmdResult<()> {
    windows::set_overlay_visible(&app, visible);
    Ok(())
}

/// The overlay reports where its characters/panels are so the rest of the strip
/// stays click-through.
#[tauri::command]
pub fn set_overlay_hitboxes(state: State<'_, AppState>, boxes: Vec<Rect>) -> CmdResult<()> {
    if boxes.len() > 64 {
        return Err("too many hitboxes".into());
    }
    *state.overlay_hitboxes.lock().map_err(|_| "lock")? = boxes;
    Ok(())
}

/// The overlay reports how wide its souls are, so the strip can shrink to them.
#[tauri::command]
pub fn set_overlay_content_width(app: AppHandle, state: State<'_, AppState>, width: u32) -> CmdResult<()> {
    let width = width.clamp(48, 8192);
    {
        let mut g = state.overlay_content_width.lock().map_err(|_| "lock")?;
        if *g == Some(width) {
            return Ok(());
        }
        *g = Some(width);
    }
    if let Some(w) = app.get_webview_window(windows::OVERLAY) {
        if state.backend_settings().desktop.auto_width {
            windows::position_overlay(&app, &w);
        }
    }
    Ok(())
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
