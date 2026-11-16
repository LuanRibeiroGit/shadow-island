// Strict CSP (no unsafe-eval in the webview): Pixi must use its precompiled
// shader/uniform paths.
import "pixi.js/unsafe-eval";
import { Application, Container, Graphics, Rectangle, Sprite, Texture, type FederatedPointerEvent, type TextureSource } from "pixi.js";
import type { Agent, Encounter, Room } from "@ids/shared";
import {
  AREAS,
  BEDS,
  BedRegistry,
  ISO_SIZE,
  ISO_W,
  ISO_H,
  MAP_H,
  MAP_W,
  NAP_SPOT,
  PROPS,
  islandDecor,
  TILE_PX,
  bedsideOf,
  buildMap,
  destinationFor,
  feetOf,
  fromIso,
  isoOfTile,
  toIso,
  findPath,
  nextVisualChange,
  resolveCharacter,
  roomOf,
  stationFor,
  stepAlong,
  tileOf,
  visualFor,
  type CastleMap,
  type CharacterCustomization,
  type Point,
} from "@ids/game-engine";
import { CharacterView, MonsterView, spawnEffect } from "../characters/pixi";
import { loadImage, loadManifest } from "../characters/sprites";

export const CASTLE_W = ISO_SIZE.w;
export const CASTLE_H = ISO_SIZE.h;

const ANIMATED = new Set(["forge", "cauldron", "brazier", "lantern", "fountain"]);
/** Walking speed in tiles per second. */
const WALK_SPEED = 3.2;
/** Souls about one wall-height tall (36 px), in proportion to the furniture. */
const CHAR_SCALE = 0.75;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 6;
/** How long a finished agent sleeps before fading away. */
const LEAVE_AFTER_MS = 6000;

interface TileSet {
  source: TextureSource;
  cw: number;
  ch: number;
  ax: number;
  ay: number;
  columns: number;
  tiles: Record<string, number>;
  cache: Map<string, Texture>;
}

type Phase = "walking" | "working" | "sleeping";

interface Actor {
  id: string;
  agent: Agent;
  view: CharacterView;
  sleeper: Sprite;
  zz: Sprite;
  pos: { x: number; y: number };
  path: Point[];
  /** Key of the current destination, to re-plan only when it changes. */
  destKey: string;
  dest: Point;
  phase: Phase;
  bed: Point | null;
  facing: 1 | -1;
  /** Agent no longer active: walks to bed, sleeps, then fades. */
  leavingSince: number | null;
  lastAnim: string;
  lastState: string;
}

/**
 * The castle seen from above. Each real agent has a bed in the barracks: idle
 * agents sleep there; when real work arrives they get up, walk through the
 * castle to the room of their activity, work at a station, and go back to bed.
 * Map, rules and path finding live in @ids/game-engine (castle.ts).
 */
export class CastleScene {
  private ready = false;
  private destroyed = false;
  readonly app = new Application();
  private root = new Container();
  private cliffLayer = new Container();
  private groundLayer = new Container();
  private backdrop: Sprite | null = null;
  private sortLayer = new Container();
  private fxLayer = new Container();
  private highlight = new Graphics();
  private tiles: TileSet | null = null;
  private animTiles: { sprite: Sprite; base: string }[] = [];
  private propSprites: Sprite[] = [];
  private map: CastleMap = buildMap();
  private beds = new BedRegistry();
  private actors = new Map<string, Actor>();
  private monsters = new Map<number, MonsterView>();
  private level = -1;
  private animPhase = 0;
  private animClock = 0;
  private wake: number | null = null;
  private custom: Record<string, CharacterCustomization> = {};
  private viewOpts = { animationSpeed: 1, animationsEnabled: true };
  private encounters: Encounter[] = [];
  private hover: Room | null = null;
  private selected: Room | undefined;
  onRoom: (r: Room) => void = () => {};
  onAgent: (id: string) => void = () => {};

