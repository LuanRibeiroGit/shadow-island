//! Fallback for platforms that are not officially supported (e.g. macOS builds made
//! by contributors). Everything is reported as limited.

use super::{Capabilities, DesktopEnv, EnvReader, OsFamily, PlatformInfo, SessionType, Support};

pub const HOOK_BINARY: &str = "ids-hook";

pub fn detect_info(_env: &EnvReader) -> PlatformInfo {
    PlatformInfo {
        os: OsFamily::Other,
        os_name: std::env::consts::OS.into(),
        arch: std::env::consts::ARCH.into(),
        session_type: SessionType::Unknown,
        desktop: DesktopEnv::Unknown,
        desktop_raw: None,
    }
}

pub fn capabilities(_info: &PlatformInfo) -> Capabilities {
    let l = || Support::Limited("Plataforma não suportada oficialmente.".into());
    Capabilities {
        tray: l(),
        transparent_windows: l(),
        always_on_top: l(),
        window_positioning: l(),
        click_through: l(),
        global_shortcuts: l(),
        autostart: l(),
        notifications: l(),
        skip_taskbar: l(),
    }
}

pub fn prepare_process_env(_info: &PlatformInfo, _prefer_x11: bool) {}

pub fn protect_file(_path: &std::path::Path) {}
