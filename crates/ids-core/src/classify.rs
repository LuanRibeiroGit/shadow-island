//! Classification of real hook data into activity categories and agent specialties.
//! Rules are deliberately conservative: when nothing matches we return the generic
//! category instead of guessing a specific activity.

use crate::model::{ActivityCategory, AgentSpecialty};

/// Classify a tool call by its name and (for shell tools) its command line.
pub fn classify_tool(tool_name: &str, command: Option<&str>) -> ActivityCategory {
    if tool_name.starts_with("mcp__") {
        return ActivityCategory::Mcp;
    }
    match tool_name {
        "Read" | "NotebookRead" | "LS" => ActivityCategory::Reading,
        "Glob" | "Grep" | "ToolSearch" => ActivityCategory::Searching,
        "WebFetch" | "WebSearch" => ActivityCategory::WebResearch,
        "Edit" | "MultiEdit" | "Write" | "NotebookEdit" => ActivityCategory::Editing,
        "Agent" | "Task" => ActivityCategory::Delegating,
        "TodoWrite" | "TaskCreate" | "TaskUpdate" | "ExitPlanMode" | "EnterPlanMode" => ActivityCategory::Planning,
        "AskUserQuestion" => ActivityCategory::Asking,
        "Bash" | "PowerShell" => command.map(classify_command).unwrap_or(ActivityCategory::Shell),
        _ => ActivityCategory::Other,
    }
}

/// Classify a shell command line. Only the first meaningful command of each
/// `&&`/`;`/`|` segment is considered.
pub fn classify_command(command: &str) -> ActivityCategory {
    let mut best = ActivityCategory::Shell;
    for segment in command.split(['&', ';', '|', '\n']) {
        let cat = classify_segment(segment.trim());
        // Testing is the most specific signal, then building, then VCS.
        best = match (best, cat) {
            (_, ActivityCategory::Testing) => return ActivityCategory::Testing,
            (ActivityCategory::Building, _) => ActivityCategory::Building,
            (_, ActivityCategory::Building) => ActivityCategory::Building,
            (ActivityCategory::Shell, c) => c,
            (b, _) => b,
        };
    }
    best
}

fn classify_segment(seg: &str) -> ActivityCategory {
    let words: Vec<&str> = seg
        .split_whitespace()
        .filter(|w| !w.contains('=') || w.starts_with('-')) // drop VAR=value prefixes
        .collect();
    let Some(&first) = words.first() else { return ActivityCategory::Shell };
    let first = first.rsplit(['/', '\\']).next().unwrap_or(first);
    let second = words.get(1).copied().unwrap_or("");
    let third = words.get(2).copied().unwrap_or("");
    let rest = words.join(" ");

    const TEST_RUNNERS: &[&str] = &["pytest", "jest", "vitest", "mocha", "phpunit", "rspec", "playwright", "ctest", "tox", "nox"];
    if TEST_RUNNERS.contains(&first) {
        return ActivityCategory::Testing;
    }
    match first {
        "cargo" => match second {
            "test" | "nextest" => return ActivityCategory::Testing,
            "build" | "check" | "clippy" => return ActivityCategory::Building,
            _ => {}
        },
        "go" | "dotnet" | "mvn" | "gradle" | "./gradlew" | "gradlew" | "swift" | "zig" => match second {
            "test" => return ActivityCategory::Testing,
            "build" | "compile" | "package" | "vet" => return ActivityCategory::Building,
            _ => {}
        },
        "npm" | "pnpm" | "yarn" | "bun" | "npx" | "deno" => {
            let script = if second == "run" { third } else { second };
            if script == "test" || script.starts_with("test:") || ["vitest", "jest", "playwright", "mocha"].contains(&script) {
                return ActivityCategory::Testing;
            }
            if script == "build" || script.starts_with("build:") || script == "typecheck" || script == "tsc" {
                return ActivityCategory::Building;
            }
            if script == "vite" && rest.contains("build") {
                return ActivityCategory::Building;
            }
        }
        "python" | "python3" if second == "-m" && (third == "pytest" || third == "unittest") => return ActivityCategory::Testing,
        "make" | "cmake" | "ninja" | "tsc" | "webpack" | "esbuild" | "rollup" => return ActivityCategory::Building,
        "git" | "gh" => return ActivityCategory::VersionControl,
        "cat" | "head" | "tail" | "less" | "more" => return ActivityCategory::Reading,
        "ls" | "find" | "grep" | "rg" | "fd" | "tree" => return ActivityCategory::Searching,
        "curl" | "wget" => return ActivityCategory::WebResearch,
        _ => {}
    }
    ActivityCategory::Shell
}

