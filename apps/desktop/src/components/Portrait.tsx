import { useEffect, useRef } from "react";
import type { Agent } from "@ids/shared";
import { resolveCharacter, visualFor, type Palette } from "@ids/game-engine";
import { characterSheet, frameRect, loadManifest } from "../characters/sprites";
import { useCharacters } from "../stores/characters";

/** One frame of a character spritesheet, recolored, drawn on a 2D canvas (no Pixi). */
export function SpriteCanvas({ sprite, palette, animation = "idle", frame = 0, size = 40, label }: { sprite: string; palette: Palette; animation?: string; frame?: number; size?: number; label?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [m, sheet] = await Promise.all([loadManifest(), characterSheet(sprite, palette)]);
      const spec = m.characters[sprite];
      const c = ref.current;
      if (cancelled || !c || !spec) return;
      const r = frameRect(spec, animation, frame);
      const ctx = c.getContext("2d")!;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.drawImage(sheet, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height);
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [sprite, palette.cloak, palette.trim, palette.glow, animation, frame]);
  return <canvas ref={ref} width={48} height={48} style={{ width: size, height: size, imageRendering: "pixelated" }} aria-label={label} />;
}

/** Portrait of an agent using its resolved character (class, colors, name). */
export function Portrait({ agent, size = 40, animation }: { agent: Agent; size?: number; animation?: string }) {
  const custom = useCharacters((s) => s.custom);
  const ch = resolveCharacter(agent, custom);
  const anim = animation ?? visualFor(agent, Date.now()).animation;
  return <SpriteCanvas sprite={ch.cls.sprite} palette={ch.palette} animation={anim} size={size} label={ch.name} />;
}
