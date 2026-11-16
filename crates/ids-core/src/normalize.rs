//! Event Normalizer: turns a validated hook envelope into a `NormalizedEvent`.
//!
//! Privacy rule: only metadata survives normalization. File contents, full shell
//! command lines, tool responses and prompts are dropped. What is kept:
//! - for file tools, the file name (not the full path);
//! - for shell tools, the program and sub-command (`npm test`), never arguments;
//! - the user prompt only as a short excerpt, and only when the user allows it.

use serde::Serialize;
use serde_json::Value;

use crate::classify::classify_tool;
use crate::event::{Envelope, HookEventName, PayloadExt};
use crate::model::ActivityCategory;

pub const PROMPT_EXCERPT_CHARS: usize = 80;

#[derive(Debug, Clone, Default)]
pub struct NormalizeOptions {
    /// Keep a short excerpt of user prompts (used as mission titles).
    pub keep_prompt_excerpt: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NormalizedEvent {
    pub envelope_id: String,
    #[serde(skip)]
    pub kind: HookEventName,
    pub event_name: String,
    pub session_id: String,
    /// `None` means the main agent of the session.
    pub agent_id: Option<String>,
    pub agent_type: Option<String>,
    pub cwd: Option<String>,
    pub transcript_path: Option<String>,
    pub agent_transcript_path: Option<String>,
    pub fired_at_ms: i64,
    pub tool_name: Option<String>,
    pub tool_use_id: Option<String>,
    pub category: Option<ActivityCategory>,
    /// Short, privacy-safe detail (file name, `program subcommand`, search pattern
    /// kind...). Never a full command line or file content.
    pub detail: Option<String>,
    pub is_failure: bool,
    pub is_interrupt: bool,
    pub duration_ms: Option<i64>,
    pub notification_type: Option<String>,
    pub task_id: Option<String>,
    pub task_subject: Option<String>,
    pub model: Option<String>,
    /// SessionStart `source` or SessionEnd `reason`.
    pub source: Option<String>,
    /// StopFailure error type, or first line of PostToolUseFailure error.
    pub error_kind: Option<String>,
    /// For PreToolUse(Agent): requested subagent type and short description.
    pub spawn_subagent_type: Option<String>,
    pub spawn_description: Option<String>,
    pub prompt_excerpt: Option<String>,
    /// Stop: whether Claude Code still has background work in flight.
    pub has_background_work: bool,
    /// Raw failure text, only used in-memory to pick a monster; never persisted.
    #[serde(skip)]
    pub failure_text: Option<String>,
    pub session_title: Option<String>,
}

pub fn normalize(env: &Envelope, opts: &NormalizeOptions) -> NormalizedEvent {
    let p = &env.payload;
    let kind = HookEventName::parse(p.str_field("hook_event_name").unwrap_or(""));
    let tool_name = p.str_field("tool_name").map(str::to_string);
    let tool_input = p.get("tool_input").cloned().unwrap_or(Value::Null);
    let command = tool_input.str_field("command");

    let category = tool_name.as_deref().map(|t| classify_tool(t, command));
    let detail = tool_name.as_deref().and_then(|t| tool_detail(t, &tool_input));

    let mut ev = NormalizedEvent {
        kind: kind.clone(),
        envelope_id: env.id.clone(),
        event_name: kind.as_str().to_string(),
        session_id: p.str_field("session_id").unwrap_or_default().to_string(),
        agent_id: p.str_field("agent_id").map(clip_id),
        agent_type: p.get("agent_type").and_then(Value::as_str).map(|s| clip(s, 120)),
        cwd: p.str_field("cwd").map(|s| clip(s, 1024)),
        transcript_path: p.str_field("transcript_path").map(|s| clip(s, 2048)),
        agent_transcript_path: p.str_field("agent_transcript_path").map(|s| clip(s, 2048)),
        fired_at_ms: env.fired_at_ms,
        tool_name,
        tool_use_id: p.str_field("tool_use_id").map(clip_id),
        category,
        detail,
        is_failure: false,
        is_interrupt: p.bool_field("is_interrupt").unwrap_or(false),
        duration_ms: p.i64_field("duration_ms"),
        notification_type: p.str_field("notification_type").map(|s| clip(s, 64)),
        task_id: p.str_field("task_id").map(clip_id),
        task_subject: p.str_field("task_subject").map(|s| clip(s, 200)),
        model: p.str_field("model").map(|s| clip(s, 120)),
        source: p.str_field("source").or_else(|| p.str_field("reason")).map(|s| clip(s, 64)),
        error_kind: None,
        spawn_subagent_type: None,
        spawn_description: None,
        prompt_excerpt: None,
        has_background_work: p
            .get("background_tasks")
            .and_then(Value::as_array)
            .map(|a| !a.is_empty())
            .unwrap_or(false),
        failure_text: None,
        session_title: p.str_field("session_title").map(|s| clip(s, 200)),
    };

    match &ev.kind {
        HookEventName::PostToolUseFailure => {
            ev.is_failure = !ev.is_interrupt;
            let err = p.str_field("error").unwrap_or("");
            ev.error_kind = err.lines().next().map(|l| clip(l, 120));
            ev.failure_text = Some(clip(err, 4000));
        }
        HookEventName::StopFailure => {
            ev.is_failure = true;
            ev.error_kind = p.str_field("error").map(|s| clip(s, 64));
        }
        HookEventName::UserPromptSubmit if opts.keep_prompt_excerpt => {
            ev.prompt_excerpt = p.str_field("prompt").map(prompt_excerpt).filter(|s| !s.is_empty());
        }
        HookEventName::PreToolUse | HookEventName::PostToolUse
            if matches!(ev.tool_name.as_deref(), Some("Agent" | "Task")) =>
        {
            ev.spawn_subagent_type = tool_input.str_field("subagent_type").map(|s| clip(s, 120));
            ev.spawn_description = tool_input.str_field("description").map(|s| clip(s, 120));
        }
        _ => {}
    }
    ev
}

/// Privacy-safe detail for a tool call.
fn tool_detail(tool: &str, input: &Value) -> Option<String> {
    match tool {
        "Read" | "Edit" | "MultiEdit" | "Write" | "NotebookEdit" | "NotebookRead" => input
            .str_field("file_path")
            .or_else(|| input.str_field("notebook_path"))
            .map(file_name),
        "Bash" | "PowerShell" => input.str_field("command").map(command_head),
        "Glob" => input.str_field("pattern").map(|s| clip(s, 60)),
        "Grep" => Some("pattern".to_string()).filter(|_| input.get("pattern").is_some()),
        "WebFetch" => input.str_field("url").and_then(url_host),
        "WebSearch" => Some("web".to_string()),
        "Agent" | "Task" => input.str_field("subagent_type").map(|s| clip(s, 60)),
        _ => None,
    }
}

pub fn file_name(path: &str) -> String {
    let name = path.rsplit(['/', '\\']).next().unwrap_or(path);
    clip(name, 80)
}

/// `program subcommand` without arguments, e.g. `cargo test`, `npm run build`.
pub fn command_head(cmd: &str) -> String {
    let first_line = cmd.lines().next().unwrap_or("");
    let first_segment = first_line.split(['&', ';', '|']).next().unwrap_or("");
    let words: Vec<&str> = first_segment
        .split_whitespace()
        .filter(|w| !w.contains('='))
        .take(3)
        .collect();
    let mut out: Vec<String> = Vec::new();
    for (i, w) in words.iter().enumerate() {
        if i > 0 && (w.starts_with('-') || w.contains(['/', '\\', '"', '\'', '$', '`'])) {
            break;
        }
        let w = if i == 0 { w.rsplit(['/', '\\']).next().unwrap_or(w) } else { w };
        out.push(clip(w, 24));
        // `npm run x`, `cargo test` -> stop after the sub-command unless it's "run".
        if i == 1 && w != "run" && w != "-m" {
            break;
        }
    }
    out.join(" ")
}

fn url_host(url: &str) -> Option<String> {
    let rest = url.split("://").nth(1)?;
    let host = rest.split(['/', '?', '#']).next()?;
    let host = host.rsplit('@').next()?; // drop credentials
    Some(clip(host, 80))
}

fn prompt_excerpt(prompt: &str) -> String {
    let line = prompt
        .lines()
        .map(str::trim)
        .find(|l| !l.is_empty() && !l.starts_with('<'))
        .unwrap_or("");
    let mut s: String = line.chars().take(PROMPT_EXCERPT_CHARS).collect();
    if line.chars().count() > PROMPT_EXCERPT_CHARS {
        s.push('…');
    }
    s
}

fn clip(s: &str, max: usize) -> String {
    s.chars().filter(|c| !c.is_control() || *c == '\n').take(max).collect()
}

fn clip_id(s: &str) -> String {
    s.chars().filter(|c| !c.is_control()).take(128).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn env(p: Value) -> Envelope {
        Envelope { v: 1, id: "e1".into(), fired_at_ms: 10, payload: p }
    }

    #[test]
    fn bash_command_is_reduced_to_head() {
        let ev = normalize(
            &env(json!({"session_id":"s","hook_event_name":"PreToolUse","tool_name":"Bash",
                "tool_input":{"command":"API_KEY=secret npm test -- --grep foo && rm x"}})),
            &NormalizeOptions::default(),
        );
        assert_eq!(ev.detail.as_deref(), Some("npm test"));
        assert_eq!(ev.category, Some(ActivityCategory::Testing));
        assert!(!format!("{:?}", ev).contains("secret"));
    }

    #[test]
    fn file_tools_keep_only_file_name() {
        let ev = normalize(
            &env(json!({"session_id":"s","hook_event_name":"PostToolUse","tool_name":"Write",
                "tool_input":{"file_path":"/home/u/proj/src/main.rs","content":"SECRET CONTENT"}})),
            &NormalizeOptions::default(),
        );
        assert_eq!(ev.detail.as_deref(), Some("main.rs"));
        assert!(!format!("{:?}", ev).contains("SECRET"));
    }

    #[test]
    fn prompt_excerpt_only_when_allowed() {
        let p = json!({"session_id":"s","hook_event_name":"UserPromptSubmit","prompt":"Fix the login bug\nmore"});
        assert_eq!(normalize(&env(p.clone()), &NormalizeOptions::default()).prompt_excerpt, None);
        let ev = normalize(&env(p), &NormalizeOptions { keep_prompt_excerpt: true });
        assert_eq!(ev.prompt_excerpt.as_deref(), Some("Fix the login bug"));
    }

    #[test]
    fn failure_fields() {
        let ev = normalize(
            &env(json!({"session_id":"s","hook_event_name":"PostToolUseFailure","tool_name":"Bash",
                "tool_input":{"command":"npm test"},"error":"Exit code 1\nboom","is_interrupt":false})),
            &NormalizeOptions::default(),
        );
        assert!(ev.is_failure);
        assert_eq!(ev.error_kind.as_deref(), Some("Exit code 1"));
    }

    #[test]
    fn interrupt_is_not_a_failure() {
        let ev = normalize(
            &env(json!({"session_id":"s","hook_event_name":"PostToolUseFailure","tool_name":"Bash","error":"x","is_interrupt":true})),
            &NormalizeOptions::default(),
        );
        assert!(!ev.is_failure);
    }

    #[test]
    fn subagent_spawn_metadata() {
        let ev = normalize(
            &env(json!({"session_id":"s","hook_event_name":"PreToolUse","tool_name":"Agent",
                "tool_input":{"subagent_type":"Explore","description":"Find API endpoints","prompt":"long"}})),
            &NormalizeOptions::default(),
        );
        assert_eq!(ev.spawn_subagent_type.as_deref(), Some("Explore"));
        assert_eq!(ev.spawn_description.as_deref(), Some("Find API endpoints"));
    }

    #[test]
    fn url_host_strips_credentials_and_path() {
        assert_eq!(url_host("https://user:pw@docs.rs/serde?x=1").as_deref(), Some("docs.rs"));
    }

    #[test]
    fn command_head_examples() {
        assert_eq!(command_head("cargo test --workspace"), "cargo test");
        assert_eq!(command_head("npm run build -- --mode x"), "npm run build");
        assert_eq!(command_head("/usr/bin/git status"), "git status");
        assert_eq!(command_head("cat /etc/passwd"), "cat");
    }
}
