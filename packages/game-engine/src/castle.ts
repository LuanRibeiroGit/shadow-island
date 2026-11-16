import type { ActivityCategory, AgentState, Room } from "@ids/shared";

/**
 * The castle seen from above: a tile map with seven rooms around a central hall,
 * furniture, workstations and beds. Pure data + path finding so the "ecosystem"
 * (agents get out of bed, walk to work, come back to sleep) is unit-testable and
 * the renderer only draws what this module decides.
 */

export const MAP_W = 64;
export const MAP_H = 38;
export const TILE_PX = 16;

export type Floor = "floor_stone" | "floor_wood" | "floor_check" | "carpet" | "runner" | "rug";

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
  /** Props block walking unless flagged (rugs, chairs agents sit on). */
  walkable?: boolean;
}

/*
 * Layout (tiles). Top wing: library, throne room, treasury, watchtower. A long
 * gallery with a red runner crosses the castle; a second runner goes from the
 * throne down to the south hall. Bottom wing: forge, laboratory, south hall and
 * the dormitory with the beds.
 */
export const AREAS: RoomArea[] = [
  { room: "library", x: 1, y: 2, w: 16, h: 12, floor: "floor_wood" },
  { room: "throne", x: 19, y: 2, w: 22, h: 12, floor: "floor_check" },
  { room: "treasury", x: 43, y: 2, w: 12, h: 12, floor: "floor_wood" },
  { room: "watchtower", x: 57, y: 2, w: 6, h: 12, floor: "floor_stone" },
  { room: "hall", x: 1, y: 16, w: 62, h: 4, floor: "floor_check" },
  { room: "forge", x: 1, y: 22, w: 12, h: 14, floor: "floor_stone" },
  { room: "laboratory", x: 14, y: 22, w: 12, h: 14, floor: "floor_stone" },
  { room: "hall", x: 27, y: 22, w: 6, h: 14, floor: "floor_check" },
  { room: "barracks", x: 34, y: 22, w: 29, h: 14, floor: "floor_wood" },
];

interface Opening {
  x: number;
  y: number;
  w: number;
  h: number;
  floor?: Floor;
}

/** Openings through the walls (2 tiles thick between the wings and the gallery). */
const OPENINGS: Opening[] = [
  { x: 8, y: 14, w: 2, h: 2 },
  { x: 28, y: 14, w: 4, h: 2, floor: "floor_check" },
  { x: 48, y: 14, w: 2, h: 2 },
  { x: 59, y: 14, w: 2, h: 2 },
  { x: 6, y: 20, w: 2, h: 2 },
  { x: 19, y: 20, w: 2, h: 2 },
  { x: 27, y: 20, w: 6, h: 2, floor: "floor_check" },
  { x: 40, y: 20, w: 2, h: 2 },
  { x: 55, y: 20, w: 2, h: 2 },
  { x: 26, y: 28, w: 1, h: 2 },
  { x: 33, y: 28, w: 1, h: 2 },
];

/** Door tiles (every tile of every opening). */
export const DOORS: Point[] = OPENINGS.flatMap((o) => {
  const out: Point[] = [];
  for (let y = o.y; y < o.y + o.h; y++) for (let x = o.x; x < o.x + o.w; x++) out.push({ x, y });
  return out;
});

/** Red runners laid over the floors: the cross from the throne to the south hall. */
const RUNNERS: Opening[] = [
  { x: 29, y: 3, w: 2, h: 33 },
  { x: 2, y: 17, w: 60, h: 2 },
];

const row = (tile: string, xs: number[], y: number, extra: Partial<Prop> = {}): Prop[] => xs.map((x) => ({ tile, x, y, ...extra }));
const range = (a: number, b: number, step = 1) => Array.from({ length: Math.floor((b - a) / step) + 1 }, (_, i) => a + i * step);
/** A long table from x0 to x1 (inclusive) with chairs above and below. */
function table(x0: number, x1: number, y: number, top = "table_m"): Prop[] {
  return [
    { tile: "table_l", x: x0, y },
    ...range(x0 + 1, x1 - 1).map((x, i) => ({ tile: i % 2 === 1 ? top : "table_m", x, y })),
    { tile: "table_r", x: x1, y },
    ...row("chair_n", range(x0, x1, 2), y - 1, { walkable: true }),
    ...row("chair_s", range(x0, x1, 2), y + 1, { walkable: true }),
  ];
}