  /** Camera: zoom and pan applied to `root`. `fit` is the zoom that shows the whole castle. */
  private zoom = 1;
  private fit = 1;
  private userMoved = false;
  private overview = false;
  private drag: { x: number; y: number; rx: number; ry: number; moved: boolean } | null = null;
  /** True right after a drag, so the release does not count as a click. */
  private dragged = false;
  private host: HTMLElement | null = null;
  private ro: ResizeObserver | null = null;
  onZoom: (zoom: number, fit: number) => void = () => {};
  onCamera: (labels: { room: Room; x: number; y: number }[]) => void = () => {};

  async init(el: HTMLElement): Promise<void> {
    this.host = el;
    await this.app.init({ resizeTo: el, background: "#07090c", antialias: false, autoDensity: true, resolution: window.devicePixelRatio || 1, roundPixels: true });
    this.ready = true;
    if (this.destroyed) {
      this.app.destroy(true, { children: true });
      return;
    }
    this.app.canvas.style.imageRendering = "pixelated";
    el.appendChild(this.app.canvas);
    this.sortLayer.sortableChildren = true;
    this.root.addChild(this.cliffLayer, this.groundLayer, this.highlight, this.sortLayer, this.fxLayer);
    this.app.stage.addChild(this.root);
    this.app.ticker.maxFPS = 30;
    this.app.ticker.add((t) => this.tick(t.deltaMS));
    document.addEventListener("visibilitychange", this.onVisibility);

    // Clicks / hover on the floor select rooms; drag pans, wheel zooms.
    this.app.stage.eventMode = "static";
    this.app.stage.hitArea = this.app.screen;
    this.app.stage.on("pointerdown", (e) => {
      this.drag = { x: e.global.x, y: e.global.y, rx: this.root.x, ry: this.root.y, moved: false };
      this.dragged = false;
    });
    this.app.stage.on("pointerup", () => this.endDrag());
    this.app.stage.on("pointerupoutside", () => this.endDrag());
    this.app.stage.on("pointermove", (e) => {
      if (this.drag) {
        const dx = e.global.x - this.drag.x;
        const dy = e.global.y - this.drag.y;
        if (!this.drag.moved && Math.hypot(dx, dy) > 4) this.drag.moved = true;
        if (this.drag.moved) {
          this.root.position.set(this.drag.rx + dx, this.drag.ry + dy);
          this.userMoved = true;
          this.clampCamera();
          this.app.canvas.style.cursor = "grabbing";
        }
      }
      const r = this.roomAtGlobal(e);
      if (r !== this.hover) {
        this.hover = r;
        this.drawHighlight();
      }
    });
    this.app.stage.on("pointerleave", () => {
      this.hover = null;
      this.drawHighlight();
    });
    this.app.stage.on("pointertap", (e) => {
      if (this.dragged) return;
      const r = this.roomAtGlobal(e);
      if (r) this.onRoom(r);
    });
    this.app.canvas.addEventListener("wheel", this.onWheel, { passive: false });
    this.ro = new ResizeObserver(() => {
      this.app.resize();
      this.app.stage.hitArea = this.app.screen;
      this.computeFit();
    });
    this.ro.observe(el);
    this.computeFit();

    const m = await loadManifest();
    if (this.destroyed) return;
    const env = m.environments as unknown as Record<string, { image: string; cellWidth?: number; cellHeight?: number; anchorX?: number; anchorY?: number; columns?: number; tiles?: Record<string, number> }>;
    const ts = env["castle-iso"];
    if (!ts) throw new Error("castle-iso ausente no manifest");
    const bd = env["castle-backdrop"];
    if (bd) {
      const bimg = await loadImage(bd.image);
      if (this.destroyed) return;
      const bt = Texture.from(bimg);
      bt.source.scaleMode = "nearest";
      this.backdrop = new Sprite(bt);
      this.app.stage.addChildAt(this.backdrop, 0);
      this.layoutBackdrop();
    }
    const img = await loadImage(ts.image);
    if (this.destroyed) return;
    const source = Texture.from(img).source;
    source.scaleMode = "nearest";
    this.tiles = { source, cw: ts.cellWidth ?? 32, ch: ts.cellHeight ?? 80, ax: ts.anchorX ?? 16, ay: ts.anchorY ?? 68, columns: ts.columns ?? 16, tiles: ts.tiles ?? {}, cache: new Map() };
    this.buildGround();
    this.buildRooms(0);
  }

