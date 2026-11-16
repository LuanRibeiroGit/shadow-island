import type { ActivityCategory, AgentState, Room } from "@ids/shared";

/**
 * The castle seen from above: a tile map with seven rooms around a central hall,
 * furniture, workstations and beds. Pure data + path finding so the "ecosystem"
 * (agents get out of bed, walk to work, come back to sleep) is unit-testable and
 * the renderer only draws what this module decides.
 */

export const MAP_W = 32;
export const MAP_H = 21;
export const TILE_PX = 16;

export type Floor = "floor_stone" | "floor_wood" | "carpet" | "rug";

export interface Point {
  x: number;
  y: number;
}

export interface RoomArea {
  room: Room | "hall";
  /** Interior, in tiles (inclusive start, exclusive end). */
  x: number;
  y: number;
  w: number;
  h: number;
  floor: Floor;
}

export interface Prop {
  tile: string;
  x: number;
  y: number;
  /** Minimum restoration level (real completed missions) for it to appear. */
  min?: number;
  /** Props block walking unless flagged. */
  walkable?: boolean;
}

const TOP_Y = 1;
const TOP_H = 7;
const HALL_Y = 9;
const HALL_H = 3;
const BOTTOM_Y = 13;
const BOTTOM_H = 7;

export const AREAS: RoomArea[] = [
  { room: "library", x: 1, y: TOP_Y, w: 7, h: TOP_H, floor: "floor_wood" },
  { room: "throne", x: 9, y: TOP_Y, w: 7, h: TOP_H, floor: "carpet" },
  { room: "treasury", x: 17, y: TOP_Y, w: 7, h: TOP_H, floor: "floor_stone" },
  { room: "watchtower", x: 25, y: TOP_Y, w: 6, h: TOP_H, floor: "floor_stone" },
  { room: "hall", x: 1, y: HALL_Y, w: 30, h: HALL_H, floor: "floor_stone" },
  { room: "forge", x: 1, y: BOTTOM_Y, w: 9, h: BOTTOM_H, floor: "floor_stone" },
  { room: "laboratory", x: 11, y: BOTTOM_Y, w: 9, h: BOTTOM_H, floor: "floor_stone" },
  { room: "barracks", x: 21, y: BOTTOM_Y, w: 10, h: BOTTOM_H, floor: "floor_wood" },
];

/** Openings in the walls between rooms and the hall. */
export const DOORS: Point[] = [
  { x: 4, y: 8 },
  { x: 12, y: 8 },
  { x: 20, y: 8 },
  { x: 27, y: 8 },
  { x: 5, y: 12 },
  { x: 15, y: 12 },
  { x: 25, y: 12 },
];

export const PROPS: Prop[] = [
  // Library: shelves on the back wall, reading desks.
  ...[1, 2, 3, 5, 6, 7].map((x) => ({ tile: "bookshelf", x, y: 1 })),
  { tile: "desk", x: 2, y: 4 },
  { tile: "desk", x: 5, y: 4 },
  { tile: "candles", x: 7, y: 6, min: 1 },
  { tile: "stool", x: 2, y: 5, walkable: true },
  // Throne room.
  { tile: "throne", x: 12, y: 2 },
  { tile: "candles", x: 10, y: 1 },
  { tile: "candles", x: 14, y: 1 },
  { tile: "crystal", x: 9, y: 7, min: 3 },
  { tile: "crystal", x: 15, y: 7, min: 3 },
  // Treasury.
  { tile: "chest", x: 17, y: 1 },
  { tile: "chest", x: 23, y: 1 },
  { tile: "map_table", x: 20, y: 3 },
  { tile: "gold", x: 18, y: 6, min: 4 },
  { tile: "gold", x: 22, y: 6, min: 4 },
  { tile: "gold", x: 20, y: 1, min: 5 },
  // Watchtower.
  { tile: "telescope", x: 28, y: 2 },
  { tile: "map_table", x: 26, y: 5 },
  { tile: "barrel", x: 30, y: 7 },
  // Hall.
  ...[3, 8, 13, 18, 23, 28].map((x) => ({ tile: "rug", x, y: 10, walkable: true, min: 2 })),
  // Forge.
  { tile: "forge", x: 2, y: 13 },
  { tile: "forge", x: 6, y: 13 },
  { tile: "anvil", x: 3, y: 16 },
  { tile: "anvil", x: 7, y: 16 },
  { tile: "rack", x: 9, y: 13 },
  { tile: "barrel", x: 1, y: 19 },
  { tile: "barrel", x: 9, y: 19 },
  // Laboratory.
  { tile: "cauldron", x: 13, y: 14 },
  { tile: "cauldron", x: 17, y: 14 },
  { tile: "crystal", x: 19, y: 13, min: 3 },
  { tile: "desk", x: 12, y: 18 },
  { tile: "bookshelf", x: 11, y: 13 },
  // Barracks: beds are separate (see BEDS).
  { tile: "rack", x: 30, y: 19 },
  { tile: "barrel", x: 21, y: 19 },
];

