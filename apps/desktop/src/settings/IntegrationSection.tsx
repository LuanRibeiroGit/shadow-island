import { useCallback, useEffect, useState } from "react";
import type { IntegrationInfo, SettingsPlan } from "@ids/shared";
import { backend } from "../bridge/backend";
import { useSettings } from "../stores/settings";
import { Modal } from "../components/Modal";
import { EVENT_LABEL, errText, fmtDateTime } from "../components/labels";
import { Toggle } from "./controls";
import { collapse, lineDiff } from "./diff";

/**
 * Install / verify / remove the Claude Code hooks. Every change shows the exact
 * settings.json diff first and needs explicit confirmation; the backend refuses to
 * write if the file changed after the review, and keeps a backup.
 */
export function IntegrationSection({ onIntegrationChange }: { onIntegrationChange: (i: IntegrationInfo) => void }) {
  const [info, setInfo] = useState<IntegrationInfo | null>(null);
  const [plan, setPlan] = useState<{ action: "install" | "remove"; plan: SettingsPlan } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const settings = useSettings((s) => s.settings);
  const update = useSettings((s) => s.update);

  const refresh = useCallback(async () => {
    const i = await (await backend()).integrationInfo();
    setInfo(i);
    onIntegrationChange(i);
  }, [onIntegrationChange]);

  useEffect(() => {
    void refresh().catch((e: unknown) => setMsg({ ok: false, text: errText(e) }));
    const t = setInterval(() => void refresh().catch(() => {}), 5000);
    return () => clearInterval(t);
  }, [refresh]);

  const review = async (action: "install" | "remove") => {
    setMsg(null);
    try {
      const p = await (await backend()).integrationPlan(action);
      if (!p.changed) setMsg({ ok: true, text: action === "install" ? "Nada a mudar: a integração já está instalada." : "Nada a remover: não há hooks da Ilha das Sombras." });
      else setPlan({ action, plan: p });
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
    }
  };

  const confirm = async () => {
    if (!plan) return;
    setBusy(true);
    try {
      const backup = await (await backend()).integrationApply(plan.action, plan.plan.after);
      setMsg({
        ok: true,
        text: `${plan.action === "install" ? "Integração instalada" : "Integração removida"}.${backup ? ` Backup do arquivo anterior: ${backup}` : ""} Sessões do Claude Code já abertas podem precisar ser reiniciadas para carregar os hooks.`,
      });
      setPlan(null);
      await refresh();
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
    } finally {
      setBusy(false);
    }
  };

  const st = info?.status;
  return (
    <>
      <section className="card px-frame">
        <h3>Integração com o Claude Code</h3>
        {!info || !st ? (
          <p className="dim">Verificando…</p>
        ) : (
          <>
            <div className="support"><span className={`tag ${st.fullyInstalled ? "ok" : st.installedEvents.length ? "warn" : "err"}`}>{st.fullyInstalled ? "Instalada" : st.installedEvents.length ? "Parcial" : "Não instalada"}</span><span className="mono">{st.settingsPath}</span></div>
            {!st.settingsValid && st.settingsExists && <div className="error-box">O settings.json atual não é um JSON válido. Nada será alterado até que ele seja corrigido.</div>}
            {st.hooksDisabled && <div className="error-box">O Claude Code está com <span className="mono">disableAllHooks</span> ativo. Os hooks instalados não vão disparar.</div>}
            {st.staleHandlers && <div className="error-box">Há hooks apontando para outra instalação da Ilha das Sombras. Reinstale para atualizar o caminho.</div>}
            {!info.hookExecutableExists && <div className="error-box">O relay de eventos não foi encontrado em {info.hookExecutable}. Reinstale o aplicativo.</div>}
            <p className="faint" style={{ fontSize: 12 }}>
              Eventos: {info.events.map((e) => (st.installedEvents.includes(e) ? "✓ " : "· ") + (EVENT_LABEL[e] ?? e)).join("  ")}
            </p>
            <div className="row">
              <button className="btn primary" onClick={() => void review("install")} disabled={!st.settingsValid && st.settingsExists}>{st.installedEvents.length ? "Verificar / reparar" : "Instalar integração"}</button>
              <button className="btn" onClick={() => void review("remove")} disabled={st.installedEvents.length === 0 && !st.staleHandlers}>Remover integração</button>
              <button className="btn" onClick={() => void refresh()}>Verificar agora</button>
            </div>
          </>
        )}
        {msg && <div className={msg.ok ? "ok-box" : "error-box"} style={{ marginTop: 10 }}>{msg.text}</div>}
      </section>

      <section className="card px-frame">
        <h3>Coleta de eventos</h3>
        <Toggle label="Processar eventos do Claude Code" hint="Desligado, os eventos ficam guardados no spool local e são processados quando você religar." checked={settings.claude.integrationEnabled} onChange={(v) => void update((s) => ({ ...s, claude: { ...s.claude, integrationEnabled: v } }))} />
        <Toggle label="Guardar trecho do prompt (80 caracteres)" hint="Usado como título das missões. Desligado, a missão mostra só “Pedido”." checked={settings.claude.keepPromptExcerpt} onChange={(v) => void update((s) => ({ ...s, claude: { ...s.claude, keepPromptExcerpt: v } }))} />
        <label className="switch">
          <span>Manter histórico por<div className="faint" style={{ fontSize: 12 }}>0 mantém tudo</div></span>
          <span className="row" style={{ gap: 6 }}>
            <input className="input" type="number" min={0} max={3650} style={{ width: 80 }} value={settings.claude.retentionDays} onChange={(e) => void update((s) => ({ ...s, claude: { ...s.claude, retentionDays: Math.max(0, Math.min(3650, Math.round(Number(e.target.value) || 0))) } }))} /> dias
          </span>
        </label>
        {info && (
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", marginTop: 10, fontSize: 13 }} data-testid="diagnostics">
            <Diag k="Coletor" v={info.collector.running ? `ativo (porta ${info.collector.port ?? "?"})` : "parado"} />
            <Diag k="Eventos recebidos" v={String(info.collector.received)} />
            <Diag k="Rejeitados" v={String(info.collector.rejected)} />
            <Diag k="Duplicados" v={String(info.collector.duplicates)} />
            <Diag k="Recuperados do spool" v={String(info.collector.replayed)} />
            <Diag k="Spool pendente" v={`${info.collector.spoolBytes} bytes`} />
            <Diag k="Último evento" v={info.db.lastEventAt ? fmtDateTime(info.db.lastEventAt) : "nenhum"} />
            <Diag k="Eventos na última hora" v={String(info.db.eventsLastHour)} />
            <Diag k="Total no banco" v={`${info.db.events} eventos · ${info.db.sessions} sessões`} />
            {info.collector.lastError && <Diag k="Último erro" v={info.collector.lastError} />}
          </div>
        )}
      </section>

      {plan && (
        <Modal
          title={plan.action === "install" ? "Revisar instalação" : "Revisar remoção"}
          onClose={() => setPlan(null)}
          footer={
            <>
              <button className="btn" onClick={() => setPlan(null)}>Cancelar</button>
              <button className="btn primary" disabled={busy} onClick={() => void confirm()}>{plan.action === "install" ? "Confirmar e instalar" : "Confirmar e remover"}</button>
            </>
          }
        >
          <p className="dim" style={{ marginTop: 0 }}>
            Arquivo: <span className="mono">{plan.plan.settingsPath}</span>. Só as entradas da Ilha das Sombras mudam; seus outros hooks e configurações ficam como estão.
            Um backup será salvo antes da gravação.
          </p>
          <p className="faint" style={{ fontSize: 12 }}>Eventos afetados: {plan.plan.changedEvents.join(", ")}</p>
          <div className="diff" data-testid="plan-diff">
            {collapse(lineDiff(plan.plan.before, plan.plan.after)).map((l, i) =>
              l.kind === "gap" ? <span key={i} className="faint" style={{ display: "block" }}>  … {l.count} linha(s) sem mudança</span> : <span key={i} className={l.kind === "same" ? undefined : l.kind} style={l.kind === "same" ? { display: "block" } : undefined}>{l.kind === "add" ? "+ " : l.kind === "del" ? "- " : "  "}{l.text}</span>,
            )}
          </div>
        </Modal>
      )}
    </>
  );
}

function Diag({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="faint" style={{ fontSize: 11 }}>{k}</div>
      <div className="mono">{v}</div>
    </div>
  );
}