  private endDrag() {
    this.dragged = this.drag?.moved ?? false;
    this.drag = null;
    this.app.canvas.style.cursor = "";
  }

  private roomAtGlobal(e: FederatedPointerEvent): Room | null {
    const g = fromIso(this.root.toLocal(e.global));
    const r = roomOf(this.map, { x: Math.floor(g.x / TILE_PX), y: Math.floor(g.y / TILE_PX) });
    return r && r !== "hall" ? r : null;
  }

  private onWheel = (ev: WheelEvent) => {
    ev.preventDefault();
    const rect = this.app.canvas.getBoundingClientRect();
    this.zoomAt(Math.exp(-ev.deltaY * 0.0015), ev.clientX - rect.left, ev.clientY - rect.top);
  };

  /** Zoom by `factor` keeping the point (sx, sy) of the screen fixed. */
  zoomAt(factor: number, sx?: number, sy?: number) {
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    const cx = sx ?? w / 2;
    const cy = sy ?? h / 2;
    const next = Math.min(MAX_ZOOM, Math.max(Math.min(MIN_ZOOM, this.fit), this.zoom * factor));
    const wx = (cx - this.root.x) / this.zoom;
    const wy = (cy - this.root.y) / this.zoom;
    this.zoom = next;
    this.root.scale.set(next);
    this.root.position.set(cx - wx * next, cy - wy * next);
    this.userMoved = true;
    this.clampCamera();
    this.onZoom(this.zoom, this.fit);
  }

  /** Back to the whole castle, centered. */
  resetView() {
    this.userMoved = false;
    this.overview = true;
    this.computeFit();
  }

  private computeFit() {
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    if (!w || !h) return;
    this.fit = Math.min(w / CASTLE_W, h / CASTLE_H);
    if (!this.userMoved) {
      // Open close enough to see the souls (2x, pixel-perfect), centered on the castle;
      // "Ver tudo" fits the whole map.
      this.zoom = this.overview ? this.fit : Math.max(this.fit, Math.min(2, MAX_ZOOM));
      this.root.scale.set(this.zoom);
      this.root.position.set(Math.round((w - CASTLE_W * this.zoom) / 2), Math.round((h - CASTLE_H * this.zoom) / 2));
    }
    this.clampCamera();
    this.onZoom(this.zoom, this.fit);
  }

  /** Keep at least part of the castle on screen; center it on axes where it fits. */
  private clampCamera() {
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    const cw = CASTLE_W * this.zoom;
    const ch = CASTLE_H * this.zoom;
    const clamp = (pos: number, view: number, size: number) => (size <= view ? (view - size) / 2 : Math.min(0, Math.max(view - size, pos)));
    this.root.position.set(clamp(this.root.x, w, cw), clamp(this.root.y, h, ch));
    this.layoutBackdrop();
    this.onCamera(this.labels());
  }

  /** Room name plates: screen positions above each room, for the HTML layer. */
  labels(): { room: Room; x: number; y: number }[] {
    return AREAS.filter((a): a is typeof a & { room: Room } => a.room !== "hall").map((a) => {
      const p = toIso({ x: (a.x + a.w / 2) * TILE_PX, y: a.y * TILE_PX });
      const g = this.root.toGlobal({ x: p.x, y: p.y - 46 });
      return { room: a.room, x: g.x, y: g.y };
    });
  }