/** Bed tiles (in the barracks). Agents sleep here when idle. */
export const BEDS: Point[] = [
  ...[22, 24, 26, 28, 30].map((x) => ({ x, y: 13 })),
  ...[22, 24, 26, 28, 30].map((x) => ({ x, y: 16 })),
  ...[23, 25, 27].map((x) => ({ x, y: 19 })),
];

/** Where an agent stands to work in each room (in front of the furniture). */
export const STATIONS: Record<Room, Point[]> = {
  library: [{ x: 2, y: 5 }, { x: 5, y: 5 }, { x: 3, y: 2 }, { x: 6, y: 2 }, { x: 4, y: 6 }, { x: 1, y: 6 }],
  throne: [{ x: 11, y: 4 }, { x: 13, y: 4 }, { x: 12, y: 5 }, { x: 10, y: 6 }, { x: 14, y: 6 }, { x: 12, y: 7 }],
  treasury: [{ x: 19, y: 3 }, { x: 21, y: 3 }, { x: 17, y: 2 }, { x: 23, y: 2 }, { x: 20, y: 5 }, { x: 18, y: 4 }],
  watchtower: [{ x: 28, y: 3 }, { x: 26, y: 6 }, { x: 27, y: 5 }, { x: 29, y: 4 }, { x: 25, y: 3 }, { x: 30, y: 5 }],
  forge: [{ x: 2, y: 14 }, { x: 6, y: 14 }, { x: 3, y: 17 }, { x: 7, y: 17 }, { x: 5, y: 15 }, { x: 4, y: 18 }],
  laboratory: [{ x: 13, y: 15 }, { x: 17, y: 15 }, { x: 15, y: 16 }, { x: 12, y: 17 }, { x: 19, y: 14 }, { x: 15, y: 18 }],
  barracks: [{ x: 23, y: 15 }, { x: 27, y: 15 }, { x: 25, y: 18 }, { x: 29, y: 18 }],
};

export type TileKind = "wall" | "floor" | "door";

export interface CastleMap {
  kind: TileKind[];
  floor: (Floor | null)[];
  blocked: boolean[];
  roomAt: (Room | "hall" | null)[];
}

const idx = (x: number, y: number) => y * MAP_W + x;
export const inMap = (x: number, y: number) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;

export function buildMap(): CastleMap {
  const n = MAP_W * MAP_H;
  const kind: TileKind[] = Array(n).fill("wall");
  const floor: (Floor | null)[] = Array(n).fill(null);
  const roomAt: (Room | "hall" | null)[] = Array(n).fill(null);
  const blocked: boolean[] = Array(n).fill(true);
  for (const a of AREAS) {
    for (let y = a.y; y < a.y + a.h; y++) {
      for (let x = a.x; x < a.x + a.w; x++) {
        kind[idx(x, y)] = "floor";
        floor[idx(x, y)] = a.floor;
        roomAt[idx(x, y)] = a.room;
        blocked[idx(x, y)] = false;
      }
    }
  }
  for (const d of DOORS) {
    kind[idx(d.x, d.y)] = "door";
    floor[idx(d.x, d.y)] = "floor_stone";
    roomAt[idx(d.x, d.y)] = "hall";
    blocked[idx(d.x, d.y)] = false;
  }
  for (const p of PROPS) if (!p.walkable) blocked[idx(p.x, p.y)] = true;
  for (const b of BEDS) blocked[idx(b.x, b.y)] = true;
  return { kind, floor, blocked, roomAt };
}

export function isWalkable(m: CastleMap, p: Point): boolean {
  return inMap(p.x, p.y) && !m.blocked[idx(p.x, p.y)];
}

/** Room (or hall) under a tile, for clicks and highlights. */
export function roomOf(m: CastleMap, p: Point): Room | "hall" | null {
  return inMap(p.x, p.y) ? (m.roomAt[idx(p.x, p.y)] ?? null) : null;
}

/** The tile an agent stands on to get into a bed (just below it, or above for the last row). */
export function bedsideOf(m: CastleMap, bed: Point): Point {
  const below = { x: bed.x, y: bed.y + 1 };
  if (isWalkable(m, below)) return below;
  const above = { x: bed.x, y: bed.y - 1 };
  if (isWalkable(m, above)) return above;
  return { x: bed.x - 1, y: bed.y };
}

