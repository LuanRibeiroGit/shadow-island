//! Shared application state managed by Tauri.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::mpsc::Sender;
use std::sync::{Arc, Mutex};

use rusqlite::Connection;
use serde_json::Value;

use crate::collector::server::CollectorServer;
use crate::collector::CollectorStats;
use crate::engine_host::EngineMsg;
use crate::platform::{PlatformAdapter, Rect};
use crate::roam::Roamers;

pub struct AppState {
    pub data_dir: PathBuf,
    pub db_path: PathBuf,
    pub log_path: PathBuf,
    pub adapter: PlatformAdapter,
    pub engine_tx: Mutex<Sender<EngineMsg>>,
    /// Read-only connection for UI queries (WAL lets it run alongside the engine).
    pub read_conn: Mutex<Connection>,
    pub stats: Arc<CollectorStats>,
    pub collector: Mutex<Option<CollectorServer>>,
    pub token: String,
    pub settings: Mutex<Value>,
    /// Clickable regions of the overlay (logical px, window-relative).
    pub overlay_hitboxes: Mutex<HashMap<String, Vec<Rect>>>,
    /// Width the overlay content needs (souls working), reported by the overlay page.
    pub overlay_content_width: Mutex<Option<u32>>,
    pub roamers: Mutex<Roamers>,
}

impl AppState {
    pub fn send(&self, msg: EngineMsg) {
        if let Ok(tx) = self.engine_tx.lock() {
            let _ = tx.send(msg);
        }
    }

    pub fn backend_settings(&self) -> crate::settings::BackendSettings {
        let v = self.settings.lock().map(|g| g.clone()).unwrap_or(Value::Null);
        crate::settings::parse(&v)
    }

    pub fn hook_executable(&self) -> PathBuf {
        let exe = std::env::current_exe().unwrap_or_default();
        let dir = exe.parent().map(PathBuf::from).unwrap_or_default();
        dir.join(self.adapter.hook_binary_name())
    }
}
