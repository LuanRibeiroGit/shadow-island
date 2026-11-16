//! Event Collector: local HTTP endpoint for `ids-hook`, plus spool replay.

pub mod runtime;
pub mod server;
pub mod spool;

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

use serde::Serialize;

#[derive(Default)]
pub struct CollectorStats {
    pub received: AtomicU64,
    pub rejected: AtomicU64,
    pub duplicates: AtomicU64,
    pub replayed: AtomicU64,
    pub last_error: Mutex<Option<String>>,
    pub last_received_at: AtomicU64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectorSnapshot {
    pub running: bool,
    pub port: Option<u16>,
    pub received: u64,
    pub rejected: u64,
    pub duplicates: u64,
    pub replayed: u64,
    pub last_error: Option<String>,
    pub last_received_at: Option<u64>,
    pub spool_bytes: u64,
}

impl CollectorStats {
    pub fn error(&self, e: impl Into<String>) {
        self.rejected.fetch_add(1, Ordering::Relaxed);
        if let Ok(mut g) = self.last_error.lock() {
            *g = Some(e.into());
        }
    }
}
