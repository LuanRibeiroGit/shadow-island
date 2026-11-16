import { describe, expect, it } from "vitest";
import type { Agent, Update } from "@ids/shared";
import { activeAgents, agentsByRoom, applyUpdates, currentQuest, emptyWorld, MAX_EVENTS } from "./index";

const agent = (over: Partial<Agent> = {}): Agent => ({
  id: "s#main",
  sessionId: "s",
  parentId: null,
  agentId: null,
  agentType: null,
  specialty: "general",
  isMain: true,
  name: "Guardiã",
  cwd: "/p",
  state: "IDLE",
  activity: null,
  currentTool: null,
  detail: null,
  task: null,
  room: "throne",
  startedAt: 1,
  updatedAt: 1,
  endedAt: null,
  lastEvent: null,
  ...over,
});

describe("world reducer", () => {
  it("adds, updates and finishes agents without duplicates", () => {
    let w = emptyWorld();
    w = applyUpdates(w, [{ type: "agent", agent: agent() }]);
    w = applyUpdates(w, [{ type: "agent", agent: agent({ state: "CODING", updatedAt: 2 }) }]);
    expect(activeAgents(w)).toHaveLength(1);
    expect(activeAgents(w)[0]!.state).toBe("CODING");
    w = applyUpdates(w, [{ type: "agent", agent: agent({ state: "SUCCESS", updatedAt: 3, endedAt: 3 }) }]);
    expect(activeAgents(w)).toHaveLength(0);
    expect(w.recentAgents[0]!.state).toBe("SUCCESS");
  });

  it("ignores stale agent updates", () => {
    let w = applyUpdates(emptyWorld(), [{ type: "agent", agent: agent({ state: "TESTING", updatedAt: 10 }) }]);
    w = applyUpdates(w, [{ type: "agent", agent: agent({ state: "READING", updatedAt: 5 }) }]);
    expect(w.agents["s#main"]!.state).toBe("TESTING");
  });

  it("groups by room and finds the current quest", () => {
    const ups: Update[] = [
      { type: "agent", agent: agent() },
      { type: "agent", agent: agent({ id: "s#a", isMain: false, room: "library", parentId: "s#main" }) },
      { type: "mission", mission: { id: 1, sessionId: "s", agentId: "s#main", projectId: 1, kind: "prompt", externalId: "e", title: "Quest", description: null, status: "in_progress", startedAt: 1, completedAt: null } },
    ];
    const w = applyUpdates(emptyWorld(), ups);
    expect(agentsByRoom(w).library).toHaveLength(1);
    expect(currentQuest(w, "s")?.title).toBe("Quest");
  });

  it("bounds the event list and keeps newest first", () => {
    const ups: Update[] = Array.from({ length: MAX_EVENTS + 20 }, (_, i) => ({
      type: "event" as const,
      event: { id: i, sessionId: "s", agentId: null, missionId: null, eventName: "PreToolUse", toolName: "Read", category: "reading" as const, detail: null, isFailure: false, firedAt: i },
    }));
    const w = applyUpdates(emptyWorld(), ups);
    expect(w.events).toHaveLength(MAX_EVENTS);
    expect(w.events[0]!.id).toBe(MAX_EVENTS + 19);
  });

  it("removes resolved encounters", () => {
    const enc = { id: 1, agentId: "s#main", sessionId: "s", monster: "bug_monster" as const, signature: "x", status: "active" as const, openedAt: 1, closedAt: null };
    let w = applyUpdates(emptyWorld(), [{ type: "encounter", encounter: enc }]);
    expect(Object.keys(w.encounters)).toHaveLength(1);
    w = applyUpdates(w, [{ type: "encounter", encounter: { ...enc, status: "defeated", closedAt: 2 } }]);
    expect(Object.keys(w.encounters)).toHaveLength(0);
  });
});
