//! Token usage from Claude Code transcripts.
//!
//! Hook payloads do not carry token counts, but they carry `transcript_path`
//! (and `agent_transcript_path` for subagents). Transcript lines of type
//! `assistant` contain `message.id`, `message.model` and `message.usage` as returned
//! by the Anthropic API. We read only the bytes appended since the last read and keep
//! only those numeric fields: no conversation content is stored.
//!
//! The transcript format is not a documented API, so parsing is tolerant: unknown
//! lines are skipped. Several lines can share one `message.id` (one per content
//! block); the last one wins via upsert.

use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};

use rusqlite::{params, Connection, OptionalExtension};
use serde_json::Value;

use crate::error::CoreResult;

/// Max bytes read per call so a huge transcript never stalls the engine thread.
const MAX_READ_BYTES: u64 = 8 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Default)]
pub struct UsageLine {
    pub message_id: String,
    pub model: Option<String>,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub cache_creation_tokens: i64,
    pub cache_read_tokens: i64,
    pub timestamp_ms: Option<i64>,
}

/// Parse one transcript line. Returns `None` for anything that is not an assistant
/// message with a usage block.
pub fn parse_line(line: &str) -> Option<UsageLine> {
    let v: Value = serde_json::from_str(line).ok()?;
    if v.get("type").and_then(Value::as_str) != Some("assistant") {
        return None;
    }
    let msg = v.get("message")?;
    let usage = msg.get("usage")?;
    let n = |k: &str| usage.get(k).and_then(Value::as_i64).unwrap_or(0).max(0);
    Some(UsageLine {
        message_id: msg.get("id").and_then(Value::as_str)?.chars().take(128).collect(),
        model: msg
            .get("model")
            .and_then(Value::as_str)
            .filter(|m| !m.is_empty() && *m != "<synthetic>")
            .map(|m| m.chars().take(120).collect()),
        input_tokens: n("input_tokens"),
        output_tokens: n("output_tokens"),
        cache_creation_tokens: n("cache_creation_input_tokens"),
        cache_read_tokens: n("cache_read_input_tokens"),
        timestamp_ms: v.get("timestamp").and_then(Value::as_str).and_then(parse_rfc3339_ms),
    })
}

/// Only read transcripts under allowed roots (by default `~/.claude`), with a
/// `.jsonl` extension. Event payloads come from a local socket, so never trust a
/// path blindly.
pub fn is_allowed_path(path: &Path, allowed_roots: &[PathBuf]) -> bool {
    if path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
        return false;
    }
    let Ok(canonical) = path.canonicalize() else { return false };
    allowed_roots
        .iter()
        .filter_map(|r| r.canonicalize().ok())
        .any(|root| canonical.starts_with(root))
}

/// Read new complete lines from `path` starting at the stored offset and upsert
/// usage records attributed to `agent_id`. Returns the number of usage lines seen.
pub fn ingest_transcript(conn: &Connection, path: &Path, session_id: &str, agent_id: &str, now: i64) -> CoreResult<usize> {
    let key = path.to_string_lossy().to_string();
    let offset: u64 = conn
        .query_row("SELECT offset FROM transcript_offsets WHERE path = ?1", params![key], |r| r.get::<_, i64>(0))
        .optional()?
        .unwrap_or(0)
        .max(0) as u64;

    let mut file = File::open(path)?;
    let len = file.metadata()?.len();
    let start = if len < offset { 0 } else { offset }; // file was truncated/rotated
    if start == len {
        return Ok(0);
    }
    file.seek(SeekFrom::Start(start))?;
    let mut buf = Vec::new();
    file.take(MAX_READ_BYTES).read_to_end(&mut buf)?;

    // Only consume up to the last newline: the last line may still be being written.
    let Some(last_nl) = buf.iter().rposition(|&b| b == b'\n') else { return Ok(0) };
    let complete = &buf[..=last_nl];
    // SAVEPOINT works both standalone and nested inside the engine transaction.
    conn.execute_batch("SAVEPOINT usage_ingest")?;
    match write_lines(conn, complete, &key, start, session_id, agent_id, now) {
        Ok(seen) => {
            conn.execute_batch("RELEASE usage_ingest")?;
            Ok(seen)
        }
        Err(e) => {
            let _ = conn.execute_batch("ROLLBACK TO usage_ingest; RELEASE usage_ingest");
            Err(e)
        }
    }
}

