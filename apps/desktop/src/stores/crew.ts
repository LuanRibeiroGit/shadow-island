import { useMemo } from "react";
import type { Agent } from "@ids/shared";
import { activeAgents } from "@ids/event-system";
import { crewKey, crewRoster, embodyCrew, type CharacterCustomization, type CrewMember } from "@ids/game-engine";
import { useCharacters } from "./characters";
import { useWorld } from "./world";

/** Real agent id -> crew member id. Shared so every view pairs them the same way. */
const sticky = new Map<string, string>();

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
    const { agents, realOf } = embodyCrew(roster, activeAgents(world), sticky, Date.now());
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
