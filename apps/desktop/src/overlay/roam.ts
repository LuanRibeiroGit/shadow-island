import { stepWalker } from "@ids/game-engine";
import type { Rect } from "@ids/shared";
import type { OverlayArea } from "../bridge/backend";

export interface RoamIo {
  area(): Promise<OverlayArea>;
  move(x: number, y: number): Promise<Rect[]>;
}

export interface RoamBounds {
  min: number;
  max: number;
}

export const ROAM_CONTENT_WIDTH = 300;
export const ROAM_TARGET_TRIES = 12;
export const ROAM_REST_MIN_MS = 1500;
export const ROAM_REST_MAX_MS = 4000;
export const ROAM_BLOCKED_REST_MS = 600;
const BUBBLE_ROOM = 20;
const MOB_ROOM = 56;
export const ROAMER_MIN_WIDTH = 160;
export const ROAMER_SPACING = 8;
const DRAG_THRESHOLD = 4;

export function roamHeight(scale: number, showNames: boolean): number {
  return Math.ceil(48 * scale + BUBBLE_ROOM + (showNames ? 16 : 2));
}

export const roamGap = (scale: number) => Math.round(64 * scale);

export function roamBounds(width: number, scale: number): RoamBounds {
  const margin = Math.round(28 * scale);
  return { min: margin, max: Math.max(margin, width - margin) };
}

export function spawnX(others: number[], bounds: RoamBounds, rand: () => number = Math.random): number {
  const stops = [...others.map((o) => Math.min(Math.max(o, bounds.min), bounds.max)), bounds.min, bounds.max].sort((a, b) => a - b);
  let best = { from: bounds.min, to: bounds.max, room: -1 };
  for (let i = 1; i < stops.length; i++) {
    const from = stops[i - 1] ?? bounds.min;
    const to = stops[i] ?? bounds.max;
    const edge = i === 1 || i === stops.length - 1;
    const room = (to - from) * (edge && others.length > 0 ? 2 : 1);
    if (room > best.room) best = { from, to, room };
  }
  const leftEdge = others.length > 0 && best.from === bounds.min;
  const rightEdge = others.length > 0 && best.to === bounds.max;
  const center = leftEdge ? best.from + (best.to - best.from) / 3 : rightEdge ? best.to - (best.to - best.from) / 3 : (best.from + best.to) / 2;
  const jitter = (rand() * 2 - 1) * (best.to - best.from) * 0.15;
  return Math.round(Math.min(Math.max(center + jitter, bounds.min), bounds.max));
}

export function nextRoamTarget(x: number, others: number[], bounds: RoamBounds, gap: number, rand: () => number = Math.random): number {
  for (let i = 0; i < ROAM_TARGET_TRIES; i++) {
    const c = Math.round(bounds.min + rand() * (bounds.max - bounds.min));
    if (Math.abs(c - x) < gap / 2) continue;
    if (others.some((o) => Math.abs(c - o) < gap)) continue;
    if (others.some((o) => (o - x) * (c - x) > 0 && Math.abs(o - x) < Math.abs(c - x))) continue;
    return c;
  }
  return x;
}

export function blockedAhead(from: number, to: number, others: number[], gap: number): boolean {
  const dir = Math.sign(to - from);
  if (dir === 0) return false;
  return others.some((o) => {
    const ahead = (o - from) * dir;
    return ahead > 0 && Math.abs(o - to) < gap;
  });
}

export function restAfterLeg(rand: () => number = Math.random): number {
  return ROAM_REST_MIN_MS + Math.round(rand() * (ROAM_REST_MAX_MS - ROAM_REST_MIN_MS));
}

export function roamerWidth(scale: number): number {
  return Math.max(ROAMER_MIN_WIDTH, Math.round(48 * scale + 2 * MOB_ROOM * scale));
}

export function windowBounds(area: OverlayArea): RoamBounds {
  const min = area.work.x;
  return { min, max: Math.max(min, area.work.x + area.work.width - area.window.width) };
}

export function laneNeighbours(window: Rect, peers: Rect[]): number[] {
  return peers.filter((p) => p.y < window.y + window.height && window.y < p.y + p.height).map((p) => p.x);
}

