//! Hook envelope parsing and validation.
//!
//! `ids-hook` (the relay binary Claude Code runs) wraps the raw hook JSON in an
//! envelope so the app can deduplicate deliveries (HTTP + spool replay) and know when
//! the hook actually fired:
//!
//! ```json
//! {"v":1,"id":"<random hex>","firedAtMs":1731760000000,"payload":{...hook stdin...}}
//! ```
//!
//! Payload fields follow https://code.claude.com/docs/en/hooks. Fields differ per
//! event, so everything except `session_id` and `hook_event_name` is optional.

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::{CoreError, CoreResult};

/// Max accepted payload size. Hook payloads can contain tool inputs (file contents
/// for `Write`), so be generous, but bounded.
pub const MAX_PAYLOAD_BYTES: usize = 4 * 1024 * 1024;
pub const ENVELOPE_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Envelope {
    pub v: u32,
    pub id: String,
    pub fired_at_ms: i64,
    pub payload: Value,
}

/// Hook events documented by Claude Code that we understand. Anything else is
/// recorded as `Other` and never drives a visual state on its own.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum HookEventName {
    SessionStart,
    SessionEnd,
    UserPromptSubmit,
    PreToolUse,
    PostToolUse,
    PostToolUseFailure,
    SubagentStart,
    SubagentStop,
    Stop,
    StopFailure,
    Notification,
    TaskCreated,
    TaskCompleted,
    PreCompact,
    PostCompact,
    PermissionRequest,
    PermissionDenied,
    Other(String),
}

impl HookEventName {
    pub fn parse(s: &str) -> Self {
        use HookEventName::*;
        match s {
            "SessionStart" => SessionStart,
            "SessionEnd" => SessionEnd,
            "UserPromptSubmit" => UserPromptSubmit,
            "PreToolUse" => PreToolUse,
            "PostToolUse" => PostToolUse,
            "PostToolUseFailure" => PostToolUseFailure,
            "SubagentStart" => SubagentStart,
            "SubagentStop" => SubagentStop,
            "Stop" => Stop,
            "StopFailure" => StopFailure,
            "Notification" => Notification,
            "TaskCreated" => TaskCreated,
            "TaskCompleted" => TaskCompleted,
            "PreCompact" => PreCompact,
            "PostCompact" => PostCompact,
            "PermissionRequest" => PermissionRequest,
            "PermissionDenied" => PermissionDenied,
            other => Other(other.to_string()),
        }
    }

    pub fn as_str(&self) -> &str {
        use HookEventName::*;
        match self {
            SessionStart => "SessionStart",
            SessionEnd => "SessionEnd",
            UserPromptSubmit => "UserPromptSubmit",
            PreToolUse => "PreToolUse",
            PostToolUse => "PostToolUse",
            PostToolUseFailure => "PostToolUseFailure",
            SubagentStart => "SubagentStart",
            SubagentStop => "SubagentStop",
            Stop => "Stop",
            StopFailure => "StopFailure",
            Notification => "Notification",
            TaskCreated => "TaskCreated",
            TaskCompleted => "TaskCompleted",
            PreCompact => "PreCompact",
            PostCompact => "PostCompact",
            PermissionRequest => "PermissionRequest",
            PermissionDenied => "PermissionDenied",
            Other(s) => s.as_str(),
        }
    }

    /// Events the installer registers. Kept to what the app actually uses so hooks
    /// do not run for nothing.
    pub fn installable() -> &'static [&'static str] {
        &[
            "SessionStart",
            "SessionEnd",
            "UserPromptSubmit",
            "PreToolUse",
            "PostToolUse",
            "PostToolUseFailure",
            "SubagentStart",
            "SubagentStop",
            "Stop",
            "StopFailure",
            "Notification",
            "TaskCreated",
            "TaskCompleted",
        ]
    }
}

