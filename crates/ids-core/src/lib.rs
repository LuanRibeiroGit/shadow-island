//! Ilha das Sombras core library.
//!
//! Everything in this crate is independent of Tauri and of any window system, so it
//! can be unit-tested headless. The pipeline is:
//!
//! ```text
//! hook payload -> envelope (event.rs) -> normalize.rs -> engine.rs
//!                                                         |-> agents.rs   (Agent Manager)
//!                                                         |-> missions.rs
//!                                                         |-> encounters.rs (monsters)
//!                                                         |-> usage.rs    (transcript token usage)
//!                                                         `-> db/         (SQLite)
//! ```

pub mod agents;
pub mod classify;
pub mod db;
pub mod encounters;
pub mod engine;
pub mod error;
pub mod event;
pub mod hooks_install;
pub mod instructions;
pub mod missions;
pub mod model;
pub mod normalize;
pub mod usage;

pub use error::{CoreError, CoreResult};
