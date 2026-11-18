import { useEffect, useMemo, useRef, useState } from "react";
import type { Agent, SystemInfo } from "@ids/shared";
import { activeAgents, encountersFor } from "@ids/event-system";
import { MessageScheduler, resolveCharacter, visualFor, type Bubble } from "@ids/game-engine";
import { backend } from "../bridge/backend";
import { useWorld } from "../stores/world";
import { useSettings } from "../stores/settings";
import { useCharacters } from "../stores/characters";
import { useCrew } from "../stores/crew";
import { OverlayScene, compactWidth, type ScreenPos } from "./scene";
import { Roamer, roamGap, roamHeight, roamerWidth } from "./roam";
import { ROAD_STAGGER_MS } from "./road";
import { BUBBLE_MAX_WIDTH, LABEL_SPACING, LABEL_TURN_MS, bubbleWidth, clampCenter, labelBox, nameWidth, visibleLabels } from "./labels";
import { workSpeech } from "../castle/speech";
import { desktopCrew, nextCrewChange } from "./crew";

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
  const roaming = settings.desktop.roam;
  const soloAgent = useMemo(() => new URLSearchParams(window.location.search).get("agent"), []);
  const solo = roaming && soloAgent !== null;
  const roamer = useMemo(() => new Roamer({ area: () => backend().then((b) => b.overlayArea()), move: (x, y) => backend().then((b) => b.moveOverlay(x, y)) }), []);
  const [dragging, setDragging] = useState(false);
  const soloRef = useRef(solo);
  soloRef.current = solo;

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
    const openAgent = (id: string) => void backend().then((b) => b.showCastle(`agent/${encodeURIComponent(id)}`));
    s.setFightGate(() => backend().then((b) => b.claimRoadFight(ROAD_STAGGER_MS)));
    s.setCallbacks(setPositions, openAgent, (id, e) => {
      if (!soloRef.current || !roamer.startDrag(e.screenX, e.screenY)) return;
      const el = e.target instanceof HTMLElement ? e.target : document.body;
      capturePointer(el, e.pointerId);
      setDragging(true);
      const move = (ev: PointerEvent) => roamer.dragTo(ev.screenX, ev.screenY);
      const up = () => {
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerup", up);
        el.removeEventListener("pointercancel", up);
        void roamer.endDrag().then(({ moved }) => {
          setDragging(false);
          if (!moved) openAgent(id);
        });
      };
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", up);
      el.addEventListener("pointercancel", up);
    });
    void s.init(host.current!).then(() => setReady(true));
    return () => s.destroy();
  }, []);

  // Only agents that are actually working show up on the desktop: idle and finished
  // agents are asleep in the castle, so the strip stays empty (and hidden) between tasks.
  const [clock, setClock] = useState(0);
  const crew = useMemo(() => desktopCrew(activeAgents(world), world.recentAgents, Date.now()), [world, clock]);
  const agents = useMemo(() => (soloAgent !== null ? crew.filter((a) => a.id === soloAgent) : roaming ? [] : crew), [crew, soloAgent, roaming]);
  useEffect(() => {
    const now = Date.now();
    const at = nextCrewChange([...activeAgents(world), ...world.recentAgents], now);
    if (at === null) return;
    const t = window.setTimeout(() => setClock((c) => c + 1), Math.max(50, at - now));
    return () => window.clearTimeout(t);
  }, [world, clock]);
  // Working agents wear the name and looks of the crew member doing their job in the castle.
  const custom = useCrew().custom;
  const encounters = useMemo(() => Object.values(world.encounters), [world]);

  useEffect(() => {
    if (!ready || !scene.current) return;
    const d = settings.desktop;
    scene.current.setOptions({ scale: d.characterScale / 2, animationSpeed: d.animationSpeed, animationsEnabled: d.animationsEnabled, walkSpeed: d.walkSpeed, showNames: d.showNames, compact: d.autoWidth, roam: d.roam, solo }, custom);
    void scene.current.sync(agents, encounters, Date.now());
  }, [ready, agents, encounters, settings.desktop, custom, solo]);

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
        if (roaming) {
          next[a.id] = { text: workSpeech(a, visualFor(a, now).state), shownAt: now };
          continue;
        }
        const enc = encountersFor(world, a.id)[0];
        const b = scheduler.next(a, now, enc);
        if (b && now - b.shownAt < 4500) next[a.id] = b;
      }
      setBubbles(next);
    };
    tick();
    const t = window.setInterval(tick, 1000);
    return () => window.clearInterval(t);
  }, [agents, world, scheduler, settings.desktop.showMessages, roaming]);

  // Auto-hide the strip when nobody is around (no click blocking on Wayland).
  const hasAgents = crew.length > 0;
  useEffect(() => {
    if (!settings.desktop.overlayEnabled || soloAgent !== null) return;
    const t = window.setTimeout(() => void backend().then((b) => b.setOverlayVisible(hasAgents)), hasAgents ? 0 : 6000);
    return () => window.clearTimeout(t);
  }, [hasAgents, settings.desktop.overlayEnabled, soloAgent]);

  // Compact strip: ask for just the width of the souls working right now.
  const want = compactWidth(crew.length, settings.desktop.characterScale / 2);
  const roamerBox = { width: roamerWidth(settings.desktop.characterScale / 2), height: roamHeight(settings.desktop.characterScale / 2, settings.desktop.showNames) };
  const crewIds = crew.map((a) => a.id).join("\n");
  useEffect(() => {
    if (soloAgent !== null) return;
    void backend().then((b) => b.syncRoamers(roaming && crewIds ? crewIds.split("\n") : [], roamerBox.width, roamerBox.height));
  }, [soloAgent, roaming, crewIds, roamerBox.width, roamerBox.height, settings.desktop.overlayEnabled]);
  useEffect(() => {
    if (soloAgent !== null || roaming || crew.length === 0 || !settings.desktop.autoWidth) return;
    void backend().then((b) => b.setOverlayContentWidth(want));
  }, [want, crew.length, settings.desktop.autoWidth, roaming, soloAgent]);

  useEffect(() => {
    if (solo) void roamer.refresh();
  }, [solo, roamer, roamerBox.width, roamerBox.height, settings.desktop.monitor, settings.desktop.placement]);

  const agentsRef = useRef(agents);
  agentsRef.current = agents;
  useEffect(() => {
    if (!solo || !settings.desktop.animationsEnabled) {
      scene.current?.setTravel(null);
      return;
    }
    let last = performance.now();
    const t = window.setInterval(() => {
      const now = performance.now();
      const dt = Math.min(now - last, 250);
      last = now;
      const wall = Date.now();
      const walking = agentsRef.current.some((a) => visualFor(a, wall).moving);
      const fighting = scene.current?.fighting ?? false;
      const facing = roamer.tick(wall, dt, settings.desktop.walkSpeed, walking && !fighting);
      if (facing !== null) scene.current?.walked((settings.desktop.walkSpeed * dt) / 1000, facing);
      scene.current?.setTravel(facing);
    }, 50);
    return () => {
      window.clearInterval(t);
      scene.current?.setTravel(null);
    };
  }, [solo, settings.desktop.animationsEnabled, settings.desktop.walkSpeed, roamer]);

  // Report clickable areas so the rest of the strip is click-through.
  useEffect(() => {
    if (dragging) {
      lastBoxes.current = "drag";
      void backend().then((b) => b.setOverlayHitboxes([{ x: 0, y: 0, width: window.innerWidth, height: window.innerHeight }]));
      return;
    }
    const boxes = positions.map((p) => ({ x: Math.round(p.x - p.width / 2), y: Math.round(p.top), width: Math.round(p.width), height: Math.round(p.y - p.top) }));
    const key = JSON.stringify(boxes.map((b) => [Math.round(b.x / 8), b.y, b.width, b.height]));
    if (key !== lastBoxes.current) {
      lastBoxes.current = key;
      void backend().then((b) => b.setOverlayHitboxes(boxes));
    }
  }, [positions, dragging]);
  const lastBoxes = useRef("");
  const scale = settings.desktop.characterScale / 2;
  const stripWidth = window.innerWidth;
  const turn = Math.floor(Date.now() / LABEL_TURN_MS);
  const nameOf = (id: string) => {
    const a = agents.find((x) => x.id === id);
    return a ? resolveCharacter(a, custom).name : "";
  };
  const roamBubbles = roaming
    ? positions.filter((p) => bubbles[p.id] && bubbleBottom(p, scale) >= BUBBLE_HEIGHT).map((p) => labelBox(p.id, p.x, bubbleWidth(textWidth(bubbles[p.id]?.text ?? "", 12)), stripWidth))
    : [];
  const shownBubbles = visibleLabels(roamBubbles, turn);
  const roamNames = roaming && settings.desktop.showNames ? positions.map((p) => labelBox(p.id, p.x, nameWidth(textWidth(nameOf(p.id), 10), solo ? stripWidth : roamGap(scale)), stripWidth)) : [];
  const shownNames = visibleLabels(roamNames, turn);

  return (
    <div className="overlay-root" data-crew={positions.length} data-roamers={soloAgent === null && roaming ? crewIds.split("\n").filter(Boolean).join(" ") : undefined}>
      <div ref={host} style={{ position: "absolute", inset: 0 }} />
      {positions.map((p) => {
        const a = agents.find((x) => x.id === p.id);
        if (!a) return null;
        const b = bubbles[p.id];
        const ch = resolveCharacter(a, custom);
        if (roaming) {
          const bubble = roamBubbles.find((x) => x.id === p.id);
          const name = roamNames.find((x) => x.id === p.id);
          return (
            <div key={p.id}>
              {b && bubble && shownBubbles.has(p.id) && (
                <div className="bubble" style={{ left: bubble.center, top: bubbleBottom(p, scale), maxWidth: BUBBLE_MAX_WIDTH }}>
                  {b.text}
                </div>
              )}
              {name && shownNames.has(p.id) && (
                <div className="nameplate" style={{ left: name.center, top: p.y - 2, maxWidth: Math.max(24, (solo ? stripWidth : roamGap(scale)) - LABEL_SPACING), overflow: "hidden", textOverflow: "ellipsis" }}>
                  {ch.name}
                </div>
              )}
            </div>
          );
        }
        return (
          <div key={p.id}>
            {/* Bubbles need room above the head: a strip as tall as the souls shows none. */}
            {b && bubbleBottom(p, scale) >= BUBBLE_HEIGHT && <div className="bubble" style={{ left: clampX(p.x, 130), top: bubbleBottom(p, scale) }}>{b.text}</div>}
            {settings.desktop.showNames && <div className="nameplate" style={{ left: clampX(p.x, 60), top: p.y - 2 }}>{ch.name}</div>}
          </div>
        );
      })}
    </div>
  );
}


/** Keep centered labels (translateX(-50%)) inside the strip near its edges. */
const BUBBLE_HEIGHT = 24;
const bubbleBottom = (p: ScreenPos, scale: number) => p.top + Math.round(6 * scale);

function clampX(x: number, half: number): number {
  return clampCenter(x, half, window.innerWidth);
}

let measure: { ctx: CanvasRenderingContext2D | null; family: string } | null = null;

function textWidth(text: string, size: number): number {
  measure ??= { ctx: document.createElement("canvas").getContext("2d"), family: getComputedStyle(document.body).fontFamily || "sans-serif" };
  if (!measure.ctx) return text.length * size * 0.6;
  measure.ctx.font = `${size}px ${measure.family}`;
  return measure.ctx.measureText(text).width;
}

function capturePointer(el: Element, pointerId: number): boolean {
  try {
    el.setPointerCapture(pointerId);
    return true;
  } catch {
    return false;
  }
}
