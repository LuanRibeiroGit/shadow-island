import type { Agent, AgentState } from "@ids/shared";

/** Animation rows every character spritesheet must provide. */
export const ANIMATIONS = ["idle", "move", "work", "read", "cast", "attack", "wait", "cheer", "hurt"] as const;
export type AnimationName = (typeof ANIMATIONS)[number];

const BY_STATE: Record<AgentState, AnimationName> = {
  IDLE: "idle",
  RUNNING: "move",
  EXPLORING: "move",
  CODING: "work",
  READING: "read",
  BUILDING: "work",
  TESTING: "cast",
  COMBAT: "attack",
  WAITING: "wait",
  SUCCESS: "cheer",
  ERROR: "hurt",
};

/** How long transient states are shown before settling (ms). */
export const SUCCESS_HOLD_MS = 4_000;
export const ERROR_HOLD_MS = 6_000;

export interface VisualState {
  /** State actually displayed (after transient states settle). */
  state: AgentState;
  animation: AnimationName;
  /** Whether the character should walk around (overlay). */
  moving: boolean;
  /** Whether the animation needs ticking. Idle/wait loops are slow & cheap. */
  energetic: boolean;
}

/**
 * Visual state for an agent at time `now`. SUCCESS and ERROR are shown for a while
 * after the event, then fall back to IDLE: the backend state is the last *real*
 * event, the visual layer only decides how long a celebration lasts.
 */
export function visualFor(agent: Pick<Agent, "state" | "updatedAt">, now: number): VisualState {
  let state = agent.state;
  if (state === "SUCCESS" && now - agent.updatedAt > SUCCESS_HOLD_MS) state = "IDLE";
  if (state === "ERROR" && now - agent.updatedAt > ERROR_HOLD_MS) state = "IDLE";
  const animation = BY_STATE[state];
  return {
    state,
    animation,
    moving: state === "RUNNING" || state === "EXPLORING",
    energetic: !(state === "IDLE" || state === "WAITING"),
  };
}

/** Next time (ms) the visual state of this agent will change on its own, if any. */
export function nextVisualChange(agent: Pick<Agent, "state" | "updatedAt">, now: number): number | null {
  if (agent.state === "SUCCESS" && now - agent.updatedAt <= SUCCESS_HOLD_MS) return agent.updatedAt + SUCCESS_HOLD_MS + 1;
  if (agent.state === "ERROR" && now - agent.updatedAt <= ERROR_HOLD_MS) return agent.updatedAt + ERROR_HOLD_MS + 1;
  return null;
}
