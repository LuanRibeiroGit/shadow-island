//! PlatformAdapter: the only place that knows about OS / desktop-environment
//! differences. Everything else asks the adapter for capabilities and behaviors.
//! OS-specific detection lives in `linux.rs` / `windows.rs`; `cfg!` checks must not
//! appear outside this module.

mod geometry;
#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "windows")]
mod windows;
#[cfg(not(any(target_os = "linux", target_os = "windows")))]
mod other;

#[cfg(not(any(target_os = "linux", target_os = "windows")))]
use other as imp;
#[cfg(target_os = "linux")]
use linux as imp;
#[cfg(target_os = "windows")]
use windows as imp;

use std::path::PathBuf;

use serde::Serialize;

pub use geometry::{overlay_rect, OverlayPlacement, Rect};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)] // variants are constructed per target OS
pub enum OsFamily {
    Linux,
    Windows,
    Other,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)] // variants are constructed per target OS
pub enum SessionType {
    X11,
    Wayland,
    Windows,
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)] // variants are constructed per target OS
pub enum DesktopEnv {
    Gnome,
    Kde,
    Other,
    Windows,
    Unknown,
}

/// Support level of a feature, with a human-readable reason when not full.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "level", content = "reason", rename_all = "camelCase")]
pub enum Support {
    Full,
    Limited(String),
    Unsupported(String),
}

impl Support {
    pub fn usable(&self) -> bool {
        !matches!(self, Support::Unsupported(_))
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformInfo {
    pub os: OsFamily,
    pub os_name: String,
    pub arch: String,
    pub session_type: SessionType,
    pub desktop: DesktopEnv,
    pub desktop_raw: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Capabilities {
    pub tray: Support,
    pub transparent_windows: Support,
    pub always_on_top: Support,
    pub window_positioning: Support,
    pub click_through: Support,
    pub global_shortcuts: Support,
    pub autostart: Support,
    pub notifications: Support,
    pub skip_taskbar: Support,
}

/// What closing the castle window does.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum CloseBehavior {
    /// Hide the window; the app keeps running and is reachable from the tray.
    HideToTray,
    /// No usable tray: minimize instead so the app stays reachable in the taskbar.
    Minimize,
    Quit,
}

#[derive(Debug, Clone)]
pub struct PlatformAdapter {
    info: PlatformInfo,
    caps: Capabilities,
}

impl PlatformAdapter {
    pub fn detect() -> Self {
        let info = imp::detect_info(&EnvReader::process());
        let caps = imp::capabilities(&info);
        Self { info, caps }
    }

    #[cfg(test)]
    pub fn from_parts(info: PlatformInfo, caps: Capabilities) -> Self {
        Self { info, caps }
    }

    pub fn info(&self) -> &PlatformInfo {
        &self.info
    }

    pub fn capabilities(&self) -> &Capabilities {
        &self.caps
    }

    pub fn close_behavior(&self, minimize_to_tray: bool) -> CloseBehavior {
        match (minimize_to_tray, &self.caps.tray) {
            (false, _) => CloseBehavior::Quit,
            (true, Support::Full) => CloseBehavior::HideToTray,
            // GNOME without the AppIndicator extension: a hidden window would be
            // unreachable, so minimize instead.
            (true, _) => CloseBehavior::Minimize,
        }
    }

    /// `~/.claude/settings.json`, honoring `CLAUDE_CONFIG_DIR`.
    pub fn claude_settings_path(&self) -> Option<PathBuf> {
        let home = home_dir()?;
        let cfg = std::env::var("CLAUDE_CONFIG_DIR").ok();
        Some(ids_core::hooks_install::default_settings_path(&home, cfg.as_deref()))
    }

    /// Directories Claude Code writes transcripts to.
    pub fn claude_transcript_roots(&self) -> Vec<PathBuf> {
        let mut roots = Vec::new();
        if let Ok(dir) = std::env::var("CLAUDE_CONFIG_DIR") {
            if !dir.is_empty() {
                roots.push(PathBuf::from(dir));
            }
        }
        if let Some(home) = home_dir() {
            roots.push(home.join(".claude"));
        }
        roots
    }

    /// File name of the hook relay next to the main executable.
    pub fn hook_binary_name(&self) -> &'static str {
        imp::HOOK_BINARY
    }

    /// Environment tweaks that must happen before the webview starts.
    pub fn prepare_process_env(&self, prefer_x11: bool) {
        imp::prepare_process_env(&self.info, prefer_x11);
    }

    /// Restrict a secret file to the current user where the OS supports it.
    pub fn protect_file(&self, path: &std::path::Path) {
        imp::protect_file(path);
    }
}

pub fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .filter(|h| !h.is_empty())
        .map(PathBuf::from)
}

/// Injectable environment reader so detection is unit-testable.
pub struct EnvReader {
    get: Box<dyn Fn(&str) -> Option<String>>,
}

impl EnvReader {
    pub fn process() -> Self {
        Self { get: Box::new(|k| std::env::var(k).ok().filter(|v| !v.is_empty())) }
    }
    #[cfg(test)]
    pub fn from_pairs(pairs: &[(&str, &str)]) -> Self {
        let map: std::collections::HashMap<String, String> = pairs.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect();
        Self { get: Box::new(move |k| map.get(k).cloned()) }
    }
    pub fn var(&self, k: &str) -> Option<String> {
        (self.get)(k)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn caps(tray: Support) -> Capabilities {
        Capabilities {
            tray,
            transparent_windows: Support::Full,
            always_on_top: Support::Full,
            window_positioning: Support::Full,
            click_through: Support::Full,
            global_shortcuts: Support::Full,
            autostart: Support::Full,
            notifications: Support::Full,
            skip_taskbar: Support::Full,
        }
    }

    fn info() -> PlatformInfo {
        PlatformInfo { os: OsFamily::Linux, os_name: "linux".into(), arch: "x86_64".into(), session_type: SessionType::X11, desktop: DesktopEnv::Kde, desktop_raw: None }
    }

    #[test]
    fn close_behavior_falls_back_without_tray() {
        let a = PlatformAdapter::from_parts(info(), caps(Support::Full));
        assert_eq!(a.close_behavior(true), CloseBehavior::HideToTray);
        assert_eq!(a.close_behavior(false), CloseBehavior::Quit);
        let b = PlatformAdapter::from_parts(info(), caps(Support::Limited("needs extension".into())));
        assert_eq!(b.close_behavior(true), CloseBehavior::Minimize);
    }
}
