import { useEffect, useMemo, useRef, useState } from "react";
import type { Room } from "@ids/shared";
import { activeAgents, activeSessions, agentsByRoom, currentQuest, openMissions } from "@ids/event-system";
import { estimateCost, formatTokens, formatUsd, sumUsage } from "@ids/analytics";
import { resolveCharacter, visualFor } from "@ids/game-engine";
import { useWorld } from "../stores/world";
import { useSettings } from "../stores/settings";
import { useCharacters } from "../stores/characters";
import { useUi } from "../stores/ui";
import { backend } from "../bridge/backend";
import { Portrait } from "../components/Portrait";
import { QualityBadge } from "../components/Stat";
import { EVENT_LABEL, MISSION_CLASS, MISSION_LABEL, ROOM_LABEL, STATE_CLASS, STATE_LABEL, fmtTime, timeAgo } from "../components/labels";
import { CastleScene } from "./scene";
import { CASTLE_H, CASTLE_W, restorationLevel, RESTORATION_LABEL, RESTORATION_THRESHOLDS } from "./layout";
import { useT } from "../i18n";

const ROOM_BLURB: Record<Room, string> = {
  throne: "Agente principal e comando geral.",
  library: "Pesquisa, leitura e investigação de código.",
  forge: "Implementação, edição e construção.",
  laboratory: "Testes, validação e combate a erros.",
  watchtower: "Monitoramento: sessões, eventos e alertas.",
  treasury: "Uso de tokens e custos.",
  barracks: "Agentes descansando ou aguardando.",
};

