//! Window management: castle (main) window, desktop overlay, tray and shortcut.
//! Platform decisions come from the PlatformAdapter.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, Monitor, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};

use crate::platform::{overlay_rect_fit, roam_spawn, CloseBehavior, OverlayPlacement, Rect};
use crate::roam::{agent_query, is_roamer};
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
    let w = overlay_window(app, OVERLAY, "overlay.html".into(), "Ilha das Sombras · tripulação", 800.0, 52.0)?;
    position_overlay(app, &w);
    start_click_through_tracker(app.clone());
    Ok(w)
}

fn overlay_window(app: &AppHandle, label: &str, url: String, title: &str, width: f64, height: f64) -> tauri::Result<WebviewWindow> {
    WebviewWindowBuilder::new(app, label, WebviewUrl::App(url.into()))
        .title(title)
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
        .inner_size(width, height)
        .build()
}

pub struct MonitorArea {
    pub name: Option<String>,
    pub scale: f64,
    pub monitor: Rect,
    pub work: Rect,
}

impl MonitorArea {
    fn of(mon: &Monitor) -> Self {
        let scale = mon.scale_factor();
        let to_logical = |x: f64| (x / scale).round() as i32;
        let wa = mon.work_area();
        Self {
            name: mon.name().cloned(),
            scale,
            monitor: Rect {
                x: to_logical(mon.position().x as f64),
                y: to_logical(mon.position().y as f64),
                width: to_logical(mon.size().width as f64) as u32,
                height: to_logical(mon.size().height as f64) as u32,
            },
            work: Rect {
                x: to_logical(wa.position.x as f64),
                y: to_logical(wa.position.y as f64),
                width: to_logical(wa.size.width as f64) as u32,
                height: to_logical(wa.size.height as f64) as u32,
            },
        }
    }
}

fn chosen_monitor(w: &WebviewWindow, name: Option<&String>) -> Option<Monitor> {
    let monitors = w.available_monitors().unwrap_or_default();
    name.and_then(|name| monitors.iter().find(|m| m.name() == Some(name)).cloned())
        .or_else(|| w.primary_monitor().ok().flatten())
        .or_else(|| monitors.first().cloned())
}

pub fn window_rect(w: &WebviewWindow) -> Option<Rect> {
    let pos = w.outer_position().ok()?;
    let size = w.inner_size().ok()?;
    let scale = w.scale_factor().ok()?;
    let to_logical = |x: f64| (x / scale).round() as i32;
    Some(Rect { x: to_logical(pos.x as f64), y: to_logical(pos.y as f64), width: to_logical(size.width as f64) as u32, height: to_logical(size.height as f64) as u32 })
}

pub fn roam_area(app: &AppHandle) -> Option<MonitorArea> {
    let w = app.get_webview_window(OVERLAY).or_else(|| app.get_webview_window(CASTLE))?;
    let s = app.state::<AppState>().backend_settings().desktop;
    chosen_monitor(&w, s.monitor.as_ref()).map(|m| MonitorArea::of(&m))
}

pub fn position_overlay(app: &AppHandle, w: &WebviewWindow) {
    let state = app.state::<AppState>();
    let s = state.backend_settings().desktop;
    if s.roam {
        return;
    }
    let Some(mon) = chosen_monitor(w, s.monitor.as_ref()) else { return };
    let area = MonitorArea::of(&mon);
    let content = if s.auto_width { state.overlay_content_width.lock().ok().and_then(|g| *g) } else { None };
    let r = overlay_rect_fit(area.monitor, Some(area.work), s.placement, s.height, s.width_fraction, content, s.align);
    log::info!("overlay: monitor {:?} {:?} work {:?} align {:?} content {content:?} -> {r:?}", area.name, area.monitor, area.work, s.align);
    apply_overlay_rect(w, r, area.scale, matches!(s.placement, OverlayPlacement::Bottom | OverlayPlacement::Taskbar));
}

