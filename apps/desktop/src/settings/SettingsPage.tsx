import { useEffect, useState } from "react";
import type { IntegrationInfo } from "@ids/shared";
import { backend, type MonitorInfo } from "../bridge/backend";
import { useSettings } from "../stores/settings";
import { useUi } from "../stores/ui";
import { IntegrationSection } from "./IntegrationSection";
import { PricesSection } from "./PricesSection";
import { SystemSection } from "./SystemSection";
import { Range, Toggle } from "./controls";
import { Select } from "../components/Filters";
import type { Settings } from "./schema";

const SECTIONS = [
  { id: "general", label: "Geral" },
  { id: "claude", label: "Claude Code" },
  { id: "desktop", label: "Área de trabalho" },
  { id: "metrics", label: "Métricas" },
  { id: "system", label: "Sistema" },
] as const;

export function SettingsPage({ section, onIntegrationChange }: { section?: string; onIntegrationChange: (i: IntegrationInfo) => void }) {
  const go = useUi((s) => s.go);
  const current = SECTIONS.find((s) => s.id === section)?.id ?? "general";
  return (
    <div className="page" style={{ maxWidth: 980 }}>
      <h2>Configurações</h2>
      <div className="tabs" role="tablist">
        {SECTIONS.map((s) => (
          <button key={s.id} role="tab" className="btn small" aria-selected={current === s.id} aria-pressed={current === s.id} onClick={() => go({ page: "settings", section: s.id })}>{s.label}</button>
        ))}
      </div>
      <div className="grid" style={{ gap: 14 }}>
        {current === "general" && <GeneralSection />}
        {current === "claude" && <IntegrationSection onIntegrationChange={onIntegrationChange} />}
        {current === "desktop" && <DesktopSection />}
        {current === "metrics" && <PricesSection />}
        {current === "system" && <SystemSection />}
      </div>
    </div>
  );
}

function useSection<K extends keyof Settings>(key: K): [Settings[K], (patch: Partial<Settings[K]>) => void] {
  const value = useSettings((s) => s.settings[key]);
  const update = useSettings((s) => s.update);
  return [value, (patch) => void update((s) => ({ ...s, [key]: { ...s[key], ...patch } }))];
}

function GeneralSection() {
  const [g, set] = useSection("general");
  return (
    <section className="card px-frame">
      <h3>Geral</h3>
      <Toggle label="Iniciar com o sistema" checked={g.launchAtLogin} onChange={(v) => set({ launchAtLogin: v })} />
      <Toggle label="Fechar o castelo mantém o app na bandeja" hint="Sem bandeja disponível (por exemplo GNOME sem extensão), a janela é minimizada." checked={g.minimizeToTray} onChange={(v) => set({ minimizeToTray: v })} />
      <Toggle label="Abrir o castelo ao iniciar" checked={g.openCastleOnStart} onChange={(v) => set({ openCastleOnStart: v })} />
      <label className="switch">
        <span>Atalho para mostrar/ocultar a tripulação<div className="faint" style={{ fontSize: 12 }}>Formato: CommandOrControl+Shift+I</div></span>
        <input className="input mono" style={{ width: 240 }} defaultValue={g.toggleShortcut} maxLength={60} onBlur={(e) => e.target.value.trim() && set({ toggleShortcut: e.target.value.trim() })} />
      </label>
      <div className="row" style={{ marginTop: 10 }}>
        <Select label="Tema" value={g.theme} onChange={(v) => set({ theme: v })} options={[{ value: "shadow", label: "Névoa espectral" }, { value: "dusk", label: "Crepúsculo" }, { value: "contrast", label: "Alto contraste" }]} />
        <Select label="Idioma" value={g.language} onChange={(v) => set({ language: v })} options={[{ value: "pt-BR", label: "Português (Brasil)" }, { value: "en", label: "English (parcial)" }]} />
      </div>
      <Toggle label="Modo compacto" checked={g.compactMode} onChange={(v) => set({ compactMode: v })} />
    </section>
  );
}

