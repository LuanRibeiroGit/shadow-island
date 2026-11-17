import type { Agent } from "@ids/shared";
import { nextVisualChange, visualFor } from "@ids/game-engine";

const RESTING = new Set(["IDLE", "SUCCESS"]);

export function isWorking(a: Agent): boolean {
  return !a.endedAt && !RESTING.has(a.state);
}

export function isCelebrating(a: Agent, now: number): boolean {
  return visualFor(a, now).state === "SUCCESS";
}

export function desktopCrew(active: Agent[], recent: Agent[], now: number): Agent[] {
  const seen = new Set<string>();
  const crew: Agent[] = [];
  for (const a of [...active, ...recent].sort((x, y) => x.startedAt - y.startedAt)) {
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    if (isWorking(a) || isCelebrating(a, now)) crew.push(a);
  }
  return crew;
}

export function nextCrewChange(agents: Agent[], now: number): number | null {
  const times = agents.map((a) => nextVisualChange(a, now)).filter((t): t is number => t !== null);
  return times.length ? Math.min(...times) : null;
}
