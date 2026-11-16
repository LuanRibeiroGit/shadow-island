import { useEffect, useState } from "react";
import { SPECIALTIES, type Specialty } from "@ids/shared";
import { CLASSES, CREW_ROLES, CREW_ROLE_LABEL, SPECIALTY_LABEL, crewKey, isCrewId, resolveCharacter, visualFor, type CharacterCustomization, type CrewRole, type Palette } from "@ids/game-engine";
import { useCharacters } from "../stores/characters";
import { useCrew } from "../stores/crew";
import { useWorld } from "../stores/world";
import { useUi } from "../stores/ui";
import { backend } from "../bridge/backend";
import { Modal } from "../components/Modal";
import { SpriteCanvas } from "../components/Portrait";
import { Select } from "../components/Filters";
import { STATE_CLASS, STATE_LABEL, timeAgo } from "../components/labels";

/**
 * Profile of a soul clicked in the castle: what it is doing right now and, on the
 * same sheet, its name, function and looks. `id` is the id the castle draws (a crew
 * member or a real agent nobody took); `doing` reads what the scene shows for it.
 */
export function CharacterProfile({ id, doing, onClose }: { id: string; doing: (id: string) => string | null; onClose: () => void }) {
  const crew = useCrew();
  const raw = useCharacters((s) => s.custom);
  const save = useCharacters((s) => s.save);
  const sessions = useWorld((s) => s.world.sessions);
  const go = useUi((s) => s.go);
  const [frame, setFrame] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // Drives the sprite animation and keeps "what it is doing" fresh.
  useEffect(() => {
    const t = setInterval(() => setFrame((f) => f + 1), 220);
    return () => clearInterval(t);
  }, []);

  const agent = crew.agents.find((a) => a.id === id);
  if (!agent) {
    return (
      <Modal title="Personagem" onClose={onClose} footer={<button className="btn" onClick={onClose}>Fechar</button>}>
        <p className="faint">Este personagem saiu do castelo.</p>
      </Modal>
    );
  }

  const key = crewKey(id);
  const own: CharacterCustomization = raw[key] ?? {};
  const member = crew.roster.find((m) => m.id === id);
  const realId = crew.realOf.get(id) ?? (isCrewId(id) ? null : id);
  const ch = resolveCharacter(agent, raw);
  const fallback = resolveCharacter(agent, { ...raw, [key]: { ...own, classId: undefined } }).cls;
  const vis = visualFor(agent, Date.now());
  const working = realId !== null && vis.state !== "IDLE";
  const session = realId ? sessions[agent.sessionId] : undefined;
  const set = (patch: Partial<CharacterCustomization>) => void save(key, { ...own, ...patch });
  const setColor = (k: keyof Palette, v: string) => set({ palette: { ...own.palette, [k]: v } });
  const setSpecialty = (s: Specialty) => {
    setError(null);
    void backend()
      .then((b) => b.setAgentSpecialty(id, s))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  };
  const open = (route: Parameters<typeof go>[0]) => {
    onClose();
    go(route);
  };

  return (
    <Modal
      title={ch.name}
      onClose={onClose}
      footer={
        <>
          {realId && <button className="btn" onClick={() => open({ page: "agent", agentId: realId })}>Ver atividade completa</button>}
          <button className="btn" onClick={() => open({ page: "characters" })}>Gerenciar tripulação</button>
          <button className="btn" onClick={onClose}>Fechar</button>
        </>
      }
    >
      <div className="profile" data-testid="character-profile">
        <section>
          <div className="row" style={{ flexWrap: "nowrap", gap: 14 }}>
            <SpriteCanvas sprite={ch.cls.sprite} palette={ch.palette} animation={vis.animation} frame={frame} size={96} label={ch.name} />
            <div style={{ minWidth: 0 }}>
              <div>{ch.cls.label}</div>
              <div className="faint" style={{ fontSize: 12 }}>
                {member ? `Tripulante · ${CREW_ROLE_LABEL[member.role]}` : agent.isMain ? "Agente principal" : `Subagente (${agent.agentType ?? "tipo desconhecido"}) · ${SPECIALTY_LABEL[agent.specialty]}`}
              </div>
              <span className={`tag ${STATE_CLASS[vis.state] ?? ""}`} style={{ marginTop: 6 }}>{STATE_LABEL[vis.state]}</span>
            </div>
          </div>
          <h4>Agora</h4>
          <dl className="profile-now">
            <dt className="faint">No castelo</dt>
            <dd>{doing(id) ?? "—"}</dd>
            {working ? (
              <>
                <dt className="faint">Tarefa</dt>
                <dd>{agent.task ?? "Indisponível"}</dd>
                <dt className="faint">Ferramenta</dt>
                <dd>{agent.currentTool ?? "—"}{agent.detail ? ` · ${agent.detail}` : ""}</dd>
              </>
            ) : (
              <>
                <dt className="faint">Trabalho</dt>
                <dd>{realId ? "Sem tarefa em andamento." : "Nenhum. Sem agente real do Claude Code para atender agora."}</dd>
              </>
            )}
            {realId && (
              <>
                <dt className="faint">Projeto</dt>
                <dd>{session?.projectName ?? "Indisponível"}</dd>
                <dt className="faint">Sessão</dt>
                <dd className="mono">{agent.sessionId.slice(0, 8)}{session?.model ? ` · ${session.model}` : ""}</dd>
                <dt className="faint">Atualizado</dt>
                <dd>{timeAgo(agent.updatedAt)}</dd>
              </>
            )}
          </dl>
          {member && realId && <p className="faint" style={{ fontSize: 12 }}>Este tripulante está fazendo o trabalho de um agente real do Claude Code.</p>}
        </section>

        <section style={{ display: "grid", gap: 8, alignContent: "start" }}>
          <label className="field">
            <span>Nome</span>
            <input
              key={id}
              className="input"
              aria-label="Nome do personagem"
              defaultValue={own.name ?? ""}
              placeholder={ch.name}
              maxLength={40}
              onBlur={(e) => set({ name: e.target.value.trim() || undefined })}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            />
          </label>
          {member ? (
            <Select label="Função" value={member.role} onChange={(r: CrewRole) => set({ role: r })} options={CREW_ROLES.map((r) => ({ value: r, label: CREW_ROLE_LABEL[r] }))} />
          ) : (
            <Select label="Função" value={agent.specialty} onChange={setSpecialty} options={SPECIALTIES.map((s) => ({ value: s, label: SPECIALTY_LABEL[s] }))} />
          )}
          <Select label="Classe" value={own.classId ?? ""} onChange={(v) => set({ classId: v || undefined })} options={[{ value: "", label: `Padrão (${fallback.label})` }, ...Object.values(CLASSES).map((c) => ({ value: c.id, label: c.label }))]} />
          <div className="row" style={{ gap: 10 }}>
            {(["cloak", "trim", "glow"] as const).map((k) => (
              <label key={k} className="field" style={{ justifyItems: "center" }}>
                <span style={{ fontSize: 11 }}>{k === "cloak" ? "Manto" : k === "trim" ? "Detalhes" : "Brilho"}</span>
                <input type="color" className="swatch-input" value={ch.palette[k]} onChange={(e) => setColor(k, e.target.value)} />
              </label>
            ))}
            {own.palette && <button className="btn small" onClick={() => set({ palette: undefined })} style={{ alignSelf: "end" }}>Cores padrão</button>}
          </div>
          <label className="field">
            <span>Tamanho na área de trabalho: {own.scale ?? ch.scale}x</span>
            <input type="range" min={1} max={4} step={1} value={own.scale ?? ch.scale} onChange={(e) => set({ scale: Number(e.target.value) })} />
          </label>
          <label className="row" style={{ gap: 6, fontSize: 13 }}>
            <input type="checkbox" checked={own.hidden ?? false} onChange={(e) => set({ hidden: e.target.checked || undefined })} /> Ocultar este personagem
          </label>
          {error && <div className="faint" style={{ fontSize: 11 }}>{error}</div>}
        </section>
      </div>
    </Modal>
  );
}
