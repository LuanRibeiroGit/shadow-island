import type { Room } from "@ids/shared";

/** Castle cross-section in internal pixels (rendered at an integer scale). */
export const CASTLE_W = 480;
export const CASTLE_H = 288;

export interface RoomLayout {
  room: Room;
  x: number;
  y: number;
  w: number;
  h: number;
  /** [tile, column, row-from-floor, minRestorationLevel?] decorations. */
  decor: [string, number, number, number?][];
  floor: "floor_stone" | "floor_wood" | "rug";
  wall: "wall" | "wall_dark";
}

export const ROOMS: RoomLayout[] = [
  {
    room: "watchtower", x: 176, y: 8, w: 128, h: 72, wall: "wall_dark", floor: "floor_stone",
    decor: [["window", 1, 2], ["window", 6, 2], ["telescope", 5, 1], ["map_table", 2, 1], ["torch", 4, 2, 1], ["crystal", 7, 1, 3]],
  },
  {
    room: "library", x: 0, y: 80, w: 160, h: 100, wall: "wall", floor: "floor_wood",
    decor: [["bookshelf", 0, 1], ["bookshelf", 0, 2], ["bookshelf", 1, 1], ["bookshelf", 1, 2], ["window", 4, 3], ["bookshelf", 8, 1], ["bookshelf", 8, 2], ["desk", 5, 1], ["candle", 5, 2], ["torch", 7, 3, 1], ["banner", 3, 3, 2]],
  },
  {
    room: "throne", x: 160, y: 80, w: 160, h: 100, wall: "wall", floor: "rug",
    decor: [["banner", 2, 2], ["banner", 7, 2], ["throne", 4, 1], ["window", 4, 3], ["torch", 1, 3, 1], ["torch", 8, 3, 1], ["pillar", 0, 1], ["pillar", 0, 2], ["pillar", 9, 1], ["pillar", 9, 2], ["crystal", 6, 1, 3]],
  },
  {
    room: "forge", x: 320, y: 80, w: 160, h: 100, wall: "wall_dark", floor: "floor_stone",
    decor: [["forge", 7, 1], ["forge", 8, 1], ["anvil", 5, 1], ["rack", 1, 2], ["barrel", 0, 1], ["barrel", 9, 1], ["torch", 3, 3, 1], ["banner", 5, 3, 2]],
  },
  {
    room: "laboratory", x: 0, y: 180, w: 160, h: 100, wall: "wall_dark", floor: "floor_stone",
    decor: [["cauldron", 6, 1], ["crystal", 8, 1], ["desk", 2, 1], ["candle", 2, 2], ["bookshelf", 0, 1], ["window", 4, 3], ["torch", 7, 3, 1], ["crystal", 9, 2, 3]],
  },
  {
    room: "treasury", x: 160, y: 180, w: 160, h: 100, wall: "wall", floor: "floor_stone",
    decor: [["chest", 1, 1], ["chest", 8, 1], ["map_table", 4, 1], ["gold", 2, 1, 4], ["gold", 7, 1, 4], ["gold", 6, 1, 5], ["banner", 4, 3, 2], ["torch", 1, 3, 1], ["torch", 8, 3, 1]],
  },
  {
    room: "barracks", x: 320, y: 180, w: 160, h: 100, wall: "wall", floor: "floor_wood",
    decor: [["bunk", 1, 1], ["bunk", 3, 1], ["rack", 6, 2], ["barrel", 8, 1], ["door", 9, 1], ["window", 6, 3], ["torch", 5, 3, 1]],
  },
];

/** Aesthetic restoration levels unlocked by REAL completed missions. */
export const RESTORATION_THRESHOLDS = [0, 1, 10, 50, 150, 400];

export function restorationLevel(completedMissions: number): number {
  let lvl = 0;
  RESTORATION_THRESHOLDS.forEach((t, i) => {
    if (completedMissions >= t) lvl = i;
  });
  return lvl;
}

export const RESTORATION_LABEL = [
  "Ruínas na névoa",
  "Primeira chama acesa",
  "Estandartes erguidos",
  "Cristais despertos",
  "Tesouro recuperado",
  "Castelo restaurado",
];

/** Character slot positions on a room's floor line. */
export function slotsFor(r: RoomLayout, count: number): { x: number; y: number }[] {
  const floorY = r.y + r.h - 6;
  const usable = r.w - 32;
  const n = Math.max(1, count);
  return Array.from({ length: count }, (_, i) => ({ x: Math.round(r.x + 16 + (usable * (i + 0.5)) / n), y: floorY }));
}

export function roomAt(x: number, y: number): RoomLayout | undefined {
  return ROOMS.find((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
}
