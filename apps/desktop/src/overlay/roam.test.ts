import { describe, expect, it } from "vitest";
import type { OverlayArea } from "../bridge/backend";
import { Roamer, freePositionOf, nextRoamTarget, roamBounds, roamSize, type RoamIo } from "./roam";

const area = (x = 1620, y = 930): OverlayArea => ({
  name: "HDMI-1",
  window: { x, y, width: 300, height: 110 },
  monitor: { x: 0, y: 0, width: 1920, height: 1080 },
  work: { x: 0, y: 0, width: 1920, height: 1040 },
});

function fakeIo(start: OverlayArea) {
  const moves: [number, number][] = [];
  let current = start;
  const io: RoamIo = {
    area: async () => current,
    move: async (x, y) => {
      moves.push([x, y]);
      current = { ...current, window: { ...current.window, x, y } };
    },
  };
  return { io, moves };
}

describe("roaming across the screen", () => {
  it("keeps the window inside the work area", () => {
    expect(roamBounds(area())).toEqual({ min: 0, max: 1620 });
  });

  it("always heads for the other side of the screen", () => {
    const bounds = { min: 0, max: 1620 };
    for (const seed of [1, 2.5, 7, 13.3]) {
      expect(nextRoamTarget(1500, bounds, seed)).toBeLessThanOrEqual(540);
      expect(nextRoamTarget(100, bounds, seed)).toBeGreaterThanOrEqual(1080);
    }
    expect(nextRoamTarget(10, { min: 50, max: 50 }, 3)).toBe(50);
  });

  it("is tall enough for the speech bubble and wide enough for the line", () => {
    expect(roamSize(64, 1, false)).toEqual({ width: 300, height: 70 });
    expect(roamSize(640, 2, true)).toEqual({ width: 640, height: 132 });
  });

  it("remembers the drop point relative to its monitor", () => {
    const second = { ...area(2400, 590), monitor: { x: 1920, y: 0, width: 2560, height: 1440 } };
    expect(freePositionOf(second)).toEqual({ monitor: "HDMI-1", x: 480, bottom: 700 });
    expect(freePositionOf({ ...second, name: null })).toBeNull();
  });

  it("walks the window along its floor only while the agent is walking", async () => {
    const { io, moves } = fakeIo(area());
    const r = new Roamer(io);
    await r.refresh();
    expect(r.tick(10_000, 100, 40, false)).toBeNull();
    expect(moves).toEqual([]);
    expect(r.tick(10_100, 100, 40, true)).toBeNull();
    await r.refresh();
    expect(r.tick(10_200, 100, 40, true)).toBe(-1);
    expect(moves).toEqual([[1616, 930]]);
  });

  it("follows the mouse while dragged and tells a click from a drag", async () => {
    const { io, moves } = fakeIo(area());
    const r = new Roamer(io);
    await r.refresh();
    expect(r.startDrag(500, 500)).toBe(true);
    r.dragTo(502, 501);
    expect(await r.endDrag()).toEqual({ moved: false, area: area() });
    expect(moves).toEqual([]);

    r.startDrag(500, 500);
    r.dragTo(400, 200);
    expect(r.tick(20_000, 100, 40, true)).toBeNull();
    const end = await r.endDrag();
    expect(end.moved).toBe(true);
    expect(end.area?.window).toMatchObject({ x: 1520, y: 630 });
    expect(moves).toEqual([[1520, 630]]);
  });
});
