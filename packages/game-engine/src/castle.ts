import type { ActivityCategory, AgentState, Room } from "@ids/shared";

/**
 * The castle seen from above: a tile map with seven rooms around a central hall,
 * furniture, workstations and beds. Pure data + path finding so the "ecosystem"
 * (agents get out of bed, walk to work, come back to sleep) is unit-testable and
 * the renderer only draws what this module decides.
 */

export const MAP_W = 46;
export const MAP_H = 46;
export const TILE_PX = 16;

type StairSkin = "stone" | "cl" | "cm" | "cr";
/** `stair{h}_{skin}`: raised floor of the throne dais, h pixels above the ground. */
export type Floor = `stair${0 | 4 | 8 | 12}_${StairSkin}` | "floor_dark" | "floor_stone" | "floor_wood" | "floor_check" | "carpet" | "runner" | "rug" | "path" | "earth" | "plaza" | "rune" | "dais";

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
 * A cursed island floating in the mist. A plaza with a spectral fountain in the
 * middle; the King's Hall (throne) up north; library, forge, laboratory,
 * watchtower, dormitory and treasury around it, each a walled room opening to
 * the plaza through a stone path.
 */
export const PLAZA = { x: 23, y: 24, r: 6.5 };

export const AREAS: RoomArea[] = [
  { room: "throne", x: 17, y: 3, w: 13, h: 10, floor: "floor_dark" },
  { room: "library", x: 3, y: 8, w: 10, h: 9, floor: "floor_wood" },
  { room: "forge", x: 34, y: 7, w: 9, h: 8, floor: "floor_stone" },
  { room: "laboratory", x: 35, y: 20, w: 8, h: 9, floor: "floor_dark" },
  { room: "watchtower", x: 3, y: 22, w: 8, h: 7, floor: "floor_stone" },
  { room: "barracks", x: 15, y: 34, w: 12, h: 8, floor: "floor_wood" },
  { room: "treasury", x: 31, y: 34, w: 9, h: 8, floor: "floor_wood" },
];

interface Opening {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Doors through the room walls (each wall is 1 tile thick). */
const OPENINGS: Opening[] = [
  { x: 21, y: 13, w: 5, h: 1 },
  { x: 13, y: 13, w: 1, h: 2 },
  { x: 37, y: 15, w: 2, h: 1 },
  { x: 34, y: 23, w: 1, h: 3 },
  { x: 11, y: 24, w: 1, h: 3 },
  { x: 20, y: 33, w: 3, h: 1 },
  { x: 34, y: 33, w: 2, h: 1 },
];

/** Stone paths from the doors to the plaza (rectangles of path floor). */
const PATHS: Opening[] = [
  { x: 21, y: 14, w: 5, h: 5 },
  { x: 14, y: 13, w: 3, h: 3 },
  { x: 15, y: 15, w: 3, h: 5 },
  { x: 36, y: 16, w: 3, h: 3 },
  { x: 29, y: 17, w: 8, h: 3 },
  { x: 29, y: 23, w: 5, h: 3 },
  { x: 12, y: 24, w: 5, h: 3 },
  { x: 20, y: 30, w: 3, h: 3 },
  { x: 27, y: 29, w: 3, h: 3 },
  { x: 28, y: 31, w: 8, h: 2 },
];

/** Door tiles (every tile of every opening). */
export const DOORS: Point[] = OPENINGS.flatMap((o) => {
  const out: Point[] = [];
  for (let y = o.y; y < o.y + o.h; y++) for (let x = o.x; x < o.x + o.w; x++) out.push({ x, y });
  return out;
});

const row = (tile: string, xs: number[], y: number, extra: Partial<Prop> = {}): Prop[] => xs.map((x) => ({ tile, x, y, ...extra }));
const col = (tile: string, x: number, ys: number[], extra: Partial<Prop> = {}): Prop[] => ys.map((y) => ({ tile, x, y, ...extra }));
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
  // King's Hall: a throne of swords on a stepped dais at the head of the royal carpet,
  // ghost-fire braziers at its corners, guardian statues, candelabra and pillars.
  { tile: "throne_big", x: 23, y: 4 },
  ...row("brazier", [21, 25], 5),
  ...row("brazier", [21, 25], 7),
  ...row("knight_statue", [19, 27], 3),
  ...row("knight_statue", [18, 28], 6),
  ...row("candelabra", [20, 26], 4),
  ...row("candelabra", [20, 26], 9),
  ...col("pillar", 19, [8, 11]),
  ...col("pillar", 27, [8, 11]),
  ...row("crystal", [17, 29], 12, { min: 3 }),
  ...row("statue", [17, 29], 6, { min: 2 }),
  // Library.
  ...row("bookshelf", range(3, 12), 8),
  ...table(4, 8, 12, "table_book"),
  ...table(4, 8, 15, "table_candle"),
  { tile: "orb", x: 11, y: 12 },
  ...col("bookshelf_side", 3, [11, 12, 13]),
  // Forge.
  ...row("forge", [35, 39], 7),
  ...row("anvil", [36, 40], 10),
  { tile: "rack", x: 42, y: 7 },
  ...row("barrel", [34, 42], 14),
  { tile: "brazier", x: 42, y: 11 },
  // The Arena (the one place where work happens): ghost-fire at the corners,
  // weapon racks on the back wall, a rune ring on the floor.
  ...row("brazier", [35, 42], 20),
  ...row("brazier", [35, 42], 28),
  ...row("rack", [37, 40], 20),
  ...row("crystal", [42], 24, { min: 3 }),
  // Watchtower: the seeing orb and the telescope.
  { tile: "orb", x: 6, y: 24 },
  { tile: "telescope", x: 4, y: 22 },
  { tile: "map_table", x: 8, y: 27 },
  ...row("lantern", [3, 10], 28),
  // Dormitory: beds are separate (see BEDS).
  ...row("chest", [15, 26], 41),
  { tile: "brazier", x: 26, y: 34 },
  // Treasury.
  ...row("chest", [32, 34, 37, 39], 34),
  ...row("gold", [33, 36, 38], 37),
  ...row("gold", [32, 35, 39], 40, { min: 4 }),
  { tile: "map_table", x: 36, y: 39 },
  ...row("brazier", [31], 41),
  // Plaza: the spectral fountain and lanterns around it.
  { tile: "fountain", x: PLAZA.x, y: PLAZA.y },
  ...[
    [18, 20],
    [28, 20],
    [18, 28],
    [28, 28],
  ].map(([x, y]) => ({ tile: "lantern", x: x!, y: y! })),
];

