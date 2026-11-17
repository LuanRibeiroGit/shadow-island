import { useState } from "react";
import { ANTHROPIC_PRICES, ANTHROPIC_PRICES_AS_OF, mergeReferencePrices, validatePrice, type ModelPrice } from "@ids/analytics";
import { useSettings } from "../stores/settings";
import { Toggle } from "./controls";

const EMPTY: ModelPrice = { model: "", input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };
const FIELDS: { k: keyof Omit<ModelPrice, "model">; label: string }[] = [
  { k: "input", label: "Entrada" },
  { k: "output", label: "Saída" },
  { k: "cacheWrite", label: "Cache (gravação)" },
  { k: "cacheRead", label: "Cache (leitura)" },
];

/** Reference prices are entered by the user. The app ships none (no invented costs). */
export function PricesSection() {
  const metrics = useSettings((s) => s.settings.metrics);
  const update = useSettings((s) => s.update);
  const [draft, setDraft] = useState<ModelPrice>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const setPrices = (prices: ModelPrice[]) => void update((s) => ({ ...s, metrics: { ...s.metrics, prices } }));

  const add = () => {
    const p = { ...draft, model: draft.model.trim() };
    const err = validatePrice(p);
    if (err) return setError(err);
    setError(null);
    setPrices([...metrics.prices.filter((x) => x.model !== p.model), p]);
    setDraft(EMPTY);
  };

  return (
    <section className="card px-frame">
      <h3>Métricas e preços de referência</h3>
      <Toggle label="Mostrar tokens" checked={metrics.showTokens} onChange={(v) => void update((s) => ({ ...s, metrics: { ...s.metrics, showTokens: v } }))} />
      <Toggle label="Mostrar custo estimado" checked={metrics.showCosts} onChange={(v) => void update((s) => ({ ...s, metrics: { ...s.metrics, showCosts: v } }))} />
      <p className="faint" style={{ fontSize: 12 }}>
        O app não traz preços prontos. Informe o valor em USD por milhão de tokens conforme a sua tabela de preços. O nome pode ser um prefixo (por exemplo
        “claude-opus-5” cobre “claude-opus-5-5”); o prefixo mais longo vence. Modelos sem preço ficam como “Indisponível”.
      </p>
      <div className="row" style={{ alignItems: "center", marginBottom: 10 }}>
        <button className="btn" onClick={() => setPrices(mergeReferencePrices(metrics.prices, ANTHROPIC_PRICES))}>Usar preços oficiais da Anthropic</button>
        <span className="faint" style={{ fontSize: 12 }}>Tabela pública da API em {ANTHROPIC_PRICES_AS_OF}. Preços que você já cadastrou são mantidos.</span>
      </div>
      {metrics.prices.length > 0 && (
        <table className="table" style={{ marginBottom: 10 }}>
          <thead><tr><th>Modelo</th>{FIELDS.map((f) => <th key={f.k}>{f.label}</th>)}<th /></tr></thead>
          <tbody>
            {metrics.prices.map((p) => (
              <tr key={p.model}>
                <td className="mono">{p.model}</td>
                {FIELDS.map((f) => <td key={f.k} className="mono">${p[f.k]}</td>)}
                <td><button className="btn small" onClick={() => setPrices(metrics.prices.filter((x) => x.model !== p.model))}>Remover</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="row" style={{ alignItems: "end" }}>
        <label className="field">
          <span>Modelo ou prefixo</span>
          <input className="input" value={draft.model} onChange={(e) => setDraft({ ...draft, model: e.target.value })} placeholder="claude-…" maxLength={80} />
        </label>
        {FIELDS.map((f) => (
          <label key={f.k} className="field">
            <span>{f.label} (US$/M)</span>
            <input className="input" type="number" min={0} step="0.01" style={{ width: 110 }} value={draft[f.k]} onChange={(e) => setDraft({ ...draft, [f.k]: Number(e.target.value) })} />
          </label>
        ))}
        <button className="btn" onClick={add} disabled={!draft.model.trim()}>Salvar preço</button>
      </div>
      {error && <div className="error-box" style={{ marginTop: 8 }}>{error}</div>}
    </section>
  );
}
