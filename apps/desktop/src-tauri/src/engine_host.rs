//! Runs the core `Engine` on its own thread. The collector and spool replay send
//! envelopes through a channel; resulting updates are emitted to every window as
//! one batched `ids://updates` event per burst (no timers, no polling).

use std::sync::atomic::Ordering;
use std::sync::mpsc::{channel, Receiver, Sender, TryRecvError};
use std::sync::Arc;

use ids_core::engine::{Engine, EngineConfig, Update};
use ids_core::event::{parse_envelope, Envelope};
use ids_core::model::AgentSpecialty;
use tauri::{AppHandle, Emitter};

use crate::collector::CollectorStats;

pub const UPDATES_EVENT: &str = "ids://updates";
const MAX_BATCH: usize = 256;

pub enum EngineMsg {
    Ingest(Box<Envelope>),
    /// Raw spool lines (validated here).
    Replay(Vec<Vec<u8>>),
    Reconfigure(EngineConfig),
    Prune { before_ms: i64 },
    /// The user changed an agent's function in the crew page.
    SetAgentSpecialty { id: String, specialty: AgentSpecialty },
    /// The user removed an agent in the crew page.
    DeleteAgent { id: String },
    Shutdown,
}

pub fn spawn(app: AppHandle, engine: Engine, stats: Arc<CollectorStats>) -> Sender<EngineMsg> {
    let (tx, rx) = channel();
    std::thread::Builder::new()
        .name("ids-engine".into())
        .spawn(move || run(app, engine, rx, stats))
        .expect("spawn engine thread");
    tx
}

fn run(app: AppHandle, mut engine: Engine, rx: Receiver<EngineMsg>, stats: Arc<CollectorStats>) {
    while let Ok(first) = rx.recv() {
        let mut batch: Vec<Update> = Vec::new();
        let mut msg = Some(first);
        let mut handled = 0;
        while let Some(m) = msg.take() {
            match m {
                EngineMsg::Shutdown => {
                    emit(&app, &mut batch);
                    return;
                }
                EngineMsg::Ingest(env) => ingest(&mut engine, &env, &stats, &mut batch),
                EngineMsg::Replay(lines) => {
                    for line in lines {
                        match parse_envelope(&line) {
                            Ok(env) => {
                                stats.replayed.fetch_add(1, Ordering::Relaxed);
                                ingest(&mut engine, &env, &stats, &mut batch);
                            }
                            Err(e) => stats.error(format!("spool: {e}")),
                        }
                        if batch.len() >= MAX_BATCH * 4 {
                            emit(&app, &mut batch);
                        }
                    }
                }
                EngineMsg::Reconfigure(cfg) => *engine.config_mut() = cfg,
                EngineMsg::SetAgentSpecialty { id, specialty } => match engine.set_agent_specialty(&id, specialty) {
                    Ok(Some(agent)) => batch.push(Update::Agent { agent }),
                    Ok(None) => {}
                    Err(e) => log::warn!("set agent specialty failed: {e}"),
                },
                EngineMsg::DeleteAgent { id } => match engine.delete_agent(&id) {
                    Ok(_) => batch.push(Update::AgentRemoved { id }),
                    Err(e) => log::warn!("delete agent failed: {e}"),
                },
                EngineMsg::Prune { before_ms } => match ids_core::db::queries::prune(engine.conn(), before_ms) {
                    Ok(n) if n > 0 => log::info!("retention: removed {n} old sessions"),
                    Ok(_) => {}
                    Err(e) => log::warn!("retention failed: {e}"),
                },
            }
            handled += 1;
            if handled < MAX_BATCH {
                msg = match rx.try_recv() {
                    Ok(m) => Some(m),
                    Err(TryRecvError::Empty) => None,
                    Err(TryRecvError::Disconnected) => None,
                };
            }
        }
        emit(&app, &mut batch);
    }
}

fn ingest(engine: &mut Engine, env: &Envelope, stats: &CollectorStats, batch: &mut Vec<Update>) {
    match engine.ingest(env) {
        Ok(out) if out.duplicate => {
            stats.duplicates.fetch_add(1, Ordering::Relaxed);
        }
        Ok(out) => batch.extend(out.updates),
        Err(e) => {
            log::warn!("engine rejected event: {e}");
            stats.error(e.to_string());
        }
    }
}

fn emit(app: &AppHandle, batch: &mut Vec<Update>) {
    if batch.is_empty() {
        return;
    }
    if let Err(e) = app.emit(UPDATES_EVENT, &*batch) {
        log::warn!("emit failed: {e}");
    }
    batch.clear();
}
