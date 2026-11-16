import { describe, expect, it } from "vitest";
import { ROOMS, restorationLevel, roomAt, slotsFor, CASTLE_W, CASTLE_H } from "./layout";

describe("castle layout", () => {
  it("has every room inside the canvas and no overlaps", () => {
    for (const r of ROOMS) {
      expect(r.x + r.w).toBeLessThanOrEqual(CASTLE_W);
      expect(r.y + r.h).toBeLessThanOrEqual(CASTLE_H);
    }
    expect(new Set(ROOMS.map((r) => r.room)).size).toBe(7);
    expect(roomAt(200, 120)?.room).toBe("throne");
    expect(roomAt(10, 200)?.room).toBe("laboratory");
  });
  it("restoration follows real completed missions", () => {
    expect(restorationLevel(0)).toBe(0);
    expect(restorationLevel(1)).toBe(1);
    expect(restorationLevel(49)).toBe(2);
    expect(restorationLevel(1000)).toBe(5);
  });
  it("spreads slots on the floor", () => {
    const s = slotsFor(ROOMS[1]!, 3);
    expect(s).toHaveLength(3);
    expect(s[0]!.x).toBeLessThan(s[2]!.x);
  });
});
