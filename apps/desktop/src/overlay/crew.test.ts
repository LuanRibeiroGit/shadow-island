import { describe, expect, it } from "vitest";
import type { Agent } from "@ids/shared";
import { SUCCESS_HOLD_MS } from "@ids/game-engine";
import { desktopCrew, nextCrewChange } from "./crew";

const agent = (over: Partial<Agent>): Agent => ({
  id: "a",
  sessionId: "s",
  parentId: null,
  agentId: null,
  agentType: null,
  specialty: "general",
  isMain: true,
  name: "a",
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

describe("crew on the desktop", () => {
  it("shows who is working and leaves out who is resting", () => {
    const working = agent({ id: "w", state: "CODING" });
    const idle = agent({ id: "i", state: "IDLE" });
    expect(desktopCrew([working, idle], [], 10_000).map((a) => a.id)).toEqual(["w"]);
  });

  it("keeps a soul that just finished on screen while it celebrates", () => {
    const done = agent({ id: "main", state: "SUCCESS", updatedAt: 10_000 });
    const finishedSub = agent({ id: "sub", state: "SUCCESS", startedAt: 2, updatedAt: 10_000, endedAt: 10_000 });
    const now = 10_000 + SUCCESS_HOLD_MS - 1;
    expect(desktopCrew([done], [finishedSub], now).map((a) => a.id)).toEqual(["main", "sub"]);
  });

  it("lets it go once the celebration is over", () => {
    const done = agent({ id: "main", state: "SUCCESS", updatedAt: 10_000 });
    expect(desktopCrew([done], [], 10_000 + SUCCESS_HOLD_MS + 1)).toEqual([]);
  });

  it("does not show the same soul twice", () => {
    const a = agent({ id: "x", state: "SUCCESS", updatedAt: 10_000 });
    expect(desktopCrew([a], [a], 10_500)).toHaveLength(1);
  });

  it("knows when the next celebration ends", () => {
    const done = agent({ id: "main", state: "SUCCESS", updatedAt: 10_000 });
    expect(nextCrewChange([done, agent({ id: "w" })], 10_500)).toBe(10_000 + SUCCESS_HOLD_MS + 1);
    expect(nextCrewChange([agent({ id: "w" })], 10_500)).toBeNull();
  });
});
