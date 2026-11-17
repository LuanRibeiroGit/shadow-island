//! Tauri commands, grouped by area. Commands are thin: they validate input,
//! call `ids-core` or the PlatformAdapter, and map errors to strings.

pub mod data;
pub mod instructions;
pub mod integration;
pub mod system;
pub mod window;

use std::sync::MutexGuard;

use rusqlite::Connection;
use tauri::State;

use crate::state::AppState;

pub type CmdResult<T> = Result<T, String>;

pub(crate) fn conn<'a>(state: &'a State<'_, AppState>) -> CmdResult<MutexGuard<'a, Connection>> {
    state.read_conn.lock().map_err(|_| "database lock poisoned".to_string())
}

pub(crate) fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}
