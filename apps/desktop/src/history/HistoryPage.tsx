import { useEffect, useState } from "react";
import type { EventRecord, SessionDetail, SessionSummary } from "@ids/shared";
import { formatDuration, formatTokens, sumUsage, totalTokens } from "@ids/analytics";
import { backend } from "../bridge/backend";
import { useWorld } from "../stores/world";
import { useUi } from "../stores/ui";
import { CATEGORY_LABEL, EVENT_LABEL, MISSION_CLASS, MISSION_LABEL, STATE_LABEL, fmtDateTime, fmtTime } from "../components/labels";
import { PERIOD_OPTIONS, ProjectSelect, Select, periodFrom } from "../components/Filters";
import { Stat } from "../components/Stat";

export function HistoryPage({ sessionId }: { sessionId?: string }) {
  return sessionId ? <SessionView id={sessionId} /> : <HistoryList />;
}

function HistoryList() {
  const [period, setPeriod] = useState(7);
  const [project, setProject] = useState(0);
  const [status, setStatus] = useState<"" | "active" | "ended">("");
  const [category, setCategory] = useState("");
  const [eventName, setEventName] = useState("");
  const [failuresOnly, setFailuresOnly] = useState(false);
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [events, setEvents] = useState<EventRecord[] | null>(null);
  const version = useWorld((s) => s.world.lastUpdateAt);
  const go = useUi((s) => s.go);

  useEffect(() => {
    const from = periodFrom(period);
    void backend().then(async (b) => {
      const [s, e] = await Promise.all([
        b.listSessions({ from, projectId: project || undefined, status: status || undefined, limit: 100 }),
        b.listEvents({ from, projectId: project || undefined, category: category || undefined, eventName: eventName || undefined, status: failuresOnly ? "failure" : undefined, limit: 200 }),
      ]);
      setSessions(s);
      setEvents(e);
    }).catch(() => (setSessions([]), setEvents([])));
  }, [period, project, status, category, eventName, failuresOnly, version]);

  return (
    <div className="page">
      <h2>Histórico</h2>
      <p className="sub">Sessões e eventos registrados localmente. Apenas metadados: nomes de arquivos, o início de comandos e (se ativado) um trecho curto do prompt.</p>
      <div className="row filters">
        <Select label="Período" value={period} onChange={setPeriod} options={PERIOD_OPTIONS} />
        <ProjectSelect value={project} onChange={setProject} />
        <Select label="Sessões" value={status} onChange={setStatus} options={[{ value: "", label: "Todas" }, { value: "active", label: "Abertas" }, { value: "ended", label: "Encerradas" }]} />
        <Select label="Atividade" value={category} onChange={setCategory} options={[{ value: "", label: "Todas" }, ...Object.entries(CATEGORY_LABEL).map(([k, v]) => ({ value: k, label: v }))]} />
        <Select label="Evento" value={eventName} onChange={setEventName} options={[{ value: "", label: "Todos" }, ...Object.entries(EVENT_LABEL).map(([k, v]) => ({ value: k, label: v }))]} />
        <label className="row" style={{ gap: 6, fontSize: 13, alignSelf: "end", paddingBottom: 6 }}>
          <input type="checkbox" checked={failuresOnly} onChange={(e) => setFailuresOnly(e.target.checked)} /> Só falhas
        </label>
      </div>
      <div className="grid two" style={{ marginTop: 14, alignItems: "start" }}>
        <section className="card px-frame">
          <h3>Sessões</h3>
          {sessions === null ? <p className="dim">Carregando…</p> : sessions.length === 0 ? <p className="empty">Nenhuma sessão no período.</p> : (
            <table className="table" data-testid="sessions-table">
              <thead><tr><th>Sessão</th><th>Início</th><th>Agentes</th><th>Tokens</th><th>Erros</th></tr></thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.session.id} className="clickable" onClick={() => go({ page: "history", sessionId: s.session.id })}>
                    <td>
                      <div>{s.session.title ?? s.session.projectName ?? "Sessão"}</div>
                      <div className="faint mono" style={{ fontSize: 11 }}>{s.session.endedAt ? "encerrada" : "aberta"} · {s.session.id.slice(0, 8)}</div>
                    </td>
                    <td className="dim">{fmtDateTime(s.session.startedAt)}</td>
                    <td className="mono">{s.agentCount}</td>
                    <td className="mono">{s.tokens.records > 0 ? formatTokens(totalTokens(s.tokens)) : "Indisponível"}</td>
                    <td className="mono">{s.errorCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <section className="card px-frame">
          <h3>Eventos</h3>
          {events === null ? <p className="dim">Carregando…</p> : events.length === 0 ? <p className="empty">Nenhum evento com esses filtros.</p> : <Timeline events={events} withDate />}
        </section>
      </div>
    </div>
  );
}

function Timeline({ events, withDate }: { events: EventRecord[]; withDate?: boolean }) {
  const go = useUi((s) => s.go);
  return (
    <ul className="timeline">
      {events.map((e) => (
        <li key={e.id}>
          <span className="t">{withDate ? fmtDateTime(e.firedAt) : fmtTime(e.firedAt)}</span>
          <span className={`mark ${e.isFailure ? "fail" : ""}`} />
          <span>
            {EVENT_LABEL[e.eventName] ?? e.eventName}
            {e.toolName && <span className="dim"> · {e.toolName}</span>}
            {e.category && <span className="faint"> · {CATEGORY_LABEL[e.category] ?? e.category}</span>}
            {e.detail && <span className="faint mono"> · {e.detail}</span>}
            {e.agentId && (
              <button className="link" onClick={() => go({ page: "agent", agentId: e.agentId! })}> agente</button>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

function SessionView({ id }: { id: string }) {
  const [d, setD] = useState<SessionDetail | null | undefined>(undefined);
  const version = useWorld((s) => s.world.sessions[id]?.lastEventAt ?? 0);
  const usageVersion = useWorld((s) => s.world.usageVersion);
  const go = useUi((s) => s.go);
  useEffect(() => {
    void backend().then((b) => b.getSessionDetail(id)).then(setD).catch(() => setD(null));
  }, [id, version, usageVersion]);
  if (d === undefined) return <div className="page dim">Carregando…</div>;
  if (d === null) return <div className="page"><button className="btn small" onClick={() => go({ page: "history" })}>← Histórico</button><p className="empty">Sessão não encontrada.</p></div>;
  const s = d.summary.session;
  const tok = sumUsage(d.usageByModel);
  return (
    <div className="page">
      <button className="btn small" onClick={() => go({ page: "history" })}>← Histórico</button>
      <h2 style={{ marginTop: 12 }}>{s.title ?? s.projectName ?? "Sessão"}</h2>
      <p className="sub mono">{s.cwd ?? "diretório indisponível"} · {s.id}</p>
      <div className="grid kpis">
        <Stat label="Duração" value={formatDuration((s.endedAt ?? s.lastEventAt) - s.startedAt)} quality="calculated" hint={s.endedAt ? `Encerrada (${s.endReason ?? "motivo não informado"})` : "Ainda aberta"} />
        <Stat label="Agentes" value={String(d.agents.length)} quality="real" />
        <Stat label="Eventos" value={String(d.summary.eventCount)} quality="real" hint={`${d.summary.errorCount} falha(s)`} />
        <Stat label="Tokens (total)" value={tok.records > 0 ? formatTokens(totalTokens(tok)) : null} quality="real" />
        <Stat label="Modelo" value={s.model ?? (d.usageByModel[0]?.model ?? null)} quality="real" />
      </div>
      <div className="grid two" style={{ marginTop: 14, alignItems: "start" }}>
        <section className="card px-frame">
          <h3>Agentes</h3>
          <table className="table">
            <thead><tr><th>Agente</th><th>Estado final</th><th>Tokens</th></tr></thead>
            <tbody>
              {d.agents.map((a) => {
                const t = d.usageByAgent.find(([aid]) => aid === a.id)?.[1];
                return (
                  <tr key={a.id} className="clickable" onClick={() => go({ page: "agent", agentId: a.id })}>
                    <td>{a.name}<div className="faint" style={{ fontSize: 11 }}>{a.isMain ? "principal" : a.agentType ?? "subagente"}</div></td>
                    <td className="dim">{STATE_LABEL[a.state]}</td>
                    <td className="mono">{t && t.records > 0 ? formatTokens(totalTokens(t)) : "Indisponível"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <h3 style={{ marginTop: 16 }}>Missões</h3>
          {d.missions.length === 0 ? <p className="faint">Nenhuma.</p> : d.missions.map((m) => (
            <div key={m.id} className="row" style={{ fontSize: 13, marginBottom: 4 }}>
              <span className={`tag ${MISSION_CLASS[m.status]}`}>{MISSION_LABEL[m.status]}</span>
              <span>{m.title}</span>
            </div>
          ))}
        </section>
        <section className="card px-frame">
          <h3>Linha do tempo</h3>
          <Timeline events={d.timeline} />
        </section>
      </div>
    </div>
  );
}
