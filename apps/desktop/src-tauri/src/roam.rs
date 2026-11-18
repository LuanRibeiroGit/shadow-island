use crate::platform::Rect;

pub const ROAMER_PREFIX: &str = "roamer-";

pub fn is_roamer(label: &str) -> bool {
    label.starts_with(ROAMER_PREFIX)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Roamer {
    pub agent: String,
    pub label: String,
    pub rect: Option<Rect>,
}

#[derive(Debug, Default, PartialEq, Eq)]
pub struct RoamPlan {
    pub removed: Vec<String>,
    pub added: Vec<Roamer>,
}

#[derive(Debug, Default)]
pub struct Roamers {
    next: u64,
    list: Vec<Roamer>,
    size: Option<(u32, u32)>,
    pub shown: bool,
    last_fight: Option<u64>,
}

impl Roamers {
    pub fn plan(&mut self, agents: &[String]) -> RoamPlan {
        let mut removed = Vec::new();
        self.list.retain(|r| {
            let keep = agents.contains(&r.agent);
            if !keep {
                removed.push(r.label.clone());
            }
            keep
        });
        let mut added = Vec::new();
        for agent in agents {
            if self.list.iter().any(|r| &r.agent == agent) {
                continue;
            }
            self.next += 1;
            let roamer = Roamer { agent: agent.clone(), label: format!("{ROAMER_PREFIX}{}", self.next), rect: None };
            self.list.push(roamer.clone());
            added.push(roamer);
        }
        RoamPlan { removed, added }
    }

    pub fn contains(&self, label: &str) -> bool {
        self.list.iter().any(|r| r.label == label)
    }

    pub fn forget(&mut self, label: &str) {
        self.list.retain(|r| r.label != label);
    }

    pub fn size(&self) -> Option<(u32, u32)> {
        self.size
    }

    pub fn rect(&self, label: &str) -> Option<Rect> {
        self.list.iter().find(|r| r.label == label).and_then(|r| r.rect)
    }

    pub fn placed(&self) -> Vec<(String, Rect)> {
        self.list.iter().filter_map(|r| r.rect.map(|rect| (r.label.clone(), rect))).collect()
    }

    pub fn set_rect(&mut self, label: &str, rect: Rect) {
        if let Some(r) = self.list.iter_mut().find(|r| r.label == label) {
            r.rect = Some(rect);
        }
    }

    pub fn peers(&self, label: &str) -> Vec<Rect> {
        self.list.iter().filter(|r| r.label != label).filter_map(|r| r.rect).collect()
    }

    pub fn resize(&mut self, width: u32, height: u32) -> Vec<(String, Rect)> {
        if self.size == Some((width, height)) {
            return Vec::new();
        }
        self.size = Some((width, height));
        let mut changed = Vec::new();
        for r in &mut self.list {
            let Some(old) = r.rect else { continue };
            let rect = Rect { x: old.x, y: old.y + old.height as i32 - height as i32, width, height };
            r.rect = Some(rect);
            changed.push((r.label.clone(), rect));
        }
        changed
    }

    pub fn relayout(&mut self, mut place: impl FnMut(&[Rect]) -> Rect) -> Vec<(String, Rect)> {
        let mut taken = Vec::new();
        let mut placed = Vec::new();
        for r in &mut self.list {
            let rect = place(&taken);
            taken.push(rect);
            r.rect = Some(rect);
            placed.push((r.label.clone(), rect));
        }
        placed
    }

    pub fn claim_fight(&mut self, now_ms: u64, stagger_ms: u64) -> bool {
        if self.last_fight.is_some_and(|last| now_ms.saturating_sub(last) < stagger_ms) {
            return false;
        }
        self.last_fight = Some(now_ms);
        true
    }
}

pub fn lane_window(lane: Rect, actual_height: u32) -> Rect {
    let height = actual_height.max(lane.height);
    Rect { x: lane.x, y: lane.y + lane.height as i32 - height as i32, width: lane.width, height }
}

pub fn lane_after_move(lane: Rect, x: i32, y: i32, actual_height: u32) -> Rect {
    let height = actual_height.max(lane.height);
    Rect { x, y: y + height as i32 - lane.height as i32, ..lane }
}

pub fn agent_query(agent: &str) -> String {
    agent
        .bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => (b as char).to_string(),
            _ => format!("%{b:02X}"),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ids(v: &[&str]) -> Vec<String> {
        v.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn opens_a_window_for_each_newcomer_and_closes_the_ones_that_left() {
        let mut r = Roamers::default();
        let plan = r.plan(&ids(&["a", "b", "a"]));
        assert_eq!(plan.added.iter().map(|x| (x.agent.as_str(), x.label.as_str())).collect::<Vec<_>>(), vec![("a", "roamer-1"), ("b", "roamer-2")]);
        assert!(plan.removed.is_empty());
        let plan = r.plan(&ids(&["b", "c"]));
        assert_eq!(plan.removed, vec!["roamer-1".to_string()]);
        assert_eq!(plan.added[0].label, "roamer-3");
        assert!(!r.contains("roamer-1") && r.contains("roamer-2") && r.contains("roamer-3"));
        assert!(is_roamer("roamer-3") && !is_roamer("overlay"));
    }

    #[test]
    fn each_window_sees_where_the_others_are() {
        let mut r = Roamers::default();
        r.plan(&ids(&["a", "b", "c"]));
        r.set_rect("roamer-1", Rect { x: 0, y: 970, width: 160, height: 70 });
        r.set_rect("roamer-2", Rect { x: 400, y: 970, width: 160, height: 70 });
        assert_eq!(r.peers("roamer-1"), vec![Rect { x: 400, y: 970, width: 160, height: 70 }]);
        assert_eq!(r.peers("roamer-3").len(), 2);
        assert_eq!(r.rect("roamer-3"), None);
    }

    #[test]
    fn resizing_keeps_every_window_on_its_ground() {
        let mut r = Roamers::default();
        r.plan(&ids(&["a"]));
        r.set_rect("roamer-1", Rect { x: 100, y: 970, width: 160, height: 70 });
        assert_eq!(r.resize(240, 102), vec![("roamer-1".to_string(), Rect { x: 100, y: 938, width: 240, height: 102 })]);
        assert!(r.resize(240, 102).is_empty());
    }

    #[test]
    fn a_fight_waits_for_the_last_one_to_be_far_enough_behind() {
        let mut r = Roamers::default();
        assert!(r.claim_fight(10_000, 1500));
        assert!(!r.claim_fight(11_499, 1500));
        assert!(r.claim_fight(11_500, 1500));
        assert!(!r.claim_fight(11_000, 1500));
    }

    #[test]
    fn a_taller_window_keeps_its_feet_on_the_lane() {
        let lane = Rect { x: 100, y: 970, width: 160, height: 70 };
        assert_eq!(lane_window(lane, 70), lane);
        assert_eq!(lane_window(lane, 200), Rect { x: 100, y: 840, width: 160, height: 200 });
        assert_eq!(lane_after_move(lane, 300, 840, 200), Rect { x: 300, y: 970, width: 160, height: 70 });
        assert_eq!(lane_after_move(lane, 300, 500, 70), Rect { x: 300, y: 500, width: 160, height: 70 });
    }

    #[test]
    fn agent_ids_travel_safely_in_the_url() {
        assert_eq!(agent_query("main:abc-1"), "main%3Aabc-1");
        assert_eq!(agent_query("a b/ç"), "a%20b%2F%C3%A7");
    }
}
