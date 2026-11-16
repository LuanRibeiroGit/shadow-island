//! App settings. The full schema (with defaults) lives in the frontend
//! (`src/settings/schema.ts`); the backend reads only the fields it acts on and
//! preserves everything else untouched.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::platform::{OverlayAlign, OverlayPlacement};

pub const SETTINGS_KEY: &str = "app";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct BackendSettings {
    pub general: General,
    pub claude: Claude,
    pub desktop: Desktop,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct General {
    pub launch_at_login: bool,
    pub minimize_to_tray: bool,
    pub open_castle_on_start: bool,
    pub toggle_shortcut: String,
}

impl Default for General {
    fn default() -> Self {
        Self { launch_at_login: false, minimize_to_tray: true, open_castle_on_start: true, toggle_shortcut: "CommandOrControl+Shift+I".into() }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Claude {
    /// Collector on/off. When off, hook deliveries are spooled, not processed.
    pub integration_enabled: bool,
    pub keep_prompt_excerpt: bool,
    /// Subagent type name -> specialty (architect, developer, ...).
    pub specialty_overrides: HashMap<String, String>,
    /// Extra directories transcripts may be read from (besides ~/.claude).
    pub extra_transcript_dirs: Vec<String>,
    /// Days of history to keep (0 = forever).
    pub retention_days: u32,
}

impl Default for Claude {
    fn default() -> Self {
        Self { integration_enabled: true, keep_prompt_excerpt: true, specialty_overrides: HashMap::new(), extra_transcript_dirs: vec![], retention_days: 90 }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Desktop {
    pub overlay_enabled: bool,
    pub placement: OverlayPlacement,
    /// Strip height in logical pixels.
    pub height: u32,
    /// Fraction of the work-area width the strip spans (0.2..1).
    pub width_fraction: f32,
    /// Strip only as wide as the working souls (ignores width_fraction).
    pub auto_width: bool,
    pub align: OverlayAlign,
    pub monitor: Option<String>,
    /// Linux/Wayland: run through XWayland so the overlay can be placed and kept on top.
    pub prefer_x11_on_wayland: bool,
}

impl Default for Desktop {
    fn default() -> Self {
        Self { overlay_enabled: true, placement: OverlayPlacement::Bottom, height: 52, width_fraction: 1.0, auto_width: true, align: OverlayAlign::Right, monitor: None, prefer_x11_on_wayland: true }
    }
}

/// Parse the stored JSON (or an incoming one). Unknown/invalid sub-objects fall
/// back to defaults instead of failing.
pub fn parse(raw: &Value) -> BackendSettings {
    serde_json::from_value(raw.clone()).unwrap_or_default()
}

/// Validate a settings document coming from the UI: must be an object of limited
/// size. Returns the normalized JSON to store.
pub fn validate(raw: &Value) -> Result<Value, String> {
    let obj: &Map<String, Value> = raw.as_object().ok_or("settings must be an object")?;
    let text = serde_json::to_string(obj).map_err(|e| e.to_string())?;
    if text.len() > 256 * 1024 {
        return Err("settings too large".into());
    }
    // Round-trip the backend part to make sure it is well-formed.
    let _ = parse(raw);
    Ok(raw.clone())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn defaults_and_partial_documents() {
        let s = parse(&json!({}));
        assert!(s.claude.integration_enabled);
        let s = parse(&json!({"claude": {"keepPromptExcerpt": false}, "theme": {"x": 1}}));
        assert!(!s.claude.keep_prompt_excerpt);
        assert!(s.claude.integration_enabled);
        assert_eq!(s.desktop.height, 52);
    }

    #[test]
    fn invalid_values_fall_back() {
        let s = parse(&json!({"desktop": {"height": "tall"}}));
        assert_eq!(s.desktop.height, 52);
        assert!(validate(&json!([1])).is_err());
    }
}
