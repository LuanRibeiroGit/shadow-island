import type { Agent, Encounter, EventRecord, Mission, Room, Session, Snapshot, Update } from "@ids/shared";

/**
 * Frontend projection of the backend state. Built from a snapshot, then kept up to
 * date by applying `ids://updates` batches. Pure functions: easy to test and to use
 * from any store.
 */
export interface World {
  agents: Record<string, Agent>;
  /** Finished agents, newest first, bounded. */
  recentAgents: Agent[];
  sessions: Record<string, Session>;
  missions: Record<number, Mission>;
  encounters: Record<number, Encounter>;
  /** Most recent events, newest first, bounded. */
  events: EventRecord[];
  /** Bumped when token usage changed somewhere (dashboards refetch). */
  usageVersion: number;
  lastUpdateAt: number;
}

export const MAX_EVENTS = 200;
export const MAX_RECENT_AGENTS = 24;
const OPEN_MISSION = new Set(["not_started", "in_progress", "waiting"]);

export const emptyWorld = (): World => ({
  agents: {},
  recentAgents: [],
  sessions: {},
  missions: {},
  encounters: {},
  events: [],
  usageVersion: 0,
  lastUpdateAt: 0,
});

export function worldFromSnapshot(s: Snapshot): World {
  const w = emptyWorld();
  for (const a of s.agents) w.agents[a.id] = a;
  w.recentAgents = s.recentAgents.slice(0, MAX_RECENT_AGENTS);
  for (const ss of s.sessions) w.sessions[ss.session.id] = ss.session;
  for (const m of s.missions) w.missions[m.id] = m;
  for (const e of s.encounters) w.encounters[e.id] = e;
  w.events = s.events.slice(0, MAX_EVENTS);
  w.lastUpdateAt = s.now;
  return w;
}

/** Apply a batch of updates. Returns a new World (structural sharing). */
export function applyUpdates(world: World, updates: readonly Update[], now: number = Date.now()): World {
  if (updates.length === 0) return world;
  const agents = { ...world.agents };
  let recent = world.recentAgents;
  const sessions = { ...world.sessions };
  const missions = { ...world.missions };
  const encounters = { ...world.encounters };
  const newEvents: EventRecord[] = [];
  let usageVersion = world.usageVersion;

  for (const u of updates) {
    switch (u.type) {
      case "agent": {
        const a = u.agent;
        const prev = agents[a.id];
        // Ignore stale updates (out-of-order batches).
        if (prev && prev.updatedAt > a.updatedAt) break;
        if (a.endedAt === null) {
          agents[a.id] = a;
          recent = recent.filter((r) => r.id !== a.id);
        } else {
          delete agents[a.id];
          recent = [a, ...recent.filter((r) => r.id !== a.id)].slice(0, MAX_RECENT_AGENTS);
        }
        break;
      }
      case "session":
        sessions[u.session.id] = u.session;
        break;
      case "mission":
        missions[u.mission.id] = u.mission;
        break;
      case "encounter":
        if (u.encounter.status === "active") encounters[u.encounter.id] = u.encounter;
        else delete encounters[u.encounter.id];
        break;
      case "event":
        newEvents.push(u.event);
        break;
      case "usage":
        usageVersion += 1;
        break;
    }
  }

  // Keep only open missions plus the last few finished ones in memory.
  const finished = Object.values(missions)
    .filter((m) => !OPEN_MISSION.has(m.status))
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
  for (const m of finished.slice(50)) delete missions[m.id];

  const events = newEvents.length
    ? [...newEvents.reverse(), ...world.events].slice(0, MAX_EVENTS)
    : world.events;

  return { agents, recentAgents: recent, sessions, missions, encounters, events, usageVersion, lastUpdateAt: now };
}

// ---- selectors -------------------------------------------------------------

export const activeAgents = (w: World): Agent[] => Object.values(w.agents).sort((a, b) => a.startedAt - b.startedAt);

export function agentsByRoom(w: World): Record<Room, Agent[]> {
  const out: Record<Room, Agent[]> = { throne: [], library: [], forge: [], laboratory: [], watchtower: [], treasury: [], barracks: [] };
  for (const a of activeAgents(w)) out[a.room].push(a);
  return out;
}

export const childrenOf = (w: World, parentId: string): Agent[] => activeAgents(w).filter((a) => a.parentId === parentId);

export const encountersFor = (w: World, agentId: string): Encounter[] =>
  Object.values(w.encounters).filter((e) => e.agentId === agentId && e.status === "active");

export const openMissions = (w: World): Mission[] =>
  Object.values(w.missions)
    .filter((m) => OPEN_MISSION.has(m.status))
    .sort((a, b) => b.startedAt - a.startedAt);

export const activeSessions = (w: World): Session[] =>
  Object.values(w.sessions)
    .filter((s) => s.endedAt === null)
    .sort((a, b) => b.lastEventAt - a.lastEventAt);

/** Current quest of a session: its newest open prompt mission. */
export const currentQuest = (w: World, sessionId: string): Mission | undefined =>
  openMissions(w).find((m) => m.sessionId === sessionId && m.kind === "prompt");
