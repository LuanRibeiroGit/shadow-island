//! Ilha das Sombras desktop app (Tauri 2).

mod collector;
mod commands;
mod engine_host;
mod logging;
mod platform;
mod roam;
mod settings;
mod state;
mod windows;

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use ids_core::db::queries as q;
use ids_core::engine::{Engine, EngineConfig};
use ids_core::model::AgentSpecialty;
use ids_core::normalize::NormalizeOptions;
use tauri::{AppHandle, Manager, RunEvent};

use collector::server::CollectorServer;
use collector::{runtime, spool, CollectorStats};
use engine_host::EngineMsg;
use platform::PlatformAdapter;
use settings::BackendSettings;
use state::AppState;

pub const BACKGROUND_FLAG: &str = "--background";

fn engine_config(adapter: &PlatformAdapter, s: &BackendSettings) -> EngineConfig {
    let mut roots = adapter.claude_transcript_roots();
    roots.extend(s.claude.extra_transcript_dirs.iter().filter(|d| !d.is_empty()).map(PathBuf::from));
    let overrides: HashMap<String, AgentSpecialty> = s
        .claude
        .specialty_overrides
        .iter()
        .map(|(k, v)| (k.clone(), AgentSpecialty::parse(v)))
        .collect();
    EngineConfig {
        normalize: NormalizeOptions { keep_prompt_excerpt: s.claude.keep_prompt_excerpt },
        transcript_roots: roots,
        specialty_overrides: overrides,
    }
}

/// Start/stop the collector according to settings. While stopped, `ids-hook`
/// finds no runtime.json and spools events to disk instead.
fn sync_collector(app: &AppHandle, enabled: bool) {
    let state = app.state::<AppState>();
    let Ok(mut guard) = state.collector.lock() else { return };
    match (enabled, guard.is_some()) {
        (true, false) => {
            let Ok(tx) = state.engine_tx.lock().map(|t| t.clone()) else { return };
            match CollectorServer::start(state.token.clone(), tx, state.stats.clone()) {
                Ok(server) => {
                    let adapter = state.adapter.clone();
                    if let Err(e) = runtime::write(&state.data_dir, server.port, &state.token, |p| adapter.protect_file(p)) {
                        log::error!("could not write runtime.json: {e}");
                    }
                    *guard = Some(server);
                    drop(guard);
                    replay_spool(&state);
                }
                Err(e) => {
                    log::error!("collector failed to start: {e}");
                    state.stats.error(format!("collector: {e}"));
                }
            }
        }
        (false, true) => {
            runtime::remove(&state.data_dir);
            *guard = None;
        }
        _ => {}
    }
}

fn replay_spool(state: &AppState) {
    match spool::take(&state.data_dir, ids_core::db::now_ms()) {
        Ok(lines) if !lines.is_empty() => {
            log::info!("replaying {} spooled events", lines.len());
            state.send(EngineMsg::Replay(lines));
        }
        Ok(_) => {}
        Err(e) => log::warn!("spool replay failed: {e}"),
    }
}

/// Apply settings that have side effects. `before` is None on startup.
pub(crate) fn apply_settings(app: &AppHandle, before: Option<&BackendSettings>) {
    use tauri_plugin_autostart::ManagerExt;
    let state = app.state::<AppState>();
    let s = state.backend_settings();

    state.send(EngineMsg::Reconfigure(engine_config(&state.adapter, &s)));
    sync_collector(app, s.claude.integration_enabled);

    if before.map(|b| b.general.launch_at_login) != Some(s.general.launch_at_login) && state.adapter.capabilities().autostart.usable() {
        let auto = app.autolaunch();
        let res = if s.general.launch_at_login { auto.enable() } else { auto.disable() };
        if let Err(e) = res {
            // Disabling when it was never enabled is not an error worth surfacing.
            log::debug!("autostart: {e}");
        }
    }
    if before.map(|b| b.general.toggle_shortcut.as_str()) != Some(s.general.toggle_shortcut.as_str()) {
        if state.adapter.capabilities().global_shortcuts.usable() {
            if let Err(e) = windows::register_shortcut(app, &s.general.toggle_shortcut) {
                log::warn!("global shortcut not registered: {e}");
            }
        }
    }
    let overlay_changed = before
        .map(|b| b.desktop.overlay_enabled != s.desktop.overlay_enabled || b.desktop.height != s.desktop.height || b.desktop.placement != s.desktop.placement || b.desktop.width_fraction != s.desktop.width_fraction || b.desktop.auto_width != s.desktop.auto_width || b.desktop.align != s.desktop.align || b.desktop.monitor != s.desktop.monitor || b.desktop.roam != s.desktop.roam || b.desktop.free_position != s.desktop.free_position)
        .unwrap_or(true);
    if overlay_changed {
        windows::set_overlay_visible(app, s.desktop.overlay_enabled);
        windows::relayout_roamers(app);
    }
}