fn apply_overlay_rect(w: &WebviewWindow, r: Rect, scale: f64, keep_bottom: bool) {
    let _ = w.set_size(LogicalSize::new(r.width as f64, r.height as f64));
    let _ = w.set_position(LogicalPosition::new(r.x as f64, r.y as f64));

    // Some platforms enforce a minimum window height (e.g. GTK/WebKit on Linux
    // keeps webviews at least ~200 px tall). Re-check the real size once it has
    // settled and keep the strip's edge glued to the work area.
    let w2 = w.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(250));
        let Ok(size) = w2.inner_size() else { return };
        let actual = (size.height as f64 / scale).round() as i32;
        let mut y = r.y;
        if actual > r.height as i32 && keep_bottom {
            y = r.y + r.height as i32 - actual;
            log::info!("overlay: window is {actual}px tall (asked {}), moving to y={y}", r.height);
        }
        // Always re-apply the position: window managers (GNOME/XWayland) may
        // place a freshly shown or resized window on their own.
        let _ = w2.set_position(LogicalPosition::new(r.x as f64, y as f64));
    });
}

fn roam_bottom(app: &AppHandle, area: &MonitorArea) -> Option<i32> {
    let s = app.state::<AppState>().backend_settings().desktop;
    s.free_position.as_ref().filter(|p| area.name.as_ref() == Some(&p.monitor)).map(|p| area.monitor.y + p.bottom)
}

pub fn sync_roamers(app: &AppHandle, agents: Vec<String>, width: u32, height: u32) {
    let state = app.state::<AppState>();
    let s = state.backend_settings().desktop;
    let agents = if s.roam && s.overlay_enabled { agents } else { Vec::new() };
    let area = roam_area(app);
    let bottom = area.as_ref().and_then(|a| roam_bottom(app, a));
    let (plan, resized, shown) = {
        let Ok(mut reg) = state.roamers.lock() else { return };
        let plan = reg.plan(&agents);
        let resized = reg.resize(width, height);
        for r in &plan.added {
            match &area {
                Some(a) => {
                    let taken: Vec<Rect> = reg.placed().into_iter().map(|(_, rect)| rect).collect();
                    let rect = roam_spawn(a.monitor, Some(a.work), s.placement, width, height, bottom, &taken);
                    reg.set_rect(&r.label, rect);
                }
                None => reg.forget(&r.label),
            }
        }
        (plan, resized, reg.shown)
    };
    if let Ok(mut boxes) = state.overlay_hitboxes.lock() {
        for label in &plan.removed {
            boxes.remove(label);
        }
    }
    for label in &plan.removed {
        if let Some(w) = app.get_webview_window(label) {
            let _ = w.destroy();
        }
    }
    let Some(area) = area else { return };
    for (label, rect) in resized {
        if let Some(w) = app.get_webview_window(&label) {
            apply_overlay_rect(&w, rect, area.scale, true);
        }
    }
    for roamer in plan.added {
        let Some(rect) = state.roamers.lock().ok().and_then(|reg| reg.rect(&roamer.label)) else { continue };
        let url = format!("overlay.html?agent={}", agent_query(&roamer.agent));
        let w = match overlay_window(app, &roamer.label, url, "Ilha das Sombras · tripulante", rect.width as f64, rect.height as f64) {
            Ok(w) => w,
            Err(e) => {
                log::warn!("overlay: roamer for {} not created: {e}", roamer.agent);
                if let Ok(mut reg) = state.roamers.lock() {
                    reg.forget(&roamer.label);
                }
                continue;
            }
        };
        if !state.roamers.lock().map(|reg| reg.contains(&roamer.label)).unwrap_or(false) {
            let _ = w.destroy();
            continue;
        }
        if shown {
            let _ = w.show();
            let _ = w.set_always_on_top(true);
        }
        log::info!("overlay: roamer {} for {} at {rect:?}", roamer.label, roamer.agent);
        apply_overlay_rect(&w, rect, area.scale, true);
    }
}

pub fn relayout_roamers(app: &AppHandle) {
    let state = app.state::<AppState>();
    let s = state.backend_settings().desktop;
    if !s.roam || !s.overlay_enabled {
        return;
    }
    let Some(area) = roam_area(app) else { return };
    let bottom = roam_bottom(app, &area);
    let placed = {
        let Ok(mut reg) = state.roamers.lock() else { return };
        let Some((width, height)) = reg.size() else { return };
        reg.relayout(|taken| roam_spawn(area.monitor, Some(area.work), s.placement, width, height, bottom, taken))
    };
    for (label, rect) in placed {
        if let Some(w) = app.get_webview_window(&label) {
            apply_overlay_rect(&w, rect, area.scale, true);
        }
    }
}

