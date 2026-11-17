import { useCallback, useEffect, useState } from "react";
import type { InstructionEntry, InstructionsOverview, LinkOutcome } from "@ids/shared";
import { backend } from "../bridge/backend";
import { useSettings } from "../stores/settings";

type Notice = { kind: "ok" | "err" | "info"; text: string };

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

function linkNotice(name: string, out: LinkOutcome): Notice {
  if (!out.changed) return { kind: "info", text: `${name} já estava vinculado.` };
  const parts = [`${name} vinculado em ${out.target}.`];
  if (out.adopted) parts.push("O conteúdo que já existia lá foi trazido para o grimório.");
  if (out.keptLocal) parts.push("O conteúdo local, diferente do grimório, foi mantido acima do import.");
  if (out.backup) parts.push(`Cópia de segurança: ${out.backup}`);
  return { kind: "ok", text: parts.join(" ") };
}

function StatusTag({ entry }: { entry: InstructionEntry }) {
  if (entry.linked) return <span className="tag ok">Vinculado</span>;
  if (!entry.target) return <span className="tag warn">{entry.projectPath ? "Pasta ausente" : "Não visto nesta máquina"}</span>;
  return <span className="tag">Não vinculado</span>;
}

function FolderPicker({ current, onSaved }: { current: string; onSaved: () => void }) {
  const [dir, setDir] = useState(current);
  useEffect(() => setDir(current), [current]);
  const save = async () => {
    await useSettings.getState().update((s) => ({ ...s, instructions: { ...s.instructions, dir: dir.trim() } }));
    onSaved();
  };
  return (
    <div className="row" style={{ alignItems: "end" }}>
      <label className="field" style={{ flex: 1, minWidth: 260 }}>
        Pasta das instruções
        <input className="input mono" value={dir} placeholder="/caminho/para/ilha-das-sombras/instructions" onChange={(e) => setDir(e.target.value)} />
      </label>
      <button className="btn" onClick={() => void save()} disabled={dir.trim() === current.trim()}>Usar esta pasta</button>
    </div>
  );
}