fn write_lines(tx: &Connection, complete: &[u8], key: &str, start: u64, session_id: &str, agent_id: &str, now: i64) -> CoreResult<usize> {
    let mut seen = 0;
    for line in complete.split(|&b| b == b'\n') {
        let Ok(text) = std::str::from_utf8(line) else { continue };
        if text.trim().is_empty() {
            continue;
        }
        if let Some(u) = parse_line(text) {
            seen += 1;
            tx.execute(
                "INSERT INTO usage_records(message_id, session_id, agent_id, model, input_tokens, output_tokens,
                                           cache_creation_tokens, cache_read_tokens, recorded_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
                 ON CONFLICT(message_id) DO UPDATE SET
                    model = COALESCE(excluded.model, usage_records.model),
                    input_tokens = MAX(usage_records.input_tokens, excluded.input_tokens),
                    output_tokens = MAX(usage_records.output_tokens, excluded.output_tokens),
                    cache_creation_tokens = MAX(usage_records.cache_creation_tokens, excluded.cache_creation_tokens),
                    cache_read_tokens = MAX(usage_records.cache_read_tokens, excluded.cache_read_tokens)",
                params![
                    u.message_id,
                    session_id,
                    agent_id,
                    u.model,
                    u.input_tokens,
                    u.output_tokens,
                    u.cache_creation_tokens,
                    u.cache_read_tokens,
                    u.timestamp_ms.unwrap_or(now)
                ],
            )?;
        }
    }
    let new_offset = start + complete.len() as u64;
    tx.execute(
        "INSERT INTO transcript_offsets(path, offset, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(path) DO UPDATE SET offset = excluded.offset, updated_at = excluded.updated_at",
        params![key, new_offset as i64, now],
    )?;
    Ok(seen)
}