  /** The misty sky covers the view and drifts a little with the camera. */
  private layoutBackdrop() {
    const b = this.backdrop;
    if (!b) return;
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    const k = Math.max((w * 1.15) / b.texture.width, (h * 1.15) / b.texture.height);
    b.scale.set(k);
    const cx = this.root.x + (CASTLE_W * this.zoom) / 2 - w / 2;
    const cy = this.root.y + (CASTLE_H * this.zoom) / 2 - h / 2;
    b.position.set((w - b.width) / 2 + cx * 0.05, (h - b.height) / 2 + cy * 0.05);
  }

  private tex(name: string): Texture | null {
    const t = this.tiles;
    if (!t) return null;
    let tx = t.cache.get(name);
    if (!tx) {
      const i = t.tiles[name];
      if (i === undefined) return null;
      tx = new Texture({ source: t.source, frame: new Rectangle((i % t.columns) * t.cw, Math.floor(i / t.columns) * t.ch, t.cw, t.ch) });
      t.cache.set(name, tx);
    }
    return tx;
  }

  /** A sprite standing on tile (x, y): anchored at the tile centre, depth-sorted by it. */
  private sprite(name: string, x: number, y: number, parent: Container, bias = 0): Sprite | null {
    const t = this.tex(name);
    if (!t || !this.tiles) return null;
    const s = new Sprite(t);
    s.anchor.set(this.tiles.ax / this.tiles.cw, this.tiles.ay / this.tiles.ch);
    const c = isoOfTile({ x, y });
    s.position.set(c.x, c.y);
    s.zIndex = c.y + bias;
    parent.addChild(s);
    return s;
  }

