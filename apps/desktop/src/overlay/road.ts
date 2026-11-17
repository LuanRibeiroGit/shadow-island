export const ROAD_GAP_MIN = 260;
export const ROAD_GAP_MAX = 900;
export const ROAD_HIT_EVERY_MS = 444;
export const ROAD_DAMAGE = 0.2;
export const ROAD_HIT_FLASH_MS = 150;
export const ROAD_CHEER_MS = 900;

export interface RoadFight {
  side: 1 | -1;
  hp: number;
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

  walk(px: number, facing: 1 | -1, now: number): boolean {
    if (this.fight || px <= 0) return false;
    this.walked += px;
    if (this.walked < this.gap) return false;
    this.walked = 0;
    this.gap = this.nextGap();
    this.fight = { side: facing, hp: 1, nextHitAt: now + ROAD_HIT_EVERY_MS, hitUntil: 0, deadAt: null };
    return true;
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
    f.nextHitAt = now + ROAD_HIT_EVERY_MS;
    f.hitUntil = now + ROAD_HIT_FLASH_MS;
    f.hp = Math.max(0, Math.round((f.hp - ROAD_DAMAGE) * 1000) / 1000);
    if (f.hp > 0) return "hit";
    f.deadAt = now;
    return "dead";
  }

  abort(): void {
    this.fight = null;
  }

  private nextGap(): number {
    return ROAD_GAP_MIN + this.rand() * (ROAD_GAP_MAX - ROAD_GAP_MIN);
  }
}