/** Tiles around the fountain that block walking (it is wider than one tile). */
/**
 * The King's dais: a platform (x 21..25, y 3..5) 12 px above the hall, two steps
 * down in front of it, and the royal carpet from the throne to the door.
 */
function throneDais(): { x: number; y: number; floor: Floor }[] {
  const out: { x: number; y: number; floor: Floor }[] = [];
  const skin = (x: number): StairSkin => (x === 22 ? "cl" : x === 23 ? "cm" : x === 24 ? "cr" : "stone");
  for (let y = 3; y <= 5; y++) for (let x = 21; x <= 25; x++) out.push({ x, y, floor: `stair12_${y === 3 ? "stone" : skin(x)}` });
  for (let x = 22; x <= 24; x++) out.push({ x, y: 6, floor: `stair8_${skin(x)}` }, { x, y: 7, floor: `stair4_${skin(x)}` });
  for (let y = 8; y <= 12; y++) for (let x = 22; x <= 24; x++) out.push({ x, y, floor: `stair0_${skin(x)}` });
  return out;
}
/** Sides of the dais: nobody climbs it except by the steps. */
const DAIS_BLOCK: Point[] = [3, 4, 5].flatMap((y) => [21, 25].map((x) => ({ x, y }))).concat([{ x: 22, y: 3 }, { x: 23, y: 3 }, { x: 24, y: 3 }, { x: 22, y: 4 }, { x: 24, y: 4 }, { x: 21, y: 6 }, { x: 25, y: 6 }, { x: 20, y: 5 }, { x: 26, y: 5 }, { x: 20, y: 3 }, { x: 26, y: 3 }]);

/** The single room where agents work: every working agent fights its task here. */
export const WORK_ROOM: Room = "laboratory";

/** Height (px) of the floor under a tile: the throne dais and its steps. */
export function heightAtTile(map: CastleMap, x: number, y: number): number {
  const f = x >= 0 && y >= 0 && x < MAP_W && y < MAP_H ? map.floor[y * MAP_W + x] : null;
  return f && f.startsWith("stair") ? Number.parseInt(f.slice(5), 10) : 0;
}