export const PROPS: Prop[] = [
  // Library: shelves on the back wall, two rows of long reading tables.
  ...row("bookshelf", [...range(1, 7), ...range(10, 16)], 2),
  ...table(3, 7, 6, "table_book"),
  ...table(10, 14, 6, "table_candle"),
  ...table(3, 7, 10, "table_candle"),
  ...table(10, 14, 10, "table_book"),
  ...row("plant", [1, 16], 13),
  // Throne room: throne at the head of the runner, pillars, benches, braziers.
  { tile: "throne", x: 29, y: 2 },
  { tile: "throne", x: 30, y: 2 },
  ...row("candles", [27, 32], 2),
  ...row("plant", [19, 40], 2),
  ...row("pillar", [23, 36], 4),
  ...row("pillar", [23, 36], 8),
  ...row("pillar", [23, 36], 12),
  ...row("bench", [19, 19, 19], 5).map((p, i) => ({ ...p, y: 5 + i * 3 })),
  ...row("bench", [40, 40, 40], 5).map((p, i) => ({ ...p, y: 5 + i * 3 })),
  ...row("crystal", [26, 33], 3, { min: 3 }),
  ...row("statue", [21, 38], 2, { min: 2 }),
  // Treasury: chests on the wall, a long ledger table, gold piles.
  ...row("chest", [44, 46, 51, 53], 2),
  ...table(45, 52, 7, "table_map"),
  ...row("gold", [43, 54], 12, { min: 4 }),
  ...row("gold", [48, 49], 2, { min: 5 }),
  ...row("barrel", [43, 54], 3),
  // Watchtower.
  { tile: "telescope", x: 60, y: 3 },
  { tile: "map_table", x: 59, y: 8 },
  ...row("barrel", [57, 62], 13),
  // Gallery: plants and benches along the walls (never in front of a door).
  ...row("plant", [3, 14, 24, 35, 45, 53, 62], 16),
  ...row("bench", [11, 12, 37, 38, 51], 16),
  ...row("plant", [3, 15, 24, 36, 47, 61], 19),
  ...row("bench", [10, 11, 44, 45, 52, 53], 19),
  ...row("rug", [5, 22, 36, 52], 17, { walkable: true, min: 2 }),
  // Forge.
  ...row("forge", [2, 6, 10], 22),
  ...row("anvil", [3, 8], 26),
  ...row("anvil", [3, 8], 30),
  { tile: "rack", x: 12, y: 22 },
  { tile: "rack", x: 12, y: 30 },
  ...row("barrel", [1, 12], 35),
  { tile: "barrel", x: 1, y: 34 },
  // Laboratory.
  ...row("bookshelf", [14, 15, 24, 25], 22),
  ...row("cauldron", [17, 22], 25),
  ...table(16, 22, 30, "table_flask"),
  ...row("crystal", [14, 25], 35, { min: 3 }),
  // South hall.
  ...row("pillar", [27, 32], 24),
  ...row("pillar", [27, 32], 30),
  ...row("plant", [27, 32], 35),
  ...row("statue", [27, 32], 27, { min: 2 }),
  // Dormitory: beds are separate (see BEDS); chests at the foot of the rows.
  ...row("chest", [35, 62], 35),
  ...row("rack", [62], 22),
  ...row("plant", [34], 22),
];

const BED_XS = [36, 38, 43, 45, 47, 49, 51, 53, 58, 60];
/** Bed tiles (in the dormitory). Agents sleep here when idle. */
export const BEDS: Point[] = [22, 26, 30].flatMap((y) => BED_XS.map((x) => ({ x, y })));

/** Where an agent with no free bed naps. */
export const NAP_SPOT: Point = { x: 48, y: 34 };

/** Where an agent stands to work in each room (chairs, in front of the furniture). */
export const STATIONS: Record<Room, Point[]> = {
  library: [{ x: 3, y: 5 }, { x: 5, y: 7 }, { x: 10, y: 5 }, { x: 12, y: 7 }, { x: 5, y: 9 }, { x: 12, y: 11 }, { x: 7, y: 11 }, { x: 14, y: 9 }],
  throne: [{ x: 28, y: 4 }, { x: 31, y: 4 }, { x: 25, y: 7 }, { x: 34, y: 7 }, { x: 28, y: 10 }, { x: 31, y: 10 }, { x: 20, y: 6 }, { x: 39, y: 6 }],
  treasury: [{ x: 45, y: 6 }, { x: 47, y: 8 }, { x: 49, y: 6 }, { x: 51, y: 8 }, { x: 44, y: 3 }, { x: 52, y: 3 }],
  watchtower: [{ x: 60, y: 4 }, { x: 59, y: 9 }, { x: 58, y: 5 }, { x: 61, y: 7 }, { x: 60, y: 11 }, { x: 58, y: 11 }],
  forge: [{ x: 2, y: 23 }, { x: 6, y: 23 }, { x: 10, y: 23 }, { x: 4, y: 26 }, { x: 9, y: 26 }, { x: 4, y: 30 }, { x: 9, y: 30 }],
  laboratory: [{ x: 17, y: 26 }, { x: 22, y: 26 }, { x: 16, y: 29 }, { x: 18, y: 31 }, { x: 20, y: 29 }, { x: 22, y: 31 }, { x: 16, y: 23 }],
  barracks: [{ x: 40, y: 33 }, { x: 46, y: 33 }, { x: 52, y: 33 }, { x: 58, y: 33 }],
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
  for (const o of OPENINGS) {
    for (let y = o.y; y < o.y + o.h; y++) {
      for (let x = o.x; x < o.x + o.w; x++) {
        kind[idx(x, y)] = "door";
        floor[idx(x, y)] = o.floor ?? "floor_stone";
        roomAt[idx(x, y)] = "hall";
        blocked[idx(x, y)] = false;
      }
    }
  }
  for (const r of RUNNERS) {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (kind[idx(x, y)] !== "wall") floor[idx(x, y)] = "runner";
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
