// Strict CSP (no unsafe-eval in the webview): Pixi must use its precompiled
// shader/uniform paths.
import "pixi.js/unsafe-eval";
import { Application, Container, Graphics, Rectangle, Sprite, Texture, type TextureSource } from "pixi.js";
import type { Agent, Encounter, Room } from "@ids/shared";
import {
  AREAS,
  BEDS,
  BedRegistry,
  MAP_H,
  MAP_W,
  PROPS,
  TILE_PX,
  bedsideOf,
  buildMap,
  destinationFor,
  feetOf,
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

export const CASTLE_W = MAP_W * TILE_PX;
export const CASTLE_H = MAP_H * TILE_PX;

const ANIMATED = new Set(["forge", "cauldron"]);
/** Walking speed in tiles per second. */
const WALK_SPEED = 3.2;
/** How long a finished agent sleeps before fading away. */
const LEAVE_AFTER_MS = 6000;

interface TileSet {
  source: TextureSource;
  size: number;
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
  private groundLayer = new Container();
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

  async init(el: HTMLElement): Promise<void> {
    await this.app.init({ width: CASTLE_W, height: CASTLE_H, background: "#050b0d", antialias: false, resolution: 1 });
    this.ready = true;
    if (this.destroyed) {
      this.app.destroy(true, { children: true });
      return;
    }
    this.app.canvas.style.imageRendering = "pixelated";
    el.appendChild(this.app.canvas);
    this.sortLayer.sortableChildren = true;
    this.root.addChild(this.groundLayer, this.highlight, this.sortLayer, this.fxLayer);
    this.app.stage.addChild(this.root);
    this.app.ticker.maxFPS = 30;
    this.app.ticker.add((t) => this.tick(t.deltaMS));
    document.addEventListener("visibilitychange", this.onVisibility);

    // Clicks / hover on the floor select rooms.
    this.app.stage.eventMode = "static";
    this.app.stage.hitArea = new Rectangle(0, 0, CASTLE_W, CASTLE_H);
    this.app.stage.on("pointermove", (e) => {
      const r = this.roomAtPx(e.global.x, e.global.y);
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
      const r = this.roomAtPx(e.global.x, e.global.y);
      if (r) this.onRoom(r);
    });

    const m = await loadManifest();
    if (this.destroyed) return;
    const env = m.environments as unknown as Record<string, { image: string; tileSize?: number; columns?: number; tiles?: Record<string, number> }>;
    const ts = env["castle-topdown"];
    if (!ts) throw new Error("castle-topdown ausente no manifest");
    const img = await loadImage(ts.image);
    if (this.destroyed) return;
    const source = Texture.from(img).source;
    source.scaleMode = "nearest";
    this.tiles = { source, size: ts.tileSize ?? 16, columns: ts.columns ?? 8, tiles: ts.tiles ?? {}, cache: new Map() };
    this.buildGround();
    this.buildRooms(0);
  }

  private roomAtPx(x: number, y: number): Room | null {
    const r = roomOf(this.map, { x: Math.floor(x / TILE_PX), y: Math.floor(y / TILE_PX) });
    return r && r !== "hall" ? r : null;
  }

  private tex(name: string): Texture | null {
    const t = this.tiles;
    if (!t) return null;
    let tx = t.cache.get(name);
    if (!tx) {
      const i = t.tiles[name];
      if (i === undefined) return null;
      tx = new Texture({ source: t.source, frame: new Rectangle((i % t.columns) * t.size, Math.floor(i / t.columns) * t.size, t.size, t.size) });
      t.cache.set(name, tx);
    }
    return tx;
  }

  private sprite(name: string, x: number, y: number, parent: Container): Sprite | null {
    const t = this.tex(name);
    if (!t) return null;
    const s = new Sprite(t);
    s.position.set(x, y);
    parent.addChild(s);
    return s;
  }

  /** Floors and walls: built once. */
  private buildGround() {
    let n = 0;
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const i = y * MAP_W + x;
        const kind = this.map.kind[i];
        if (kind === "floor") this.sprite(this.map.floor[i] ?? "floor_stone", x * TILE_PX, y * TILE_PX, this.groundLayer);
        else if (kind === "door") this.sprite("door", x * TILE_PX, y * TILE_PX, this.groundLayer);
        else {
          const below = y + 1 < MAP_H ? this.map.kind[i + MAP_W] : "wall";
          if (below === "wall") this.sprite("wall", x * TILE_PX, y * TILE_PX, this.groundLayer);
          else {
            // Wall faces seen from above, with torches and windows here and there.
            n++;
            const variant = n % 6 === 3 ? "torch" : n % 9 === 5 ? "window" : "wall_face";
            if (variant === "torch") {
              const s = this.sprite("torch0", x * TILE_PX, y * TILE_PX, this.groundLayer);
              if (s) this.animTiles.push({ sprite: s, base: "torch" });
            } else this.sprite(variant, x * TILE_PX, y * TILE_PX, this.groundLayer);
          }
        }
      }
    }
    for (const b of BEDS) {
      const s = this.sprite("bed", b.x * TILE_PX, b.y * TILE_PX, this.sortLayer);
      if (s) s.zIndex = b.y * TILE_PX + 1;
    }
  }

  /** (Re)build furniture for a restoration level (unlocked by real completed missions). */
  buildRooms(level: number) {
    if (level === this.level || !this.tiles || this.destroyed) return;
    this.level = level;
    for (const s of this.propSprites) s.destroy();
    this.propSprites = [];
    this.animTiles = this.animTiles.filter((a) => a.base === "torch");
    for (const p of PROPS) {
      if ((p.min ?? 0) > level) continue;
      const animated = ANIMATED.has(p.tile);
      const flat = p.walkable === true;
      const s = this.sprite(animated ? `${p.tile}0` : p.tile, p.x * TILE_PX, p.y * TILE_PX, flat ? this.groundLayer : this.sortLayer);
      if (!s) continue;
      s.zIndex = p.y * TILE_PX + TILE_PX - 3;
      this.propSprites.push(s);
      if (animated) this.animTiles.push({ sprite: s, base: p.tile });
    }
    this.groundLayer.alpha = level === 0 ? 0.88 : 1;
  }

  setHighlight(_hover: unknown, selected?: Room) {
    this.selected = selected;
    this.drawHighlight();
  }

  private drawHighlight() {
    this.highlight.clear();
    const draw = (room: Room, width: number, alpha: number) => {
      const a = AREAS.find((x) => x.room === room);
      if (a) this.highlight.rect(a.x * TILE_PX + 0.5, a.y * TILE_PX + 0.5, a.w * TILE_PX - 1, a.h * TILE_PX - 1).stroke({ width, color: 0x7cf2c2, alpha });
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
      if (actor.lastState !== vis.state && vis.state === "SUCCESS") void spawnEffect(this.fxLayer, "sparkle", actor.pos.x, actor.pos.y - 16, 1);
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
      void actor.view.sync(a, custom, now, { scale: 0.5, ...opts, animation: this.animFor(actor, now) });
    });
    for (const actor of this.actors.values()) if (actor.leavingSince !== null) this.goToBed(actor);

    this.syncMonsters(alive);

    if (this.wake) window.clearTimeout(this.wake);
    const next = agents.map((a) => nextVisualChange(a, now)).filter((t): t is number => t !== null);
    if (next.length) this.wake = window.setTimeout(() => void this.sync(agents, encounters, this.custom, Date.now(), this.viewOpts), Math.max(50, Math.min(...next) - now));
  }

  private spawn(a: Agent, bed: Point | null): Actor {
    const start = bed ?? { x: 25, y: 17 };
    const view = new CharacterView(a);
    view.on("pointertap", (e) => {
      e.stopPropagation();
      this.onAgent(a.id);
    });
    const sleeper = new Sprite(this.tex("sleeper") ?? Texture.EMPTY);
    const zz = new Sprite(this.tex("zz") ?? Texture.EMPTY);
    sleeper.eventMode = "static";
    sleeper.cursor = "pointer";
    sleeper.on("pointertap", (e) => {
      e.stopPropagation();
      this.onAgent(a.id);
    });
    this.sortLayer.addChild(view, sleeper);
    this.fxLayer.addChild(zz);
    const px = bed ? { x: bed.x * TILE_PX + TILE_PX / 2, y: bed.y * TILE_PX + TILE_PX - 2 } : feetOf(start);
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
      this.goTo(actor, { x: 25, y: 17 }, "floor-nap");
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
    view.position.set(Math.round(actor.pos.x), Math.round(actor.pos.y));
    view.zIndex = actor.pos.y;
    if (sleeping && actor.bed) {
      sleeper.position.set(actor.bed.x * TILE_PX, actor.bed.y * TILE_PX);
      sleeper.zIndex = actor.bed.y * TILE_PX + 2;
      sleeper.tint = ch.palette.cloak;
      zz.position.set(actor.bed.x * TILE_PX + 6, actor.bed.y * TILE_PX - 12);
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
        void actor.view.sync(actor.agent, this.custom, now, { scale: 0.5, ...this.viewOpts, animation: anim });
      }
      if (actor.phase === "sleeping") actor.zz.alpha = 0.55 + 0.45 * Math.sin(now / 500);
      this.place(actor);
      if (actor.leavingSince !== null && actor.phase === "sleeping" && now - actor.leavingSince > LEAVE_AFTER_MS) this.remove(actor);
      else if (actor.leavingSince !== null && !actor.bed && now - actor.leavingSince > LEAVE_AFTER_MS) this.remove(actor);
    }
    for (const m of this.monsters.values()) {
      const a = this.actors.get(m.encounter.agentId);
      if (a) {
        m.position.set(Math.round(a.pos.x + 14), Math.round(a.pos.y));
        m.zIndex = a.pos.y;
      }
    }
  }

  private remove(actor: Actor) {
    void spawnEffect(this.fxLayer, "mist", actor.pos.x, actor.pos.y - 6, 1);
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
    if (this.wake) window.clearTimeout(this.wake);
    this.app.destroy(true, { children: true });
  }
}