export function CastlePage({ room }: { room?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<CastleScene | null>(null);
  const [ready, setReady] = useState(false);
  const [scale, setScale] = useState(2);
  const [completed, setCompleted] = useState<number | null>(null);
  const world = useWorld((s) => s.world);
  const settings = useSettings((s) => s.settings);
  const custom = useCharacters((s) => s.custom);
  const go = useUi((s) => s.go);
  const selected = (room as Room | undefined) ?? "throne";

  useEffect(() => {
    const s = new CastleScene();
    scene.current = s;
    s.onRoom = (r) => go({ page: "castle", room: r });
    s.onAgent = (id) => go({ page: "agent", agentId: id });
    void s.init(host.current!).then(() => setReady(true));
    return () => s.destroy();
  }, [go]);

  // Integer scaling keeps pixels crisp; below 2x we fit the space instead so the
  // castle is never stuck at a tiny 1x on mid-size windows.
  useEffect(() => {
    const el = host.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const k = Math.min(el.clientWidth / CASTLE_W, el.clientHeight / CASTLE_H);
      setScale(k >= 2 ? Math.floor(k) : k);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Restoration level from real completed missions.
  const finishedCount = Object.values(world.missions).filter((m) => m.status === "completed").length;
  useEffect(() => {
    void backend()
      .then((b) => b.getDashboard(0))
      .then((d) => setCompleted(d.overview.missionsCompleted))
      .catch(() => setCompleted(null));
  }, [finishedCount]);
  const level = restorationLevel(completed ?? 0);

  const agents = useMemo(() => activeAgents(world), [world]);
  const encounters = useMemo(() => Object.values(world.encounters), [world]);
  useEffect(() => {
    if (!ready || !scene.current) return;
    scene.current.buildRooms(level);
    scene.current.setHighlight(null, selected);
    void scene.current.sync(agents, encounters, custom, Date.now(), { animationSpeed: settings.desktop.animationSpeed, animationsEnabled: settings.desktop.animationsEnabled });
  }, [ready, agents, encounters, custom, level, selected, settings.desktop.animationSpeed, settings.desktop.animationsEnabled]);

  return (
    <div className="castle-layout">
      <div className="castle-stage" data-testid="castle-stage">
        <div ref={host} style={{ width: CASTLE_W * scale, height: CASTLE_H * scale }} className="castle-canvas-host" />
        <div className="room-hint">
          {RESTORATION_LABEL[level]}
          {completed !== null && level < RESTORATION_THRESHOLDS.length - 1 && ` · ${completed}/${RESTORATION_THRESHOLDS[level + 1]} missões para restaurar mais o castelo`}
        </div>
      </div>
      <aside className="castle-side">
        <div className="tabs" role="tablist">
          {(Object.keys(ROOM_LABEL) as Room[]).filter((r) => !settings.castle.hiddenRooms.includes(r)).map((r) => (
            <button key={r} role="tab" aria-selected={selected === r} onClick={() => go({ page: "castle", room: r })}>
              {settings.castle.roomNames[r] || ROOM_LABEL[r]}
            </button>
          ))}
        </div>
        <RoomPanel room={selected} />
      </aside>
    </div>
  );
}

function AgentList({ ids }: { ids: string[] }) {
  const world = useWorld((s) => s.world);
  const custom = useCharacters((s) => s.custom);
  const go = useUi((s) => s.go);
  const t = useT();
  const list = ids.map((id) => world.agents[id]).filter((a) => !!a);
  if (list.length === 0) return <p className="faint">Ninguém aqui agora.</p>;
  return (
    <div>
      {list.map((a) => {
        const vis = visualFor(a, Date.now());
        return (
          <div key={a.id} className="agent-row" onClick={() => go({ page: "agent", agentId: a.id })} data-testid="agent-row">
            <Portrait agent={a} />
            <div style={{ minWidth: 0 }}>
              <div>{resolveCharacter(a, custom).name}</div>
              <div className="faint" style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {a.task ?? (a.currentTool ? `${a.currentTool}${a.detail ? ` · ${a.detail}` : ""}` : a.isMain ? "Agente principal" : (a.agentType ?? ""))}
              </div>
            </div>
            <span className={`tag ${STATE_CLASS[vis.state] ?? ""}`}>{STATE_LABEL[vis.state]}</span>
          </div>
        );
      })}
      <span hidden>{t("common.details")}</span>
    </div>
  );
}

function RoomPanel({ room }: { room: Room }) {
  const world = useWorld((s) => s.world);
  const settings = useSettings((s) => s.settings);
  const t = useT();
  const byRoom = agentsByRoom(world);
  const sessions = activeSessions(world);
  const agents = activeAgents(world);
  const title = settings.castle.roomNames[room] || ROOM_LABEL[room];

  if (room === "throne") {
    const mains = agents.filter((a) => a.isMain);
    const missions = openMissions(world);
    return (
      <div>
        <h3>{title}</h3>
        <p className="dim">{ROOM_BLURB[room]}</p>
        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr 1fr", gap: 8, margin: "12px 0" }}>
          <MiniStat label="Agentes ativos" value={agents.length} />
          <MiniStat label="Sessões abertas" value={sessions.length} />
          <MiniStat label="Missões em curso" value={missions.length} />
        </div>
        {agents.length === 0 && <p className="empty">{t("castle.empty")}</p>}
        {mains.map((m) => {
          const q = currentQuest(world, m.sessionId);
          const subs = agents.filter((a) => a.parentId === m.id);
          const sess = world.sessions[m.sessionId];
          return (
            <div key={m.id} className="card px-frame" style={{ marginBottom: 10 }}>
              <div className="faint" style={{ fontSize: 12 }}>
                {sess?.projectName ?? "Projeto indisponível"} · sessão <span className="mono">{m.sessionId.slice(0, 8)}</span>
                {sess?.model && ` · ${sess.model}`}
              </div>
              <AgentList ids={[m.id]} />
              <div style={{ fontSize: 13 }}>
                <strong>Missão atual:</strong> {q ? q.title : <span className="faint">nenhuma em andamento</span>}
                {q && <span className={`tag ${MISSION_CLASS[q.status]}`} style={{ marginLeft: 6 }}>{MISSION_LABEL[q.status]}</span>}
              </div>
              <div className="faint" style={{ fontSize: 12, marginTop: 4 }}>
                {subs.length} subagente(s) ativos · progresso: {missions.filter((x) => x.sessionId === m.sessionId).length} missão(ões) abertas nesta sessão
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  if (room === "watchtower") {
    const waiting = agents.filter((a) => a.state === "WAITING");
    const failures = world.events.filter((e) => e.isFailure).slice(0, 5);
    return (
      <div>
        <h3>{title}</h3>
        <p className="dim">{ROOM_BLURB[room]}</p>
        <h4>Sessões ativas ({sessions.length})</h4>
        {sessions.length === 0 && <p className="faint">Nenhuma sessão aberta.</p>}
        {sessions.map((s) => (
          <div key={s.id} className="row" style={{ fontSize: 13, justifyContent: "space-between" }}>
            <span>{s.projectName ?? s.cwd ?? s.id.slice(0, 8)}</span>
            <span className="faint">{timeAgo(s.lastEventAt)}</span>
          </div>
        ))}
        <h4>Aguardando você ({waiting.length})</h4>
        <AgentList ids={waiting.map((a) => a.id)} />
        <h4>Erros recentes</h4>
        {failures.length === 0 ? <p className="faint">Nenhum erro recente.</p> : failures.map((e) => (
          <div key={e.id} style={{ fontSize: 13 }} className="row">
            <span className="tag err">{e.toolName ?? e.eventName}</span>
            <span className="dim">{e.detail ?? ""}</span>
            <span className="faint">{fmtTime(e.firedAt)}</span>
          </div>
        ))}
        <h4>Eventos recentes</h4>
        <ul className="timeline">
          {world.events.slice(0, 14).map((e) => (
            <li key={e.id}>
              <span className="t">{fmtTime(e.firedAt)}</span>
              <span className={`mark ${e.isFailure ? "fail" : e.eventName.endsWith("Start") ? "start" : ""}`} />
              <span>
                {EVENT_LABEL[e.eventName] ?? e.eventName}
                {e.toolName && <span className="dim"> · {e.toolName}</span>}
                {e.detail && <span className="faint"> · {e.detail}</span>}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (room === "treasury") return <TreasuryPanel title={title} />;

  return (
    <div>
      <h3>{title}</h3>
      <p className="dim">{ROOM_BLURB[room]}</p>
      <AgentList ids={byRoom[room].map((a) => a.id)} />
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="px-frame" style={{ padding: "8px 10px" }}>
      <div className="faint" style={{ fontSize: 11 }}>{label}</div>
      <div className="mono" style={{ fontSize: 20 }}>{value}</div>
    </div>
  );
}

function TreasuryPanel({ title }: { title: string }) {
  const usageVersion = useWorld((s) => s.world.usageVersion);
  const settings = useSettings((s) => s.settings);
  const go = useUi((s) => s.go);
  const [data, setData] = useState<Awaited<ReturnType<Awaited<ReturnType<typeof backend>>["getDashboard"]>> | null>(null);
  useEffect(() => {
    void backend().then((b) => b.getDashboard(1)).then(setData).catch(() => {});
  }, [usageVersion]);
  const tok = data ? sumUsage(data.overview.usageByModel) : null;
  const cost = data ? estimateCost(data.overview.usageByModel, settings.metrics.prices) : null;
  const has = !!tok && tok.records > 0;
  return (
    <div>
      <h3>{title}</h3>
      <p className="dim">{ROOM_BLURB.treasury} Últimas 24 h.</p>
      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div className="px-frame card">
          <div className="faint row" style={{ fontSize: 11, justifyContent: "space-between" }}>Entrada <QualityBadge quality={has ? "real" : "unavailable"} /></div>
          <div className="mono" style={{ fontSize: 18 }}>{has ? formatTokens(tok!.input + tok!.cacheCreation + tok!.cacheRead) : "Indisponível"}</div>
        </div>
        <div className="px-frame card">
          <div className="faint row" style={{ fontSize: 11, justifyContent: "space-between" }}>Saída <QualityBadge quality={has ? "real" : "unavailable"} /></div>
          <div className="mono" style={{ fontSize: 18 }}>{has ? formatTokens(tok!.output) : "Indisponível"}</div>
        </div>
        <div className="px-frame card" style={{ gridColumn: "span 2" }}>
          <div className="faint row" style={{ fontSize: 11, justifyContent: "space-between" }}>Custo <QualityBadge quality={cost?.quality ?? "unavailable"} /></div>
          <div className="mono" style={{ fontSize: 18 }}>{cost?.usd != null ? formatUsd(cost.usd) : "Indisponível"}</div>
          {settings.metrics.prices.length === 0 && <div className="faint" style={{ fontSize: 11 }}>Configure preços de referência para estimar custos.</div>}
        </div>
      </div>
      <h4>Por sessão</h4>
      {(data?.bySession ?? []).slice(0, 8).map((s) => (
        <div key={s.id + (s.model ?? "")} className="row" style={{ justifyContent: "space-between", fontSize: 13 }}>
          <span>{s.label} <span className="faint">{s.model ?? ""}</span></span>
          <span className="mono">{formatTokens(s.tokens.input + s.tokens.output + s.tokens.cacheCreation + s.tokens.cacheRead)}</span>
        </div>
      ))}
      <button className="btn" style={{ marginTop: 12 }} onClick={() => go({ page: "dashboard" })}>Abrir painel completo</button>
    </div>
  );
}