/// Parse and validate raw bytes coming from the collector (HTTP body or spool line).
pub fn parse_envelope(bytes: &[u8]) -> CoreResult<Envelope> {
    if bytes.len() > MAX_PAYLOAD_BYTES {
        return Err(CoreError::InvalidEvent(format!("payload too large: {} bytes", bytes.len())));
    }
    let env: Envelope = serde_json::from_slice(bytes)
        .map_err(|e| CoreError::InvalidEvent(format!("malformed envelope: {e}")))?;
    validate_envelope(&env)?;
    Ok(env)
}

pub fn validate_envelope(env: &Envelope) -> CoreResult<()> {
    if env.v != ENVELOPE_VERSION {
        return Err(CoreError::InvalidEvent(format!("unsupported envelope version {}", env.v)));
    }
    if env.id.is_empty() || env.id.len() > 64 || !env.id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err(CoreError::InvalidEvent("invalid envelope id".into()));
    }
    let obj = env
        .payload
        .as_object()
        .ok_or_else(|| CoreError::InvalidEvent("payload is not an object".into()))?;
    let name = obj
        .get("hook_event_name")
        .and_then(Value::as_str)
        .ok_or_else(|| CoreError::InvalidEvent("missing hook_event_name".into()))?;
    if name.is_empty() || name.len() > 64 || !name.chars().all(|c| c.is_ascii_alphanumeric()) {
        return Err(CoreError::InvalidEvent("invalid hook_event_name".into()));
    }
    let sid = obj
        .get("session_id")
        .and_then(Value::as_str)
        .ok_or_else(|| CoreError::InvalidEvent("missing session_id".into()))?;
    if sid.is_empty() || sid.len() > 128 || sid.chars().any(|c| c.is_control()) {
        return Err(CoreError::InvalidEvent("invalid session_id".into()));
    }
    Ok(())
}

/// Convenience accessors over the untyped payload.
pub trait PayloadExt {
    fn str_field(&self, key: &str) -> Option<&str>;
    fn bool_field(&self, key: &str) -> Option<bool>;
    fn i64_field(&self, key: &str) -> Option<i64>;
}

impl PayloadExt for Value {
    fn str_field(&self, key: &str) -> Option<&str> {
        self.get(key).and_then(Value::as_str).filter(|s| !s.is_empty())
    }
    fn bool_field(&self, key: &str) -> Option<bool> {
        self.get(key).and_then(Value::as_bool)
    }
    fn i64_field(&self, key: &str) -> Option<i64> {
        self.get(key).and_then(Value::as_i64)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn env(payload: Value) -> Vec<u8> {
        serde_json::to_vec(&json!({"v":1,"id":"abc123","firedAtMs":1,"payload":payload})).unwrap()
    }

    #[test]
    fn accepts_valid_envelope() {
        let e = parse_envelope(&env(json!({"session_id":"s1","hook_event_name":"Stop"}))).unwrap();
        assert_eq!(e.id, "abc123");
    }

    #[test]
    fn rejects_missing_fields() {
        assert!(parse_envelope(&env(json!({"hook_event_name":"Stop"}))).is_err());
        assert!(parse_envelope(&env(json!({"session_id":"s1"}))).is_err());
        assert!(parse_envelope(&env(json!([1, 2]))).is_err());
        assert!(parse_envelope(b"not json").is_err());
    }

    #[test]
    fn rejects_bad_identifiers() {
        assert!(parse_envelope(&env(json!({"session_id":"s1","hook_event_name":"Stop; rm -rf"}))).is_err());
        let bad_id = serde_json::to_vec(&json!({"v":1,"id":"../x","firedAtMs":1,"payload":{"session_id":"s","hook_event_name":"Stop"}})).unwrap();
        assert!(parse_envelope(&bad_id).is_err());
    }

    #[test]
    fn unknown_event_names_are_kept_as_other() {
        assert_eq!(HookEventName::parse("FutureEvent"), HookEventName::Other("FutureEvent".into()));
        assert_eq!(HookEventName::parse("SubagentStart"), HookEventName::SubagentStart);
    }
}
