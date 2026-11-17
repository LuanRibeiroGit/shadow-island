import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Dashboard, LabeledTokens } from "@ids/shared";
import { estimateCost, formatDuration, formatTokens, formatUsd, pivotUsage, totalTokens } from "@ids/analytics";
import { backend } from "../bridge/backend";
import { useSettings } from "../stores/settings";
import { useWorld } from "../stores/world";
import { useUi } from "../stores/ui";
import { Stat } from "../components/Stat";
import { CATEGORY_LABEL, STATE_LABEL, errText } from "../components/labels";
import { AXIS_TEXT, GRID, OTHER, SERIES, colorFor } from "./palette";

const PERIODS = [
  { days: 1, label: "24 horas" },
  { days: 7, label: "7 dias" },
  { days: 30, label: "30 dias" },
  { days: 0, label: "Tudo" },
];

const axisProps = { stroke: GRID, tick: { fill: AXIS_TEXT, fontSize: 11 }, tickLine: false } as const;

export function DashboardPage() {
  const periodDays = useSettings((s) => s.settings.metrics.periodDays);
  const prices = useSettings((s) => s.settings.metrics.prices);
  const showCosts = useSettings((s) => s.settings.metrics.showCosts);
  const usageVersion = useWorld((s) => s.world.usageVersion);
  const missionsVersion = useWorld((s) => Object.keys(s.world.missions).length);
  const [data, setData] = useState<Dashboard | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [asTable, setAsTable] = useState(false);

  useEffect(() => {
    let alive = true;
    void backend()
      .then((b) => b.getDashboard(periodDays))
      .then((d) => alive && (setData(d), setErr(null)))
      .catch((e: unknown) => alive && setErr(errText(e)));
    return () => {
      alive = false;
    };
  }, [periodDays, usageVersion, missionsVersion]);

  const setPeriod = (d: number) => void useSettings.getState().update((s) => ({ ...s, metrics: { ...s.metrics, periodDays: d } }));

  return (
    <div className="page">
      <h2>Métricas</h2>
      <p className="sub">Tokens vêm das transcrições locais do Claude Code (campo usage). Custos são estimativas com os preços que você configurar.</p>
      <div className="row" style={{ marginBottom: 14 }} role="toolbar" aria-label="Filtros">
        <div className="tabs" style={{ margin: 0 }}>
          {PERIODS.map((p) => (
            <button key={p.days} className="btn small" aria-pressed={periodDays === p.days} onClick={() => setPeriod(p.days)}>{p.label}</button>
          ))}
        </div>
        <label className="row" style={{ gap: 6, fontSize: 13 }}>
          <input type="checkbox" checked={asTable} onChange={(e) => setAsTable(e.target.checked)} /> Ver como tabela
        </label>
      </div>
      {err && <div className="error-box">{err}</div>}
      {!data ? <p className="dim">Carregando…</p> : <DashboardBody d={data} prices={prices} showCosts={showCosts} asTable={asTable} />}
    </div>
  );
}

