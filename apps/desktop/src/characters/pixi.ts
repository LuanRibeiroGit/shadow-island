import { AnimatedSprite, Container, Rectangle, Texture, type Graphics, type TextureSource } from "pixi.js";
import type { Agent, Encounter } from "@ids/shared";
import { monsterInfo, resolveCharacter, visualFor, type AssetManifest, type CharacterCustomization, type SheetSpec } from "@ids/game-engine";
import { characterSheet, loadImage, loadManifest } from "./sprites";

/** Pixi views for characters, monsters and effects (shared by castle + overlay). */

const sources = new Map<string, TextureSource>();
const frameCache = new Map<string, Texture[]>();

function sourceFor(key: string, canvas: HTMLCanvasElement | HTMLImageElement): TextureSource {
  let s = sources.get(key);
  if (!s) {
    s = Texture.from(canvas).source;
    s.scaleMode = "nearest";
    sources.set(key, s);
  }
  return s;
}

function framesFor(key: string, source: TextureSource, spec: SheetSpec, animation: string): Texture[] {
  const k = `${key}|${animation}`;
  let f = frameCache.get(k);
  if (!f) {
    const a = spec.animations[animation] ?? spec.animations.idle;
    const row = a?.row ?? 0;
    const n = a?.frames ?? 1;
    f = Array.from({ length: n }, (_, i) => new Texture({ source, frame: new Rectangle(i * spec.frameWidth, row * spec.frameHeight, spec.frameWidth, spec.frameHeight) }));
    frameCache.set(k, f);
  }
  return f;
}

export interface ViewOptions {
  scale: number;
  animationSpeed: number;
  animationsEnabled: boolean;
  /** Force an animation (e.g. "move" while walking in the castle). */
  animation?: string;
}

export class CharacterView extends Container {
  private sprite: AnimatedSprite | null = null;
  private currentKey = "";
  private manifest: AssetManifest | null = null;
  agent: Agent;
  facing: 1 | -1 = 1;

  constructor(agent: Agent) {
    super();
    this.agent = agent;
    this.eventMode = "static";
    this.cursor = "pointer";
  }

  /** Apply agent + customization; reloads textures only when something changed. */
  async sync(agent: Agent, custom: Record<string, CharacterCustomization>, now: number, opts: ViewOptions): Promise<void> {
    this.agent = agent;
    this.manifest ??= await loadManifest();
    const ch = resolveCharacter(agent, custom);
    const vis = visualFor(agent, now);
    const anim = opts.animation ?? vis.animation;
    const spec = this.manifest.characters[ch.cls.sprite];
    if (!spec) return;
    const sheetKey = `${ch.cls.sprite}|${ch.palette.cloak}|${ch.palette.trim}|${ch.palette.glow}`;
    const key = `${sheetKey}|${anim}`;
    this.visible = !ch.hidden;
    const size = ch.scale * opts.scale * (spec.displayScale ?? 1);
    this.scale.set(size * this.facing, size);
    if (key === this.currentKey) return;
    const canvas = await characterSheet(ch.cls.sprite, ch.palette);
    const frames = framesFor(sheetKey, sourceFor(sheetKey, canvas), spec, anim);
    const a = spec.animations[anim] ?? spec.animations.idle;
    if (!this.sprite) {
      this.sprite = new AnimatedSprite(frames);
      this.sprite.anchor.set(0.5, spec.anchorY / spec.frameHeight);
      this.addChild(this.sprite);
    } else {
      this.sprite.textures = frames;
    }
    this.sprite.loop = a?.loop ?? true;
    this.sprite.animationSpeed = ((a?.fps ?? 6) / 60) * opts.animationSpeed;
    if (opts.animationsEnabled) this.sprite.gotoAndPlay(0);
    else this.sprite.gotoAndStop(0);
    this.currentKey = key;
    this.hitArea = new Rectangle(-spec.frameWidth / 2, -spec.anchorY, spec.frameWidth, spec.frameHeight);
  }

  setFacing(f: 1 | -1) {
    if (f !== this.facing) {
      this.facing = f;
      this.scale.x = Math.abs(this.scale.x) * f;
    }
  }
}

const HURT_TINT = 0xff4a4a;

export class MonsterView extends Container {
  private sprite: AnimatedSprite | null = null;
  encounter: Encounter;
  private anim = "";
  private hurt = false;

  /** `spriteId` overrides the sprite (used for the arena's task shade, which is no encounter). */
  constructor(encounter: Encounter, private spriteId?: string) {
    super();
    this.encounter = encounter;
  }

  async play(animation: "idle" | "attack" | "vanish", scale: number): Promise<void> {
    if (animation === this.anim) return;
    this.anim = animation;
    const m = await loadManifest();
    const sprite = this.spriteId ?? monsterInfo(this.encounter.monster).sprite;
    const spec = m.monsters[sprite];
    if (!spec) return;
    const img = await loadImage(spec.image);
    const frames = framesFor(`monster:${sprite}`, sourceFor(`monster:${sprite}`, img), spec, animation);
    const a = spec.animations[animation];
    if (!this.sprite) {
      this.sprite = new AnimatedSprite(frames);
      this.sprite.anchor.set(0.5, spec.anchorY / spec.frameHeight);
      this.addChild(this.sprite);
    } else this.sprite.textures = frames;
    this.sprite.loop = a?.loop ?? true;
    this.sprite.animationSpeed = (a?.fps ?? 6) / 60;
    this.sprite.gotoAndPlay(0);
    this.sprite.tint = this.hurt ? HURT_TINT : 0xffffff;
    this.scale.set(-scale, scale); // monsters face the hero
  }

  /** Red while it is taking a blow. */
  setHurt(hurt: boolean) {
    if (hurt === this.hurt) return;
    this.hurt = hurt;
    if (this.sprite) this.sprite.tint = hurt ? HURT_TINT : 0xffffff;
  }

  onDone(cb: () => void) {
    if (this.sprite) this.sprite.onComplete = cb;
  }
}

/** One-shot effect (sparkles, mist) that removes itself when finished. */
export async function spawnEffect(parent: Container, effect: "sparkle" | "mist", x: number, y: number, scale: number): Promise<void> {
  const m = await loadManifest();
  const spec = m.effects[effect];
  if (!spec) return;
  const img = await loadImage(spec.image);
  const frames = framesFor(`fx:${effect}`, sourceFor(`fx:${spec.image}`, img), spec, "play");
  const s = new AnimatedSprite(frames);
  s.anchor.set(0.5, spec.anchorY / spec.frameHeight);
  s.position.set(x, y);
  s.scale.set(scale);
  s.loop = false;
  s.animationSpeed = (spec.animations.play?.fps ?? 10) / 60;
  s.onComplete = () => s.destroy();
  parent.addChild(s);
  s.play();
}

/** Life bar above a task shade; `hp` from 0 to 1. Centred on its origin. */
export function drawLifeBar(g: Graphics, hp: number) {
  const w = 34;
  const h = 5;
  const color = hp > 0.5 ? 0x4fdc8c : hp > 0.25 ? 0xe6c24a : 0xe0503f;
  g.clear();
  g.rect(-w / 2 - 1, -h - 1, w + 2, h + 2).fill({ color: 0x050b0d, alpha: 0.9 });
  g.rect(-w / 2, -h, w, h).fill({ color: 0x3a1418 });
  if (hp > 0) g.rect(-w / 2, -h, Math.max(1, Math.round(w * hp)), h).fill({ color });
}
