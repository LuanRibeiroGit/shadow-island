//! Windows 10/11 detection. Tauri's APIs cover tray, transparency, always-on-top,
//! skip-taskbar and global shortcuts natively; WebView2 is required (the installer
//! bootstraps it).

use super::{Capabilities, DesktopEnv, EnvReader, OsFamily, PlatformInfo, SessionType, Support};

pub const HOOK_BINARY: &str = "ids-hook.exe";

pub fn detect_info(_env: &EnvReader) -> PlatformInfo {
    PlatformInfo {
        os: OsFamily::Windows,
        os_name: "windows".into(),
        arch: std::env::consts::ARCH.into(),
        session_type: SessionType::Windows,
        desktop: DesktopEnv::Windows,
        desktop_raw: None,
    }
}

pub fn capabilities(_info: &PlatformInfo) -> Capabilities {
    Capabilities {
        tray: Support::Full,
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

pub fn prepare_process_env(_info: &PlatformInfo, _prefer_x11: bool) {}

pub fn protect_file(_path: &std::path::Path) {
    // Files live under %APPDATA%\<identifier>, which is already per-user (ACL).
}