function DesktopSection() {
  const [d, set] = useSection("desktop");
  const [audio, setAudio] = useSection("audio");
  const [monitors, setMonitors] = useState<MonitorInfo[]>([]);
  useEffect(() => {
    void backend().then((b) => b.listMonitors()).then(setMonitors).catch(() => setMonitors([]));
  }, []);
  return (
    <>
      <section className="card px-frame">
        <h3>Tripulação na área de trabalho</h3>
        <Toggle label="Mostrar personagens perto da barra de tarefas" checked={d.overlayEnabled} onChange={(v) => set({ overlayEnabled: v })} />
        <div className="row" style={{ margin: "8px 0" }}>
          <Select label="Posição" value={d.placement} onChange={(v) => set({ placement: v })} options={[{ value: "bottom", label: "Rodapé da tela (acima da barra, ou no lugar dela com a dock oculta)" }, { value: "taskbar", label: "Sobre a barra de tarefas (Windows, KDE, X11)" }, { value: "top", label: "Em cima" }]} />
          <Select
            label="Monitor"
            value={d.monitor ?? ""}
            onChange={(v) => set({ monitor: v === "" ? null : v })}
            options={[
              { value: "", label: "Tela principal do sistema" },
              ...monitors.map((m) => ({ value: m.name, label: `${m.name} · ${m.width}×${m.height}${m.primary ? " (principal)" : ""}` })),
              ...(d.monitor && !monitors.some((m) => m.name === d.monitor) ? [{ value: d.monitor, label: `${d.monitor} (desconectado)` }] : []),
            ]}
          />
        </div>
        <Range label="Altura da faixa" value={d.height} min={32} max={320} step={4} format={(v) => `${v}px`} onChange={(v) => set({ height: v })} />
        <Toggle label="Largura só das almas trabalhando" hint="A faixa cresce quando mais agentes trabalham e encolhe quando param." checked={d.autoWidth} onChange={(v) => set({ autoWidth: v })} />
        <div className="row" style={{ margin: "8px 0" }}>
          <Select label="Lado da tela" value={d.align} onChange={(v) => set({ align: v })} options={[{ value: "left", label: "Esquerda" }, { value: "center", label: "Centro" }, { value: "right", label: "Direita" }]} />
        </div>
        {!d.autoWidth && <Range label="Largura da faixa" value={d.widthFraction} min={0.2} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ widthFraction: v })} />}
        <Range label="Tamanho dos personagens" value={d.characterScale} min={1} max={4} step={1} format={(v) => `${v}x`} onChange={(v) => set({ characterScale: v })} />
        <Range label="Velocidade de caminhada" value={d.walkSpeed} min={8} max={80} step={2} format={(v) => `${v}px/s`} onChange={(v) => set({ walkSpeed: v })} />
        <Range label="Velocidade das animações" value={d.animationSpeed} min={0.5} max={2} step={0.1} format={(v) => `${v.toFixed(1)}x`} onChange={(v) => set({ animationSpeed: v })} />
        <Toggle label="Animações" hint="Desligado, os personagens ficam parados (útil para economizar CPU)." checked={d.animationsEnabled} onChange={(v) => set({ animationsEnabled: v })} />
        <Toggle label="Nomes embaixo dos personagens" hint="Desligado, o nome aparece ao passar o mouse ou clicar." checked={d.showNames} onChange={(v) => set({ showNames: v })} />
        <Toggle label="Balões de fala" checked={d.showMessages} onChange={(v) => set({ showMessages: v })} />
        <Toggle label="Linux/Wayland: usar XWayland para a faixa" hint="No Wayland, aplicativos não podem se posicionar nem ficar sempre no topo. Com isso ligado o app usa XWayland. Requer reiniciar." checked={d.preferX11OnWayland} onChange={(v) => set({ preferX11OnWayland: v })} />
      </section>
      <section className="card px-frame">
        <h3>Som</h3>
        <p className="faint" style={{ fontSize: 12, marginTop: 0 }}>Ainda não há efeitos sonoros nesta versão; a preferência fica salva para quando houver.</p>
        <Toggle label="Efeitos sonoros" checked={audio.enabled} onChange={(v) => setAudio({ enabled: v })} disabled />
      </section>
    </>
  );
}
