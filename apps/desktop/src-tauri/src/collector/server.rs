//! Minimal HTTP server bound to 127.0.0.1 on a random port.
//! Only `POST /v1/events` with the right token is accepted; bodies are validated by
//! `ids_core::event::parse_envelope` before they reach the engine.

use std::io::Read;
use std::sync::atomic::Ordering;
use std::sync::mpsc::Sender;
use std::sync::Arc;
use std::thread::JoinHandle;

use ids_core::event::{parse_envelope, MAX_PAYLOAD_BYTES};
use tiny_http::{Header, Method, Response, Server};

use super::runtime::token_matches;
use super::CollectorStats;
use crate::engine_host::EngineMsg;

pub struct CollectorServer {
    server: Arc<Server>,
    pub port: u16,
    handle: Option<JoinHandle<()>>,
}

impl CollectorServer {
    pub fn start(token: String, tx: Sender<EngineMsg>, stats: Arc<CollectorStats>) -> std::io::Result<Self> {
        let server = Server::http("127.0.0.1:0").map_err(|e| std::io::Error::other(e.to_string()))?;
        let port = server.server_addr().to_ip().map(|a| a.port()).ok_or_else(|| std::io::Error::other("no ip addr"))?;
        let server = Arc::new(server);
        let s2 = server.clone();
        let handle = std::thread::Builder::new()
            .name("ids-collector".into())
            .spawn(move || serve(s2, token, tx, stats))?;
        log::info!("collector listening on 127.0.0.1:{port}");
        Ok(Self { server, port, handle: Some(handle) })
    }

    pub fn stop(&mut self) {
        self.server.unblock();
        if let Some(h) = self.handle.take() {
            let _ = h.join();
        }
    }
}

impl Drop for CollectorServer {
    fn drop(&mut self) {
        self.stop();
    }
}

fn serve(server: Arc<Server>, token: String, tx: Sender<EngineMsg>, stats: Arc<CollectorStats>) {
    for mut req in server.incoming_requests() {
        let authorized = req
            .headers()
            .iter()
            .find(|h| h.field.equiv("X-IDS-Token"))
            .map(|h| token_matches(&token, h.value.as_str()))
            .unwrap_or(false);
        let status = if !authorized {
            stats.error("unauthorized request");
            401
        } else if req.method() == &Method::Get && req.url() == "/v1/health" {
            200
        } else if req.method() == &Method::Post && req.url() == "/v1/events" {
            let len = req.body_length().unwrap_or(0);
            if len > MAX_PAYLOAD_BYTES {
                stats.error("payload too large");
                413
            } else {
                let mut body = Vec::with_capacity(len);
                match req.as_reader().take(MAX_PAYLOAD_BYTES as u64 + 1).read_to_end(&mut body) {
                    Ok(_) => match parse_envelope(&body) {
                        Ok(env) => {
                            stats.received.fetch_add(1, Ordering::Relaxed);
                            stats.last_received_at.store(ids_core::db::now_ms() as u64, Ordering::Relaxed);
                            if tx.send(EngineMsg::Ingest(Box::new(env))).is_err() {
                                stats.error("engine stopped");
                                503
                            } else {
                                204
                            }
                        }
                        Err(e) => {
                            stats.error(e.to_string());
                            400
                        }
                    },
                    Err(e) => {
                        stats.error(format!("read error: {e}"));
                        400
                    }
                }
            }
        } else {
            404
        };
        let mut resp = Response::empty(status);
        if let Ok(h) = Header::from_bytes(&b"Connection"[..], &b"close"[..]) {
            resp.add_header(h);
        }
        let _ = req.respond(resp);
    }
}
