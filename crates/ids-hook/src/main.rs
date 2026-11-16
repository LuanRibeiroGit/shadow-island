//! `ids-hook`: the tiny program Claude Code runs for each hook event.
//!
//! Contract (see docs/adr/0001-claude-code-integration.md):
//! - Registered as an `async: true` command hook, so it never delays Claude Code.
//! - Reads the hook JSON from stdin, wraps it in an envelope and POSTs it to the app
//!   on 127.0.0.1 using the port/token in `<data-dir>/runtime.json`.
//! - If the app is not running, appends the envelope to `<data-dir>/spool/events.jsonl`
//!   so nothing is lost; the app replays the spool on start.
//! - Prints nothing on stdout and always exits 0: it can never block or alter
//!   Claude Code's behavior, even when misconfigured.
//! - Never executes anything from the payload.

use std::collections::hash_map::RandomState;
use std::fs::{self, OpenOptions};
use std::hash::{BuildHasher, Hasher};
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const MAX_STDIN: u64 = 4 * 1024 * 1024;
const MAX_SPOOL_BYTES: u64 = 64 * 1024 * 1024;
const MAX_LOG_BYTES: u64 = 512 * 1024;
const CONNECT_TIMEOUT: Duration = Duration::from_millis(300);
const IO_TIMEOUT: Duration = Duration::from_millis(1500);

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.iter().any(|a| a == "--version") {
        println!("ids-hook {}", env!("CARGO_PKG_VERSION"));
        return;
    }
    let Some(data_dir) = arg_value(&args, "--data-dir").map(PathBuf::from) else {
        // Misconfigured: do nothing, never fail the hook.
        return;
    };
    let mut input = Vec::new();
    if std::io::stdin().take(MAX_STDIN + 1).read_to_end(&mut input).is_err() || input.len() as u64 > MAX_STDIN {
        log(&data_dir, "stdin unreadable or too large, event dropped");
        return;
    }
    if let Err(e) = relay(&data_dir, &input) {
        log(&data_dir, &e);
    }
}

fn arg_value(args: &[String], key: &str) -> Option<String> {
    args.iter().position(|a| a == key).and_then(|i| args.get(i + 1)).cloned()
}

/// Build the envelope and deliver it. Returns an error message only when the event
/// could neither be sent nor spooled.
pub fn relay(data_dir: &Path, input: &[u8]) -> Result<(), String> {
    let payload: serde_json::Value = serde_json::from_slice(input).map_err(|e| format!("invalid hook JSON: {e}"))?;
    if !payload.is_object() {
        return Err("hook payload is not an object".into());
    }
    let envelope = serde_json::json!({
        "v": 1,
        "id": random_id(),
        "firedAtMs": now_ms(),
        "payload": payload,
    });
    let body = serde_json::to_vec(&envelope).map_err(|e| e.to_string())?;
    match send(data_dir, &body) {
        Ok(()) => Ok(()),
        Err(send_err) => spool(data_dir, &body).map_err(|e| format!("send failed ({send_err}); spool failed ({e})")),
    }
}

