import { describe, expect, it } from "vitest";
import type { Agent } from "@ids/shared";
import { pinnedLook, resolveCharacter } from "./classes";
import { crewKey, crewRoster, embodyCrew, newCrewId } from "./crew";

const agent = (id: string, over: Partial<Agent> = {}): Agent => ({
  id,
  sessionId: "s",
  parentId: null,
  agentId: null,
  agentType: null,
  specialty: "general",
  isMain: false,
  name: id,
  cwd: null,
  state: "CODING",
  activity: null,
  currentTool: null,
  detail: null,
  task: null,
  room: "forge",
  startedAt: 1,
  updatedAt: 1,
  endedAt: null,
  lastEvent: null,
  ...over,
});

describe("crew", () => {
  it("has one member per function by default, all resting", () => {
    const roster = crewRoster({});
    expect(roster.map((m) => m.role)).toEqual(["main", "architect", "developer", "researcher", "tester", "reviewer", "debugger", "documentation", "general"]);
    const { agents, realOf } = embodyCrew(roster, [], new Map(), 0);
    expect(agents).toHaveLength(9);
    expect(agents.every((a) => a.state === "IDLE" && a.sessionId === "")).toBe(true);
    expect(realOf.size).toBe(0);
  });

  it("a member of the same function takes a real agent's work and keeps it", () => {
    const roster = crewRoster({});
    const sticky = new Map<string, string>();
    const main = agent("s#main", { isMain: true });
    const tester = agent("s#t1", { specialty: "tester", state: "TESTING" });
    const a = embodyCrew(roster, [main, tester], sticky, 0);
    expect(a.realOf.get("crew:main")).toBe("s#main");
    expect(a.realOf.get("crew:tester")).toBe("s#t1");
    expect(a.agents.find((x) => x.id === "crew:tester")!.state).toBe("TESTING");
    // A second tester has no free member: it shows up as itself.
    const b = embodyCrew(roster, [main, tester, agent("s#t2", { specialty: "tester", startedAt: 2 })], sticky, 0);
    expect(b.agents.map((x) => x.id)).toContain("s#t2");
    expect(b.realOf.get("crew:tester")).toBe("s#t1");
    // When the first ends, the member is free again.
    const c = embodyCrew(roster, [main], sticky, 0);
    expect(c.agents.find((x) => x.id === "crew:tester")!.state).toBe("IDLE");
  });

  it("honours deleted, re-assigned and added members", () => {
    const custom = { [crewKey("crew:tester")]: { deleted: true }, [crewKey("crew:general")]: { role: "developer" as const } };
    const id = newCrewId(custom);
    const roster = crewRoster({ ...custom, [crewKey(id)]: { role: "tester" as const, name: "Nix" } });
    expect(roster.find((m) => m.id === "crew:tester")).toBeUndefined();
    expect(roster.filter((m) => m.role === "developer")).toHaveLength(2);
    expect(roster.find((m) => m.id === id)!.role).toBe("tester");
  });

  it("changing a member's function keeps the character it was", () => {
    const before = crewRoster({}).find((m) => m.id === "crew:tester")!;
    const resting = embodyCrew([before], [], new Map(), 0).agents[0]!;
    const custom = { [crewKey("crew:tester")]: { ...pinnedLook(resting, {}), role: "developer" as const } };
    const after = crewRoster(custom).find((m) => m.id === "crew:tester")!;
    expect(after.role).toBe("developer");
    expect(after.defaultName).toBe(before.defaultName);
    const shown = embodyCrew([after], [], new Map(), 0).agents[0]!;
    expect(resolveCharacter(shown, custom).cls.id).toBe("mist_alchemist");
  });
});
