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

/// Horizontal alignment of a strip narrower than the work area.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum OverlayAlign {
    Left,
    #[default]
    Center,
    Right,
}

/// Compute the overlay strip rectangle from the monitor rectangle and its work area
/// (monitor minus panels/taskbar). The strip hugs the edge of the work area that is
/// next to the taskbar, spans the work-area width (optionally narrowed) and has the
/// requested height.
#[cfg(test)]
pub fn overlay_rect(monitor: Rect, work_area: Option<Rect>, placement: OverlayPlacement, height: u32, width_fraction: f32) -> Rect {
    overlay_rect_fit(monitor, work_area, placement, height, width_fraction, None, OverlayAlign::Center)
}

/// Like [`overlay_rect`], but `content_width` (when set) makes the strip only as wide
/// as the characters it shows, aligned left/center/right.
#[allow(clippy::too_many_arguments)]
pub fn overlay_rect_fit(monitor: Rect, work_area: Option<Rect>, placement: OverlayPlacement, height: u32, width_fraction: f32, content_width: Option<u32>, align: OverlayAlign) -> Rect {
    let wa = work_area.filter(|w| w.width > 0 && w.height > 0).unwrap_or(monitor);
    let height = height.min(wa.height).max(32);
    let width = match content_width {
        Some(w) => w.clamp(48, wa.width),
        None => ((wa.width as f32) * width_fraction.clamp(0.2, 1.0)).round() as u32,
    };
    let x = match align {
        OverlayAlign::Left => wa.x,
        OverlayAlign::Center => wa.x + ((wa.width - width) / 2) as i32,
        OverlayAlign::Right => wa.x + (wa.width - width) as i32,
    };
    let y = match placement {
        OverlayPlacement::Bottom => wa.y + wa.height as i32 - height as i32,
        OverlayPlacement::Top => wa.y,
        OverlayPlacement::Taskbar => monitor.y + monitor.height as i32 - height as i32,
    };
    Rect { x, y, width, height }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Anchor {
    pub x: i32,
    pub bottom: i32,
}

#[allow(clippy::too_many_arguments)]
pub fn roam_rect(monitor: Rect, work_area: Option<Rect>, placement: OverlayPlacement, align: OverlayAlign, width: u32, height: u32, anchor: Option<Anchor>) -> Rect {
    let wa = work_area.filter(|w| w.width > 0 && w.height > 0).unwrap_or(monitor);
    let width = width.min(wa.width).max(48.min(wa.width));
    let height = height.min(monitor.height).max(32.min(monitor.height));
    let default_x = match align {
        OverlayAlign::Left => wa.x,
        OverlayAlign::Center => wa.x + ((wa.width - width) / 2) as i32,
        OverlayAlign::Right => wa.x + (wa.width - width) as i32,
    };
    let default_bottom = match placement {
        OverlayPlacement::Bottom => wa.y + wa.height as i32,
        OverlayPlacement::Top => wa.y + height as i32,
        OverlayPlacement::Taskbar => monitor.y + monitor.height as i32,
    };
    let (x, bottom) = anchor.map(|a| (a.x, a.bottom)).unwrap_or((default_x, default_bottom));
    let x = x.clamp(monitor.x, monitor.x + (monitor.width - width) as i32);
    let bottom = bottom.clamp(monitor.y + height as i32, monitor.y + monitor.height as i32);
    Rect { x, y: bottom - height as i32, width, height }
}

pub fn monitor_at(monitors: &[Rect], x: i32, y: i32) -> Option<usize> {
    let contains = |m: &Rect| x >= m.x && y >= m.y && x < m.x + m.width as i32 && y < m.y + m.height as i32;
    monitors.iter().position(contains).or_else(|| {
        monitors
            .iter()
            .enumerate()
            .min_by_key(|(_, m)| {
                let cx = x.clamp(m.x, m.x + m.width as i32);
                let cy = y.clamp(m.y, m.y + m.height as i32);
                (cx - x).unsigned_abs() as u64 + (cy - y).unsigned_abs() as u64
            })
            .map(|(i, _)| i)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const MON: Rect = Rect { x: 0, y: 0, width: 1920, height: 1080 };

    #[test]
    fn fits_the_characters() {
        let wa = Rect { x: 0, y: 0, width: 1920, height: 1040 };
        let r = overlay_rect_fit(MON, Some(wa), OverlayPlacement::Bottom, 52, 1.0, Some(180), OverlayAlign::Right);
        assert_eq!(r, Rect { x: 1740, y: 988, width: 180, height: 52 });
        let r = overlay_rect_fit(MON, Some(wa), OverlayPlacement::Bottom, 52, 1.0, Some(180), OverlayAlign::Left);
        assert_eq!(r.x, 0);
        let r = overlay_rect_fit(MON, Some(wa), OverlayPlacement::Bottom, 52, 1.0, Some(5000), OverlayAlign::Center);
        assert_eq!(r.width, 1920);
    }

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

    #[test]
    fn roams_from_the_default_corner() {
        let wa = Rect { x: 0, y: 0, width: 1920, height: 1040 };
        let r = roam_rect(MON, Some(wa), OverlayPlacement::Bottom, OverlayAlign::Right, 300, 110, None);
        assert_eq!(r, Rect { x: 1620, y: 930, width: 300, height: 110 });
        let r = roam_rect(MON, Some(wa), OverlayPlacement::Taskbar, OverlayAlign::Left, 300, 110, None);
        assert_eq!(r, Rect { x: 0, y: 970, width: 300, height: 110 });
    }

    #[test]
    fn roams_from_where_it_was_dropped_but_stays_on_the_monitor() {
        let m2 = Rect { x: 1920, y: 0, width: 2560, height: 1440 };
        let r = roam_rect(m2, None, OverlayPlacement::Bottom, OverlayAlign::Right, 300, 110, Some(Anchor { x: 2400, bottom: 700 }));
        assert_eq!(r, Rect { x: 2400, y: 590, width: 300, height: 110 });
        let r = roam_rect(m2, None, OverlayPlacement::Bottom, OverlayAlign::Right, 300, 110, Some(Anchor { x: 9000, bottom: 20 }));
        assert_eq!(r, Rect { x: 4180, y: 0, width: 300, height: 110 });
    }

    #[test]
    fn finds_the_monitor_under_a_point() {
        let monitors = [MON, Rect { x: 1920, y: 0, width: 2560, height: 1440 }];
        assert_eq!(monitor_at(&monitors, 100, 100), Some(0));
        assert_eq!(monitor_at(&monitors, 2000, 1200), Some(1));
        assert_eq!(monitor_at(&monitors, 1000, 1300), Some(0));
        assert_eq!(monitor_at(&[], 0, 0), None);
    }
}
