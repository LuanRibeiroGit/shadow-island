//! Window management: castle (main) window, desktop overlay, tray and shortcut.
//! Platform decisions come from the PlatformAdapter.

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};

use crate::platform::{overlay_rect_fit, CloseBehavior, OverlayPlacement, Rect};
use crate::state::AppState;

pub const CASTLE: &str = "castle";
pub const OVERLAY: &str = "overlay";

static QUITTING: AtomicBool = AtomicBool::new(false);

pub fn show_castle(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(CASTLE) {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

pub fn toggle_castle(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(CASTLE) {
        if w.is_visible().unwrap_or(false) && !w.is_minimized().unwrap_or(false) {
            let _ = w.hide();
        } else {
            show_castle(app);
        }
    }
}

pub fn quit(app: &AppHandle) {
    QUITTING.store(true, Ordering::SeqCst);
    app.exit(0);
}

/// Close button on the castle: hide to tray, minimize, or quit, per adapter.
pub fn install_castle_close_handler(app: &AppHandle) {
    let Some(w) = app.get_webview_window(CASTLE) else { return };
    let handle = app.clone();
    w.on_window_event(move |ev| {
        if let WindowEvent::CloseRequested { api, .. } = ev {
            if QUITTING.load(Ordering::SeqCst) {
                return;
            }
            let state = handle.state::<AppState>();
            let behavior = state.adapter.close_behavior(state.backend_settings().general.minimize_to_tray);
            if let Some(w) = handle.get_webview_window(CASTLE) {
                match behavior {
                    CloseBehavior::HideToTray => {
                        api.prevent_close();
                        let _ = w.hide();
                    }
                    CloseBehavior::Minimize => {
                        api.prevent_close();
                        let _ = w.minimize();
                    }
                    CloseBehavior::Quit => quit(&handle),
                }
            }
        }
    });
}

pub fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Abrir castelo", true, None::<&str>)?;
    let crew = MenuItem::with_id(app, "crew", "Mostrar/ocultar tripulação", true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let quit_i = MenuItem::with_id(app, "quit", "Sair", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &crew, &sep, &quit_i])?;
    let mut builder = TrayIconBuilder::with_id("main")
        .tooltip("Ilha das Sombras")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, ev| match ev.id().as_ref() {
            "open" => show_castle(app),
            "crew" => toggle_overlay(app),
            "quit" => quit(app),
            _ => {}
        })
        .on_tray_icon_event(|tray, ev| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = ev {
                toggle_castle(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

pub fn register_shortcut(app: &AppHandle, accelerator: &str) -> Result<(), String> {
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
    let gs = app.global_shortcut();
    let _ = gs.unregister_all();
    if accelerator.trim().is_empty() {
        return Ok(());
    }
    gs.on_shortcut(accelerator, |app, _sc, ev| {
        if ev.state == ShortcutState::Pressed {
            toggle_castle(app);
        }
    })
    .map_err(|e| e.to_string())
}

pub fn ensure_overlay(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    if let Some(w) = app.get_webview_window(OVERLAY) {
        return Ok(w);
    }
    let w = WebviewWindowBuilder::new(app, OVERLAY, WebviewUrl::App("overlay.html".into()))
        .title("Ilha das Sombras · tripulação")
        .transparent(true)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        // GTK keeps non-resizable windows at their natural size (~200 px for a
        // webview); a resizable, undecorated window can be made as thin as the taskbar.
        .resizable(true)
        .shadow(false)
        .focused(false)
        .visible(false)
        .inner_size(800.0, 52.0)
        .build()?;
    position_overlay(app, &w);
    start_click_through_tracker(app.clone());
    Ok(w)
}

pub fn position_overlay(app: &AppHandle, w: &WebviewWindow) {
    let state = app.state::<AppState>();
    let s = state.backend_settings().desktop;
    let monitors = w.available_monitors().unwrap_or_default();
    let mon = s
        .monitor
        .as_ref()
        .and_then(|name| monitors.iter().find(|m| m.name().map(|n| n == name).unwrap_or(false)).cloned())
        .or_else(|| w.primary_monitor().ok().flatten())
        .or_else(|| monitors.first().cloned());
    let Some(mon) = mon else { return };
    let scale = mon.scale_factor();
    let to_logical = |x: f64| (x / scale).round() as i32;
    let m = Rect {
        x: to_logical(mon.position().x as f64),
        y: to_logical(mon.position().y as f64),
        width: to_logical(mon.size().width as f64) as u32,
        height: to_logical(mon.size().height as f64) as u32,
    };
    let wa = mon.work_area();
    let work = Rect {
        x: to_logical(wa.position.x as f64),
        y: to_logical(wa.position.y as f64),
        width: to_logical(wa.size.width as f64) as u32,
        height: to_logical(wa.size.height as f64) as u32,
    };
    let content = if s.auto_width { state.overlay_content_width.lock().ok().and_then(|g| *g) } else { None };
    let r = overlay_rect_fit(m, Some(work), s.placement, s.height, s.width_fraction, content, s.align);
    log::info!("overlay: monitor {:?} {m:?} work {work:?} align {:?} content {content:?} -> {r:?}", mon.name(), s.align);
    let _ = w.set_size(LogicalSize::new(r.width as f64, r.height as f64));
    let _ = w.set_position(LogicalPosition::new(r.x as f64, r.y as f64));

    // Some platforms enforce a minimum window height (e.g. GTK/WebKit on Linux
    // keeps webviews at least ~200 px tall). Re-check the real size once it has
    // settled and keep the strip's edge glued to the work area.
    let w2 = w.clone();
    let placement = s.placement;
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(250));
        let Ok(size) = w2.inner_size() else { return };
        let actual = (size.height as f64 / scale).round() as i32;
        let mut y = r.y;
        if actual > r.height as i32 && matches!(placement, OverlayPlacement::Bottom | OverlayPlacement::Taskbar) {
            y = r.y + r.height as i32 - actual;
            log::info!("overlay: window is {actual}px tall (asked {}), moving to y={y}", r.height);
        }
        // Always re-apply the position: window managers (GNOME/XWayland) may
        // place a freshly shown or resized window on their own.
        let _ = w2.set_position(LogicalPosition::new(r.x as f64, y as f64));
    });
}

pub fn set_overlay_visible(app: &AppHandle, visible: bool) {
    if visible {
        if let Ok(w) = ensure_overlay(app) {
            let _ = w.show();
            let _ = w.set_always_on_top(true);
            // Position after showing: before it is mapped the window manager may
            // ignore the requested position and use its own placement.
            position_overlay(app, &w);
        }
    } else if let Some(w) = app.get_webview_window(OVERLAY) {
        let _ = w.hide();
    }
}

pub fn toggle_overlay(app: &AppHandle) {
    let visible = app.get_webview_window(OVERLAY).and_then(|w| w.is_visible().ok()).unwrap_or(false);
    set_overlay_visible(app, !visible);
}

/// Click-through: the overlay ignores the mouse except over character hitboxes.
/// Polls the global cursor only while the overlay is visible and has hitboxes,
/// at a low rate; does nothing on platforms without a global cursor position.
fn start_click_through_tracker(app: AppHandle) {
    let supported = app.state::<AppState>().adapter.capabilities().click_through == crate::platform::Support::Full;
    if !supported {
        return;
    }
    std::thread::Builder::new()
        .name("ids-overlay-hit".into())
        .spawn(move || {
            let mut ignoring: Option<bool> = None;
            loop {
                std::thread::sleep(Duration::from_millis(80));
                if QUITTING.load(Ordering::SeqCst) {
                    return;
                }
                let Some(w) = app.get_webview_window(OVERLAY) else { return };
                if !w.is_visible().unwrap_or(false) {
                    std::thread::sleep(Duration::from_millis(400));
                    continue;
                }
                let boxes = app.state::<AppState>().overlay_hitboxes.lock().map(|b| b.clone()).unwrap_or_default();
                let (Ok(cursor), Ok(pos), Ok(scale)) = (app.cursor_position(), w.outer_position(), w.scale_factor()) else { continue };
                let lx = (cursor.x - pos.x as f64) / scale;
                let ly = (cursor.y - pos.y as f64) / scale;
                let inside = boxes.iter().any(|b| {
                    lx >= b.x as f64 && ly >= b.y as f64 && lx <= (b.x + b.width as i32) as f64 && ly <= (b.y + b.height as i32) as f64
                });
                let ignore = !inside;
                if ignoring != Some(ignore) {
                    let _ = w.set_ignore_cursor_events(ignore);
                    ignoring = Some(ignore);
                }
            }
        })
        .ok();
}
