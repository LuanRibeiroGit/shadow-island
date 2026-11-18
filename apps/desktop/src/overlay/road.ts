export const ROAD_GAP_MIN = 260;
export const ROAD_GAP_MAX = 900;
export const ROAD_BLOWS_MIN = 4;
export const ROAD_BLOWS_MAX = 8;
export const ROAD_HIT_MIN_MS = 350;
export const ROAD_HIT_MAX_MS = 650;
export const ROAD_HIT_FLASH_MS = 150;
export const ROAD_CHEER_MS = 900;
export const ROAD_STAGGER_MS = 1500;

export interface RoadFight {
  side: 1 | -1;
  hp: number;
  blows: number;
  taken: number;
  nextHitAt: number;
  hitUntil: number;
  deadAt: number | null;
}

export type RoadEvent = "hit" | "dead" | "over";

export class Road {
  private walked = 0;
  private gap: number;
  fight: RoadFight | null = null;

  constructor(private readonly rand: () => number = Math.random) {
    this.gap = this.nextGap();
  }

  get swinging(): boolean {
    return this.fight !== null && this.fight.deadAt === null;
  }

  get due(): boolean {
    return this.fight === null && this.walked >= this.gap;
  }

  walk(px: number): boolean {
    if (this.fight || px <= 0) return false;
    this.walked += px;
    return this.due;
  }

  start(side: 1 | -1, now: number): RoadFight {
    this.walked = 0;
    this.gap = this.nextGap();
    const blows = ROAD_BLOWS_MIN + Math.floor(this.rand() * (ROAD_BLOWS_MAX - ROAD_BLOWS_MIN + 1));
    this.fight = { side, hp: 1, blows: Math.min(blows, ROAD_BLOWS_MAX), taken: 0, nextHitAt: now + this.swing(), hitUntil: 0, deadAt: null };
    return this.fight;
  }

  tick(now: number): RoadEvent | null {
    const f = this.fight;
    if (!f) return null;
    if (f.deadAt !== null) {
      if (now < f.deadAt + ROAD_CHEER_MS) return null;
      this.fight = null;
      return "over";
    }
    if (now < f.nextHitAt) return null;
    f.taken += 1;
    f.nextHitAt = now + this.swing();
    f.hitUntil = now + ROAD_HIT_FLASH_MS;
    f.hp = Math.max(0, Math.round(((f.blows - f.taken) / f.blows) * 1000) / 1000);
    if (f.hp > 0) return "hit";
    f.deadAt = now;
    return "dead";
  }

  abort(): void {
    this.fight = null;
  }

  private swing(): number {
    return Math.round(ROAD_HIT_MIN_MS + this.rand() * (ROAD_HIT_MAX_MS - ROAD_HIT_MIN_MS));
  }

  private nextGap(): number {
    return ROAD_GAP_MIN + this.rand() * (ROAD_GAP_MAX - ROAD_GAP_MIN);
  }
}

export class Roads {
  private roads = new Map<string, Road>();
  private lastStart = -Infinity;

  constructor(
    private readonly rand: () => number = Math.random,
    private readonly stagger = ROAD_STAGGER_MS,
  ) {}

  get busy(): boolean {
    for (const r of this.roads.values()) if (r.fight) return true;
    return false;
  }

  fight(id: string): RoadFight | null {
    return this.roads.get(id)?.fight ?? null;
  }

  fights(): [string, RoadFight][] {
    const out: [string, RoadFight][] = [];
    for (const [id, r] of this.roads) if (r.fight) out.push([id, r.fight]);
    return out;
  }

  walk(id: string, px: number, facing: 1 | -1, now: number): RoadFight | null {
    if (!this.advance(id, px) || now - this.lastStart < this.stagger) return null;
    return this.begin(id, facing, now);
  }

  advance(id: string, px: number): boolean {
    const road = this.road(id);
    road.walk(px);
    return road.due;
  }

  begin(id: string, facing: 1 | -1, now: number): RoadFight | null {
    const road = this.road(id);
    if (!road.due) return null;
    this.lastStart = now;
    return road.start(facing, now);
  }

  tick(now: number): [string, RoadEvent][] {
    const out: [string, RoadEvent][] = [];
    for (const [id, r] of this.roads) {
      const event = r.tick(now);
      if (event) out.push([id, event]);
    }
    return out;
  }

  forget(id: string): void {
    this.roads.delete(id);
  }

  clear(): void {
    this.roads.clear();
  }

  private road(id: string): Road {
    let r = this.roads.get(id);
    if (!r) {
      r = new Road(this.rand);
      this.roads.set(id, r);
    }
    return r;
  }
}

export function foeSpot(x: number, side: 1 | -1, offset: number, bounds: { min: number; max: number }): { x: number; side: 1 | -1 } {
  const ahead = x + side * offset;
  if (ahead >= bounds.min && ahead <= bounds.max) return { x: Math.round(ahead), side };
  const back = x - side * offset;
  if (back >= bounds.min && back <= bounds.max) return { x: Math.round(back), side: side === 1 ? -1 : 1 };
  return { x: Math.round(Math.min(Math.max(ahead, bounds.min), bounds.max)), side };
}
