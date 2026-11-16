//! Domain types shared by the whole core. These are serialized to the frontend with
//! `camelCase` keys and mirrored in `packages/shared/src/types.ts`.

use serde::{Deserialize, Serialize};

/// Visual state of a character. Mirrors the states listed in the product spec.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AgentState {
    Idle,
    Running,
    Exploring,
    Coding,
    Reading,
    Building,
    Testing,
    Combat,
    Waiting,
    Success,
    Error,
}

impl AgentState {
    pub fn as_str(self) -> &'static str {
        match self {
            AgentState::Idle => "IDLE",
            AgentState::Running => "RUNNING",
            AgentState::Exploring => "EXPLORING",
            AgentState::Coding => "CODING",
            AgentState::Reading => "READING",
            AgentState::Building => "BUILDING",
            AgentState::Testing => "TESTING",
            AgentState::Combat => "COMBAT",
            AgentState::Waiting => "WAITING",
            AgentState::Success => "SUCCESS",
            AgentState::Error => "ERROR",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        Some(match s {
            "IDLE" => AgentState::Idle,
            "RUNNING" => AgentState::Running,
            "EXPLORING" => AgentState::Exploring,
            "CODING" => AgentState::Coding,
            "READING" => AgentState::Reading,
            "BUILDING" => AgentState::Building,
            "TESTING" => AgentState::Testing,
            "COMBAT" => AgentState::Combat,
            "WAITING" => AgentState::Waiting,
            "SUCCESS" => AgentState::Success,
            "ERROR" => AgentState::Error,
            _ => return None,
        })
    }
}

/// Specialty of an agent. Only assigned from real metadata (subagent type name),
/// otherwise `General`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AgentSpecialty {
    Architect,
    Developer,
    Researcher,
    Tester,
    Reviewer,
    Debugger,
    Documentation,
    General,
}

impl AgentSpecialty {
    pub fn as_str(self) -> &'static str {
        match self {
            AgentSpecialty::Architect => "architect",
            AgentSpecialty::Developer => "developer",
            AgentSpecialty::Researcher => "researcher",
            AgentSpecialty::Tester => "tester",
            AgentSpecialty::Reviewer => "reviewer",
            AgentSpecialty::Debugger => "debugger",
            AgentSpecialty::Documentation => "documentation",
            AgentSpecialty::General => "general",
        }
    }

    pub fn parse(s: &str) -> Self {
        match s {
            "architect" => AgentSpecialty::Architect,
            "developer" => AgentSpecialty::Developer,
            "researcher" => AgentSpecialty::Researcher,
            "tester" => AgentSpecialty::Tester,
            "reviewer" => AgentSpecialty::Reviewer,
            "debugger" => AgentSpecialty::Debugger,
            "documentation" => AgentSpecialty::Documentation,
            _ => AgentSpecialty::General,
        }
    }
}

/// What kind of work an event represents. This is the bridge between real hook
/// data and the visual state machine.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ActivityCategory {
    Reading,
    Searching,
    WebResearch,
    Editing,
    Building,
    Testing,
    VersionControl,
    Shell,
    Delegating,
    Planning,
    Asking,
    Mcp,
    Other,
}

impl ActivityCategory {
    pub fn as_str(self) -> &'static str {
        match self {
            ActivityCategory::Reading => "reading",
            ActivityCategory::Searching => "searching",
            ActivityCategory::WebResearch => "web_research",
            ActivityCategory::Editing => "editing",
            ActivityCategory::Building => "building",
            ActivityCategory::Testing => "testing",
            ActivityCategory::VersionControl => "version_control",
            ActivityCategory::Shell => "shell",
            ActivityCategory::Delegating => "delegating",
            ActivityCategory::Planning => "planning",
            ActivityCategory::Asking => "asking",
            ActivityCategory::Mcp => "mcp",
            ActivityCategory::Other => "other",
        }
    }

    /// Visual state while this activity is in progress.
    pub fn working_state(self) -> AgentState {
        match self {
            ActivityCategory::Reading => AgentState::Reading,
            ActivityCategory::Searching | ActivityCategory::WebResearch => AgentState::Exploring,
            ActivityCategory::Editing => AgentState::Coding,
            ActivityCategory::Building => AgentState::Building,
            ActivityCategory::Testing => AgentState::Testing,
            ActivityCategory::Asking => AgentState::Waiting,
            // Generic "busy" state when we do not know more.
            _ => AgentState::Running,
        }
    }
}

/// Castle room an agent is shown in.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Room {
    Throne,
    Library,
    Forge,
    Laboratory,
    Watchtower,
    Treasury,
    Barracks,
}

impl Room {
    pub fn as_str(self) -> &'static str {
        match self {
            Room::Throne => "throne",
            Room::Library => "library",
            Room::Forge => "forge",
            Room::Laboratory => "laboratory",
            Room::Watchtower => "watchtower",
            Room::Treasury => "treasury",
            Room::Barracks => "barracks",
        }
    }

    /// Room for a subagent given its current state. The main agent always sits in the
    /// throne room (see `agents.rs`).
    pub fn for_state(state: AgentState) -> Room {
        match state {
            AgentState::Reading | AgentState::Exploring => Room::Library,
            AgentState::Coding | AgentState::Building => Room::Forge,
            AgentState::Testing | AgentState::Combat => Room::Laboratory,
            AgentState::Running => Room::Forge,
            _ => Room::Barracks,
        }
    }
}

/// Provenance of a number shown in the UI. The spec requires telling these apart.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DataQuality {
    /// Reported by Claude Code (hook payload or transcript usage block).
    Real,
    /// Computed locally from real data (durations, counts).
    Calculated,
    /// Estimated with user-configured reference prices.
    Estimated,
    /// Not available.
    Unavailable,
}