/// Map a subagent type name (from `SubagentStart.agent_type`) to a specialty. Uses
/// the documented built-in names first, then keywords in custom agent names.
/// User overrides (settings) are applied by the caller before this fallback.
pub fn specialty_for_agent_type(agent_type: &str) -> AgentSpecialty {
    let t = agent_type.to_ascii_lowercase();
    let t = t.rsplit(':').next().unwrap_or(&t); // plugin-scoped "plugin:name"
    match t {
        "explore" => return AgentSpecialty::Researcher,
        "plan" => return AgentSpecialty::Architect,
        "general-purpose" | "" => return AgentSpecialty::General,
        _ => {}
    }
    let has = |k: &[&str]| k.iter().any(|w| t.contains(w));
    if has(&["test", "qa", "verif"]) {
        AgentSpecialty::Tester
    } else if has(&["review", "audit", "lint"]) {
        AgentSpecialty::Reviewer
    } else if has(&["debug", "bug", "fix", "triage"]) {
        AgentSpecialty::Debugger
    } else if has(&["doc", "writer", "readme"]) {
        AgentSpecialty::Documentation
    } else if has(&["architect", "plan", "design"]) {
        AgentSpecialty::Architect
    } else if has(&["research", "explor", "search", "investig"]) {
        AgentSpecialty::Researcher
    } else if has(&["dev", "implement", "code", "engineer", "build", "refactor"]) {
        AgentSpecialty::Developer
    } else {
        AgentSpecialty::General
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ActivityCategory::*;

    #[test]
    fn tools() {
        assert_eq!(classify_tool("Read", None), Reading);
        assert_eq!(classify_tool("Grep", None), Searching);
        assert_eq!(classify_tool("Edit", None), Editing);
        assert_eq!(classify_tool("WebFetch", None), WebResearch);
        assert_eq!(classify_tool("Agent", None), Delegating);
        assert_eq!(classify_tool("mcp__github__get_me", None), Mcp);
        assert_eq!(classify_tool("SomethingNew", None), Other);
    }

    #[test]
    fn commands() {
        assert_eq!(classify_command("npm test"), Testing);
        assert_eq!(classify_command("pnpm run test:unit"), Testing);
        assert_eq!(classify_command("cd app && cargo test --workspace"), Testing);
        assert_eq!(classify_command("CI=1 npx vitest run"), Testing);
        assert_eq!(classify_command("python -m pytest -q"), Testing);
        assert_eq!(classify_command("cargo build --release"), Building);
        assert_eq!(classify_command("npm run build"), Building);
        assert_eq!(classify_command("git status"), VersionControl);
        assert_eq!(classify_command("ls -la"), Searching);
        assert_eq!(classify_command("echo hi"), Shell);
        assert_eq!(classify_command("/usr/bin/make all"), Building);
    }

    #[test]
    fn specialties() {
        assert_eq!(specialty_for_agent_type("Explore"), AgentSpecialty::Researcher);
        assert_eq!(specialty_for_agent_type("Plan"), AgentSpecialty::Architect);
        assert_eq!(specialty_for_agent_type("general-purpose"), AgentSpecialty::General);
        assert_eq!(specialty_for_agent_type("my-plugin:code-reviewer"), AgentSpecialty::Reviewer);
        assert_eq!(specialty_for_agent_type("test-runner"), AgentSpecialty::Tester);
        assert_eq!(specialty_for_agent_type("frobnicator"), AgentSpecialty::General);
    }
}
