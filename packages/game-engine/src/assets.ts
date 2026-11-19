import type { AnimationName } from "./animation";

/**
 * Asset manifest contract. Art lives in /assets and is described by
 * assets/manifest.json; game logic only refers to ids, so characters, monsters,
 * rooms and effects can be replaced without touching code.
 */
export interface AnimationSpec {
  row: number;
  frames: number;
  fps: number;
  loop: boolean;
}

export interface SheetSpec {
  /** Path relative to the assets root. */
  image: string;
  frameWidth: number;
  frameHeight: number;
  /** Pixel offset of the feet inside the frame (anchor). */
  anchorY: number;
  displayScale?: number;
  animations: Partial<Record<AnimationName | string, AnimationSpec>>;
}

export interface AssetManifest {
  version: number;
  characters: Record<string, SheetSpec>;
  monsters: Record<string, SheetSpec>;
  effects: Record<string, SheetSpec>;
  environments: Record<string, { image: string; width: number; height: number }>;
  ui: Record<string, string>;
}

export function validateManifest(m: AssetManifest, requiredAnimations: readonly string[]): string[] {
  const errors: string[] = [];
  for (const [id, s] of Object.entries(m.characters)) {
    for (const a of requiredAnimations) {
      if (!s.animations[a]) errors.push(`character ${id}: missing animation ${a}`);
    }
  }
  for (const [kind, group] of [["character", m.characters], ["monster", m.monsters], ["effect", m.effects]] as const) {
    for (const [id, s] of Object.entries(group)) {
      if (s.frameWidth <= 0 || s.frameHeight <= 0) errors.push(`${kind} ${id}: invalid frame size`);
      for (const [name, a] of Object.entries(s.animations)) {
        if (!a || a.frames <= 0 || a.fps <= 0) errors.push(`${kind} ${id}: invalid animation ${name}`);
      }
    }
  }
  return errors;
}
