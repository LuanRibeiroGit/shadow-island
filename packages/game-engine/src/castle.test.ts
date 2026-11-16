import { describe, expect, it } from "vitest";
import { ROOMS } from "@ids/shared";
import { AREAS, BEDS, BedRegistry, DOORS, PROPS, STATIONS, bedsideOf, buildMap, destinationFor, feetOf, findPath, fromIso, isWalkable, isoOfTile, roomOf, stepAlong, tileOf, toIso } from "./castle";

const map = buildMap();

describe("castle map", () => {
  it("has every room", () => {
    const rooms = new Set(AREAS.map((a) => a.room));
    for (const r of ROOMS) expect(rooms.has(r)).toBe(true);
  });

  it("puts props, beds and stations inside rooms", () => {
    for (const p of [...PROPS, ...BEDS, ...DOORS]) expect(roomOf(map, p)).not.toBeNull();
    for (const [room, list] of Object.entries(STATIONS)) {
      for (const s of list) {
        expect(isWalkable(map, s)).toBe(true);
        expect(roomOf(map, s)).toBe(room);
      }
    }
  });

  it("reaches every station and every bed from every bed", () => {
    for (const bed of BEDS) {
      const from = bedsideOf(map, bed);
      expect(isWalkable(map, from)).toBe(true);
      for (const list of Object.values(STATIONS)) {
        for (const s of list) expect(findPath(map, from, s), `${from.x},${from.y} -> ${s.x},${s.y}`).not.toBeNull();
      }
    }
  });

  it("paths go through doors, never walls", () => {
    const p = findPath(map, STATIONS.library[0]!, STATIONS.laboratory[0]!)!;
    for (let i = 1; i < p.length; i++) {
      expect(Math.abs(p[i]!.x - p[i - 1]!.x) + Math.abs(p[i]!.y - p[i - 1]!.y)).toBe(1);
      expect(isWalkable(map, p[i]!)).toBe(true);
    }
    expect(p.some((t) => DOORS.some((d) => d.x === t.x && d.y === t.y))).toBe(true);
  });
});

describe("ecosystem rules", () => {
  it("idle agents sleep, working agents go to the right room", () => {
    expect(destinationFor("IDLE", null)).toEqual({ kind: "bed" });
    expect(destinationFor("READING", "reading")).toEqual({ kind: "room", room: "library" });
    expect(destinationFor("EXPLORING", "web_research")).toEqual({ kind: "room", room: "watchtower" });
    expect(destinationFor("CODING", "editing")).toEqual({ kind: "room", room: "forge" });
    expect(destinationFor("TESTING", "testing")).toEqual({ kind: "room", room: "laboratory" });
    expect(destinationFor("COMBAT", "testing")).toEqual({ kind: "room", room: "laboratory" });
    expect(destinationFor("WAITING", null)).toEqual({ kind: "room", room: "throne" });
    expect(destinationFor("RUNNING", "version_control")).toEqual({ kind: "room", room: "treasury" });
    expect(destinationFor("SUCCESS", "editing")).toEqual({ kind: "stay" });
  });

  it("keeps beds stable and frees them", () => {
    const r = new BedRegistry();
    const a = r.assign(["a", "b"]);
    const b = r.assign(["b", "a", "c"]);
    expect(b.get("a")).toBe(a.get("a"));
    expect(b.get("b")).toBe(a.get("b"));
    const c = r.assign(["c", "d"]);
    expect(c.has("a")).toBe(false);
    expect(new Set(c.values()).size).toBe(2);
  });

  it("projects to isometric and back", () => {
    const p = { x: 123, y: 456 };
    const back = fromIso(toIso(p));
    expect(back.x).toBeCloseTo(p.x);
    expect(back.y).toBeCloseTo(p.y);
    // Moving +x goes right-down, +y goes left-down.
    const o = isoOfTile({ x: 5, y: 5 });
    expect(isoOfTile({ x: 6, y: 5 }).x).toBeGreaterThan(o.x);
    expect(isoOfTile({ x: 5, y: 6 }).x).toBeLessThan(o.x);
  });

  it("walks along a path at the given speed", () => {
    const path = findPath(map, { x: 16, y: 25 }, { x: 20, y: 25 })!;
    let pos = feetOf(path[0]!);
    let rest = path.slice(1);
    let t = 0;
    while (rest.length && t < 10_000) {
      const s = stepAlong(pos, rest, 100, 4);
      pos = { x: s.x, y: s.y };
      rest = s.path;
      t += 100;
    }
    expect(tileOf(pos)).toEqual({ x: 20, y: 25 });
    // 4 tiles at 4 tiles/s ≈ 1 s
    expect(t).toBeGreaterThanOrEqual(900);
    expect(t).toBeLessThanOrEqual(1100);
  });
});