  /**
   * Floors and walls: built once. Walls are blocks; only the outer back walls
   * (north and west, with nothing walkable behind them) are full height, the
   * others are cut down so rooms stay visible, like a doll house.
   */
  private buildGround() {
    const k = (x: number, y: number) => (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H ? "void" : this.map.kind[y * MAP_W + x]);
    const room = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return false;
      const r = this.map.roomAt[y * MAP_W + x];
      return k(x, y) === "floor" && r !== null && r !== "hall";
    };
    let n = 0;
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const i = y * MAP_W + x;
        const kind = k(x, y);
        if (kind === "void") continue;
        const h = Math.abs((x * 73856093) ^ (y * 19349663));
        // Island edge: rock (and now and then a spectral waterfall) down into the mist.
        const southVoid = k(x, y + 1) === "void";
        const eastVoid = k(x + 1, y) === "void";
        if (southVoid || eastVoid) {
          const fall = h % 9 === 0 ? (southVoid ? "cliff_fall_L" : "cliff_fall_R") : "cliff";
          this.sprite(fall, x, y, this.cliffLayer);
        }
        if (kind !== "wall") {
          this.sprite(this.map.floor[i] ?? "floor_stone", x, y, this.groundLayer);
          continue;
        }
        // Walls: tall at the back of a room (looking into it), low or ruined in front,
        // so the rooms stay visible like a doll house.
        // A tall wall would hide anything walkable behind it (up-left on screen).
        const walk = (xx: number, yy: number) => {
          const kk = k(xx, yy);
          return kk === "door" || (kk === "floor" && this.map.floor[yy * MAP_W + xx] !== "earth");
        };
        const front = [1, 2, 3].some((d) => walk(x - d, y) || walk(x, y - d) || walk(x - d, y - d)) || walk(x - 2, y - 1) || walk(x - 1, y - 2);
        const back = room(x + 1, y) || room(x, y + 1) || room(x + 1, y + 1) || room(x - 1, y + 1) || room(x + 1, y - 1);
        if (front || !back) {
          this.sprite(h % 4 === 0 ? "wall_broken" : "wall_low", x, y, this.sortLayer, -1);
          continue;
        }
        const face = room(x, y + 1) ? "L" : room(x + 1, y) ? "R" : null;
        n++;
        let name = "wall_tall";
        if (face) {
          const deco = n % 4 === 1 ? "torch" : n % 5 === 3 ? "banner" : n % 7 === 0 ? "window" : null;
          if (deco === "torch") name = `wall_tall_${face}_torch0`;
          else if (deco) name = `wall_tall_${face}_${deco}`;
        }
        const s = this.sprite(name, x, y, this.sortLayer, -1);
        if (s && name.endsWith("torch0")) this.animTiles.push({ sprite: s, base: name.slice(0, -1) });
      }
    }
    for (const b of BEDS) this.sprite("bed", b.x, b.y, this.sortLayer);
  }

  /** (Re)build furniture for a restoration level (unlocked by real completed missions). */
  buildRooms(level: number) {
    if (level === this.level || !this.tiles || this.destroyed) return;
    this.level = level;
    for (const s of this.propSprites) s.destroy();
    this.propSprites = [];
    this.animTiles = this.animTiles.filter((a) => a.base.startsWith("wall_"));
    for (const p of [...PROPS, ...islandDecor(this.map)]) {
      if ((p.min ?? 0) > level) continue;
      const animated = ANIMATED.has(p.tile);
      const flat = p.walkable === true;
      const s = this.sprite(animated ? `${p.tile}0` : p.tile, p.x, p.y, flat ? this.groundLayer : this.sortLayer);
      if (!s) continue;
      this.propSprites.push(s);
      if (animated) this.animTiles.push({ sprite: s, base: p.tile });
    }
  }

  setHighlight(_hover: unknown, selected?: Room) {
    this.selected = selected;
    this.drawHighlight();
  }

  private drawHighlight() {
    this.highlight.clear();
    const draw = (room: Room, width: number, alpha: number) => {
      for (const a of AREAS.filter((x) => x.room === room)) {
        const pts = [
          [a.x, a.y],
          [a.x + a.w, a.y],
          [a.x + a.w, a.y + a.h],
          [a.x, a.y + a.h],
        ].map(([x, y]) => toIso({ x: x! * TILE_PX, y: y! * TILE_PX }));
        this.highlight.poly(pts.flatMap((p) => [p.x, p.y])).fill({ color: 0x7cf2c2, alpha: alpha * 0.12 }).stroke({ width, color: 0x7cf2c2, alpha });
      }
    };
    if (this.selected) draw(this.selected, 1, 0.8);
    if (this.hover && this.hover !== this.selected) draw(this.hover, 1, 0.35);
  }

  async sync(agents: Agent[], encounters: Encounter[], custom: Record<string, CharacterCustomization>, now: number, opts: { animationSpeed: number; animationsEnabled: boolean }) {
    if (this.destroyed || !this.ready || !this.tiles) return;
    this.custom = custom;
    this.viewOpts = opts;
    this.encounters = encounters;
    const ids = agents.map((a) => a.id);
    const alive = new Set(ids);

    // Agents that are no longer active go to bed and leave.
    for (const actor of this.actors.values()) {
      if (!alive.has(actor.id) && actor.leavingSince === null) actor.leavingSince = now;
    }
    const bedMap = this.beds.assign([...ids, ...[...this.actors.values()].filter((a) => a.leavingSince !== null).map((a) => a.id)]);

    const taken = new Set<string>();
    agents.forEach((a, order) => {
      let actor = this.actors.get(a.id);
      const bedIdx = bedMap.get(a.id);
      const bed = bedIdx !== undefined ? BEDS[bedIdx]! : null;
      if (!actor) actor = this.spawn(a, bed);
      actor.agent = a;
      actor.leavingSince = null;
      actor.bed = bed;
      const vis = visualFor(a, now);
      if (actor.lastState !== vis.state && vis.state === "SUCCESS") {
        const sp = toIso(actor.pos);
        void spawnEffect(this.fxLayer, "sparkle", sp.x, sp.y - 30, 1);
      }
      actor.lastState = vis.state;
      const d = destinationFor(vis.state, a.activity);
      if (d.kind === "bed") this.goToBed(actor);
      else if (d.kind === "room") {
        const key = `room:${d.room}`;
        if (actor.destKey.startsWith(key)) {
          taken.add(`${actor.dest.x},${actor.dest.y}`);
        } else {
          const st = stationFor(d.room, taken, order);
          taken.add(`${st.x},${st.y}`);
          this.goTo(actor, st, `${key}:${st.x},${st.y}`);
        }
      }
      void actor.view.sync(a, custom, now, { scale: CHAR_SCALE, ...opts, animation: this.animFor(actor, now) });
    });
    for (const actor of this.actors.values()) if (actor.leavingSince !== null) this.goToBed(actor);

    this.syncMonsters(alive);

    if (this.wake) window.clearTimeout(this.wake);
    const next = agents.map((a) => nextVisualChange(a, now)).filter((t): t is number => t !== null);
    if (next.length) this.wake = window.setTimeout(() => void this.sync(agents, encounters, this.custom, Date.now(), this.viewOpts), Math.max(50, Math.min(...next) - now));
  }

  private spawn(a: Agent, bed: Point | null): Actor {
    const start = bed ?? NAP_SPOT;
    const view = new CharacterView(a);
    view.on("pointertap", (e) => {
      e.stopPropagation();
      if (!this.dragged) this.onAgent(a.id);
    });
    const sleeper = new Sprite(this.tex("sleeper") ?? Texture.EMPTY);
    const zz = new Sprite(this.tex("zz") ?? Texture.EMPTY);
    if (this.tiles) {
      const ax = this.tiles.ax / this.tiles.cw;
      const ay = this.tiles.ay / this.tiles.ch;
      sleeper.anchor.set(ax, ay);
      zz.anchor.set(ax, ay);
    }
    sleeper.eventMode = "static";
    sleeper.cursor = "pointer";
    sleeper.on("pointertap", (e) => {
      e.stopPropagation();
      if (!this.dragged) this.onAgent(a.id);
    });
    this.sortLayer.addChild(view, sleeper);
    this.fxLayer.addChild(zz);
    const px = feetOf(bed ?? start);
    const actor: Actor = {
      id: a.id,
      agent: a,
      view,
      sleeper,
      zz,
      pos: px,
      path: [],
      destKey: bed ? "bed" : "",
      dest: start,
      phase: bed ? "sleeping" : "working",
      bed,
      facing: 1,
      leavingSince: null,
      lastAnim: "",
      lastState: "",
    };
    this.actors.set(a.id, actor);
    this.place(actor);
    return actor;
  }

  private goTo(actor: Actor, target: Point, key: string) {
    if (actor.destKey === key) return;
    actor.destKey = key;
    actor.dest = target;
    const from = actor.phase === "sleeping" && actor.bed ? bedsideOf(this.map, actor.bed) : tileOf(actor.pos);
    const path = findPath(this.map, from, target) ?? [target];
    actor.path = actor.phase === "sleeping" ? path : path.slice(1);
    actor.phase = "walking";
  }

  private goToBed(actor: Actor) {
    if (!actor.bed) {
      // No bed left: nap on the barracks floor.
      this.goTo(actor, NAP_SPOT, "floor-nap");
      return;
    }
    if (actor.destKey === "bed") return;
    const side = bedsideOf(this.map, actor.bed);
    this.goTo(actor, side, "bed-walk");
    actor.destKey = "bed";
    actor.dest = actor.bed;
  }

  private animFor(actor: Actor, now: number): string {
    if (actor.phase === "walking") return "move";
    if (actor.phase === "sleeping") return "idle";
    return visualFor(actor.agent, now).animation;
  }

  private place(actor: Actor) {
    const { view, sleeper, zz } = actor;
    const sleeping = actor.phase === "sleeping" && actor.bed !== null;
    const ch = resolveCharacter(actor.agent, this.custom);
    view.visible = !sleeping && !ch.hidden;
    sleeper.visible = sleeping && !ch.hidden;
    zz.visible = sleeper.visible;
    const sp = toIso(actor.pos);
    view.position.set(Math.round(sp.x), Math.round(sp.y));
    view.zIndex = sp.y + 0.5;
    if (sleeping && actor.bed) {
      const b = isoOfTile(actor.bed);
      sleeper.position.set(b.x, b.y);
      sleeper.zIndex = b.y + 0.2;
      sleeper.tint = ch.palette.cloak;
      zz.position.set(b.x, b.y);
    }
  }

  private syncMonsters(alive: Set<string>) {
    const active = new Set(this.encounters.filter((e) => alive.has(e.agentId) && e.status === "active").map((e) => e.id));
    for (const [id, m] of this.monsters) {
      if (!active.has(id)) {
        void m.play("vanish", 0.75).then(() => m.onDone(() => m.destroy()));
        this.monsters.delete(id);
      }
    }
    for (const e of this.encounters) {
      if (!active.has(e.id) || this.monsters.has(e.id)) continue;
      const m = new MonsterView(e);
      this.sortLayer.addChild(m);
      this.monsters.set(e.id, m);
      void m.play("attack", 0.75);
    }
  }

  private tick(dt: number) {
    const now = Date.now();
    this.animClock += dt;
    if (this.animClock > 380) {
      this.animClock = 0;
      this.animPhase ^= 1;
      for (const a of this.animTiles) {
        const t = this.tex(`${a.base}${this.animPhase}`);
        if (t) a.sprite.texture = t;
      }
    }
    for (const actor of [...this.actors.values()]) {
      if (actor.phase === "walking") {
        const s = stepAlong(actor.pos, actor.path, dt, WALK_SPEED);
        actor.pos = { x: s.x, y: s.y };
        actor.path = s.path;
        if (s.dx !== 0) actor.facing = s.dx > 0 ? 1 : -1;
        if (actor.path.length === 0) actor.phase = actor.destKey === "bed" ? "sleeping" : "working";
      }
      actor.view.setFacing(actor.facing);
      const anim = this.animFor(actor, now);
      if (anim !== actor.lastAnim) {
        actor.lastAnim = anim;
        void actor.view.sync(actor.agent, this.custom, now, { scale: CHAR_SCALE, ...this.viewOpts, animation: anim });
      }
      if (actor.phase === "sleeping") actor.zz.alpha = 0.55 + 0.45 * Math.sin(now / 500);
      this.place(actor);
      if (actor.leavingSince !== null && actor.phase === "sleeping" && now - actor.leavingSince > LEAVE_AFTER_MS) this.remove(actor);
      else if (actor.leavingSince !== null && !actor.bed && now - actor.leavingSince > LEAVE_AFTER_MS) this.remove(actor);
    }
    for (const m of this.monsters.values()) {
      const a = this.actors.get(m.encounter.agentId);
      if (a) {
        const sp = toIso(a.pos);
        m.position.set(Math.round(sp.x + 22), Math.round(sp.y));
        m.zIndex = sp.y;
      }
    }
  }

  private remove(actor: Actor) {
    const sp = toIso(actor.pos);
    void spawnEffect(this.fxLayer, "mist", sp.x, sp.y - 10, 1);
    actor.view.destroy({ children: true });
    actor.sleeper.destroy();
    actor.zz.destroy();
    this.actors.delete(actor.id);
    this.beds.release(actor.id);
  }

  private onVisibility = () => {
    if (document.hidden) this.app.ticker.stop();
    else this.app.ticker.start();
  };

  destroy() {
    this.destroyed = true;
    if (!this.ready) return;
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.ro?.disconnect();
    this.app.canvas.removeEventListener("wheel", this.onWheel);
    if (this.wake) window.clearTimeout(this.wake);
    this.app.destroy(true, { children: true });
  }
}
