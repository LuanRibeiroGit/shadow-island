// Strict CSP (no unsafe-eval in the webview): Pixi must use its precompiled
// shader/uniform paths.
import "pixi.js/unsafe-eval";
import { Application, Container } from "pixi.js";
import type { Agent, Encounter } from "@ids/shared";
import { homeX, stepWalker, visualFor, wanderTarget, nextVisualChange, type CharacterCustomization, type Walker } from "@ids/game-engine";
import { CharacterView, MonsterView, spawnEffect, type ViewOptions } from "../characters/pixi";

export interface OverlayOptions extends ViewOptions {
  walkSpeed: number;
  /** Reserve space under the feet for name labels. */
  showNames: boolean;
  /** Strip sized to the souls: one slot each, side by side, small wander. */
  compact?: boolean;
}

export interface ScreenPos {
  id: string;
  x: number;
  y: number;
  top: number;
  width: number;
}

/**
 * Desktop strip scene. Characters stand on a ground line near the bottom (or top)
 * edge, walk only while their real state is RUNNING/EXPLORING, and fight a monster
 * only while an encounter is active. The ticker slows down when nothing moves and
 * stops entirely when there are no characters.
 */
export class OverlayScene {
  private ready = false;
  private resizeObs: ResizeObserver | null = null;
  private destroyed = false;
  readonly app = new Application();
  private world = new Container();
  private views = new Map<string, CharacterView>();
  private walkers = new Map<string, Walker & { home: number; pinned: boolean; nextWander: number }>();
  private monsters = new Map<number, MonsterView>();
  private lastStates = new Map<string, string>();
  private opts: OverlayOptions = { scale: 1, animationSpeed: 1, animationsEnabled: true, walkSpeed: 28, showNames: false };
  private custom: Record<string, CharacterCustomization> = {};
  private onPositions: (p: ScreenPos[]) => void = () => {};
  private onPick: (id: string) => void = () => {};
  private lastEmit = 0;
  private drag: { id: string; dx: number } | null = null;
  private wakeTimer: number | null = null;

  async init(el: HTMLElement): Promise<void> {
    await this.app.init({ backgroundAlpha: 0, resizeTo: el, antialias: false, autoDensity: true, resolution: window.devicePixelRatio || 1 });
    this.ready = true;
    if (this.destroyed) {
      this.app.destroy(true, { children: true });
      return;
    }
    el.appendChild(this.app.canvas);
    // Pixi's resizeTo only reacts to window "resize" events. Native windows can
    // settle their size after the page loads (positioning, scale changes) without
    // one, so watch the element itself.
    this.resizeObs = new ResizeObserver(() => this.app.resize());
    this.resizeObs.observe(el);
    this.app.stage.addChild(this.world);
    this.app.stage.eventMode = "static";
    this.app.stage.on("pointermove", (e) => {
      if (!this.drag) return;
      const w = this.walkers.get(this.drag.id);
      if (w) {
        w.x = w.targetX = w.home = e.global.x - this.drag.dx;
        w.pinned = true;
      }
    });
    this.app.stage.on("pointerup", () => (this.drag = null));
    this.app.stage.on("pointerupoutside", () => (this.drag = null));
    this.app.ticker.add((t) => this.tick(t.deltaMS));
  }

  setCallbacks(onPositions: (p: ScreenPos[]) => void, onPick: (id: string) => void) {
    this.onPositions = onPositions;
    this.onPick = onPick;
  }

  setOptions(o: OverlayOptions, custom: Record<string, CharacterCustomization>) {
    this.opts = o;
    this.custom = custom;
  }

  private ground(): number {
    // Feet rest on the bottom edge (the taskbar's top); leave room for names if shown.
    return this.app.screen.height - (this.opts.showNames ? 16 : 2);
  }

