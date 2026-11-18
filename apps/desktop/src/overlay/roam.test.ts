import { describe, expect, it } from "vitest";
import { ROAM_REST_MAX_MS, ROAM_REST_MIN_MS, blockedAhead, nextRoamTarget, restAfterLeg, roamBounds, roamGap, roamHeight, spawnX, Roamer, laneNeighbours, roamerWidth } from "./roam";

const sequence = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length] ?? 0;
};

describe("roaming along the strip", () => {
  it("is as low as a soul with its bubble and name", () => {
    expect(roamHeight(1, false)).toBe(70);
    expect(roamHeight(2, true)).toBe(132);
  });

  it("keeps the souls inside the strip and a soul apart from each other", () => {
    expect(roamBounds(1920, 1)).toEqual({ min: 28, max: 1892 });
    expect(roamBounds(20, 1)).toEqual({ min: 28, max: 28 });
    expect(roamGap(1)).toBe(64);
    expect(roamGap(1.5)).toBe(96);
  });

  it("spreads newcomers over the free room of the strip", () => {
    const bounds = { min: 0, max: 1200 };
    const mid = () => 0.5;
    const first = spawnX([], bounds, mid);
    expect(first).toBe(600);
    const second = spawnX([first], bounds, mid);
    expect(second).toBe(200);
    const third = spawnX([first, second], bounds, mid);
    expect(third).toBe(1000);
    const xs = [first, second, third, spawnX([first, second, third], bounds, mid)].sort((a, b) => a - b);
    xs.slice(1).forEach((x, i) => expect(x - (xs[i] ?? 0)).toBeGreaterThanOrEqual(roamGap(1)));
  });

  it("picks a target of its own, away from the others and without walking through them", () => {
    const bounds = { min: 0, max: 1000 };
    expect(nextRoamTarget(500, [], bounds, 64, () => 0.9)).toBe(900);
    expect(nextRoamTarget(500, [880], bounds, 64, sequence(0.9, 0.82, 0.2))).toBe(200);
    expect(nextRoamTarget(500, [700], bounds, 64, sequence(0.9, 0.62))).toBe(620);
    expect(nextRoamTarget(500, [], bounds, 64, () => 0.51)).toBe(500);
  });

  it("stays put when there is no room to go anywhere", () => {
    expect(nextRoamTarget(100, [40, 160], { min: 0, max: 200 }, 64, Math.random)).toBe(100);
  });

  it("does not choose the same targets for walkers with different luck", () => {
    const bounds = { min: 0, max: 1600 };
    const a = nextRoamTarget(800, [], bounds, 64, sequence(0.1));
    const b = nextRoamTarget(800, [], bounds, 64, sequence(0.8));
    expect(a).not.toBe(b);
  });

  it("stops before stepping too close to someone ahead, but can always step away", () => {
    expect(blockedAhead(100, 102, [160], 64)).toBe(true);
    expect(blockedAhead(100, 98, [160], 64)).toBe(false);
    expect(blockedAhead(100, 102, [40], 64)).toBe(false);
    expect(blockedAhead(100, 100, [120], 64)).toBe(false);
    expect(blockedAhead(100, 101, [100], 64)).toBe(false);
  });

  it("rests for a while of its own after each leg", () => {
    expect(restAfterLeg(() => 0)).toBe(ROAM_REST_MIN_MS);
    expect(restAfterLeg(() => 1)).toBe(ROAM_REST_MAX_MS);
  });
});

describe("roamer windows", () => {
  const work = { x: 0, y: 0, width: 1000, height: 1000 };
  const area = (x: number, peers: { x: number; y: number; width: number; height: number }[]) => ({ name: null, monitor: work, work, window: { x, y: 930, width: 160, height: 70 }, peers });

  it("fits the soul, its mob on either side and a bubble", () => {
    expect(roamerWidth(1)).toBe(160);
    expect(roamerWidth(2)).toBe(320);
  });

  it("only counts the windows on the same lane", () => {
    const window = { x: 0, y: 930, width: 160, height: 70 };
    expect(laneNeighbours(window, [{ x: 300, y: 930, width: 160, height: 70 }, { x: 600, y: 500, width: 160, height: 70 }])).toEqual([300]);
  });

  it("never walks into another window", async () => {
    const moves: number[] = [];
    const roamer = new Roamer({ area: async () => area(100, [{ x: 400, y: 930, width: 160, height: 70 }]), move: async (x) => (moves.push(x), [{ x: 400, y: 930, width: 160, height: 70 }]) }, () => 0);
    await roamer.refresh();
    for (let t = 0; t < 400; t++) roamer.tick(10_000 + t * 50, 50, 200, true);
    expect(moves.length).toBeGreaterThan(0);
    for (const x of moves) expect(Math.abs(x - 400)).toBeGreaterThanOrEqual(168);
  });

  it("stays put when every spot is taken", async () => {
    const moves: number[] = [];
    const peers = [{ x: 0, y: 930, width: 160, height: 70 }, { x: 840, y: 930, width: 160, height: 70 }, { x: 600, y: 930, width: 160, height: 70 }];
    const roamer = new Roamer({ area: async () => area(420, peers), move: async (x) => (moves.push(x), peers) }, () => 0.5);
    await roamer.refresh();
    for (let t = 0; t < 100; t++) roamer.tick(10_000 + t * 50, 50, 200, true);
    expect(moves).toEqual([]);
  });
});
