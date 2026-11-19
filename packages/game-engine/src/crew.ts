import { SPECIALTIES, type Agent, type Specialty } from "@ids/shared";
import { BATHROOM_REGULAR, CLASSES, SPECIALTY_LABEL, type CharacterCustomization } from "./classes";

/**
 * The castle's standing crew. Crew members live in the castle whether or not
 * Claude Code is running: they sleep, wander and chat. When a real agent with
 * the same function shows up, a free crew member takes the job and shows that
 * agent's real state. A crew member never invents activity of its own.
 *
 * A member is stored as the customization `agent:crew:<id>` (name, class, colours)
 * plus its `role`; the nine default members exist until deleted.
 */
export type CrewRole = Specialty | "main";

export interface CrewMember {
  /** Actor id, e.g. `crew:tester`. Its customization key is `agent:${id}`. */
  id: string;
  role: CrewRole;
  /** Name shown when the user has not named this member. */
  defaultName: string;
}

export const CREW_ROLES: readonly CrewRole[] = ["main", ...SPECIALTIES];

export const CREW_ROLE_LABEL: Record<CrewRole, string> = { main: "Agente principal", ...SPECIALTY_LABEL };

const DEFAULT_CLASS: Record<CrewRole, string> = {
  main: "lantern_keeper",
  architect: "tide_architect",
  developer: "spectral_smith",
  researcher: "wraith_scholar",
  tester: "mist_alchemist",
  reviewer: "bone_sentinel",
  debugger: "shade_lancer",
  documentation: "ink_scribe",
  general: "wisp",
};

export const crewKey = (id: string) => `agent:${id}`;
export const isCrewId = (id: string) => id.startsWith("crew:");

/** The King is a character of the castle, not an agent; only his name is the user's to change. */
export const KING_KEY = "npc:king";
export const KING_DEFAULT_NAME = "O Rei";
export const kingName = (custom: Record<string, CharacterCustomization>) => custom[KING_KEY]?.name?.trim() || KING_DEFAULT_NAME;

/** Default members that have a name of their own instead of their class's. */
const OWN_NAME: Record<string, string> = { [BATHROOM_REGULAR]: "Robson" };

function defaultName(role: CrewRole, custom: CharacterCustomization | undefined, id?: string): string {
  if (id && OWN_NAME[id]) return OWN_NAME[id];
  const cls = CLASSES[custom?.classId ?? ""] ?? CLASSES[DEFAULT_CLASS[role]];
  return cls?.label ?? CREW_ROLE_LABEL[role];
}

/** The crew as the user left it: default members not deleted, plus the ones added. */
export function crewRoster(custom: Record<string, CharacterCustomization>): CrewMember[] {
  const out: CrewMember[] = [];
  for (const role of CREW_ROLES) {
    const id = `crew:${role}`;
    const c = custom[crewKey(id)];
    if (c?.deleted) continue;
    const r = c?.role ?? role;
    out.push({ id, role: r, defaultName: defaultName(r, c, id) });
  }
  const defaults = new Set(CREW_ROLES.map((r) => crewKey(`crew:${r}`)));
  for (const key of Object.keys(custom).sort()) {
    if (!key.startsWith("agent:crew:") || defaults.has(key)) continue;
    const c = custom[key]!;
    if (c.deleted || !c.role) continue;
    out.push({ id: key.slice("agent:".length), role: c.role, defaultName: defaultName(c.role, c) });
  }
  return out;
}

/** An id for a member the user adds. */
export function newCrewId(custom: Record<string, CharacterCustomization>): string {
  let n = 1;
  while (custom[crewKey(`crew:x${n}`)]) n++;
  return `crew:x${n}`;
}

export interface Embodied {
  /** What the castle draws: one entry per crew member, plus real agents nobody could take. */
  agents: Agent[];
  /** Displayed id -> real agent id, for members currently doing a real agent's job. */
  realOf: Map<string, string>;
}

/**
 * Give each real active agent to a free crew member of its function. `sticky`
 * (real agent id -> member id) keeps a pairing stable while both exist; pass the
 * same map on every call.
 */
export function embodyCrew(roster: readonly CrewMember[], active: readonly Agent[], sticky: Map<string, string>, now: number): Embodied {
  const members = new Map(roster.map((m) => [m.id, m]));
  const roleOf = (a: Agent): CrewRole => (a.isMain ? "main" : a.specialty);
  const alive = new Set(active.map((a) => a.id));
  for (const [real, member] of sticky) {
    const a = active.find((x) => x.id === real);
    if (!alive.has(real) || !a || members.get(member)?.role !== roleOf(a)) sticky.delete(real);
  }
  const busy = new Set(sticky.values());
  const sorted = [...active].sort((a, b) => a.startedAt - b.startedAt || a.id.localeCompare(b.id));
  for (const a of sorted) {
    if (sticky.has(a.id)) continue;
    const free = roster.find((m) => m.role === roleOf(a) && !busy.has(m.id));
    if (free) {
      sticky.set(a.id, free.id);
      busy.add(free.id);
    }
  }
  const realByMember = new Map([...sticky].map(([real, member]) => [member, real]));
  const agents: Agent[] = [];
  const realOf = new Map<string, string>();
  for (const m of roster) {
    const real = active.find((a) => a.id === realByMember.get(m.id));
    if (real) {
      agents.push({ ...real, id: m.id, name: m.defaultName });
      realOf.set(m.id, real.id);
    } else {
      agents.push(restingMember(m, now));
    }
  }
  for (const a of sorted) if (!sticky.has(a.id)) agents.push(a);
  return { agents, realOf };
}

/** A crew member with nothing to do: idle, with no session and no activity. */
function restingMember(m: CrewMember, now: number): Agent {
  return {
    id: m.id,
    sessionId: "",
    parentId: null,
    agentId: null,
    agentType: null,
    specialty: m.role === "main" ? "general" : m.role,
    isMain: m.role === "main",
    name: m.defaultName,
    cwd: null,
    state: "IDLE",
    activity: null,
    currentTool: null,
    detail: null,
    task: null,
    room: "barracks",
    startedAt: 0,
    updatedAt: 0,
    endedAt: null,
    lastEvent: null,
  };
}
