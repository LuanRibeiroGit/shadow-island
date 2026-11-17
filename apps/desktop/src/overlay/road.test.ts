import { describe, expect, it } from "vitest";
import { ROAD_CHEER_MS, ROAD_GAP_MIN, ROAD_HIT_EVERY_MS, Road } from "./road";

describe("battles along the road", () => {
  it("meets a mob only after walking far enough, on the side it is heading to", () => {
    const road = new Road(() => 0);
    expect(road.walk(ROAD_GAP_MIN - 1, -1, 0)).toBe(false);
    expect(road.fight).toBeNull();
    expect(road.walk(1, -1, 0)).toBe(true);
    expect(road.fight).toMatchObject({ side: -1, hp: 1, deadAt: null });
    expect(road.swinging).toBe(true);
  });

  it("does not meet another mob in the middle of a fight", () => {
    const road = new Road(() => 0);
    road.walk(ROAD_GAP_MIN, 1, 0);
    expect(road.walk(ROAD_GAP_MIN * 10, 1, 0)).toBe(false);
  });

  it("hits the mob on every swing until it dies, then cheers and moves on", () => {
    const road = new Road(() => 0);
    road.walk(ROAD_GAP_MIN, 1, 0);
    expect(road.tick(ROAD_HIT_EVERY_MS - 1)).toBeNull();
    const events = [1, 2, 3, 4, 5].map((i) => road.tick(i * ROAD_HIT_EVERY_MS));
    expect(events).toEqual(["hit", "hit", "hit", "hit", "dead"]);
    expect(road.fight?.hp).toBe(0);
    expect(road.swinging).toBe(false);
    const died = 5 * ROAD_HIT_EVERY_MS;
    expect(road.tick(died + ROAD_CHEER_MS - 1)).toBeNull();
    expect(road.tick(died + ROAD_CHEER_MS)).toBe("over");
    expect(road.fight).toBeNull();
  });

  it("flashes the mob red right after each blow", () => {
    const road = new Road(() => 0);
    road.walk(ROAD_GAP_MIN, 1, 0);
    road.tick(ROAD_HIT_EVERY_MS);
    expect(road.fight!.hitUntil).toBeGreaterThan(ROAD_HIT_EVERY_MS);
    expect(road.fight!.hp).toBe(0.8);
  });
});