fn close_roamers(app: &AppHandle) {
    let state = app.state::<AppState>();
    let removed = match state.roamers.lock() {
        Ok(mut reg) => {
            reg.shown = false;
            reg.plan(&[]).removed
        }
        Err(_) => return,
    };
    for label in removed {
        if let Some(w) = app.get_webview_window(&label) {
            let _ = w.destroy();
        }
    }
}

fn show_roamers(app: &AppHandle, shown: bool) {
    let state = app.state::<AppState>();
    let placed = match state.roamers.lock() {
        Ok(mut reg) => {
            reg.shown = shown;
            reg.placed()
        }
        Err(_) => return,
    };
    let scale = roam_area(app).map(|a| a.scale).unwrap_or(1.0);
    for (label, rect) in placed {
        let Some(w) = app.get_webview_window(&label) else { continue };
        if shown {
            let _ = w.show();
            let _ = w.set_always_on_top(true);
            apply_overlay_rect(&w, rect, scale, true);
        } else {
            let _ = w.hide();
        }
    }
}

pub fn roamers_shown(app: &AppHandle) -> bool {
    app.state::<AppState>().roamers.lock().map(|reg| reg.shown).unwrap_or(false)
}

pub fn set_overlay_visible(app: &AppHandle, visible: bool) {
    let roam = app.state::<AppState>().backend_settings().desktop.roam;
    if visible {
        if let Ok(w) = ensure_overlay(app) {
            if roam {
                let _ = w.hide();
                show_roamers(app, true);
                return;
            }
            close_roamers(app);
            let _ = w.show();
            let _ = w.set_always_on_top(true);
            // Position after showing: before it is mapped the window manager may
            // ignore the requested position and use its own placement.
            position_overlay(app, &w);
        }
    } else {
        show_roamers(app, false);
        if let Some(w) = app.get_webview_window(OVERLAY) {
            let _ = w.hide();
        }
    }
}

pub fn toggle_overlay(app: &AppHandle) {
    let visible = if app.state::<AppState>().backend_settings().desktop.roam {
        roamers_shown(app)
    } else {
        app.get_webview_window(OVERLAY).and_then(|w| w.is_visible().ok()).unwrap_or(false)
    };
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
            let mut ignoring: HashMap<String, bool> = HashMap::new();
            loop {
                std::thread::sleep(Duration::from_millis(80));
                if QUITTING.load(Ordering::SeqCst) {
                    return;
                }
                let shown: Vec<WebviewWindow> = app
                    .webview_windows()
                    .into_iter()
                    .filter(|(label, _)| label == OVERLAY || is_roamer(label))
                    .map(|(_, w)| w)
                    .filter(|w| w.is_visible().unwrap_or(false))
                    .collect();
                ignoring.retain(|label, _| shown.iter().any(|w| w.label() == label));
                if shown.is_empty() {
                    std::thread::sleep(Duration::from_millis(400));
                    continue;
                }
                let Ok(cursor) = app.cursor_position() else { continue };
                let boxes = app.state::<AppState>().overlay_hitboxes.lock().map(|b| b.clone()).unwrap_or_default();
                for w in shown {
                    let (Ok(pos), Ok(scale)) = (w.outer_position(), w.scale_factor()) else { continue };
                    let lx = (cursor.x - pos.x as f64) / scale;
                    let ly = (cursor.y - pos.y as f64) / scale;
                    let inside = boxes.get(w.label()).is_some_and(|boxes| {
                        boxes.iter().any(|b| lx >= b.x as f64 && ly >= b.y as f64 && lx <= (b.x + b.width as i32) as f64 && ly <= (b.y + b.height as i32) as f64)
                    });
                    let ignore = !inside;
                    if ignoring.get(w.label()) != Some(&ignore) {
                        let _ = w.set_ignore_cursor_events(ignore);
                        ignoring.insert(w.label().to_string(), ignore);
                    }
                }
            }
        })
        .ok();
}