const FOUNTAIN_BLOCK: Point[] = range(-1, 1).flatMap((dx) => range(-1, 1).map((dy) => ({ x: PLAZA.x + dx, y: PLAZA.y + dy })));

/** Bed tiles (in the dormitory). Agents sleep here when idle. */
export const BEDS: Point[] = [34, 37, 40].flatMap((y) => [16, 18, 22, 24].map((x) => ({ x, y })));

/** Where an agent with no free bed naps. */
export const NAP_SPOT: Point = { x: 20, y: 38 };

/** Where an agent stands to work in each room (chairs, in front of the furniture). */
export const STATIONS: Record<Room, Point[]> = {
  throne: [{ x: 22, y: 9 }, { x: 24, y: 9 }, { x: 21, y: 8 }, { x: 25, y: 8 }, { x: 23, y: 10 }, { x: 20, y: 11 }, { x: 26, y: 11 }],
  library: [{ x: 4, y: 11 }, { x: 6, y: 13 }, { x: 8, y: 11 }, { x: 4, y: 14 }, { x: 6, y: 16 }, { x: 10, y: 12 }, { x: 11, y: 9 }],
  forge: [{ x: 35, y: 8 }, { x: 39, y: 8 }, { x: 37, y: 10 }, { x: 41, y: 10 }, { x: 36, y: 12 }, { x: 40, y: 13 }],
  // Fighters stand two tiles apart, each with room for a foe on its right.
  laboratory: [22, 24, 26].flatMap((y) => [38, 36, 40].map((x) => ({ x, y }))),
  watchtower: [{ x: 6, y: 25 }, { x: 5, y: 23 }, { x: 8, y: 24 }, { x: 7, y: 27 }, { x: 4, y: 26 }, { x: 9, y: 26 }],
  treasury: [{ x: 33, y: 35 }, { x: 36, y: 35 }, { x: 34, y: 38 }, { x: 37, y: 38 }, { x: 33, y: 40 }],
  barracks: [{ x: 20, y: 36 }, { x: 20, y: 39 }, { x: 25, y: 37 }],
};

/** Land of the island (walkable earth): around rooms, paths and the plaza. */
function isLand(x: number, y: number): boolean {
  const near = (r: Opening, m: number) => x >= r.x - m && x < r.x + r.w + m && y >= r.y - m && y < r.y + r.h + m;
  if (Math.hypot(x - PLAZA.x, y - PLAZA.y) <= PLAZA.r + 3.2) return true;
  // A wobbly margin so the coast is not a straight line.
  const wob = ((x * 7 + y * 13) % 5) / 5;
  return AREAS.some((a) => near(a, 2 + (wob > 0.5 ? 1 : 0))) || PATHS.some((p) => near(p, 2));
}

export type TileKind = "wall" | "floor" | "door" | "void";

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
  const kind: TileKind[] = Array(n).fill("void");
  const floor: (Floor | null)[] = Array(n).fill(null);
  const roomAt: (Room | "hall" | null)[] = Array(n).fill(null);
  const blocked: boolean[] = Array(n).fill(true);
  const open = (x: number, y: number, f: Floor, room: Room | "hall" | null, k: TileKind = "floor") => {
    if (!inMap(x, y)) return;
    kind[idx(x, y)] = k;
    floor[idx(x, y)] = f;
    roomAt[idx(x, y)] = room;
    blocked[idx(x, y)] = false;
  };
  // Island ground.
  for (let y = 1; y < MAP_H - 1; y++) for (let x = 1; x < MAP_W - 1; x++) if (isLand(x, y)) open(x, y, "earth", null);
  // Plaza with a ring of glowing runes.
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const d = Math.hypot(x - PLAZA.x, y - PLAZA.y);
      if (d <= PLAZA.r) open(x, y, Math.abs(d - 4.6) < 0.5 ? "rune" : "plaza", "hall");
    }
  }
  for (const p of PATHS) for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) open(x, y, "path", "hall");
  // Rooms: a wall ring, then the floor.
  for (const a of AREAS) {
    for (let y = a.y - 1; y <= a.y + a.h; y++) {
      for (let x = a.x - 1; x <= a.x + a.w; x++) {
        if (!inMap(x, y)) continue;
        kind[idx(x, y)] = "wall";
        floor[idx(x, y)] = null;
        roomAt[idx(x, y)] = null;
        blocked[idx(x, y)] = true;
      }
    }
  }
  for (const a of AREAS) for (let y = a.y; y < a.y + a.h; y++) for (let x = a.x; x < a.x + a.w; x++) open(x, y, a.floor, a.room);
  for (const o of OPENINGS) for (let y = o.y; y < o.y + o.h; y++) for (let x = o.x; x < o.x + o.w; x++) open(x, y, "path", "hall", "door");
  // The King's Hall: runner from the door to the dais, dais under the throne.
  for (const t of throneDais()) floor[idx(t.x, t.y)] = t.floor;
  // The Arena's rune ring.
  for (let y = 21; y <= 27; y++) for (let x = 36; x <= 41; x++) if (x === 36 || x === 41 || y === 21 || y === 27) floor[idx(x, y)] = "rune";
  for (const p of DAIS_BLOCK) blocked[idx(p.x, p.y)] = true;
  for (const p of PROPS) if (!p.walkable) blocked[idx(p.x, p.y)] = true;
  for (const p of FOUNTAIN_BLOCK) blocked[idx(p.x, p.y)] = true;
  for (const b of BEDS) blocked[idx(b.x, b.y)] = true;
  const m = { kind, floor, blocked, roomAt };
  for (const d of islandDecor(m)) blocked[idx(d.x, d.y)] = true;
  return m;
}

