import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { SPECIALTIES, type Agent, type Specialty } from "@ids/shared";
import { CLASSES, SPECIALTY_LABEL, resolveCharacter, type CharacterCustomization, type Palette } from "@ids/game-engine";
import { useCharacters } from "../stores/characters";
import { useSettings } from "../stores/settings";
import { useWorld } from "../stores/world";
import { SpriteCanvas } from "../components/Portrait";
import { Select } from "../components/Filters";
import { backend } from "../bridge/backend";

const DEFAULT_CLASS: Record<Specialty, string> = {
  architect: "tide_architect",
  developer: "spectral_smith",
  researcher: "wraith_scholar",
  tester: "mist_alchemist",
  reviewer: "bone_sentinel",
  debugger: "shade_lancer",
  documentation: "ink_scribe",
  general: "wisp",
};

const PREVIEW_ANIMS: { value: string; label: string }[] = [
  { value: "idle", label: "Parado" },
  { value: "move", label: "Andando" },
  { value: "work", label: "Trabalhando" },
  { value: "read", label: "Lendo" },
  { value: "cast", label: "Conjurando (testes/build)" },
  { value: "attack", label: "Combate" },
  { value: "wait", label: "Aguardando você" },
  { value: "cheer", label: "Comemorando" },
  { value: "hurt", label: "Erro" },
];

/** Agent cards drawn at a time (each one animates a sprite). */
const PAGE = 24;

/**
 * Character customization. Saved per specialty ("specialty:tester") or per agent
 * ("agent:<id>"). The agent's real specialty decides which entry applies.
 */
export function CharactersPage() {
  const custom = useCharacters((s) => s.custom);
  const world = useWorld((s) => s.world);
  const [anim, setAnim] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setAnim((a) => a + 1), 220);
    return () => clearInterval(t);
  }, []);
  // Every agent ever recorded, not only the ones in memory. Live agents come from
  // the world (always fresh); the rest is read from the database.
  const [stored, setStored] = useState<Agent[]>([]);
  const [shown, setShown] = useState(PAGE);
  const liveKey = Object.values(world.agents).concat(world.recentAgents).map((a) => `${a.id}:${a.specialty}:${a.endedAt ?? ""}`).join("|");
  const reload = useCallback(() => {
    void backend()
      .then((b) => b.listAgents({ limit: 1000 }))
      .then(setStored)
      .catch(() => {});
  }, []);
  useEffect(reload, [reload, liveKey]);
  const agents = useMemo(() => {
    const byId = new Map<string, Agent>();
    for (const a of stored) byId.set(a.id, a);
    for (const a of world.recentAgents) byId.set(a.id, a);
    for (const a of Object.values(world.agents)) byId.set(a.id, a);
    return [...byId.values()].sort((a, b) => Number(a.endedAt !== null) - Number(b.endedAt !== null) || b.startedAt - a.startedAt);
  }, [stored, world.agents, world.recentAgents]);
  const removed = (id: string) => {
    setStored((s) => s.filter((a) => a.id !== id));
    setTimeout(reload, 400);
  };

  return (
    <div className="page">
      <h2>Personagens</h2>
      <p className="sub">A classe padrão vem da especialidade real do agente. Você pode trocar classe, cores, tamanho e visibilidade por especialidade, ou só para um agente.</p>
      <h3>Por especialidade</h3>
      <div className="char-grid">
        {SPECIALTIES.map((s) => (
          <CustomCard key={s} storeKey={`specialty:${s}`} title={SPECIALTY_LABEL[s]} defaultClass={DEFAULT_CLASS[s]} value={custom[`specialty:${s}`] ?? {}} frame={anim} nameEditable />
        ))}
        <CustomCard storeKey="specialty:main" title="Agente principal" defaultClass="lantern_keeper" value={custom["specialty:main"] ?? {}} frame={anim} nameEditable note="Aplicado aos agentes principais de cada sessão. O nome vale para todas as sessões." />
      </div>

      <h3 style={{ marginTop: 22 }}>Todos os agentes ({agents.length})</h3>
      <p className="sub">Aqui você troca o nome, a função e o visual de cada agente, ou o exclui. Excluir tira o agente da tripulação; os eventos e o consumo que ele gerou continuam no histórico.</p>
      {agents.length === 0 ? (
        <p className="faint">Nenhum agente registrado ainda. Eles aparecem aqui quando uma sessão do Claude Code começa.</p>
      ) : (
        <div className="char-grid">
          {agents.slice(0, shown).map((a) => (
            <AgentCustomCard key={a.id} agent={a} custom={custom} frame={anim} onRemoved={removed} />
          ))}
        </div>
      )}
      {agents.length > shown && (
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn" onClick={() => setShown((n) => n + PAGE)}>Mostrar mais ({agents.length - shown} restantes)</button>
          <button className="btn" onClick={() => setShown(agents.length)}>Mostrar todos</button>
        </div>
      )}

      <SpecialtyOverrides />
    </div>
  );
}

