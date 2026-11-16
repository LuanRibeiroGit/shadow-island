// Strict CSP (no unsafe-eval in the webview): Pixi must use its precompiled
// shader/uniform paths.
import "pixi.js/unsafe-eval";
import { Application, Container, Graphics, Rectangle, Sprite, Texture, type TextureSource } from "pixi.js";
import type { Agent, Encounter, Room } from "@ids/shared";
import { visualFor, nextVisualChange, type CharacterCustomization } from "@ids/game-engine";
import { CharacterView, MonsterView, spawnEffect } from "../characters/pixi";
import { loadImage, loadManifest } from "../characters/sprites";
import { CASTLE_H, CASTLE_W, ROOMS, slotsFor, type RoomLayout } from "./layout";

const ANIMATED = new Set(["torch", "forge", "cauldron"]);
const FLOOR_H = 10;

interface TileSet {
  source: TextureSource;
  size: number;
  columns: number;
  tiles: Record<string, number>;
  cache: Map<string, Texture>;
}

/**
 * Living castle cross-section. Rooms are built once from the tileset; characters
 * are placed in the room that matches their real state. Animated tiles (torches,
 * forge, cauldron) tick slowly; everything pauses while the window is hidden.
 */
export class CastleScene {
  private ready = false;
  private destroyed = false;
  readonly app = new Application();
  private root = new Container();
  private roomLayer = new Container();
  private actorLayer = new Container();
  private fxLayer = new Container();
  private highlight = new Graphics();
  private tiles: TileSet | null = null;
  private animTiles: { sprite: Sprite; base: string }[] = [];
  private views = new Map<string, CharacterView>();
  private monsters = new Map<number, MonsterView>();
  private lastStates = new Map<string, string>();
  private level = -1;
  private backdrop: Sprite | null = null;
  private animPhase = 0;
  private animClock = 0;
  private wake: number | null = null;
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
    this.root.addChild(this.roomLayer, this.highlight, this.actorLayer, this.fxLayer);
    this.app.stage.addChild(this.root);
    this.app.ticker.maxFPS = 12;
    this.app.ticker.add((t) => this.tick(t.deltaMS));
    document.addEventListener("visibilitychange", this.onVisibility);

    const m = await loadManifest();
    if (this.destroyed) return;
    const env = m.environments as unknown as Record<string, { image: string; tileSize?: number; columns?: number; tiles?: Record<string, number> }>;
    const ts = env["castle-tiles"]!;
    const img = await loadImage(ts.image);
    if (this.destroyed) return;
    const source = Texture.from(img).source;
    source.scaleMode = "nearest";
    this.tiles = { source, size: ts.tileSize ?? 16, columns: ts.columns ?? 8, tiles: ts.tiles ?? {}, cache: new Map() };
    const back = env["island-backdrop"];
    if (back) {
      const bimg = await loadImage(back.image);
      if (this.destroyed) return;
      const bt = Texture.from(bimg);
      bt.source.scaleMode = "nearest";
      this.backdrop = new Sprite(bt);
      this.roomLayer.addChild(this.backdrop);
    }
    this.buildRooms(0);
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

  /** (Re)build room art for a restoration level. */
  buildRooms(level: number) {
    if (level === this.level || !this.tiles || this.destroyed) return;
    this.level = level;
    // Keep the backdrop; rebuild everything else.
    for (const c of [...this.roomLayer.children]) {
      if (c === this.backdrop) continue;
      this.roomLayer.removeChild(c);
      c.destroy({ children: true });
    }
    this.animTiles = [];
    const T = this.tiles.size;
    for (const r of ROOMS) {
      const room = new Container();
      room.position.set(r.x, r.y);
      const mask = new Graphics().rect(0, 0, r.w, r.h).fill(0xffffff);
      room.addChild(mask);
      room.mask = mask;
      for (let y = 0; y < r.h; y += T) for (let x = 0; x < r.w; x += T) this.place(room, r.wall, x, y);
      for (let x = 0; x < r.w; x += T) this.place(room, r.floor === "rug" ? "floor_stone" : r.floor, x, r.h - FLOOR_H);
      if (r.floor === "rug") for (let x = 48; x < r.w - 48; x += T) this.place(room, "rug", x, r.h - FLOOR_H - 6);
      for (const [tile, col, row, min] of r.decor) {
        if ((min ?? 0) > level) continue;
        const x = col * T;
        const y = r.h - FLOOR_H - row * T + 2;
        if (ANIMATED.has(tile)) {
          const s = this.place(room, `${tile}0`, x, y);
          if (s) this.animTiles.push({ sprite: s, base: tile });
        } else this.place(room, tile, x, y);
      }
      // Dim unrestored rooms a little: the castle "wakes up" with real progress.
      if (level === 0) room.alpha = 0.85;
      // Frame
      const frame = new Graphics().rect(0.5, 0.5, r.w - 1, r.h - 1).stroke({ width: 1, color: 0x0a1214 });
      room.addChild(frame);
      room.eventMode = "static";
      room.cursor = "pointer";
      room.hitArea = new Rectangle(0, 0, r.w, r.h);
      room.on("pointertap", () => this.onRoom(r.room));
      room.on("pointerover", () => this.setHighlight(r));
      room.on("pointerout", () => this.setHighlight(null));
      this.roomLayer.addChild(room);
    }
    this.setHighlight(null);
  }