/// Minimal RFC 3339 parser for `2026-11-16T13:04:07.492Z`-style timestamps.
pub fn parse_rfc3339_ms(s: &str) -> Option<i64> {
    let b = s.as_bytes();
    if b.len() < 20 || b[4] != b'-' || b[10] != b'T' {
        return None;
    }
    let num = |a: usize, z: usize| s.get(a..z)?.parse::<i64>().ok();
    let (y, mo, d) = (num(0, 4)?, num(5, 7)?, num(8, 10)?);
    let (h, mi, sec) = (num(11, 13)?, num(14, 16)?, num(17, 19)?);
    let mut ms = 0;
    let mut rest = &s[19..];
    if let Some(frac) = rest.strip_prefix('.') {
        let digits: String = frac.chars().take_while(|c| c.is_ascii_digit()).collect();
        let d3: String = digits.chars().chain("000".chars()).take(3).collect();
        ms = d3.parse::<i64>().ok()?;
        rest = &frac[digits.len()..];
    }
    let offset_min = match rest {
        "Z" | "z" => 0,
        o if o.len() == 6 => {
            let sign = if o.starts_with('-') { -1 } else { 1 };
            sign * (o[1..3].parse::<i64>().ok()? * 60 + o[4..6].parse::<i64>().ok()?)
        }
        _ => return None,
    };
    // Days from civil (Howard Hinnant's algorithm).
    let y2 = if mo <= 2 { y - 1 } else { y };
    let era = if y2 >= 0 { y2 } else { y2 - 399 } / 400;
    let yoe = y2 - era * 400;
    let doy = (153 * (if mo > 2 { mo - 3 } else { mo + 9 }) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146097 + doe - 719468;
    Some(((days * 86400 + h * 3600 + mi * 60 + sec) - offset_min * 60) * 1000 + ms)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use std::io::Write;

    #[test]
    fn parses_assistant_usage_only() {
        let l = r#"{"type":"assistant","timestamp":"2026-11-16T13:04:07.492Z","message":{"id":"msg_1","model":"claude-x","usage":{"input_tokens":2,"cache_creation_input_tokens":10,"cache_read_input_tokens":20,"output_tokens":30},"content":[{"type":"text","text":"secret"}]}}"#;
        let u = parse_line(l).unwrap();
        assert_eq!(u.message_id, "msg_1");
        assert_eq!((u.input_tokens, u.output_tokens, u.cache_creation_tokens, u.cache_read_tokens), (2, 30, 10, 20));
        assert_eq!(u.timestamp_ms, Some(1794834247492));
        assert!(parse_line(r#"{"type":"user","message":{"content":"x"}}"#).is_none());
        assert!(parse_line("garbage").is_none());
    }

    #[test]
    fn rfc3339() {
        assert_eq!(parse_rfc3339_ms("1970-01-01T00:00:00Z"), Some(0));
        assert_eq!(parse_rfc3339_ms("1970-01-01T01:00:00+01:00"), Some(0));
        assert_eq!(parse_rfc3339_ms("2000-03-01T00:00:00.5Z"), Some(951868800500));
    }

    #[test]
    fn incremental_ingest_and_partial_lines() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("t.jsonl");
        let conn = db::open_in_memory().unwrap();
        conn.execute("INSERT INTO sessions(id, started_at, last_event_at) VALUES ('s', 0, 0)", []).unwrap();
        conn.execute("INSERT INTO agents(id, session_id, specialty, is_main, name, state, room, started_at, updated_at) VALUES ('s#main','s','general',1,'n','IDLE','throne',0,0)", []).unwrap();

        let line = |id: &str, out: i64| format!(r#"{{"type":"assistant","message":{{"id":"{id}","model":"m","usage":{{"input_tokens":1,"output_tokens":{out}}}}}}}"#);
        let mut f = File::create(&path).unwrap();
        writeln!(f, "{}", line("a", 5)).unwrap();
        writeln!(f, "{}", line("a", 7)).unwrap(); // same message, later block
        write!(f, "{}", &line("b", 3)[..20]).unwrap(); // partial line
        f.flush().unwrap();

        assert_eq!(ingest_transcript(&conn, &path, "s", "s#main", 1).unwrap(), 2);
        let total: i64 = conn.query_row("SELECT SUM(output_tokens) FROM usage_records", [], |r| r.get(0)).unwrap();
        assert_eq!(total, 7);

        // Complete the partial line; only the new line is read.
        writeln!(f, "{}", &line("b", 3)[20..]).unwrap();
        f.flush().unwrap();
        assert_eq!(ingest_transcript(&conn, &path, "s", "s#main", 2).unwrap(), 1);
        let total: i64 = conn.query_row("SELECT SUM(output_tokens) FROM usage_records", [], |r| r.get(0)).unwrap();
        assert_eq!(total, 10);
        assert_eq!(ingest_transcript(&conn, &path, "s", "s#main", 3).unwrap(), 0);
    }

    #[test]
    fn path_allowlist() {
        let dir = tempfile::tempdir().unwrap();
        let ok = dir.path().join("a.jsonl");
        std::fs::write(&ok, "").unwrap();
        let other = tempfile::tempdir().unwrap();
        let outside = other.path().join("b.jsonl");
        std::fs::write(&outside, "").unwrap();
        let roots = vec![dir.path().to_path_buf()];
        assert!(is_allowed_path(&ok, &roots));
        assert!(!is_allowed_path(&outside, &roots));
        assert!(!is_allowed_path(&dir.path().join("a.txt"), &roots));
    }
}
