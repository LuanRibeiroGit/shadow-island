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

#[tauri::command]
pub fn overlay_info(app: AppHandle, state: State<'_, AppState>) -> CmdResult<serde_json::Value> {
    let visible = app.get_webview_window(windows::OVERLAY).and_then(|w| w.is_visible().ok()).unwrap_or(false);
    Ok(serde_json::json!({
        "visible": visible,
        "clickThrough": state.adapter.capabilities().click_through,
        "transparent": state.adapter.capabilities().transparent_windows,
    }))
}

#[tauri::command]
pub fn quit_app(app: AppHandle) {
    windows::quit(&app);
}
