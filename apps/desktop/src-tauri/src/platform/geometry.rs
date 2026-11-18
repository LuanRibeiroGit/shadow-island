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

#[allow(clippy::too_many_arguments)]
pub fn roam_spawn(monitor: Rect, work_area: Option<Rect>, placement: OverlayPlacement, width: u32, height: u32, bottom: Option<i32>, taken: &[Rect]) -> Rect {
    let wa = work_area.filter(|w| w.width > 0 && w.height > 0).unwrap_or(monitor);
    let width = width.clamp(1, wa.width.max(1));
    let height = height.min(monitor.height).max(32.min(monitor.height));
    let h = height as i32;
    let (top, floor) = match placement {
        OverlayPlacement::Taskbar => (monitor.y, monitor.y + monitor.height as i32),
        OverlayPlacement::Bottom | OverlayPlacement::Top => (wa.y, wa.y + wa.height as i32),
    };
    let ceiling = (top + h).min(floor);
    let default_bottom = match placement {
        OverlayPlacement::Top => ceiling,
        OverlayPlacement::Bottom | OverlayPlacement::Taskbar => floor,
    };
    let first = bottom.unwrap_or(default_bottom).clamp(ceiling, floor);
    let step = if placement == OverlayPlacement::Top { h } else { -h };
    let (min_x, max_x) = (wa.x, wa.x + (wa.width - width) as i32);
    let lane = |bottom: i32| taken.iter().filter(|r| r.y < bottom && bottom - h < r.y + r.height as i32).map(|r| r.x).collect::<Vec<_>>();
    let mut bottom = first;
    while (ceiling..=floor).contains(&bottom) {
        if let Some(x) = free_x(min_x, max_x, &lane(bottom), 2 * width as i32) {
            return Rect { x, y: bottom - h, width, height };
        }
        bottom += step;
    }
    let x = free_x(min_x, max_x, &lane(first), width as i32).unwrap_or(min_x);
    Rect { x, y: first - h, width, height }
}

pub fn free_x(min: i32, max: i32, taken: &[i32], spacing: i32) -> Option<i32> {
    if taken.is_empty() {
        return (min <= max).then_some(min + (max - min) / 2);
    }
    let mut sorted = taken.to_vec();
    sorted.sort_unstable();
    let room = |x: i32| sorted.iter().map(|t| (x - t).abs()).min().unwrap_or(i32::MAX);
    let between = sorted.windows(2).map(|p| p[0] + (p[1] - p[0]) / 2).filter(|x| (min..=max).contains(x));
    std::iter::once(min)
        .chain(between)
        .chain(std::iter::once(max))
        .filter(|&x| room(x) >= spacing)
        .fold(None, |best: Option<i32>, x| match best {
            Some(b) if room(b) >= room(x) => Some(b),
            _ => Some(x),
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
    fn the_first_roamer_is_born_in_the_middle_of_the_bottom_lane() {
        let wa = Rect { x: 0, y: 0, width: 1920, height: 1040 };
        let r = roam_spawn(MON, Some(wa), OverlayPlacement::Bottom, 160, 70, None, &[]);
        assert_eq!(r, Rect { x: 880, y: 970, width: 160, height: 70 });
        let r = roam_spawn(MON, Some(wa), OverlayPlacement::Taskbar, 160, 70, None, &[]);
        assert_eq!(r.y, 1010);
        let top = Rect { x: 64, y: 32, width: 1856, height: 1048 };
        let r = roam_spawn(MON, Some(top), OverlayPlacement::Top, 160, 70, None, &[]);
        assert_eq!(r, Rect { x: 912, y: 32, width: 160, height: 70 });
    }

    #[test]
    fn newcomers_are_born_a_window_away_from_everyone() {
        let wa = Rect { x: 0, y: 0, width: 1920, height: 1040 };
        let mut taken: Vec<Rect> = vec![];
        for _ in 0..5 {
            let r = roam_spawn(MON, Some(wa), OverlayPlacement::Bottom, 160, 70, None, &taken);
            assert_eq!(r.y, 970);
            for t in &taken {
                assert!((r.x - t.x).abs() >= 320, "{r:?} too close to {t:?}");
            }
            taken.push(r);
        }
        assert_eq!(taken.iter().map(|r| r.x).collect::<Vec<_>>(), vec![880, 0, 1760, 440, 1320]);
    }

    #[test]
    fn a_full_lane_sends_the_newcomer_one_lane_further() {
        let wa = Rect { x: 0, y: 0, width: 400, height: 1040 };
        let first = roam_spawn(MON, Some(wa), OverlayPlacement::Bottom, 160, 70, None, &[]);
        let second = roam_spawn(MON, Some(wa), OverlayPlacement::Bottom, 160, 70, None, &[first]);
        assert_eq!(second.y, first.y - 70);
        let top = Rect { x: 0, y: 32, width: 400, height: 1048 };
        let first = roam_spawn(MON, Some(top), OverlayPlacement::Top, 160, 70, None, &[]);
        let second = roam_spawn(MON, Some(top), OverlayPlacement::Top, 160, 70, None, &[first]);
        assert_eq!(second.y, first.y + 70);
    }

    #[test]
    fn honors_the_dropped_height_but_never_goes_over_the_taskbar() {
        let m2 = Rect { x: 1920, y: 0, width: 2560, height: 1440 };
        let wa2 = Rect { x: 1920, y: 0, width: 2560, height: 1400 };
        let r = roam_spawn(m2, Some(wa2), OverlayPlacement::Bottom, 160, 110, Some(700), &[]);
        assert_eq!(r, Rect { x: 3120, y: 590, width: 160, height: 110 });
        assert_eq!(roam_spawn(m2, Some(wa2), OverlayPlacement::Bottom, 160, 110, Some(1440), &[]).y, 1290);
        assert_eq!(roam_spawn(m2, Some(wa2), OverlayPlacement::Bottom, 160, 110, Some(20), &[]).y, 0);
    }

    #[test]
    fn finds_the_widest_free_room_or_none() {
        assert_eq!(free_x(0, 1000, &[], 100), Some(500));
        assert_eq!(free_x(0, 1000, &[300], 100), Some(1000));
        assert_eq!(free_x(0, 1000, &[100, 900], 100), Some(500));
        assert_eq!(free_x(0, 200, &[100], 100), Some(0));
        assert_eq!(free_x(0, 200, &[100], 150), None);
    }
}
