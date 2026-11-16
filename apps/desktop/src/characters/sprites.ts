import type { AssetManifest, Palette, SheetSpec } from "@ids/game-engine";

/**
 * Asset loading + palette recoloring, shared by the castle, the overlay and the
 * portraits. Only ids from assets/manifest.json are used: swapping art never
 * requires code changes.
 */

export type CharacterSheetSpec = SheetSpec & { palette?: Palette };

let manifestPromise: Promise<AssetManifest> | null = null;

export function loadManifest(): Promise<AssetManifest> {
  manifestPromise ??= fetch("/manifest.json").then((r) => {
    if (!r.ok) throw new Error(`manifest.json: HTTP ${r.status}`);
    return r.json() as Promise<AssetManifest>;
  });
  return manifestPromise;
}

const images = new Map<string, Promise<HTMLImageElement>>();

export function loadImage(path: string): Promise<HTMLImageElement> {
  let p = images.get(path);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`não foi possível carregar ${path}`));
      img.src = `/${path}`;
    });
    images.set(path, p);
  }
  return p;
}

type RGB = [number, number, number];

export function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Recolor pixels that are a brightness-scaled version of a source key color
 * (cloak/trim/glow and their shades) into the same scale of the target color.
 * Outline, face and item colors are left untouched.
 */
export function recolorPixels(data: Uint8ClampedArray, from: Palette, to: Palette): void {
  const keys = (["cloak", "trim", "glow"] as const)
    .filter((k) => from[k].toLowerCase() !== to[k].toLowerCase())
    .map((k) => ({ src: hexToRgb(from[k]), dst: hexToRgb(to[k]) }));
  if (keys.length === 0) return;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3]! === 0) continue;
    const p: RGB = [data[i]!, data[i + 1]!, data[i + 2]!];
    let best: { k: number; dst: RGB; err: number } | null = null;
    for (const { src, dst } of keys) {
      const dot = p[0] * src[0] + p[1] * src[1] + p[2] * src[2];
      const nn = src[0] * src[0] + src[1] * src[1] + src[2] * src[2] || 1;
      const k = dot / nn;
      if (k < 0.3 || k > 1.6) continue;
      const err = Math.hypot(p[0] - k * src[0], p[1] - k * src[1], p[2] - k * src[2]);
      if (err < 14 && (!best || err < best.err)) best = { k, dst, err };
    }
    if (best) {
      data[i] = Math.min(255, best.k * best.dst[0]);
      data[i + 1] = Math.min(255, best.k * best.dst[1]);
      data[i + 2] = Math.min(255, best.k * best.dst[2]);
    }
  }
}

const sheets = new Map<string, Promise<HTMLCanvasElement>>();

/** Spritesheet canvas for a character class, recolored to `palette`. Cached. */
export function characterSheet(classId: string, palette: Palette): Promise<HTMLCanvasElement> {
  const key = `${classId}|${palette.cloak}|${palette.trim}|${palette.glow}`;
  let p = sheets.get(key);
  if (!p) {
    p = (async () => {
      const m = await loadManifest();
      const spec = (m.characters[classId] ?? m.characters.wisp) as CharacterSheetSpec | undefined;
      if (!spec) throw new Error(`personagem ${classId} ausente no manifest`);
      const img = await loadImage(spec.image);
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0);
      if (spec.palette) {
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
        recolorPixels(data.data, spec.palette, palette);
        ctx.putImageData(data, 0, 0);
      }
      return canvas;
    })();
    sheets.set(key, p);
  }
  return p;
}

export function frameRect(spec: SheetSpec, animation: string, frame: number): { x: number; y: number; w: number; h: number } {
  const a = spec.animations[animation] ?? spec.animations.idle;
  const row = a?.row ?? 0;
  const f = a ? frame % a.frames : 0;
  return { x: f * spec.frameWidth, y: row * spec.frameHeight, w: spec.frameWidth, h: spec.frameHeight };
}
