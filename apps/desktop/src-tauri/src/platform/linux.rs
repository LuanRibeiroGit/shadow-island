//! Linux detection: X11 vs Wayland, GNOME vs KDE Plasma and their known limits.

use super::{Capabilities, DesktopEnv, EnvReader, OsFamily, PlatformInfo, SessionType, Support};

pub const HOOK_BINARY: &str = "ids-hook";

pub fn detect_info(env: &EnvReader) -> PlatformInfo {
    let session_type = match env.var("XDG_SESSION_TYPE").as_deref() {
        Some("wayland") => SessionType::Wayland,
        Some("x11") => SessionType::X11,
        _ if env.var("WAYLAND_DISPLAY").is_some() => SessionType::Wayland,
        _ if env.var("DISPLAY").is_some() => SessionType::X11,
        _ => SessionType::Unknown,
    };
    let raw = env.var("XDG_CURRENT_DESKTOP").or_else(|| env.var("DESKTOP_SESSION"));
    let lower = raw.clone().unwrap_or_default().to_ascii_lowercase();
    let desktop = if lower.contains("gnome") || lower.contains("unity") || lower.contains("ubuntu") {
        DesktopEnv::Gnome
    } else if lower.contains("kde") || lower.contains("plasma") {
        DesktopEnv::Kde
    } else if lower.is_empty() {
        DesktopEnv::Unknown
    } else {
        DesktopEnv::Other
    };
    PlatformInfo {
        os: OsFamily::Linux,
        os_name: "linux".into(),
        arch: std::env::consts::ARCH.into(),
        session_type,
        desktop,
        desktop_raw: raw,
    }
}

pub fn capabilities(info: &PlatformInfo) -> Capabilities {
    let wayland = info.session_type == SessionType::Wayland;
    let gnome = info.desktop == DesktopEnv::Gnome;
    Capabilities {
        tray: if gnome {
            Support::Limited("GNOME só mostra ícones de bandeja com a extensão AppIndicator/KStatusNotifierItem (padrão no Ubuntu).".into())
        } else {
            Support::Full
        },
        transparent_windows: match info.session_type {
            SessionType::Wayland => Support::Full,
            _ if gnome || info.desktop == DesktopEnv::Kde => Support::Full,
            _ => Support::Limited("No X11 a transparência exige um compositor ativo; sem ele a faixa de personagens fica opaca.".into()),
        },
        always_on_top: if wayland && gnome {
            Support::Limited("GNOME no Wayland ignora 'sempre no topo'. O modo de compatibilidade X11 (XWayland) contorna isso.".into())
        } else {
            Support::Full
        },
        window_positioning: if wayland {
            Support::Limited("No Wayland o app não pode posicionar janelas; o modo de compatibilidade X11 (XWayland) é usado quando disponível.".into())
        } else {
            Support::Full
        },
        click_through: if wayland {
            Support::Limited("No Wayland a posição global do cursor não está disponível; a faixa de personagens captura cliques na sua área.".into())
        } else {
            Support::Full
        },
        global_shortcuts: if wayland {
            Support::Unsupported("Atalhos globais não funcionam no Wayland. Use o ícone da bandeja ou abra o app novamente.".into())
        } else {
            Support::Full
        },
        autostart: Support::Full,
        notifications: Support::Full,
        skip_taskbar: Support::Full,
    }
}

/// On Wayland, prefer XWayland so the overlay can be positioned and kept on top.
/// Must run before GTK initializes.
pub fn prepare_process_env(info: &PlatformInfo, prefer_x11: bool) {
    if prefer_x11 && info.session_type == SessionType::Wayland && std::env::var_os("DISPLAY").is_some() && std::env::var_os("GDK_BACKEND").is_none() {
        // SAFETY: called at startup before any thread is spawned.
        unsafe { std::env::set_var("GDK_BACKEND", "x11") };
    }
    // Known WebKitGTK rendering issue with some GPU drivers; harmless elsewhere.
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        unsafe { std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1") };
    }
}

pub fn protect_file(path: &std::path::Path) {
    use std::os::unix::fs::PermissionsExt;
    let _ = std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gnome_wayland() {
        let env = EnvReader::from_pairs(&[("XDG_SESSION_TYPE", "wayland"), ("XDG_CURRENT_DESKTOP", "ubuntu:GNOME")]);
        let info = detect_info(&env);
        assert_eq!(info.session_type, SessionType::Wayland);
        assert_eq!(info.desktop, DesktopEnv::Gnome);
        let caps = capabilities(&info);
        assert!(matches!(caps.tray, Support::Limited(_)));
        assert!(matches!(caps.global_shortcuts, Support::Unsupported(_)));
        assert!(matches!(caps.window_positioning, Support::Limited(_)));
    }

    #[test]
    fn kde_x11() {
        let env = EnvReader::from_pairs(&[("XDG_SESSION_TYPE", "x11"), ("XDG_CURRENT_DESKTOP", "KDE")]);
        let info = detect_info(&env);
        assert_eq!(info.desktop, DesktopEnv::Kde);
        let caps = capabilities(&info);
        assert_eq!(caps.tray, Support::Full);
        assert_eq!(caps.global_shortcuts, Support::Full);
        assert_eq!(caps.transparent_windows, Support::Full);
    }

    #[test]
    fn unknown_x11_wm_has_limited_transparency() {
        let env = EnvReader::from_pairs(&[("DISPLAY", ":0"), ("XDG_CURRENT_DESKTOP", "i3")]);
        let info = detect_info(&env);
        assert_eq!(info.session_type, SessionType::X11);
        assert!(matches!(capabilities(&info).transparent_windows, Support::Limited(_)));
    }
}
