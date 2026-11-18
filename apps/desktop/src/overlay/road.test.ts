import { describe, expect, it } from "vitest";
import { ROAD_BLOWS_MAX, ROAD_BLOWS_MIN, ROAD_CHEER_MS, ROAD_GAP_MIN, ROAD_HIT_MAX_MS, ROAD_HIT_MIN_MS, ROAD_STAGGER_MS, Road, Roads, foeSpot } from "./road";

const sequence = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length] ?? 0;
};

function fightToTheEnd(road: Road, start: number): number {
  let now = start;
  for (let guard = 0; guard < 50; guard++) {
    now = road.fight!.nextHitAt;
    if (road.tick(now) === "dead") return now;
  }
  throw new Error("the mob never died");
}

describe("battles along the road", () => {
  it("is due for a mob only after walking far enough", () => {
    const road = new Road(() => 0);
    expect(road.walk(ROAD_GAP_MIN - 1)).toBe(false);
    expect(road.walk(1)).toBe(true);
    expect(road.fight).toBeNull();
    const fight = road.start(-1, 0);
    expect(fight).toMatchObject({ side: -1, hp: 1, blows: ROAD_BLOWS_MIN, taken: 0, deadAt: null });
    expect(road.swinging).toBe(true);
    expect(road.walk(ROAD_GAP_MIN * 10)).toBe(false);
  });

  it("takes several blows with a life bar going down, then cheers and moves on", () => {
    const road = new Road(() => 0);
    road.walk(ROAD_GAP_MIN);
    road.start(1, 0);
    expect(road.tick(ROAD_HIT_MIN_MS - 1)).toBeNull();
    const events = [1, 2, 3, 4].map((i) => road.tick(i * ROAD_HIT_MIN_MS));
    expect(events).toEqual(["hit", "hit", "hit", "dead"]);
    expect(road.fight?.hp).toBe(0);
    expect(road.swinging).toBe(false);
    const died = 4 * ROAD_HIT_MIN_MS;
    expect(road.tick(died + ROAD_CHEER_MS - 1)).toBeNull();
    expect(road.tick(died + ROAD_CHEER_MS)).toBe("over");
    expect(road.fight).toBeNull();
  });

  it("flashes the mob red right after each blow and drains its life evenly", () => {
    const road = new Road(() => 0);
    road.walk(ROAD_GAP_MIN);
    road.start(1, 0);
    road.tick(ROAD_HIT_MIN_MS);
    expect(road.fight!.hitUntil).toBeGreaterThan(ROAD_HIT_MIN_MS);
    expect(road.fight!.hp).toBe(0.75);
  });

  it("draws the number of blows and the time between them for every fight", () => {
    const tough = new Road(() => 0.999);
    tough.walk(10_000);
    expect(tough.start(1, 0).blows).toBe(ROAD_BLOWS_MAX);
    expect(tough.fight!.nextHitAt).toBe(ROAD_HIT_MAX_MS);
    const swings = new Road(sequence(0, 0, 0, 1, 0.5));
    swings.walk(ROAD_GAP_MIN);
    swings.start(1, 0);
    const first = swings.fight!.nextHitAt;
    swings.tick(first);
    expect(first).toBe(ROAD_HIT_MAX_MS);
    expect(swings.fight!.nextHitAt - first).toBe(500);
  });

  it("keeps fights that start together from ending together", () => {
    const a = new Road(sequence(0, 0.1, 0.3, 0.7, 0.2));
    const b = new Road(sequence(0, 0.9, 0.8, 0.4, 0.6));
    a.walk(10_000);
    b.walk(10_000);
    a.start(1, 0);
    b.start(1, 0);
    expect(fightToTheEnd(a, 0)).not.toBe(fightToTheEnd(b, 0));
  });
});

describe("a mob for each walker", () => {
  it("only the walker that went far enough fights, the others keep walking", () => {
    const roads = new Roads(() => 0);
    expect(roads.walk("a", ROAD_GAP_MIN, 1, 0)).not.toBeNull();
    expect(roads.walk("b", 10, -1, 0)).toBeNull();
    expect(roads.fight("a")).toMatchObject({ side: 1 });
    expect(roads.fight("b")).toBeNull();
    expect(roads.busy).toBe(true);
    expect(roads.fights().map(([id]) => id)).toEqual(["a"]);
  });

  it("postpones a fight that would start too soon after another one", () => {
    const roads = new Roads(() => 0);
    roads.walk("a", ROAD_GAP_MIN, 1, 1000);
    expect(roads.walk("b", ROAD_GAP_MIN, -1, 1000 + ROAD_STAGGER_MS - 1)).toBeNull();
    expect(roads.fight("b")).toBeNull();
    expect(roads.walk("b", 5, -1, 1000 + ROAD_STAGGER_MS)).toMatchObject({ side: -1 });
  });

  it("reports the events of each fight under its walker", () => {
    const roads = new Roads(() => 0, 0);
    roads.walk("a", ROAD_GAP_MIN, 1, 0);
    roads.walk("b", ROAD_GAP_MIN, 1, 100);
    expect(roads.tick(ROAD_HIT_MIN_MS)).toEqual([["a", "hit"]]);
    expect(roads.tick(100 + ROAD_HIT_MIN_MS)).toEqual([["b", "hit"]]);
    roads.forget("a");
    expect(roads.fight("a")).toBeNull();
    roads.clear();
    expect(roads.busy).toBe(false);
  });

  it("puts the mob ahead of the walker, or behind it at the edge of the strip", () => {
    const bounds = { min: 16, max: 984 };
    expect(foeSpot(500, 1, 40, bounds)).toEqual({ x: 540, side: 1 });
    expect(foeSpot(500, -1, 40, bounds)).toEqual({ x: 460, side: -1 });
    expect(foeSpot(970, 1, 40, bounds)).toEqual({ x: 930, side: -1 });
    expect(foeSpot(30, -1, 40, bounds)).toEqual({ x: 70, side: 1 });
  });
});
