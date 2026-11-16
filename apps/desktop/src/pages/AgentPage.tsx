import { useEffect, useState } from "react";
import type { AgentDetail } from "@ids/shared";
import { estimateCost, formatDuration, formatTokens, formatUsd, sumUsage } from "@ids/analytics";
import { monsterInfo, resolveCharacter, SPECIALTY_LABEL, visualFor } from "@ids/game-engine";
import { backend } from "../bridge/backend";
import { useWorld } from "../stores/world";
import { useSettings } from "../stores/settings";
import { useCrew } from "../stores/crew";
import { useUi } from "../stores/ui";
import { Portrait } from "../components/Portrait";
import { Stat } from "../components/Stat";
import { EVENT_LABEL, MISSION_CLASS, MISSION_LABEL, ROOM_LABEL, STATE_LABEL, fmtDateTime, fmtTime } from "../components/labels";

export function AgentPage({ agentId }: { agentId: string }) {
  const [detail, setDetail] = useState<AgentDetail | null | undefined>(undefined);
  const live = useWorld((s) => s.world.agents[agentId]);
  const usageVersion = useWorld((s) => s.world.usageVersion);
  const prices = useSettings((s) => s.settings.metrics.prices);
  const custom = useCrew().custom;
  const go = useUi((s) => s.go);

  useEffect(() => {
    void backend().then((b) => b.getAgentDetail(agentId)).then(setDetail).catch(() => setDetail(null));
  }, [agentId, live?.updatedAt, usageVersion]);

  if (detail === undefined) return <div className="page dim">Carregando…</div>;
  if (detail === null) return <div className="page"><p className="empty">Agente não encontrado.</p></div>;
  const a = live ?? detail.agent;
  const ch = resolveCharacter(a, custom);
  const vis = visualFor(a, Date.now());
  const tokens = sumUsage(detail.usageByModel);
  const cost = estimateCost(detail.usageByModel, prices);
  const has = tokens.records > 0;
  const end = a.endedAt ?? Date.now();

  return (
    <div className="page">
      <button className="btn small" onClick={() => go({ page: "castle", room: a.room })}>← Voltar ao castelo</button>
      <div className="row" style={{ margin: "14px 0", gap: 16 }}>
        <Portrait agent={a} size={96} />
        <div>
          <h2>{ch.name}</h2>
          <p className="sub" style={{ margin: 0 }}>
            {ch.cls.label} · {a.isMain ? "Agente principal" : `Subagente (${a.agentType ?? "tipo desconhecido"})`} · {SPECIALTY_LABEL[a.specialty]}
          </p>
          <p className="faint" style={{ margin: "4px 0 0" }}>
            {STATE_LABEL[vis.state]} · {ROOM_LABEL[a.room]} · sessão <span className="mono">{a.sessionId}</span>
            {detail.session?.projectName && ` · ${detail.session.projectName}`}
          </p>
        </div>
      </div>
      <div className="grid kpis">
        <Stat label="Tokens de entrada" value={has ? formatTokens(tokens.input + tokens.cacheCreation + tokens.cacheRead) : null} quality="real" hint={has ? `${formatTokens(tokens.cacheRead)} lidos do cache` : "Sem uso registrado na transcrição"} />
        <Stat label="Tokens de saída" value={has ? formatTokens(tokens.output) : null} quality="real" />
        <Stat label="Custo estimado" value={cost.usd !== null ? formatUsd(cost.usd) : null} quality="estimated" hint={cost.unpricedModels.length ? `Sem preço: ${cost.unpricedModels.join(", ")}` : undefined} />
        <Stat label="Tempo de execução" value={formatDuration(end - a.startedAt)} quality="calculated" />
        <Stat label="Ferramentas usadas" value={detail.stats ? String(detail.stats.toolCount) : null} quality="calculated" hint={detail.stats ? `${detail.stats.toolFailures} falha(s)` : undefined} />
        <Stat label="Tarefas concluídas" value={detail.stats ? String(detail.stats.tasksCompleted) : null} quality="calculated" />
      </div>
      <div className="grid two" style={{ marginTop: 14 }}>
        <section className="card px-frame">
          <h3>Agora</h3>
          <dl style={{ display: "grid", gridTemplateColumns: "130px 1fr", gap: "4px 10px", margin: 0 }}>
            <dt className="faint">Tarefa</dt><dd style={{ margin: 0 }}>{a.task ?? "Indisponível"}</dd>
            <dt className="faint">Ferramenta</dt><dd style={{ margin: 0 }}>{a.currentTool ?? "—"}{a.detail ? ` · ${a.detail}` : ""}</dd>
            <dt className="faint">Diretório</dt><dd style={{ margin: 0 }} className="mono">{a.cwd ?? "Indisponível"}</dd>
            <dt className="faint">Início</dt><dd style={{ margin: 0 }}>{fmtDateTime(a.startedAt)}</dd>
            <dt className="faint">Última atualização</dt><dd style={{ margin: 0 }}>{fmtDateTime(a.updatedAt)} ({a.lastEvent ?? "—"})</dd>
            <dt className="faint">Modelos</dt><dd style={{ margin: 0 }}>{detail.usageByModel.map((u) => u.model ?? "?").join(", ") || "Indisponível"}</dd>
          </dl>
          <h3 style={{ marginTop: 16 }}>Missões</h3>
          {detail.missions.length === 0 ? <p className="faint">Nenhuma.</p> : detail.missions.map((m) => (
            <div key={m.id} className="row" style={{ fontSize: 13 }}>
              <span className={`tag ${MISSION_CLASS[m.status]}`}>{MISSION_LABEL[m.status]}</span>
              <span>{m.title}</span>
            </div>
          ))}
          <h3 style={{ marginTop: 16 }}>Monstros enfrentados</h3>
          {detail.encounters.length === 0 ? <p className="faint">Nenhum.</p> : detail.encounters.map((e) => (
            <div key={e.id} className="row" style={{ fontSize: 13 }}>
              <span className={`tag ${e.status === "defeated" ? "ok" : e.status === "active" ? "err" : "warn"}`}>
                {e.status === "defeated" ? "Derrotado (confirmado)" : e.status === "active" ? "Em combate" : "Recuou (sem confirmação)"}
              </span>
              <span>{monsterInfo(e.monster).name}</span>
              <span className="faint mono">{e.signature}</span>
            </div>
          ))}
        </section>
        <section className="card px-frame">
          <h3>Histórico de atividades</h3>
          <ul className="timeline">
            {detail.recentEvents.map((e) => (
              <li key={e.id}>
                <span className="t">{fmtTime(e.firedAt)}</span>
                <span className={`mark ${e.isFailure ? "fail" : ""}`} />
                <span>{EVENT_LABEL[e.eventName] ?? e.eventName}{e.toolName && <span className="dim"> · {e.toolName}</span>}{e.detail && <span className="faint"> · {e.detail}</span>}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
