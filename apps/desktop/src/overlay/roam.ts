import { stepWalker } from "@ids/game-engine";
import type { OverlayArea } from "../bridge/backend";
import type { FreePosition } from "../settings/schema";

export interface RoamIo {
  area(): Promise<OverlayArea>;
  move(x: number, y: number): Promise<void>;
}

export interface RoamBounds {
  min: number;
  max: number;
}

export const ROAM_MIN_WIDTH = 300;
const BUBBLE_ROOM = 20;
const DRAG_THRESHOLD = 4;

export function roamSize(contentWidth: number, scale: number, showNames: boolean): { width: number; height: number } {
  const characterHeight = 48 * scale;
  return { width: Math.max(Math.round(contentWidth), ROAM_MIN_WIDTH), height: Math.ceil(characterHeight + BUBBLE_ROOM + (showNames ? 16 : 2)) };
}

export function roamBounds(area: OverlayArea): RoamBounds {
  const min = area.work.x;
  return { min, max: Math.max(min, area.work.x + area.work.width - area.window.width) };
}

export function nextRoamTarget(x: number, bounds: RoamBounds, seed: number): number {
  const span = bounds.max - bounds.min;
  if (span <= 0) return bounds.min;
  const third = (span / 3) * fraction(seed);
  const goRight = x - bounds.min < span / 2;
  return Math.round(goRight ? bounds.max - third : bounds.min + third);
}

export function restAfterLeg(seed: number): number {
  return 1500 + Math.round(fraction(seed) * 2500);
}

export function freePositionOf(area: OverlayArea): FreePosition | null {
  if (!area.name) return null;
  return { monitor: area.name, x: area.window.x - area.monitor.x, bottom: area.window.y + area.window.height - area.monitor.y };
}

function fraction(seed: number): number {
  const r = Math.sin(seed * 12.9898) * 43758.5453;
  return r - Math.floor(r);
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
  private x = 0;
  private target: number | null = null;
  private restUntil = 0;
  private stale = false;
  private loading: Promise<void> | null = null;
  private drag: DragStart | null = null;
  private inFlight = false;
  private queued: [number, number] | null = null;

  constructor(private readonly io: RoamIo) {}

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
    if (this.target === null) {
      if (now < this.restUntil) return null;
      this.target = nextRoamTarget(this.x, roamBounds(area), now / 1000);
    }
    const step = stepWalker({ x: this.x, targetX: this.target, facing: 1 }, dtMs, speed);
    this.x = step.x;
    const x = Math.round(this.x);
    if (x !== area.window.x) {
      this.area = { ...area, window: { ...area.window, x } };
      this.push(x, area.window.y);
    }
    if (this.x === this.target) {
      this.target = null;
      this.restUntil = now + restAfterLeg(now / 1000);
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

  async endDrag(): Promise<{ moved: boolean; area: OverlayArea | null }> {
    const d = this.drag;
    this.drag = null;
    if (!d?.moved) return { moved: false, area: this.area };
    await this.settled();
    try {
      this.adopt(await this.io.area());
    } catch {
      return { moved: true, area: this.area };
    }
    return { moved: true, area: this.area };
  }

  private adopt(a: OverlayArea) {
    this.area = a;
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