  async sync(agents: Agent[], encounters: Encounter[], now: number): Promise<void> {
    if (this.destroyed || !this.ready) return;
    const ids = new Set(agents.map((a) => a.id));
    for (const [id, v] of this.views) {
      if (!ids.has(id)) {
        void spawnEffect(this.world, "mist", v.x, v.y - 10, 2);
        v.destroy({ children: true });
        this.views.delete(id);
        this.walkers.delete(id);
        this.lastStates.delete(id);
      }
    }
    const width = this.app.screen.width;
    const spacing = this.opts.compact ? slotSpacing(this.opts.scale) : 90 * this.opts.scale;
    agents.forEach((a, i) => {
      let v = this.views.get(a.id);
      if (!v) {
        v = new CharacterView(a);
        v.on("pointertap", () => this.onPick(a.id));
        v.on("pointerdown", (e) => {
          const w = this.walkers.get(a.id);
          if (w) this.drag = { id: a.id, dx: e.global.x - w.x };
        });
        this.world.addChild(v);
        this.views.set(a.id, v);
        const home = this.opts.compact ? slotX(i, spacing) : homeX(a.id, i, width, spacing);
        this.walkers.set(a.id, { x: home, targetX: home, facing: 1, home, pinned: false, nextWander: 0 });
        void spawnEffect(this.world, "mist", home, this.ground() - 10, 2);
      }
      const vis = visualFor(a, now);
      const prev = this.lastStates.get(a.id);
      if (prev !== vis.state && vis.state === "SUCCESS") {
        const w = this.walkers.get(a.id)!;
        void spawnEffect(this.world, "sparkle", w.x, this.ground() - 40 * this.opts.scale, 2 * this.opts.scale);
      }
      this.lastStates.set(a.id, vis.state);
      if (this.opts.compact) {
        // Slots follow the order of the souls so the strip can shrink around them.
        const w = this.walkers.get(a.id)!;
        w.home = slotX(i, spacing);
        if (Math.abs(w.targetX - w.home) > 12 * this.opts.scale) w.targetX = w.home;
      }
      void v.sync(a, this.custom, now, this.opts);
    });

    // Monsters: one per active encounter, next to its agent.
    const active = new Set(encounters.filter((e) => ids.has(e.agentId)).map((e) => e.id));
    for (const [id, m] of this.monsters) {
      if (!active.has(id)) {
        void m.play("vanish", 2 * this.opts.scale).then(() => m.onDone(() => m.destroy()));
        this.monsters.delete(id);
      }
    }
    for (const e of encounters) {
      if (!ids.has(e.agentId) || this.monsters.has(e.id)) continue;
      const m = new MonsterView(e);
      this.world.addChild(m);
      this.monsters.set(e.id, m);
      void m.play("attack", 2 * this.opts.scale);
    }
    this.scheduleWake(agents, now);
    this.updateTicker(agents, now);
  }

  /** Wake up when a transient state (celebration / error) should settle. */
  private scheduleWake(agents: Agent[], now: number) {
    if (this.wakeTimer) window.clearTimeout(this.wakeTimer);
    const next = agents.map((a) => nextVisualChange(a, now)).filter((t): t is number => t !== null);
    if (next.length) {
      const at = Math.min(...next);
      this.wakeTimer = window.setTimeout(() => {
        this.wakeTimer = null;
        void this.sync(agents, [...this.monsters.values()].map((m) => m.encounter), Date.now());
      }, Math.max(50, at - now));
    }
  }

  private updateTicker(agents: Agent[], now: number) {
    if (agents.length === 0 && this.monsters.size === 0) {
      // Keep running briefly so despawn effects finish, then stop.
      window.setTimeout(() => this.views.size === 0 && this.app.ticker.stop(), 1500);
      return;
    }
    const energetic = agents.some((a) => visualFor(a, now).energetic) || this.monsters.size > 0;
    this.app.ticker.maxFPS = energetic ? 30 : 12;
    if (!this.app.ticker.started) this.app.ticker.start();
  }

  private tick(dt: number) {
    const now = Date.now();
    const ground = this.ground();
    const width = this.app.screen.width;
    for (const [id, v] of this.views) {
      const w = this.walkers.get(id);
      if (!w) continue;
      const vis = visualFor(v.agent, now);
      if (vis.moving && !w.pinned && this.drag?.id !== id && now > w.nextWander && Math.abs(w.x - w.targetX) < 1) {
        w.targetX = wanderTarget(w.home, now / 1000 + w.home, (this.opts.compact ? 10 : 70) * this.opts.scale, width, this.opts.compact ? 12 : 30);
        w.nextWander = now + 1500 + ((w.home * 7) % 1500);
      }
      if (!vis.moving) w.targetX = w.x; // stop where you are
      const nw = stepWalker(w, dt, this.opts.walkSpeed);
      w.x = nw.x;
      w.facing = nw.facing;
      v.setFacing(w.facing);
      v.position.set(Math.round(w.x), ground);
    }
    for (const m of this.monsters.values()) {
      const w = this.walkers.get(m.encounter.agentId);
      if (w) m.position.set(Math.round(w.x + 46 * this.opts.scale), ground);
    }
    if (now - this.lastEmit > 100) {
      this.lastEmit = now;
      const charH = 24 * 2 * this.opts.scale;
      this.onPositions(
        [...this.views.values()]
          .filter((v) => v.visible)
          .map((v) => ({ id: v.agent.id, x: v.x, y: ground, top: ground - charH, width: 24 * 2 * this.opts.scale })),
      );
    }
  }

  destroy() {
    this.destroyed = true;
    this.resizeObs?.disconnect();
    if (!this.ready) return;
    this.app.destroy(true, { children: true });
  }
}

/** Width the strip needs for `n` souls in compact mode. */
export function compactWidth(n: number, scale: number): number {
  return Math.max(1, n) * slotSpacing(scale);
}

export const slotSpacing = (scale: number) => Math.round(64 * scale);
const slotX = (i: number, spacing: number) => Math.round(spacing / 2 + i * spacing);
