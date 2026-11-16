/**
 * Movement of characters along the desktop strip. Deterministic per agent so
 * characters do not jump around when the overlay reloads. Characters only walk
 * while their real state is "moving" (RUNNING/EXPLORING); otherwise they stay put,
 * so idle characters cost nothing to render.
 */
export interface Walker {
  x: number;
  targetX: number;
  facing: 1 | -1;
}

export function homeX(agentId: string, index: number, width: number, spacing: number): number {
  const slots = Math.max(1, Math.floor(width / spacing));
  let h = 0;
  for (const c of agentId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const slot = (index + (h % 3)) % slots;
  return Math.round(spacing / 2 + slot * spacing);
}

export function stepWalker(w: Walker, dtMs: number, speedPxPerSec: number): Walker {
  const dx = w.targetX - w.x;
  if (Math.abs(dx) < 0.5) return { ...w, x: w.targetX };
  const step = Math.sign(dx) * Math.min(Math.abs(dx), (speedPxPerSec * dtMs) / 1000);
  return { x: w.x + step, targetX: w.targetX, facing: dx >= 0 ? 1 : -1 };
}

/** Pick a new wander target near home (pseudo-random but bounded). */
export function wanderTarget(home: number, seed: number, range: number, width: number, margin: number): number {
  const r = Math.sin(seed * 12.9898) * 43758.5453;
  const frac = r - Math.floor(r);
  const t = home + (frac * 2 - 1) * range;
  return Math.min(width - margin, Math.max(margin, Math.round(t)));
}