fn send(data_dir: &Path, body: &[u8]) -> Result<(), String> {
    let runtime = fs::read_to_string(data_dir.join("runtime.json")).map_err(|_| "app not running".to_string())?;
    let rt: serde_json::Value = serde_json::from_str(&runtime).map_err(|e| e.to_string())?;
    let port = rt.get("port").and_then(|p| p.as_u64()).filter(|p| *p > 0 && *p < 65536).ok_or("bad port")? as u16;
    let token = rt.get("token").and_then(|t| t.as_str()).filter(|t| t.chars().all(|c| c.is_ascii_alphanumeric())).ok_or("bad token")?;

    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let mut stream = TcpStream::connect_timeout(&addr, CONNECT_TIMEOUT).map_err(|e| e.to_string())?;
    stream.set_write_timeout(Some(IO_TIMEOUT)).ok();
    stream.set_read_timeout(Some(IO_TIMEOUT)).ok();
    let head = format!(
        "POST /v1/events HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nContent-Type: application/json\r\nX-IDS-Token: {token}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    );
    stream.write_all(head.as_bytes()).map_err(|e| e.to_string())?;
    stream.write_all(body).map_err(|e| e.to_string())?;
    let mut status = [0u8; 12];
    stream.read_exact(&mut status).map_err(|e| e.to_string())?;
    // "HTTP/1.1 2xx"
    if &status[..9] == b"HTTP/1.1 " && status[9] == b'2' {
        Ok(())
    } else {
        Err(format!("app answered {}", String::from_utf8_lossy(&status[9..])))
    }
}

fn spool(data_dir: &Path, body: &[u8]) -> Result<(), String> {
    let dir = data_dir.join("spool");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join("events.jsonl");
    if fs::metadata(&path).map(|m| m.len()).unwrap_or(0) > MAX_SPOOL_BYTES {
        return Err("spool full".into());
    }
    let mut line = Vec::with_capacity(body.len() + 1);
    line.extend_from_slice(body);
    line.push(b'\n');
    // One write call per line with O_APPEND keeps concurrent writers line-atomic on
    // POSIX for reasonable sizes; the reader also skips malformed lines.
    let mut f = OpenOptions::new().create(true).append(true).open(&path).map_err(|e| e.to_string())?;
    f.write_all(&line).map_err(|e| e.to_string())
}

fn log(data_dir: &Path, msg: &str) {
    let dir = data_dir.join("logs");
    if fs::create_dir_all(&dir).is_err() {
        return;
    }
    let path = dir.join("hook.log");
    if fs::metadata(&path).map(|m| m.len()).unwrap_or(0) > MAX_LOG_BYTES {
        let _ = fs::rename(&path, dir.join("hook.log.1"));
    }
    if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(&path) {
        let _ = writeln!(f, "{} {}", now_ms(), msg.replace(['\n', '\r'], " "));
    }
}

fn now_ms() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

/// 128-bit random hex id (dedupe key, not a secret). `RandomState` is seeded from
/// the OS RNG, so no extra dependency is needed.
fn random_id() -> String {
    let mut out = String::with_capacity(32);
    for i in 0..2u64 {
        let mut h = RandomState::new().build_hasher();
        h.write_u64(i);
        h.write_u128(SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0));
        h.write_u32(std::process::id());
        out.push_str(&format!("{:016x}", h.finish()));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;
    use std::thread;

    #[test]
    fn spools_when_app_is_not_running() {
        let dir = tempfile::tempdir().unwrap();
        relay(dir.path(), br#"{"session_id":"s","hook_event_name":"Stop"}"#).unwrap();
        relay(dir.path(), br#"{"session_id":"s","hook_event_name":"Stop"}"#).unwrap();
        let spool = fs::read_to_string(dir.path().join("spool/events.jsonl")).unwrap();
        let lines: Vec<serde_json::Value> = spool.lines().map(|l| serde_json::from_str(l).unwrap()).collect();
        assert_eq!(lines.len(), 2);
        assert_eq!(lines[0]["payload"]["hook_event_name"], "Stop");
        assert_ne!(lines[0]["id"], lines[1]["id"]);
    }

    #[test]
    fn posts_to_running_app_with_token() {
        let dir = tempfile::tempdir().unwrap();
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        fs::write(dir.path().join("runtime.json"), format!(r#"{{"port":{port},"token":"abc123"}}"#)).unwrap();
        let server = thread::spawn(move || {
            let (mut s, _) = listener.accept().unwrap();
            let mut buf = vec![0u8; 8192];
            let n = s.read(&mut buf).unwrap();
            s.write_all(b"HTTP/1.1 204 No Content\r\n\r\n").unwrap();
            String::from_utf8_lossy(&buf[..n]).to_string()
        });
        relay(dir.path(), br#"{"session_id":"s","hook_event_name":"Stop"}"#).unwrap();
        let req = server.join().unwrap();
        assert!(req.starts_with("POST /v1/events"));
        assert!(req.contains("X-IDS-Token: abc123"));
        assert!(!dir.path().join("spool/events.jsonl").exists());
    }

    #[test]
    fn rejects_non_json_without_panicking() {
        let dir = tempfile::tempdir().unwrap();
        assert!(relay(dir.path(), b"not json").is_err());
    }
}