function CustomCard({ storeKey, title, defaultClass, value, frame, note, nameEditable, children }: { storeKey: string; title: string; defaultClass: string; value: CharacterCustomization; frame: number; note?: string; nameEditable?: boolean; children?: ReactNode }) {
  const save = useCharacters((s) => s.save);
  const cls = CLASSES[value.classId ?? defaultClass] ?? CLASSES.wisp!;
  const palette: Palette = { ...cls.palette, ...value.palette };
  const [anim, setAnim] = useState("idle");
  const set = (patch: Partial<CharacterCustomization>) => void save(storeKey, { ...value, ...patch });
  const setColor = (k: keyof Palette, v: string) => set({ palette: { ...value.palette, [k]: v } });
  return (
    <section className="card px-frame" style={{ display: "grid", gap: 8 }}>
      <div className="row" style={{ flexWrap: "nowrap" }}>
        <SpriteCanvas sprite={cls.sprite} palette={palette} animation={anim} frame={frame} size={64} label={title} />
        <div>
          <strong>{title}</strong>
          <div className="faint" style={{ fontSize: 12 }}>{cls.label}</div>
          {note && <div className="faint" style={{ fontSize: 11 }}>{note}</div>}
        </div>
      </div>
      {nameEditable && (
        <label className="field">
          <span>Nome</span>
          <input className="input" aria-label={`Nome de ${title}`} defaultValue={value.name ?? ""} placeholder="Nome automático" maxLength={40} onBlur={(e) => set({ name: e.target.value.trim() || undefined })} />
        </label>
      )}
      <Select label="Classe" value={value.classId ?? ""} onChange={(v) => set({ classId: v || undefined })} options={[{ value: "", label: `Padrão (${CLASSES[defaultClass]?.label ?? "?"})` }, ...Object.values(CLASSES).map((c) => ({ value: c.id, label: c.label }))]} />
      <div className="row" style={{ gap: 10 }}>
        {(["cloak", "trim", "glow"] as const).map((k) => (
          <label key={k} className="field" style={{ justifyItems: "center" }}>
            <span style={{ fontSize: 11 }}>{k === "cloak" ? "Manto" : k === "trim" ? "Detalhes" : "Brilho"}</span>
            <input type="color" className="swatch-input" value={palette[k]} onChange={(e) => setColor(k, e.target.value)} />
          </label>
        ))}
        {value.palette && (
          <button className="btn small" onClick={() => set({ palette: undefined })} style={{ alignSelf: "end" }}>Cores padrão</button>
        )}
      </div>
      <label className="field">
        <span>Tamanho: {value.scale ?? 2}x</span>
        <input type="range" min={1} max={4} step={1} value={value.scale ?? 2} onChange={(e) => set({ scale: Number(e.target.value) })} />
      </label>
      <Select label="Prévia da animação" value={anim} onChange={setAnim} options={PREVIEW_ANIMS} />
      <label className="row" style={{ gap: 6, fontSize: 13 }}>
        <input type="checkbox" checked={value.hidden ?? false} onChange={(e) => set({ hidden: e.target.checked || undefined })} /> Ocultar na área de trabalho
      </label>
      {children}
    </section>
  );
}