/**
 * Decorations scattered on the island (dead trees, graves, crystals, lanterns),
 * deterministic, never on paths, doors or next to room walls.
 */
export function islandDecor(m: CastleMap): Prop[] {
  const out: Prop[] = [];
  const kinds = ["tree_dead", "tree_dead", "grave", "grave", "crystal", "lantern", "broken_pillar", "tree_dead"];
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const i = idx(x, y);
      if (m.floor[i] !== "earth") continue;
      let clear = true;
      for (let dy = -1; dy <= 1 && clear; dy++) for (let dx = -1; dx <= 1 && clear; dx++) {
        const j = inMap(x + dx, y + dy) ? idx(x + dx, y + dy) : -1;
        if (j >= 0 && m.kind[j] !== "void" && m.floor[j] !== "earth") clear = false;
      }
      if (!clear) continue;
      const h = (x * 73856093) ^ (y * 19349663);
      if (Math.abs(h) % 7 !== 0) continue;
      out.push({ tile: kinds[Math.abs(h >> 3) % kinds.length]!, x, y });
    }
  }
  return out;
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
    const ty = target.y * TILE_PX + TILE_PX / 2;
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
export const feetOf = (p: Point) => ({ x: p.x * TILE_PX + TILE_PX / 2, y: p.y * TILE_PX + TILE_PX / 2 });
export const tileOf = (px: { x: number; y: number }): Point => ({ x: Math.floor(px.x / TILE_PX), y: Math.floor(px.y / TILE_PX) });

/**
 * Isometric projection used by the castle renderer: grid pixels (TILE_PX per tile)
 * to screen pixels, with 2:1 diamonds of ISO_W x ISO_H.
 */
export const ISO_W = 32;
export const ISO_H = 16;
/** Height of the back walls in screen pixels (room above the map for them). */
export const ISO_WALL = 64;
export const ISO_ORIGIN = { x: MAP_H * (ISO_W / 2), y: ISO_WALL + 8 };
export const ISO_SIZE = { w: (MAP_W + MAP_H) * (ISO_W / 2), h: (MAP_W + MAP_H) * (ISO_H / 2) + ISO_WALL + 80 };

export function toIso(px: { x: number; y: number }): { x: number; y: number } {
  const gx = px.x / TILE_PX;
  const gy = px.y / TILE_PX;
  return { x: ISO_ORIGIN.x + (gx - gy) * (ISO_W / 2), y: ISO_ORIGIN.y + (gx + gy) * (ISO_H / 2) };
}

export function fromIso(s: { x: number; y: number }): { x: number; y: number } {
  const a = (s.x - ISO_ORIGIN.x) / (ISO_W / 2);
  const b = (s.y - ISO_ORIGIN.y) / (ISO_H / 2);
  return { x: ((a + b) / 2) * TILE_PX, y: ((b - a) / 2) * TILE_PX };
}

/** Screen position of a tile's centre. */
export const isoOfTile = (p: Point) => toIso(feetOf(p));
