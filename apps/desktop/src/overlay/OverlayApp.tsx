import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import type { Agent, Encounter, SystemInfo } from "@ids/shared";
import { activeAgents, encountersFor } from "@ids/event-system";
import { MessageScheduler, resolveCharacter, SPECIALTY_LABEL, visualFor, type Bubble } from "@ids/game-engine";
import { formatDuration, formatTokens, sumUsage } from "@ids/analytics";
import { backend } from "../bridge/backend";
import { useWorld } from "../stores/world";
import { useSettings } from "../stores/settings";
import { useCharacters } from "../stores/characters";
import { STATE_LABEL, timeAgo } from "../components/labels";
import { OverlayScene, type ScreenPos } from "./scene";

/**
 * Desktop overlay window: transparent, borderless strip near the taskbar with one
 * character per real agent. Clicking a character opens a small card.
 */
export function OverlayApp() {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<OverlayScene | null>(null);
  const [ready, setReady] = useState(false);
  const [positions, setPositions] = useState<ScreenPos[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
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
    s.setCallbacks(setPositions, (id) => setPicked((p) => (p === id ? null : id)));
    void s.init(host.current!).then(() => setReady(true));
    return () => s.destroy();
  }, []);

  const agents = useMemo(() => {
    const active = activeAgents(world);
    if (!settings.desktop.showFinished) return active;
    // Keep finished agents visible while they celebrate, then they leave.
    const now = Date.now();
    const celebrating = world.recentAgents.filter((a) => a.endedAt && now - a.endedAt < 5000);
    return [...active, ...celebrating];
  }, [world, settings.desktop.showFinished]);
  const encounters = useMemo(() => Object.values(world.encounters), [world]);

  useEffect(() => {
    if (!ready || !scene.current) return;
    const d = settings.desktop;
    scene.current.setOptions({ scale: d.characterScale / 2, animationSpeed: d.animationSpeed, animationsEnabled: d.animationsEnabled, walkSpeed: d.walkSpeed }, custom);
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

  // Report clickable areas so the rest of the strip is click-through.
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const boxes = positions.map((p) => ({ x: Math.round(p.x - p.width / 2), y: Math.round(p.top), width: Math.round(p.width), height: Math.round(p.y - p.top) }));
    const card = cardRef.current?.getBoundingClientRect();
    if (card) boxes.push({ x: Math.round(card.left), y: Math.round(card.top), width: Math.round(card.width), height: Math.round(card.height) });
    const key = JSON.stringify(boxes.map((b) => [Math.round(b.x / 8), b.y, b.width, b.height]));
    if (key !== lastBoxes.current) {
      lastBoxes.current = key;
      void backend().then((b) => b.setOverlayHitboxes(boxes));
    }
  }, [positions, picked]);
  const lastBoxes = useRef("");

  const pickedAgent = agents.find((a) => a.id === picked);
  const pickedPos = positions.find((p) => p.id === picked);

  return (
    <div className="overlay-root" onMouseDown={(e) => e.target === e.currentTarget && setPicked(null)}>
      <div ref={host} style={{ position: "absolute", inset: 0 }} />
      {positions.map((p) => {
        const a = agents.find((x) => x.id === p.id);
        if (!a) return null;
        const b = bubbles[p.id];
        const ch = resolveCharacter(a, custom);
        return (
          <div key={p.id}>
            {b && <div className="bubble" style={{ left: clampX(p.x, 130), top: p.top - 4 }}>{b.text}</div>}
            <div className="nameplate" style={{ left: clampX(p.x, 60), top: p.y - 2 }}>{ch.name}</div>
          </div>
        );
      })}
      {pickedAgent && pickedPos && (
        <AgentCard
          ref={cardRef}
          agent={pickedAgent}
          encounter={encountersFor(world, pickedAgent.id)[0]}
          left={Math.min(Math.max(pickedPos.x, 160), window.innerWidth - 160)}
          bottom={window.innerHeight - pickedPos.top + 6}
          onClose={() => setPicked(null)}
          onHide={() => {
            void useCharacters.getState().save(`agent:${pickedAgent.id}`, { ...custom[`agent:${pickedAgent.id}`], hidden: true });
            setPicked(null);
          }}
        />
      )}
    </div>
  );
}


const AgentCard = forwardRef<HTMLDivElement, { agent: Agent; encounter?: Encounter; left: number; bottom: number; onClose: () => void; onHide: () => void }>(
  function AgentCard({ agent, encounter, left, bottom, onClose, onHide }, ref) {
    const world = useWorld((s) => s.world);
    const custom = useCharacters((s) => s.custom);
    const session = world.sessions[agent.sessionId];
    const ch = resolveCharacter(agent, custom);
    const vis = visualFor(agent, Date.now());
    const [tokens, setTokens] = useState<string>("…");
    useEffect(() => {
      let off = false;
      void backend()
        .then((b) => b.getAgentDetail(agent.id))
        .then((d) => {
          if (off) return;
          const t = sumUsage(d?.usageByModel ?? []);
          setTokens(t.records > 0 ? `${formatTokens(t.input + t.cacheCreation + t.cacheRead)} entrada · ${formatTokens(t.output)} saída` : "Indisponível");
        })
        .catch(() => setTokens("Indisponível"));
      return () => {
        off = true;
      };
    }, [agent.id, agent.updatedAt]);
    return (
      <div ref={ref} className="agent-card px-frame" style={{ left, bottom }} role="dialog" aria-label={ch.name}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <strong>{ch.name}</strong>
          <span className="state-tag">{STATE_LABEL[vis.state]}</span>
        </div>
        <div className="faint" style={{ fontSize: 11 }}>
          {agent.isMain ? "Agente principal" : `Subagente · ${agent.agentType ?? "tipo desconhecido"}`} · {SPECIALTY_LABEL[agent.specialty]}
        </div>
        <dl>
          <dt>Sessão</dt>
          <dd className="mono" title={agent.sessionId}>{agent.sessionId.slice(0, 8)}</dd>
          <dt>Projeto</dt>
          <dd>{session?.projectName ?? "Indisponível"}</dd>
          <dt>Tarefa</dt>
          <dd title={agent.task ?? ""}>{agent.task ?? "Indisponível"}</dd>
          <dt>Ferramenta</dt>
          <dd>{agent.currentTool ? `${agent.currentTool}${agent.detail ? ` · ${agent.detail}` : ""}` : "—"}</dd>
          <dt>Ativo há</dt>
          <dd>{formatDuration(Date.now() - agent.startedAt)}</dd>
          <dt>Tokens</dt>
          <dd title="Lidos da transcrição do Claude Code; atualizados ao fim de cada resposta">{tokens}</dd>
          <dt>Último evento</dt>
          <dd>{agent.lastEvent ? `${agent.lastEvent} · ${timeAgo(agent.updatedAt)}` : "—"}</dd>
          {encounter && (
            <>
              <dt>Obstáculo</dt>
              <dd style={{ color: "var(--danger)" }}>{encounter.monster.replace(/_/g, " ")}</dd>
            </>
          )}
        </dl>
        <div className="row">
          <button className="btn small primary" onClick={() => void backend().then((b) => b.showCastle(`agent/${encodeURIComponent(agent.id)}`))}>
            Ver detalhes
          </button>
          <button className="btn small" onClick={onHide} title="Ocultar este personagem da área de trabalho">
            Ocultar
          </button>
          <button className="btn small" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    );
  },
);

/** Keep centered labels (translateX(-50%)) inside the strip near its edges. */
function clampX(x: number, half: number): number {
  return Math.min(Math.max(x, half), Math.max(half, window.innerWidth - half));
}