interface DragStart {
  pointerX: number;
  pointerY: number;
  x: number;
  y: number;
  moved: boolean;
}

export class Roamer {
  private area: OverlayArea | null = null;
  private peers: Rect[] = [];
  private x = 0;
  private target: number | null = null;
  private restUntil = 0;
  private stale = false;
  private loading: Promise<void> | null = null;
  private drag: DragStart | null = null;
  private inFlight = false;
  private queued: [number, number] | null = null;

  constructor(
    private readonly io: RoamIo,
    private readonly rand: () => number = Math.random,
  ) {}

  get current(): OverlayArea | null {
    return this.area;
  }

  get dragging(): boolean {
    return this.drag !== null;
  }

  refresh(): Promise<void> {
    if (!this.loading) {
      this.loading = this.io
        .area()
        .then((a) => {
          if (!this.drag) this.adopt(a);
        })
        .catch(() => {})
        .finally(() => {
          this.loading = null;
        });
    }
    return this.loading;
  }

  tick(now: number, dtMs: number, speed: number, walking: boolean): 1 | -1 | null {
    const area = this.area;
    if (!area || this.drag || this.loading) return null;
    if (!walking) {
      this.stale = true;
      return null;
    }
    if (this.stale) {
      this.stale = false;
      void this.refresh();
      return null;
    }
    const gap = area.window.width + ROAMER_SPACING;
    const others = laneNeighbours(area.window, this.peers);
    if (this.target === null) {
      if (now < this.restUntil) return null;
      const target = nextRoamTarget(this.x, others, windowBounds(area), gap, this.rand);
      if (target === this.x) {
        this.restUntil = now + ROAM_BLOCKED_REST_MS;
        return null;
      }
      this.target = target;
    }
    const step = stepWalker({ x: this.x, targetX: this.target, facing: 1 }, dtMs, speed);
    if (blockedAhead(this.x, step.x, others, gap)) {
      this.target = null;
      this.restUntil = now + ROAM_BLOCKED_REST_MS;
      return null;
    }
    this.x = step.x;
    const x = Math.round(this.x);
    if (x !== area.window.x) {
      this.area = { ...area, window: { ...area.window, x } };
      this.push(x, area.window.y);
    }
    if (this.x === this.target) {
      this.target = null;
      this.restUntil = now + restAfterLeg(this.rand);
    }
    return step.facing;
  }

  startDrag(pointerX: number, pointerY: number): boolean {
    const area = this.area;
    if (!area) return false;
    this.drag = { pointerX, pointerY, x: area.window.x, y: area.window.y, moved: false };
    this.target = null;
    return true;
  }

  dragTo(pointerX: number, pointerY: number): void {
    const d = this.drag;
    const area = this.area;
    if (!d || !area) return;
    const dx = pointerX - d.pointerX;
    const dy = pointerY - d.pointerY;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    d.moved = true;
    const x = Math.round(d.x + dx);
    const y = Math.round(d.y + dy);
    this.area = { ...area, window: { ...area.window, x, y } };
    this.x = x;
    this.push(x, y);
  }

  async endDrag(): Promise<{ moved: boolean }> {
    const d = this.drag;
    this.drag = null;
    if (!d?.moved) return { moved: false };
    await this.settled();
    await this.refresh();
    return { moved: true };
  }

  private adopt(a: OverlayArea) {
    this.area = a;
    this.peers = a.peers ?? [];
    this.x = a.window.x;
    this.target = null;
  }

  private push(x: number, y: number) {
    if (this.inFlight) {
      this.queued = [x, y];
      return;
    }
    this.inFlight = true;
    void this.io
      .move(x, y)
      .then((peers) => {
        this.peers = peers;
      })
      .catch(() => {})
      .finally(() => {
        this.inFlight = false;
        const next = this.queued;
        this.queued = null;
        if (next) this.push(next[0], next[1]);
      });
  }

  private async settled(): Promise<void> {
    while (this.inFlight) await new Promise((r) => setTimeout(r, 10));
  }
}