  private place(parent: Container, name: string, x: number, y: number): Sprite | null {
    const t = this.tex(name);
    if (!t) return null;
    const s = new Sprite(t);
    s.position.set(x, y);
    parent.addChild(s);
    return s;
  }

  setHighlight(r: RoomLayout | null, selected?: Room) {
    this.highlight.clear();
    const sel = ROOMS.find((x) => x.room === selected);
    if (sel) this.highlight.rect(sel.x + 1, sel.y + 1, sel.w - 2, sel.h - 2).stroke({ width: 2, color: 0x7cf2c2, alpha: 0.9 });
    if (r && r !== sel) this.highlight.rect(r.x + 1, r.y + 1, r.w - 2, r.h - 2).stroke({ width: 1, color: 0x7cf2c2, alpha: 0.5 });
  }

  async sync(agents: Agent[], encounters: Encounter[], custom: Record<string, CharacterCustomization>, now: number, opts: { animationSpeed: number; animationsEnabled: boolean }) {
    if (this.destroyed || !this.ready) return;
    const ids = new Set(agents.map((a) => a.id));
    for (const [id, v] of this.views) {
      if (!ids.has(id)) {
        void spawnEffect(this.fxLayer, "mist", v.x, v.y - 8, 1);
        v.destroy({ children: true });
        this.views.delete(id);
        this.lastStates.delete(id);
      }
    }
    const byRoom = new Map<Room, Agent[]>();
    for (const a of agents) {
      const list = byRoom.get(a.room) ?? [];
      list.push(a);
      byRoom.set(a.room, list);
    }
    for (const r of ROOMS) {
      const list = (byRoom.get(r.room) ?? []).slice(0, 6);
      const slots = slotsFor(r, list.length);
      list.forEach((a, i) => {
        let v = this.views.get(a.id);
        if (!v) {
          v = new CharacterView(a);
          v.on("pointertap", (e) => {
            e.stopPropagation();
            this.onAgent(a.id);
          });
          this.actorLayer.addChild(v);
          this.views.set(a.id, v);
          void spawnEffect(this.fxLayer, "mist", slots[i]!.x, slots[i]!.y - 8, 1);
        }
        v.position.set(slots[i]!.x, slots[i]!.y);
        const vis = visualFor(a, now);
        if (this.lastStates.get(a.id) !== vis.state && vis.state === "SUCCESS") void spawnEffect(this.fxLayer, "sparkle", v.x, v.y - 20, 1.2);
        this.lastStates.set(a.id, vis.state);
        void v.sync(a, custom, now, { scale: 0.5, animationSpeed: opts.animationSpeed, animationsEnabled: opts.animationsEnabled });
      });
      // agents beyond 6 in a room are hidden (the side panel lists them all)
      for (const a of (byRoom.get(r.room) ?? []).slice(6)) this.views.get(a.id)?.destroy();
    }

    const active = new Set(encounters.filter((e) => ids.has(e.agentId)).map((e) => e.id));
    for (const [id, m] of this.monsters) {
      if (!active.has(id)) {
        void m.play("vanish", 0.5).then(() => m.onDone(() => m.destroy()));
        this.monsters.delete(id);
      }
    }
    for (const e of encounters) {
      const v = this.views.get(e.agentId);
      if (!v) continue;
      let m = this.monsters.get(e.id);
      if (!m) {
        m = new MonsterView(e);
        this.actorLayer.addChild(m);
        this.monsters.set(e.id, m);
        void m.play("attack", 0.5);
      }
      m.position.set(v.x + 18, v.y);
    }

    if (this.wake) window.clearTimeout(this.wake);
    const next = agents.map((a) => nextVisualChange(a, now)).filter((t): t is number => t !== null);
    if (next.length) this.wake = window.setTimeout(() => void this.sync(agents, encounters, custom, Date.now(), opts), Math.max(50, Math.min(...next) - now));
    const energetic = agents.some((a) => visualFor(a, now).energetic) || this.monsters.size > 0;
    this.app.ticker.maxFPS = energetic ? 24 : 8;
  }

  private tick(dt: number) {
    this.animClock += dt;
    if (this.animClock > 380) {
      this.animClock = 0;
      this.animPhase ^= 1;
      for (const a of this.animTiles) {
        const t = this.tex(`${a.base}${this.animPhase}`);
        if (t) a.sprite.texture = t;
      }
    }
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