function DashboardBody({ d, prices, showCosts, asTable }: { d: Dashboard; prices: Parameters<typeof estimateCost>[1]; showCosts: boolean; asTable: boolean }) {
  const go = useUi((s) => s.go);
  const o = d.overview;
  const t = o.tokens;
  const has = t.records > 0;
  const cost = estimateCost(o.usageByModel, prices);
  const daily = d.bucketMs >= 86_400_000;
  const fmtT = (ms: number) => new Date(ms).toLocaleString("pt-BR", daily ? { day: "2-digit", month: "2-digit" } : { hour: "2-digit", minute: "2-digit" });

  const usage = useMemo(() => {
    const { points, models } = pivotUsage(d.usageSeries, d.from, d.to, d.bucketMs);
    // Fixed order by model name; beyond the palette, fold into "Outros".
    const shown = models.slice(0, SERIES.length);
    const rest = models.slice(SERIES.length);
    const rows = points.map((p) => {
      const r: Record<string, number> = { t: p.t };
      for (const m of shown) r[m] = p[m] ?? 0;
      if (rest.length) r.Outros = rest.reduce((s, m) => s + (p[m] ?? 0), 0);
      return r;
    });
    return { rows, keys: rest.length ? [...shown, "Outros"] : shown, models: shown };
  }, [d]);

  const activity = d.activitySeries.map((a) => ({ t: Number(a.key), calls: a.count, failures: a.durationMs }));

  return (
    <>
      <div className="grid kpis">
        <Stat testId="kpi-active" label="Agentes ativos agora" value={String(o.activeAgents)} quality="real" hint={`${o.waitingAgents} aguardando você`} />
        <Stat label="Missões concluídas" value={String(o.missionsCompleted)} quality="calculated" hint={`${o.missionsInProgress} em andamento`} />
        <Stat label="Erros de ferramentas" value={String(o.errors)} quality="real" />
        <Stat label="Tempo ativo dos agentes" value={formatDuration(o.activeTimeMs)} quality="calculated" />
        <Stat testId="kpi-tokens" label="Tokens (entrada + saída)" value={has ? formatTokens(t.input + t.output) : null} quality="real" hint={has ? `+ ${formatTokens(t.cacheRead)} lidos do cache, ${formatTokens(t.cacheCreation)} gravados` : "Nenhum uso nas transcrições do período"} />
        {showCosts && (
          <Stat
            testId="kpi-cost"
            label="Custo estimado"
            value={cost.usd !== null ? formatUsd(cost.usd) : null}
            quality="estimated"
            hint={cost.usd === null ? (prices.length ? "Nenhum modelo usado tem preço configurado" : "Configure preços em Configurações › Métricas (há um botão com a tabela da Anthropic)") : cost.coverage < 1 ? `Cobre ${(cost.coverage * 100).toFixed(0)}% dos tokens · sem preço: ${cost.unpricedModels.join(", ")}` : undefined}
          />
        )}
      </div>

      <div className="grid two" style={{ marginTop: 14 }}>
        <ChartCard title="Tokens por modelo" subtitle={`Entrada + saída por ${daily ? "dia" : "hora"}`} empty={usage.rows.length === 0}>
          {asTable ? (
            <Table head={["Período", ...usage.keys]} rows={usage.rows.map((r) => [fmtT(r.t!), ...usage.keys.map((k) => formatTokens(r[k] ?? 0))])} />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={usage.rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap={2}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="t" tickFormatter={fmtT} {...axisProps} />
                <YAxis tickFormatter={(v: number) => formatTokens(v)} width={52} {...axisProps} axisLine={false} />
                <Tooltip content={<TokensTooltip fmt={fmtT} />} cursor={{ fill: "#ffffff08" }} />
                {usage.keys.length > 1 && <Legend wrapperStyle={{ fontSize: 12, color: AXIS_TEXT }} />}
                {usage.keys.map((k, i) => (
                  <Bar key={k} dataKey={k} stackId="u" fill={k === "Outros" ? OTHER : colorFor(usage.models, k)} stroke="#132427" strokeWidth={i === usage.keys.length - 1 ? 0 : 1} radius={i === usage.keys.length - 1 ? [4, 4, 0, 0] : 0} isAnimationActive={false} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Chamadas de ferramentas" subtitle={`Por ${daily ? "dia" : "hora"} (eventos PreToolUse reais)`} empty={activity.length === 0}>
          {asTable ? (
            <Table head={["Período", "Chamadas", "Falhas"]} rows={activity.map((a) => [fmtT(a.t), String(a.calls), String(a.failures)])} />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={activity} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="t" tickFormatter={fmtT} {...axisProps} />
                <YAxis allowDecimals={false} width={40} {...axisProps} axisLine={false} />
                <Tooltip cursor={{ fill: "#ffffff08" }} labelFormatter={(v) => fmtT(Number(v))} contentStyle={tooltipStyle} formatter={(v, n) => [String(v), n === "calls" ? "Chamadas" : n]} />
                <Bar dataKey="calls" fill={SERIES[0]} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <RankCard title="Tokens por sessão" items={d.bySession.map((i) => ({ ...i, label: `${i.label} · ${i.id.slice(0, 8)}` }))} asTable={asTable} onPick={(id) => go({ page: "history", sessionId: id })} />
        <RankCard title="Tokens por agente" items={d.byAgent} asTable={asTable} onPick={(id) => go({ page: "agent", agentId: id })} />

        <DistCard
          title="Tempo por estado"
          subtitle="Soma da duração dos estados registrados"
          rows={d.states.map((s) => ({ label: STATE_LABEL[s.key as keyof typeof STATE_LABEL] ?? s.key, value: s.durationMs, text: formatDuration(s.durationMs) }))}
          asTable={asTable}
        />
        <DistCard
          title="Ferramentas por tipo de atividade"
          subtitle="Chamadas concluídas no período"
          rows={d.categories.map((c) => ({ label: CATEGORY_LABEL[c.key as keyof typeof CATEGORY_LABEL] ?? c.key, value: c.count, text: `${c.count} · ${formatDuration(c.durationMs)}` }))}
          asTable={asTable}
        />
      </div>

      <section className="card px-frame" style={{ marginTop: 14 }}>
        <h3>Uso por modelo</h3>
        {o.usageByModel.length === 0 ? (
          <p className="faint">Indisponível: nenhuma resposta com usage foi encontrada nas transcrições do período.</p>
        ) : (
          <Table
            head={["Modelo", "Entrada", "Saída", "Cache (gravação)", "Cache (leitura)", "Respostas", "Custo estimado"]}
            rows={o.usageByModel.map((u) => {
              const c = estimateCost([u], prices);
              return [u.model ?? "desconhecido", formatTokens(u.tokens.input), formatTokens(u.tokens.output), formatTokens(u.tokens.cacheCreation), formatTokens(u.tokens.cacheRead), String(u.tokens.records), c.usd !== null ? formatUsd(c.usd) : "Indisponível"];
            })}
          />
        )}
      </section>
    </>
  );
}

const tooltipStyle = { background: "#0f1c1f", border: "2px solid #2f5e56", borderRadius: 2, fontSize: 12, color: "#dceee8" };

function TokensTooltip({ active, payload, label, fmt }: { active?: boolean; payload?: { name?: string | number; value?: unknown; color?: string }[]; label?: unknown; fmt: (t: number) => string }) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + Number(p.value ?? 0), 0);
  return (
    <div style={{ ...tooltipStyle, padding: "6px 10px" }}>
      <div style={{ marginBottom: 4 }}>{fmt(Number(label))} · {formatTokens(total)}</div>
      {payload.filter((p) => Number(p.value) > 0).map((p) => (
        <div key={String(p.name)} className="row" style={{ gap: 6 }}>
          <span style={{ width: 8, height: 8, background: p.color, display: "inline-block" }} />
          <span>{String(p.name)}</span>
          <span style={{ marginLeft: "auto" }}>{formatTokens(Number(p.value))}</span>
        </div>
      ))}
    </div>
  );
}

function ChartCard({ title, subtitle, empty, children }: { title: string; subtitle?: string; empty: boolean; children: React.ReactNode }) {
  return (
    <section className="card px-frame">
      <h3 style={{ marginBottom: 2 }}>{title}</h3>
      {subtitle && <p className="faint" style={{ margin: "0 0 10px", fontSize: 12 }}>{subtitle}</p>}
      {empty ? <p className="empty">Indisponível no período</p> : children}
    </section>
  );
}

function RankCard({ title, items, asTable, onPick }: { title: string; items: LabeledTokens[]; asTable: boolean; onPick: (id: string) => void }) {
  const rows = items.filter((i) => i.tokens.records > 0).slice(0, 8).map((i) => ({ id: i.id, label: i.label, value: totalTokens(i.tokens), model: i.model }));
  return (
    <ChartCard title={title} subtitle="Total de tokens, incluindo cache · clique para abrir" empty={rows.length === 0}>
      {asTable ? (
        <Table head={["Nome", "Modelo", "Tokens"]} rows={rows.map((r) => [r.label, r.model ?? "—", formatTokens(r.value)])} />
      ) : (
        <HBars rows={rows.map((r) => ({ key: r.id, label: r.label, value: r.value, text: formatTokens(r.value) }))} onPick={onPick} />
      )}
    </ChartCard>
  );
}

function DistCard({ title, subtitle, rows, asTable }: { title: string; subtitle: string; rows: { label: string; value: number; text: string }[]; asTable: boolean }) {
  return (
    <ChartCard title={title} subtitle={subtitle} empty={rows.length === 0}>
      {asTable ? <Table head={["Item", "Valor"]} rows={rows.map((r) => [r.label, r.text])} /> : <HBars rows={rows.map((r) => ({ key: r.label, ...r }))} />}
    </ChartCard>
  );
}

/** Ranked horizontal bars (single series, so one color and no legend). */
function HBars({ rows, onPick }: { rows: { key: string; label: string; value: number; text: string }[]; onPick?: (key: string) => void }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(80, rows.length * 30 + 10)}>
      <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 64, bottom: 0, left: 0 }} barCategoryGap={6}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="label" width={150} {...axisProps} axisLine={false} tickFormatter={(v: string) => (v.length > 22 ? `${v.slice(0, 21)}…` : v)} />
        <Tooltip cursor={{ fill: "#ffffff08" }} contentStyle={tooltipStyle} formatter={(_v, _n, item) => [String((item.payload as { text: string }).text), ""]} separator="" />
        <Bar
          dataKey="value"
          fill={SERIES[0]}
          radius={[0, 4, 4, 0]}
          isAnimationActive={false}
          cursor={onPick ? "pointer" : undefined}
          onClick={onPick ? (e: unknown) => onPick((e as { payload?: { key: string } }).payload?.key ?? "") : undefined}
        >
          <LabelList dataKey="text" position="right" fill={AXIS_TEXT} fontSize={11} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div style={{ overflow: "auto", maxHeight: 320 }}>
      <table className="table">
        <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={j > 0 ? "mono" : undefined}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}
