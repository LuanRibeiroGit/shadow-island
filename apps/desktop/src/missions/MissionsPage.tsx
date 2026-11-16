import { useEffect, useMemo, useState } from "react";
import type { Mission, MissionKind, MissionStatus } from "@ids/shared";
import { formatDuration } from "@ids/analytics";
import { backend } from "../bridge/backend";
import { useWorld } from "../stores/world";
import { useUi } from "../stores/ui";
import { MISSION_CLASS, MISSION_LABEL, fmtDateTime } from "../components/labels";
import { PERIOD_OPTIONS, ProjectSelect, Select, periodFrom } from "../components/Filters";

const KIND_LABEL: Record<MissionKind, string> = { prompt: "Pedido (prompt)", task: "Tarefa", subagent: "Subagente" };

/**
 * Missions come only from real lifecycle events: a prompt (UserPromptSubmit → Stop),
 * a task (TaskCreated → TaskCompleted) or a subagent run. No percentages are shown
 * because Claude Code does not report progress.
 */
export function MissionsPage() {
  const [status, setStatus] = useState<"" | MissionStatus>("");
  const [kind, setKind] = useState<"" | MissionKind>("");
  const [period, setPeriod] = useState(7);
  const [project, setProject] = useState(0);
  const [rows, setRows] = useState<Mission[] | null>(null);
  const live = useWorld((s) => s.world.missions);
  const go = useUi((s) => s.go);

  useEffect(() => {
    void backend()
      .then((b) => b.listMissions({ status: status || undefined, category: kind || undefined, from: periodFrom(period), projectId: project || undefined, limit: 300 }))
      .then(setRows)
      .catch(() => setRows([]));
  }, [status, kind, period, project]);

  // Merge live updates over the loaded page so statuses change without reloading.
  const merged = useMemo(() => (rows ?? []).map((m) => live[m.id] ?? m), [rows, live]);
  const counts = useMemo(() => {
    const c: Partial<Record<MissionStatus, number>> = {};
    for (const m of merged) c[m.status] = (c[m.status] ?? 0) + 1;
    return c;
  }, [merged]);

  return (
    <div className="page">
      <h2>Missões</h2>
      <p className="sub">Cada pedido enviado ao Claude Code, cada tarefa criada e cada subagente convocado vira uma missão.</p>
      <div className="row filters">
        <Select label="Status" value={status} onChange={setStatus} options={[{ value: "", label: "Todos" }, ...(Object.keys(MISSION_LABEL) as MissionStatus[]).map((s) => ({ value: s, label: MISSION_LABEL[s] }))]} />
        <Select label="Tipo" value={kind} onChange={setKind} options={[{ value: "", label: "Todos" }, ...(Object.keys(KIND_LABEL) as MissionKind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }))]} />
        <Select label="Período" value={period} onChange={setPeriod} options={PERIOD_OPTIONS} />
        <ProjectSelect value={project} onChange={setProject} />
      </div>
      <div className="row" style={{ margin: "10px 0" }}>
        {(Object.keys(counts) as MissionStatus[]).map((s) => (
          <span key={s} className={`tag ${MISSION_CLASS[s]}`}>{MISSION_LABEL[s]}: {counts[s]}</span>
        ))}
      </div>
      {rows === null ? (
        <p className="dim">Carregando…</p>
      ) : merged.length === 0 ? (
        <p className="empty">Nenhuma missão com esses filtros.</p>
      ) : (
        <table className="table" data-testid="missions-table">
          <thead>
            <tr><th>Status</th><th>Missão</th><th>Tipo</th><th>Início</th><th>Duração</th><th /></tr>
          </thead>
          <tbody>
            {merged.map((m) => (
              <tr key={m.id}>
                <td><span className={`tag ${MISSION_CLASS[m.status]}`}>{MISSION_LABEL[m.status]}</span></td>
                <td>
                  {m.title}
                  {m.description && <div className="faint" style={{ fontSize: 12 }}>{m.description}</div>}
                </td>
                <td className="dim">{KIND_LABEL[m.kind]}</td>
                <td className="dim">{fmtDateTime(m.startedAt)}</td>
                <td className="mono">{m.completedAt ? formatDuration(m.completedAt - m.startedAt) : "—"}</td>
                <td className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                  {m.agentId && <button className="btn small" onClick={() => go({ page: "agent", agentId: m.agentId! })}>Agente</button>}
                  <button className="btn small" onClick={() => go({ page: "history", sessionId: m.sessionId })}>Sessão</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