function AgentCustomCard({ agent, custom, frame, onRemoved }: { agent: Agent; custom: Record<string, CharacterCustomization>; frame: number; onRemoved: (id: string) => void }) {
  const resolved = resolveCharacter(agent, custom);
  const own = custom[`agent:${agent.id}`] ?? {};
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e));
  const setSpecialty = (s: Specialty) => {
    setError(null);
    void backend().then((b) => b.setAgentSpecialty(agent.id, s)).catch(fail);
  };
  const remove = () => {
    setError(null);
    void backend()
      .then((b) => b.deleteAgent(agent.id))
      .then(() => onRemoved(agent.id))
      .catch(fail);
  };
  return (
    <CustomCard
      storeKey={`agent:${agent.id}`}
      title={resolved.name}
      defaultClass={resolved.cls.id}
      value={own}
      frame={frame}
      nameEditable
      note={`${agent.isMain ? "Principal" : agent.agentType ?? "subagente"} · ${agent.endedAt ? "encerrado" : "ativo"}`}
    >
      <Select label="Função" value={agent.specialty} onChange={setSpecialty} options={SPECIALTIES.map((s) => ({ value: s, label: SPECIALTY_LABEL[s] }))} />
      <div className="row" style={{ gap: 8 }}>
        {confirming ? (
          <>
            <button className="btn small danger" onClick={remove}>Confirmar exclusão</button>
            <button className="btn small" onClick={() => setConfirming(false)}>Cancelar</button>
          </>
        ) : (
          <button className="btn small" aria-label={`Excluir ${resolved.name}`} onClick={() => setConfirming(true)}>Excluir agente</button>
        )}
      </div>
      {!agent.endedAt && confirming && <div className="faint" style={{ fontSize: 11 }}>Este agente está ativo. Se ele voltar a trabalhar no Claude Code, reaparece.</div>}
      {error && <div className="faint" style={{ fontSize: 11 }}>{error}</div>}
    </CustomCard>
  );
}

/** Map custom subagent types to specialties (stored in settings, used by the backend). */
function SpecialtyOverrides() {
  const overrides = useSettings((s) => s.settings.claude.specialtyOverrides);
  const update = useSettings((s) => s.update);
  const [type, setType] = useState("");
  const [spec, setSpec] = useState<Specialty>("developer");
  const save = (next: Record<string, string>) => void update((s) => ({ ...s, claude: { ...s.claude, specialtyOverrides: next } }));
  return (
    <section className="card px-frame" style={{ marginTop: 22, maxWidth: 720 }}>
      <h3>Especialidade de subagentes personalizados</h3>
      <p className="faint" style={{ marginTop: 0 }}>
        A especialidade vem do nome do tipo do subagente (por exemplo Explore, Plan ou o nome de um agente seu). Quando o nome não diz nada, você pode
        definir aqui. Vale para novos subagentes.
      </p>
      {Object.entries(overrides).map(([k, v]) => (
        <div key={k} className="row" style={{ justifyContent: "space-between" }}>
          <span className="mono">{k}</span>
          <span>{SPECIALTY_LABEL[v as Specialty] ?? v}</span>
          <button className="btn small" onClick={() => { const n = { ...overrides }; delete n[k]; save(n); }}>Remover</button>
        </div>
      ))}
      <div className="row" style={{ alignItems: "end", marginTop: 10 }}>
        <label className="field">
          <span>Tipo do subagente</span>
          <input className="input" value={type} onChange={(e) => setType(e.target.value)} placeholder="ex.: db-migrator" maxLength={80} />
        </label>
        <Select label="Especialidade" value={spec} onChange={setSpec} options={SPECIALTIES.map((s) => ({ value: s, label: SPECIALTY_LABEL[s] }))} />
        <button className="btn" disabled={!type.trim()} onClick={() => { save({ ...overrides, [type.trim()]: spec }); setType(""); }}>Adicionar</button>
      </div>
    </section>
  );
}