export function GrimoirePage() {
  const dir = useSettings((s) => s.settings.instructions.dir);
  const [overview, setOverview] = useState<InstructionsOverview | null | undefined>(undefined);
  const [selected, setSelected] = useState("global");
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setOverview(await (await backend()).instructionsOverview());
    } catch (e) {
      setOverview(null);
      setNotice({ kind: "err", text: errorText(e) });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, dir]);

  useEffect(() => {
    if (!overview || selected in saved) return;
    void backend()
      .then((b) => b.readInstructions(selected))
      .then((text) => setSaved((s) => ({ ...s, [selected]: text })))
      .catch((e) => setNotice({ kind: "err", text: errorText(e) }));
  }, [overview, selected, saved]);

  const entries = overview ? [overview.global, ...overview.projects] : [];
  const entry = entries.find((e) => e.key === selected) ?? overview?.global;
  const original = saved[selected];
  const text = drafts[selected] ?? original ?? "";
  const dirty = original !== undefined && drafts[selected] !== undefined && drafts[selected] !== original;
  const isDirty = (key: string) => drafts[key] !== undefined && drafts[key] !== saved[key];

  const save = useCallback(async () => {
    if (!dirty) return;
    setBusy(true);
    try {
      await (await backend()).saveInstructions(selected, text);
      setSaved((s) => ({ ...s, [selected]: text }));
      setDrafts((d) => {
        const next = { ...d };
        delete next[selected];
        return next;
      });
      setNotice({ kind: "ok", text: `${entry?.name ?? selected} salvo.` });
      await refresh();
    } catch (e) {
      setNotice({ kind: "err", text: errorText(e) });
    } finally {
      setBusy(false);
    }
  }, [dirty, selected, text, entry, refresh]);

  const link = async (targets: InstructionEntry[]) => {
    setBusy(true);
    const notices: Notice[] = [];
    const b = await backend();
    for (const t of targets) {
      try {
        notices.push(linkNotice(t.name, await b.linkInstructions(t.key)));
      } catch (e) {
        notices.push({ kind: "err", text: `${t.name}: ${errorText(e)}` });
      }
    }
    setSaved({});
    await refresh();
    setBusy(false);
    const failed = notices.find((n) => n.kind === "err");
    setNotice(notices.length === 1 ? notices[0]! : { kind: failed ? "err" : "ok", text: notices.map((n) => n.text).join("\n") });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  if (overview === undefined) return <div className="page dim">Carregando…</div>;

  if (overview === null) {
    return (
      <div className="page">
        <h2>Grimório</h2>
        <p className="sub">Escolha a pasta <span className="mono">instructions/</span> do repositório da Ilha das Sombras para editar suas instruções do Claude Code.</p>
        <div className="card"><FolderPicker current={dir} onSaved={() => void refresh()} /></div>
        {notice && <div className={notice.kind === "err" ? "error-box" : "dim"} style={{ marginTop: 12 }}>{notice.text}</div>}
      </div>
    );
  }

  const linkable = entries.filter((e) => e.target && !e.linked && (e.key === "global" || e.exists));

  return (
    <div className="page grimoire">
      <h2>Grimório</h2>
      <p className="sub">As instruções que o Claude Code lê: uma global e uma por projeto, guardadas em <span className="mono">{overview.root}</span>.</p>
      <div className="grimoire-body">
        <aside className="card grimoire-list" aria-label="Instruções">
          {entries.map((e) => (
            <button key={e.key} className={`grimoire-item${e.key === "global" ? " global" : ""}`} aria-current={e.key === selected ? "true" : undefined} onClick={() => setSelected(e.key)}>
              <span className="grimoire-name">{e.name}{isDirty(e.key) ? " •" : ""}</span>
              <StatusTag entry={e} />
            </button>
          ))}
          <button className="btn small" style={{ marginTop: 10 }} disabled={busy || linkable.length === 0} onClick={() => void link(linkable)}>
            Vincular tudo ({linkable.length})
          </button>
        </aside>
        {entry && (
          <section className="card grimoire-editor">
            <div className="grimoire-head">
              <div className="grimoire-meta">
                <h3>{entry.name}</h3>
                <div className="grimoire-path" title={entry.file}><span className="dim">Arquivo</span> {entry.file}</div>
                {entry.target ? (
                  <div className="grimoire-path" title={entry.target}><span className="dim">Lido em</span> {entry.target}</div>
                ) : (
                  <div className="grimoire-path">Este projeto ainda não rodou o Claude Code nesta máquina.</div>
                )}
              </div>
              <div className="grimoire-actions">
                <StatusTag entry={entry} />
                {entry.target && !entry.linked && (
                  <button className="btn" disabled={busy || dirty} title={dirty ? "Salve antes de vincular" : undefined} onClick={() => void link([entry])}>Vincular</button>
                )}
                <button className="btn primary" disabled={busy || !dirty} onClick={() => void save()}>Salvar</button>
              </div>
            </div>
            <textarea
              className="input mono grimoire-text"
              aria-label={`Instruções de ${entry.name}`}
              spellCheck={false}
              value={text}
              disabled={original === undefined}
              placeholder={entry.exists ? "" : "Arquivo ainda não existe. Escreva e salve para criá-lo."}
              onChange={(e) => setDrafts((d) => ({ ...d, [selected]: e.target.value }))}
            />
          </section>
        )}
      </div>
      {notice && <div className={notice.kind === "err" ? "error-box" : "card dim"} style={{ marginTop: 12, whiteSpace: "pre-wrap" }} role="status">{notice.text}</div>}
      <details style={{ marginTop: 16 }}>
        <summary className="dim">Pasta das instruções</summary>
        <div style={{ marginTop: 8 }}><FolderPicker current={dir || overview.root} onSaved={() => { setSaved({}); setDrafts({}); }} /></div>
      </details>
    </div>
  );
}