/** A* on the 4-neighbour grid. Returns the path including start and goal, or null. */
export function findPath(m: CastleMap, from: Point, to: Point): Point[] | null {
  if (!inMap(from.x, from.y) || !inMap(to.x, to.y)) return null;
  const goal = idx(to.x, to.y);
  const start = idx(from.x, from.y);
  if (start === goal) return [from];
  if (m.blocked[goal]) return null;
  const g = new Map<number, number>([[start, 0]]);
  const came = new Map<number, number>();
  const open: { i: number; f: number }[] = [{ i: start, f: 0 }];
  const h = (i: number) => Math.abs((i % MAP_W) - to.x) + Math.abs(Math.floor(i / MAP_W) - to.y);
  const closed = new Set<number>();
  while (open.length) {
    open.sort((a, b) => a.f - b.f);
    const cur = open.shift()!.i;
    if (cur === goal) {
      const path: Point[] = [];
      let c: number | undefined = cur;
      while (c !== undefined) {
        path.push({ x: c % MAP_W, y: Math.floor(c / MAP_W) });
        c = came.get(c);
      }
      return path.reverse();
    }
    if (closed.has(cur)) continue;
    closed.add(cur);
    const cx = cur % MAP_W;
    const cy = Math.floor(cur / MAP_W);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!inMap(nx, ny)) continue;
      const ni = idx(nx, ny);
      // The start tile may be "blocked" (an agent lying in bed): leaving is allowed.
      if (m.blocked[ni] || closed.has(ni)) continue;
      const ng = g.get(cur)! + 1;
      if (ng < (g.get(ni) ?? Infinity)) {
        g.set(ni, ng);
        came.set(ni, cur);
        open.push({ i: ni, f: ng + h(ni) });
      }
    }
  }
  return null;
}

export type Destination = { kind: "bed" } | { kind: "room"; room: Room } | { kind: "stay" };

/**
 * Where an agent should be, from its REAL state and activity. Idle agents sleep;
 * working ones go to the room of what they are doing; short-lived states
 * (success, error) are played where the agent already is.
 */
export function destinationFor(state: AgentState, activity: ActivityCategory | null): Destination {
  switch (state) {
    case "IDLE":
      return { kind: "bed" };
    case "SUCCESS":
    case "ERROR":
      return { kind: "stay" };
    case "WAITING":
      return { kind: "room", room: "throne" };
    case "TESTING":
    case "COMBAT":
      return { kind: "room", room: "laboratory" };
    case "CODING":
    case "BUILDING":
      return { kind: "room", room: "forge" };
    case "READING":
    case "EXPLORING":
      return { kind: "room", room: activity === "web_research" ? "watchtower" : "library" };
    case "RUNNING":
      switch (activity) {
        case "planning":
          return { kind: "room", room: "watchtower" };
        case "delegating":
        case "asking":
          return { kind: "room", room: "throne" };
        case "version_control":
        case "mcp":
          return { kind: "room", room: "treasury" };
        case "web_research":
          return { kind: "room", room: "watchtower" };
        case "reading":
        case "searching":
          return { kind: "room", room: "library" };
        case "testing":
          return { kind: "room", room: "laboratory" };
        default:
          return { kind: "room", room: "forge" };
      }
  }
}

/**
 * Stable assignment of beds to agents: an agent keeps its bed while it exists,
 * new agents take the first free one. Extra agents (more than beds) get none and
 * nap on the barracks floor.
 */
export class BedRegistry {
  private byAgent = new Map<string, number>();

  assign(ids: readonly string[]): Map<string, number> {
    const alive = new Set(ids);
    for (const id of [...this.byAgent.keys()]) if (!alive.has(id)) this.byAgent.delete(id);
    const used = new Set(this.byAgent.values());
    for (const id of ids) {
      if (this.byAgent.has(id)) continue;
      const free = BEDS.findIndex((_, i) => !used.has(i));
      if (free < 0) continue;
      this.byAgent.set(id, free);
      used.add(free);
    }
    return new Map(this.byAgent);
  }

  release(id: string) {
    this.byAgent.delete(id);
  }
}

/** Pick a station in a room for an agent: first free one, else share by index. */
export function stationFor(room: Room, taken: ReadonlySet<string>, order: number): Point {
  const list = STATIONS[room];
  const free = list.find((p) => !taken.has(`${p.x},${p.y}`));
  return free ?? list[order % list.length]!;
}

/** Move along a path at `speed` tiles/second. Returns the new pixel position and the remaining path. */
export function stepAlong(pos: { x: number; y: number }, path: Point[], dtMs: number, speedTiles: number): { x: number; y: number; path: Point[]; dx: number } {
  let budget = (speedTiles * TILE_PX * dtMs) / 1000;
  let { x, y } = pos;
  let rest = path;
  let dx = 0;
  while (budget > 0 && rest.length) {
    const target = rest[0]!;
    const tx = target.x * TILE_PX + TILE_PX / 2;
    const ty = target.y * TILE_PX + TILE_PX - 2;
    const ddx = tx - x;
    const ddy = ty - y;
    const dist = Math.hypot(ddx, ddy);
    if (ddx !== 0) dx = Math.sign(ddx);
    if (dist <= budget) {
      x = tx;
      y = ty;
      budget -= dist;
      rest = rest.slice(1);
    } else {
      x += (ddx / dist) * budget;
      y += (ddy / dist) * budget;
      budget = 0;
    }
  }
  return { x, y, path: rest, dx };
}

/** Pixel position where a character standing on a tile has its feet. */
export const feetOf = (p: Point) => ({ x: p.x * TILE_PX + TILE_PX / 2, y: p.y * TILE_PX + TILE_PX - 2 });
export const tileOf = (px: { x: number; y: number }): Point => ({ x: Math.floor(px.x / TILE_PX), y: Math.floor((px.y - 1) / TILE_PX) });