fn setup(app: &mut tauri::App, adapter: PlatformAdapter, background: bool) -> Result<(), Box<dyn std::error::Error>> {
    let handle = app.handle().clone();
    let data_dir = app.path().app_data_dir()?;
    std::fs::create_dir_all(&data_dir)?;
    let log_path = logging::init(data_dir.join("logs"));
    log::info!("starting Ilha das Sombras {} on {:?}/{:?}/{:?}", app.package_info().version, adapter.info().os, adapter.info().desktop, adapter.info().session_type);

    let db_path = data_dir.join("ilha-das-sombras.db");
    let engine = Engine::open(&db_path, EngineConfig::default())?;
    let stored = q::get_setting(engine.conn(), settings::SETTINGS_KEY)?
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_else(|| serde_json::json!({}));
    let retention = settings::parse(&stored).claude.retention_days;
    let read_conn = ids_core::db::open(&db_path)?;

    let stats = Arc::new(CollectorStats::default());
    let tx = engine_host::spawn(handle.clone(), engine, stats.clone());
    if retention > 0 {
        let _ = tx.send(EngineMsg::Prune { before_ms: ids_core::db::now_ms() - retention as i64 * 86_400_000 });
    }

    app.manage(AppState {
        data_dir,
        db_path,
        log_path,
        adapter,
        engine_tx: Mutex::new(tx),
        read_conn: Mutex::new(read_conn),
        stats,
        collector: Mutex::new(None),
        token: runtime::new_token(),
        settings: Mutex::new(stored),
        overlay_hitboxes: Mutex::new(HashMap::new()),
        overlay_content_width: Mutex::new(None),
        roamers: Mutex::new(roam::Roamers::default()),
    });

    let state = handle.state::<AppState>();
    if state.adapter.capabilities().tray.usable() {
        if let Err(e) = windows::setup_tray(&handle) {
            log::warn!("tray unavailable: {e}");
        }
    }
    windows::install_castle_close_handler(&handle);
    apply_settings(&handle, None);

    let s = state.backend_settings();
    if !background && s.general.open_castle_on_start {
        windows::show_castle(&handle);
    } else if !state.adapter.capabilities().tray.usable() {
        // Without a tray the app must stay reachable from the taskbar.
        if let Some(w) = handle.get_webview_window(windows::CASTLE) {
            let _ = w.show();
            let _ = w.minimize();
        }
    }
    Ok(())
}

pub fn run() {
    let adapter = PlatformAdapter::detect();
    adapter.prepare_process_env(true);
    let background = std::env::args().any(|a| a == BACKGROUND_FLAG);
    let setup_adapter = adapter.clone();

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| windows::show_castle(app)))
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec![BACKGROUND_FLAG])))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .setup(move |app| setup(app, setup_adapter, background))
        .invoke_handler(tauri::generate_handler![
            commands::data::get_snapshot,
            commands::data::get_agent_detail,
            commands::data::list_agents,
            commands::data::set_agent_specialty,
            commands::data::delete_agent,
            commands::data::list_sessions,
            commands::data::get_session_detail,
            commands::data::list_events,
            commands::data::list_missions,
            commands::data::list_projects,
            commands::data::get_dashboard,
            commands::data::get_characters,
            commands::integration::integration_info,
            commands::integration::integration_plan,
            commands::integration::integration_apply,
            commands::instructions::instructions_overview,
            commands::instructions::instructions_read,
            commands::instructions::instructions_save,
            commands::instructions::instructions_link,
            commands::window::show_castle,
            commands::window::set_overlay_visible,
            commands::window::set_overlay_hitboxes,
            commands::window::overlay_info,
            commands::window::list_monitors,
            commands::window::set_overlay_content_width,
            commands::window::overlay_area,
            commands::window::move_overlay,
            commands::window::sync_roamers,
            commands::window::claim_road_fight,
            commands::window::quit_app,
            commands::system::get_settings,
            commands::system::save_settings,
            commands::system::save_character,
            commands::system::system_info,
            commands::system::read_logs,
            commands::system::log_client_error,
            commands::system::export_data,
            commands::system::backup_database,
            commands::system::toggle_castle,
        ])
        .build(tauri::generate_context!())
        .expect("error while building Ilha das Sombras");

    app.run(|handle, event| match event {
        // Keep running in the background when all windows are hidden/closed.
        RunEvent::ExitRequested { api, code, .. } if code.is_none() => api.prevent_exit(),
        RunEvent::Exit => {
            if let Some(state) = handle.try_state::<AppState>() {
                runtime::remove(&state.data_dir);
                state.send(EngineMsg::Shutdown);
            }
        }
        _ => {}
    });
}
