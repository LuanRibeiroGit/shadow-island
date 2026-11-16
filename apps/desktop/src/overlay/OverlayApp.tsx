import { useEffect, useMemo, useRef, useState } from "react";
import type { Agent, SystemInfo } from "@ids/shared";
import { activeAgents, encountersFor } from "@ids/event-system";
import { MessageScheduler, resolveCharacter, type Bubble } from "@ids/game-engine";
import { backend } from "../bridge/backend";
import { useWorld } from "../stores/world";
import { useSettings } from "../stores/settings";
import { useCharacters } from "../stores/characters";
import { OverlayScene, compactWidth, type ScreenPos } from "./scene";

/**
 * Desktop overlay window: transparent, borderless strip near the taskbar with one
 * character per real agent. Clicking a character opens a small card.
 */
export function OverlayApp() {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<OverlayScene | null>(null);
  const [ready, setReady] = useState(false);
  const [positions, setPositions] = useState<ScreenPos[]>([]);
  const [bubbles, setBubbles] = useState<Record<string, Bubble>>({});
  const [opaque, setOpaque] = useState(false);
  const scheduler = useMemo(() => new MessageScheduler(), []);
  const world = useWorld((s) => s.world);
  const settings = useSettings((s) => s.settings);
  const custom = useCharacters((s) => s.custom);

  useEffect(() => {
    void useWorld.getState().init();
    void useSettings.getState().init();
    void useCharacters.getState().init();
    backend()
      .then((b) => b.systemInfo())
      .then((i: SystemInfo) => setOpaque(i.capabilities.transparentWindows.level !== "full"))
      .catch(() => {});
  }, []);

  useEffect(() => {
    document.body.classList.toggle("opaque", opaque);
  }, [opaque]);

  useEffect(() => {
    const s = new OverlayScene();
    scene.current = s;
    // Clicking a character opens its page in the castle window: the strip stays thin.
    s.setCallbacks(setPositions, (id) => void backend().then((b) => b.showCastle(`agent/${encodeURIComponent(id)}`)));
    void s.init(host.current!).then(() => setReady(true));
    return () => s.destroy();
  }, []);

  // Only agents that are actually working show up on the desktop: idle and finished
  // agents are asleep in the castle, so the strip stays empty (and hidden) between tasks.
  const agents = useMemo(() => activeAgents(world).filter(isWorking), [world]);
  const encounters = useMemo(() => Object.values(world.encounters), [world]);

  useEffect(() => {
    if (!ready || !scene.current) return;
    const d = settings.desktop;
    scene.current.setOptions({ scale: d.characterScale / 2, animationSpeed: d.animationSpeed, animationsEnabled: d.animationsEnabled, walkSpeed: d.walkSpeed, showNames: d.showNames, compact: d.autoWidth }, custom);
    void scene.current.sync(agents, encounters, Date.now());
  }, [ready, agents, encounters, settings.desktop, custom]);

  // Speech bubbles from real events, rate-limited by the scheduler.
  useEffect(() => {
    if (!settings.desktop.showMessages) {
      setBubbles({});
      return;
    }
    const tick = () => {
      const now = Date.now();
      const next: Record<string, Bubble> = {};
      for (const a of agents) {
        const enc = encountersFor(world, a.id)[0];
        const b = scheduler.next(a, now, enc);
        if (b && now - b.shownAt < 4500) next[a.id] = b;
      }
      setBubbles(next);
    };
    tick();
    const t = window.setInterval(tick, 1000);
    return () => window.clearInterval(t);
  }, [agents, world, scheduler, settings.desktop.showMessages]);

  // Auto-hide the strip when nobody is around (no click blocking on Wayland).
  const hasAgents = agents.length > 0;
  useEffect(() => {
    if (!settings.desktop.overlayEnabled) return;
    const t = window.setTimeout(() => void backend().then((b) => b.setOverlayVisible(hasAgents)), hasAgents ? 0 : 6000);
    return () => window.clearTimeout(t);
  }, [hasAgents, settings.desktop.overlayEnabled]);

  // Compact strip: ask for just the width of the souls working right now.
  const want = compactWidth(agents.length, settings.desktop.characterScale / 2);
  useEffect(() => {
    if (!settings.desktop.autoWidth || agents.length === 0) return;
    void backend().then((b) => b.setOverlayContentWidth(want));
  }, [want, agents.length, settings.desktop.autoWidth]);

  // Report clickable areas so the rest of the strip is click-through.
  useEffect(() => {
    const boxes = positions.map((p) => ({ x: Math.round(p.x - p.width / 2), y: Math.round(p.top), width: Math.round(p.width), height: Math.round(p.y - p.top) }));
    const key = JSON.stringify(boxes.map((b) => [Math.round(b.x / 8), b.y, b.width, b.height]));
    if (key !== lastBoxes.current) {
      lastBoxes.current = key;
      void backend().then((b) => b.setOverlayHitboxes(boxes));
    }
  }, [positions]);
  const lastBoxes = useRef("");


  return (
    <div className="overlay-root" data-crew={positions.length}>
      <div ref={host} style={{ position: "absolute", inset: 0 }} />
      {positions.map((p) => {
        const a = agents.find((x) => x.id === p.id);
        if (!a) return null;
        const b = bubbles[p.id];
        const ch = resolveCharacter(a, custom);
        return (
          <div key={p.id}>
            {/* Bubbles need room above the head: a strip as tall as the souls shows none. */}
            {b && p.top >= 26 && <div className="bubble" style={{ left: clampX(p.x, 130), top: p.top - 24 }}>{b.text}</div>}
            {settings.desktop.showNames && <div className="nameplate" style={{ left: clampX(p.x, 60), top: p.y - 2 }}>{ch.name}</div>}
          </div>
        );
      })}
    </div>
  );
}


/** Keep centered labels (translateX(-50%)) inside the strip near its edges. */
function clampX(x: number, half: number): number {
  return Math.min(Math.max(x, half), Math.max(half, window.innerWidth - half));
}

const RESTING = new Set(["IDLE", "SUCCESS"]);
function isWorking(a: Agent): boolean {
  return !a.endedAt && !RESTING.has(a.state);
}
