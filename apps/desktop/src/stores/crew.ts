import { useMemo } from "react";
import type { Agent } from "@ids/shared";
import { activeAgents } from "@ids/event-system";
import { crewKey, crewRoster, embodyCrew, pinnedLook, type CharacterCustomization, type CrewMember, type CrewRole } from "@ids/game-engine";
import { backend } from "../bridge/backend";
import { useCharacters } from "./characters";
import { useWorld } from "./world";

/** Real agent id -> crew member id. Shared so every view pairs them the same way. */
const sticky = new Map<string, string>();
/**
 * Real agent id -> the member that must keep it while both change function (the two
 * changes arrive separately, and in between their functions would not match).
 */
const wanted = new Map<string, string>();

export interface Crew {
  roster: CrewMember[];
  /** What the castle draws: every crew member (working or resting) plus unpaired real agents. */
  agents: Agent[];
  /** Displayed crew id -> the real agent it is working for. */
  realOf: Map<string, string>;
  /**
   * Customizations with each paired real agent wearing its crew member's name and
   * looks, so views that list real agents show the same character as the castle.
   */
  custom: Record<string, CharacterCustomization>;
}

export function useCrew(): Crew {
  const world = useWorld((s) => s.world);
  const custom = useCharacters((s) => s.custom);
  return useMemo(() => {
    const roster = crewRoster(custom);
    const real = activeAgents(world);
    for (const id of [...wanted.keys()]) if (!real.some((a) => a.id === id)) wanted.delete(id);
    const active = real.map((a) => {
      const m = roster.find((r) => r.id === wanted.get(a.id));
      if (!m || m.role === "main" || a.isMain) {
        wanted.delete(a.id);
        return a;
      }
      for (const [other, member] of sticky) if (member === m.id && other !== a.id) sticky.delete(other);
      sticky.set(a.id, m.id);
      if (a.specialty === m.role) {
        wanted.delete(a.id);
        return a;
      }
      // Its new function is on the way: show it already, so the pair never splits.
      return { ...a, specialty: m.role };
    });
    const { agents, realOf } = embodyCrew(roster, active, sticky, Date.now());
    const faced = { ...custom };
    for (const [memberId, realId] of realOf) {
      const m = roster.find((r) => r.id === memberId)!;
      const look = custom[crewKey(memberId)] ?? {};
      const own = custom[`agent:${realId}`] ?? {};
      faced[`agent:${realId}`] = { ...look, name: look.name?.trim() || m.defaultName, ...own, palette: { ...look.palette, ...own.palette } };
    }
    return { roster, agents, realOf, custom: faced };
  }, [world, custom]);
}

/**
 * Give a crew member another function. The character stays who it is (class, name,
 * colours); only its function changes. If it is doing a real agent's job, that
 * agent changes function with it, so the member keeps the job.
 */
export async function setCrewRole(crew: Crew, memberId: string, role: CrewRole): Promise<void> {
  const { custom, save } = useCharacters.getState();
  const key = crewKey(memberId);
  const shown = crew.agents.find((a) => a.id === memberId);
  const look = shown ? pinnedLook(shown, custom) : (custom[key] ?? {});
  const realId = crew.realOf.get(memberId);
  // A session's main agent cannot stop being the main one, nor can a subagent become it.
  const follows = realId !== undefined && role !== "main" && shown !== undefined && !shown.isMain;
  if (follows) wanted.set(realId, memberId);
  await save(key, { ...look, role });
  if (!follows) return;
  try {
    await (await backend()).setAgentSpecialty(realId, role);
  } catch (e) {
    wanted.delete(realId);
    throw e;
  }
}
