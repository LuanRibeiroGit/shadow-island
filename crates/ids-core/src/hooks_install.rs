//! Safe install / verify / remove of the Claude Code hook integration.
//!
//! Rules (spec §8):
//! - never touch the file without an explicit user action;
//! - show a plan first (`plan_install` / `plan_remove` return the new JSON);
//! - back up the original file before writing, write atomically;
//! - only add/remove *our* handlers (identified by the `ids-hook` executable name),
//!   leaving every other key and hook untouched, in their original order;
//! - refuse to write when the existing file is not valid JSON.

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;
use serde_json::{json, Map, Value};

use crate::error::{CoreError, CoreResult};
use crate::event::HookEventName;

pub const HOOK_BIN_STEM: &str = "ids-hook";

#[derive(Debug, Clone)]
pub struct HookCommand {
    /// Absolute path of the relay executable.
    pub executable: PathBuf,
    /// App data dir, passed to the relay so it can find the port/token and spool.
    pub data_dir: PathBuf,
}

impl HookCommand {
    pub fn handler(&self) -> Value {
        json!({
            "type": "command",
            "command": self.executable.to_string_lossy(),
            "args": ["--data-dir", self.data_dir.to_string_lossy()],
            "async": true,
            "timeout": 10
        })
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IntegrationStatus {
    pub settings_path: String,
    pub settings_exists: bool,
    pub settings_valid: bool,
    pub installed_events: Vec<String>,
    pub missing_events: Vec<String>,
    /// Some of our handlers point at a different executable (moved/updated app).
    pub stale_handlers: bool,
    /// `disableAllHooks: true` is set in this file.
    pub hooks_disabled: bool,
    pub fully_installed: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Plan {
    pub settings_path: String,
    pub before: String,
    pub after: String,
    pub changed_events: Vec<String>,
    pub changed: bool,
}

/// `~/.claude/settings.json`, honoring `CLAUDE_CONFIG_DIR`.
pub fn default_settings_path(home: &Path, claude_config_dir: Option<&str>) -> PathBuf {
    match claude_config_dir.filter(|s| !s.is_empty()) {
        Some(dir) => PathBuf::from(dir).join("settings.json"),
        None => home.join(".claude").join("settings.json"),
    }
}

pub fn is_our_handler(h: &Value) -> bool {
    h.get("type").and_then(Value::as_str) == Some("command")
        && h
            .get("command")
            .and_then(Value::as_str)
            .map(|c| {
                let name = c.trim_matches('"').rsplit(['/', '\\']).next().unwrap_or("");
                let stem = name.strip_suffix(".exe").unwrap_or(name);
                stem == HOOK_BIN_STEM || stem.starts_with(&format!("{HOOK_BIN_STEM}-"))
            })
            .unwrap_or(false)
}

fn read_settings(path: &Path) -> CoreResult<(String, Value)> {
    match fs::read_to_string(path) {
        Ok(text) if text.trim().is_empty() => Ok((text, json!({}))),
        Ok(text) => {
            let v: Value = serde_json::from_str(&text)
                .map_err(|e| CoreError::Settings(format!("settings.json is not valid JSON ({e}); nothing was changed")))?;
            if !v.is_object() {
                return Err(CoreError::Settings("settings.json is not a JSON object; nothing was changed".into()));
            }
            Ok((text, v))
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok((String::new(), json!({}))),
        Err(e) => Err(e.into()),
    }
}

pub fn status(path: &Path, cmd: &HookCommand) -> IntegrationStatus {
    let exists = path.exists();
    let parsed = read_settings(path);
    let mut st = IntegrationStatus {
        settings_path: path.to_string_lossy().to_string(),
        settings_exists: exists,
        settings_valid: parsed.is_ok(),
        installed_events: vec![],
        missing_events: vec![],
        stale_handlers: false,
        hooks_disabled: false,
        fully_installed: false,
    };
    let Ok((_, v)) = parsed else { return st };
    st.hooks_disabled = v.get("disableAllHooks").and_then(Value::as_bool).unwrap_or(false);
    let wanted = cmd.handler();
    for ev in HookEventName::installable() {
        let ours: Vec<&Value> = v
            .get("hooks")
            .and_then(|h| h.get(*ev))
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(|g| g.get("hooks").and_then(Value::as_array))
            .flatten()
            .filter(|h| is_our_handler(h))
            .collect();
        if ours.is_empty() {
            st.missing_events.push(ev.to_string());
        } else {
            st.installed_events.push(ev.to_string());
            if ours.iter().any(|h| h.get("command") != wanted.get("command") || h.get("args") != wanted.get("args")) {
                st.stale_handlers = true;
            }
        }
    }
    st.fully_installed = st.missing_events.is_empty() && !st.stale_handlers;
    st
}

/// Compute the settings content after installing. Does not write anything.
pub fn plan_install(path: &Path, cmd: &HookCommand) -> CoreResult<Plan> {
    let (before, mut v) = read_settings(path)?;
    let root = v.as_object_mut().expect("checked object");
    let hooks = root.entry("hooks").or_insert_with(|| Value::Object(Map::new()));
    let hooks = hooks
        .as_object_mut()
        .ok_or_else(|| CoreError::Settings("\"hooks\" is not an object; nothing was changed".into()))?;
    let handler = cmd.handler();
    let mut changed_events = Vec::new();
    for ev in HookEventName::installable() {
        let groups = hooks.entry(ev.to_string()).or_insert_with(|| Value::Array(vec![]));
        let Some(groups) = groups.as_array_mut() else {
            return Err(CoreError::Settings(format!("hooks.{ev} is not an array; nothing was changed")));
        };
        let mut found = false;
        for g in groups.iter_mut() {
            if let Some(hs) = g.get_mut("hooks").and_then(Value::as_array_mut) {
                for h in hs.iter_mut().filter(|h| is_our_handler(h)) {
                    if !found && *h != handler {
                        *h = handler.clone();
                        changed_events.push(ev.to_string());
                    }
                    found = true;
                }
            }
        }
        // Drop duplicate copies of our handler beyond the first.
        let mut seen = false;
        for g in groups.iter_mut() {
            if let Some(hs) = g.get_mut("hooks").and_then(Value::as_array_mut) {
                hs.retain(|h| {
                    if is_our_handler(h) {
                        let keep = !seen;
                        seen = true;
                        keep
                    } else {
                        true
                    }
                });
            }
        }
        if !found {
            groups.push(json!({ "hooks": [handler.clone()] }));
            changed_events.push(ev.to_string());
        }
    }
    finish_plan(path, before, &v, changed_events)
}

/// Compute the settings content after removing only our handlers.
pub fn plan_remove(path: &Path) -> CoreResult<Plan> {
    let (before, mut v) = read_settings(path)?;
    let mut changed_events = Vec::new();
    if let Some(hooks) = v.get_mut("hooks").and_then(Value::as_object_mut) {
        let keys: Vec<String> = hooks.keys().cloned().collect();
        for ev in keys {
            let Some(groups) = hooks.get_mut(&ev).and_then(Value::as_array_mut) else { continue };
            let mut removed = false;
            for g in groups.iter_mut() {
                if let Some(hs) = g.get_mut("hooks").and_then(Value::as_array_mut) {
                    let n = hs.len();
                    hs.retain(|h| !is_our_handler(h));
                    removed |= hs.len() != n;
                }
            }
            if removed {
                // Remove groups we emptied (a group with no handlers is meaningless).
                groups.retain(|g| g.get("hooks").and_then(Value::as_array).map(|a| !a.is_empty()).unwrap_or(true));
                changed_events.push(ev.clone());
                if groups.is_empty() {
                    hooks.remove(&ev);
                }
            }
        }
        if hooks.is_empty() && !changed_events.is_empty() {
            v.as_object_mut().expect("object").remove("hooks");
        }
    }
    finish_plan(path, before, &v, changed_events)
}

fn finish_plan(path: &Path, before: String, v: &Value, changed_events: Vec<String>) -> CoreResult<Plan> {
    let after = serde_json::to_string_pretty(v)? + "\n";
    Ok(Plan {
        settings_path: path.to_string_lossy().to_string(),
        changed: !changed_events.is_empty(),
        before,
        after,
        changed_events,
    })
}

/// Apply a plan: backup + atomic write. Fails if the file changed since the plan.
pub fn apply(plan: &Plan, backup_dir: &Path, now_ms: i64) -> CoreResult<Option<PathBuf>> {
    if !plan.changed {
        return Ok(None);
    }
    let path = PathBuf::from(&plan.settings_path);
    let current = match fs::read_to_string(&path) {
        Ok(t) => t,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => String::new(),
        Err(e) => return Err(e.into()),
    };
    if current != plan.before {
        return Err(CoreError::Settings("settings.json changed since the plan was made; review again".into()));
    }
    let mut backup = None;
    if path.exists() {
        fs::create_dir_all(backup_dir)?;
        let b = backup_dir.join(format!("settings.json.{now_ms}.bak"));
        fs::copy(&path, &b)?;
        backup = Some(b);
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let tmp = path.with_extension(format!("json.ids-tmp-{now_ms}"));
    fs::write(&tmp, plan.after.as_bytes())?;
    fs::rename(&tmp, &path).inspect_err(|_| {
        let _ = fs::remove_file(&tmp);
    })?;
    Ok(backup)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cmd() -> HookCommand {
        HookCommand { executable: PathBuf::from("/opt/ids/ids-hook"), data_dir: PathBuf::from("/data dir/ids") }
    }

    const EXISTING: &str = r#"{
  "model": "opus",
  "permissions": { "allow": ["Bash(npm test)"] },
  "hooks": {
    "PreToolUse": [
      { "matcher": "Bash", "hooks": [ { "type": "command", "command": "/home/u/guard.sh" } ] }
    ]
  }
}
"#;

    #[test]
    fn install_preserves_existing_and_is_idempotent() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        fs::write(&path, EXISTING).unwrap();

        let plan = plan_install(&path, &cmd()).unwrap();
        assert!(plan.changed);
        assert_eq!(plan.changed_events.len(), HookEventName::installable().len());
        let backup = apply(&plan, &dir.path().join("backups"), 1).unwrap().unwrap();
        assert_eq!(fs::read_to_string(backup).unwrap(), EXISTING);

        let v: Value = serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(v["model"], "opus");
        assert_eq!(v["permissions"]["allow"][0], "Bash(npm test)");
        let pre = v["hooks"]["PreToolUse"].as_array().unwrap();
        assert_eq!(pre[0]["hooks"][0]["command"], "/home/u/guard.sh");
        assert!(is_our_handler(&pre[1]["hooks"][0]));
        assert_eq!(pre[1]["hooks"][0]["async"], true);
        // Key order preserved: model stays first.
        assert!(fs::read_to_string(&path).unwrap().find("\"model\"").unwrap() < 10);

        let st = status(&path, &cmd());
        assert!(st.fully_installed, "{st:?}");

        let again = plan_install(&path, &cmd()).unwrap();
        assert!(!again.changed);
    }

    #[test]
    fn remove_only_removes_ours() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        fs::write(&path, EXISTING).unwrap();
        apply(&plan_install(&path, &cmd()).unwrap(), dir.path(), 1).unwrap();
        apply(&plan_remove(&path).unwrap(), dir.path(), 2).unwrap();
        let after: Value = serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
        let orig: Value = serde_json::from_str(EXISTING).unwrap();
        assert_eq!(after, orig);
        assert!(!status(&path, &cmd()).installed_events.iter().any(|_| true));
    }

    #[test]
    fn stale_path_is_detected_and_fixed() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        let old = HookCommand { executable: PathBuf::from("/old/ids-hook.exe"), data_dir: PathBuf::from("/d") };
        apply(&plan_install(&path, &old).unwrap(), dir.path(), 1).unwrap();
        let st = status(&path, &cmd());
        assert!(st.stale_handlers && !st.fully_installed);
        apply(&plan_install(&path, &cmd()).unwrap(), dir.path(), 2).unwrap();
        assert!(status(&path, &cmd()).fully_installed);
    }

    #[test]
    fn invalid_json_is_never_overwritten() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        fs::write(&path, "{ broken").unwrap();
        assert!(plan_install(&path, &cmd()).is_err());
        assert!(plan_remove(&path).is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), "{ broken");
    }

    #[test]
    fn concurrent_edit_is_detected() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        fs::write(&path, "{}").unwrap();
        let plan = plan_install(&path, &cmd()).unwrap();
        fs::write(&path, "{\"x\":1}").unwrap();
        assert!(apply(&plan, dir.path(), 1).is_err());
    }

    #[test]
    fn missing_file_is_created_without_backup() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("sub").join("settings.json");
        let plan = plan_install(&path, &cmd()).unwrap();
        assert_eq!(apply(&plan, dir.path(), 1).unwrap(), None);
        assert!(status(&path, &cmd()).fully_installed);
    }

    #[test]
    fn handler_detection() {
        assert!(is_our_handler(&json!({"type":"command","command":"C:\\Program Files\\Ilha\\ids-hook.exe"})));
        assert!(is_our_handler(&json!({"type":"command","command":"/usr/bin/ids-hook-x86_64-unknown-linux-gnu"})));
        assert!(!is_our_handler(&json!({"type":"command","command":"/usr/bin/other-hook"})));
        assert!(!is_our_handler(&json!({"type":"http","url":"http://x/ids-hook"})));
    }
}
