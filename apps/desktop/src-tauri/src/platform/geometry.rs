//! Overlay placement math, independent of any window system (unit-tested).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum OverlayPlacement {
    /// Just above the taskbar / bottom panel (default).
    #[default]
    Bottom,
    /// Just below a top panel (GNOME top bar, top taskbars).
    Top,
    /// Over the bottom taskbar itself (bottom edge of the monitor). Works where the
    /// OS lets a topmost window cover the taskbar (Windows, most X11 panels); GNOME
    /// draws its dock above every window, so there the strip would be hidden.
    Taskbar,
}

/// Compute the overlay strip rectangle from the monitor rectangle and its work area
/// (monitor minus panels/taskbar). The strip hugs the edge of the work area that is
/// next to the taskbar, spans the work-area width (optionally narrowed) and has the
/// requested height.
pub fn overlay_rect(monitor: Rect, work_area: Option<Rect>, placement: OverlayPlacement, height: u32, width_fraction: f32) -> Rect {
    let wa = work_area.filter(|w| w.width > 0 && w.height > 0).unwrap_or(monitor);
    let height = height.min(wa.height).max(32);
    let frac = width_fraction.clamp(0.2, 1.0);
    let width = ((wa.width as f32) * frac).round() as u32;
    let x = wa.x + ((wa.width - width) / 2) as i32;
    let y = match placement {
        OverlayPlacement::Bottom => wa.y + wa.height as i32 - height as i32,
        OverlayPlacement::Top => wa.y,
        OverlayPlacement::Taskbar => monitor.y + monitor.height as i32 - height as i32,
    };
    Rect { x, y, width, height }
}

#[cfg(test)]
mod tests {
    use super::*;

    const MON: Rect = Rect { x: 0, y: 0, width: 1920, height: 1080 };

    #[test]
    fn sits_above_bottom_taskbar() {
        let wa = Rect { x: 0, y: 0, width: 1920, height: 1040 };
        let r = overlay_rect(MON, Some(wa), OverlayPlacement::Bottom, 120, 1.0);
        assert_eq!(r, Rect { x: 0, y: 920, width: 1920, height: 120 });
    }

    #[test]
    fn below_top_panel() {
        let wa = Rect { x: 0, y: 32, width: 1920, height: 1048 };
        let r = overlay_rect(MON, Some(wa), OverlayPlacement::Top, 100, 0.5);
        assert_eq!(r, Rect { x: 480, y: 32, width: 960, height: 100 });
    }

    #[test]
    fn over_the_taskbar() {
        let wa = Rect { x: 0, y: 0, width: 1920, height: 1012 };
        let r = overlay_rect(MON, Some(wa), OverlayPlacement::Taskbar, 76, 1.0);
        assert_eq!(r, Rect { x: 0, y: 1004, width: 1920, height: 76 });
    }

    #[test]
    fn second_monitor_and_missing_work_area() {
        let m2 = Rect { x: 1920, y: 0, width: 2560, height: 1440 };
        let r = overlay_rect(m2, None, OverlayPlacement::Bottom, 5000, 1.0);
        assert_eq!(r.height, 1440);
        assert_eq!(r.x, 1920);
    }
}
