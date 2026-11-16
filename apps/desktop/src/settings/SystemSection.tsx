import { useEffect, useState } from "react";
import type { Capabilities, SystemInfo } from "@ids/shared";
import { backend } from "../bridge/backend";
import { SupportLine } from "./controls";
import { errText } from "../components/labels";

const CAP_LABEL: Record<keyof Capabilities, string> = {
  tray: "Ícone na bandeja",
  transparentWindows: "Janela transparente",
  alwaysOnTop: "Sempre no topo",
  windowPositioning: "Posicionar a faixa",
  clickThrough: "Clique atravessa a faixa",
  globalShortcuts: "Atalho global",
  autostart: "Iniciar com o sistema",
  notifications: "Notificações",
  skipTaskbar: "Ocultar da barra de tarefas",
};

export function SystemSection() {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [logs, setLogs] = useState<string[] | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    void backend().then((b) => b.systemInfo()).then(setInfo).catch((e: unknown) => setMsg({ ok: false, text: errText(e) }));
  }, []);
  const run = async (f: () => Promise<string>, ok: (r: string) => string) => {
    setMsg(null);
    try {
      setMsg({ ok: true, text: ok(await f()) });
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
    }
  };
  return (
    <>
      <section className="card px-frame">
        <h3>Sistema</h3>
        {!info ? <p className="dim">Carregando…</p> : (
          <dl style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: "4px 10px", margin: 0, fontSize: 13 }}>
            <dt className="faint">Versão</dt><dd style={{ margin: 0 }}>{info.version}{info.debugBuild ? " (desenvolvimento)" : ""}</dd>
            <dt className="faint">Sistema</dt><dd style={{ margin: 0 }}>{info.platform.osName} · {info.platform.arch}</dd>
            <dt className="faint">Sessão gráfica</dt><dd style={{ margin: 0 }}>{info.platform.sessionType} · {info.platform.desktopRaw ?? info.platform.desktop}</dd>
            <dt className="faint">Dados</dt><dd style={{ margin: 0 }} className="mono">{info.dataDir}</dd>
            <dt className="faint">Banco</dt><dd style={{ margin: 0 }} className="mono">{info.dbPath} ({(info.dbSizeBytes / 1024 / 1024).toFixed(1)} MB)</dd>
            <dt className="faint">Log</dt><dd style={{ margin: 0 }} className="mono">{info.logPath}</dd>
          </dl>
        )}
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn" onClick={() => void run(async () => (await backend()).exportData(), (p) => `Dados exportados para ${p}`)}>Exportar dados (JSON)</button>
          <button className="btn" onClick={() => void run(async () => (await backend()).backupDatabase(), (p) => `Backup criado em ${p}`)}>Fazer backup do banco</button>
          <button className="btn" onClick={() => void backend().then((b) => b.readLogs(300)).then(setLogs).catch((e: unknown) => setMsg({ ok: false, text: errText(e) }))}>Ver logs</button>
        </div>
        {msg && <div className={msg.ok ? "ok-box" : "error-box"} style={{ marginTop: 10 }}>{msg.text}</div>}
        {logs && <div className="logs" style={{ marginTop: 10 }}>{logs.length ? logs.join("\n") : "Log vazio."}</div>}
      </section>
      {info && (
        <section className="card px-frame">
          <h3>Recursos da área de trabalho neste sistema</h3>
          <p className="faint" style={{ fontSize: 12, marginTop: 0 }}>Detectado em tempo de execução. Quando algo é limitado, o app usa uma alternativa e explica aqui.</p>
          {(Object.keys(CAP_LABEL) as (keyof Capabilities)[]).map((k) => <SupportLine key={k} name={CAP_LABEL[k]} s={info.capabilities[k]} />)}
        </section>
      )}
    </>
  );
}
