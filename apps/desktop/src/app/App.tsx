import { lazy, Suspense, useEffect, useState } from "react";
import type { IntegrationInfo } from "@ids/shared";
import { backend } from "../bridge/backend";
import { useWorld } from "../stores/world";
import { useSettings } from "../stores/settings";
import { useCharacters } from "../stores/characters";
import { parseRoute, useUi, type Route } from "../stores/ui";
import { Icon } from "../components/Icon";
import { useT } from "../i18n";
import { CastlePage } from "../castle/CastlePage";
import { HomePage } from "../pages/HomePage";
import { AgentPage } from "../pages/AgentPage";

// Heavier pages are split out so the castle starts fast.
const DashboardPage = lazy(() => import("../dashboard/DashboardPage").then((m) => ({ default: m.DashboardPage })));
const MissionsPage = lazy(() => import("../missions/MissionsPage").then((m) => ({ default: m.MissionsPage })));
const HistoryPage = lazy(() => import("../history/HistoryPage").then((m) => ({ default: m.HistoryPage })));
const CharactersPage = lazy(() => import("../characters/CharactersPage").then((m) => ({ default: m.CharactersPage })));
const SettingsPage = lazy(() => import("../settings/SettingsPage").then((m) => ({ default: m.SettingsPage })));

const NAV: { page: Route["page"]; icon: string; key: Parameters<ReturnType<typeof useT>>[0] }[] = [
  { page: "home", icon: "home", key: "nav.home" },
  { page: "castle", icon: "castle", key: "nav.castle" },
  { page: "dashboard", icon: "chart", key: "nav.dashboard" },
  { page: "missions", icon: "sword", key: "nav.missions" },
  { page: "history", icon: "scroll", key: "nav.history" },
  { page: "characters", icon: "ghost", key: "nav.characters" },
  { page: "settings", icon: "gear", key: "nav.settings" },
];

export function App() {
  const t = useT();
  const route = useUi((s) => s.route);
  const go = useUi((s) => s.go);
  const error = useWorld((s) => s.error);
  const settings = useSettings((s) => s.settings);
  const [kind, setKind] = useState<"tauri" | "demo" | null>(null);
  const [integration, setIntegration] = useState<IntegrationInfo | null>(null);
  const lastEventAt = useWorld((s) => s.world.lastUpdateAt);

  useEffect(() => {
    void useWorld.getState().init();
    void useSettings.getState().init();
    void useCharacters.getState().init();
    void backend().then(async (b) => {
      setKind(b.kind);
      await b.onNavigate((r) => {
        const parsed = parseRoute(r);
        if (parsed) go(parsed);
      });
      const info = await b.integrationInfo().catch(() => null);
      setIntegration(info);
      // First run: show the welcome screen until the integration is installed.
      if (info && !info.status.fullyInstalled && b.kind === "tauri") go({ page: "home" });
    }).catch(() => {});
  }, [go]);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.general.theme;
    document.documentElement.lang = settings.general.language;
  }, [settings.general.theme, settings.general.language]);

  const collectorOn = integration?.collector.running ?? false;
  const installed = integration?.status.fullyInstalled ?? false;
  const compact = settings.general.compactMode;

  return (
    <div className={`app${compact ? " compact" : ""}`}>
      <nav className="sidebar" aria-label="Navegação">
        <div className="brand">
          <img src="/ui/app-icon-32.png" alt="" />
          <div>
            <h1>Ilha das Sombras</h1>
            <small>sua tripulação espectral</small>
          </div>
        </div>
        {NAV.map((n) => (
          <button key={n.page} className="nav-btn" aria-current={route.page === n.page || (route.page === "agent" && n.page === "castle") ? "page" : undefined} onClick={() => go({ page: n.page } as Route)} title={t(n.key)}>
            <Icon name={n.icon} />
            <span>{t(n.key)}</span>
          </button>
        ))}
        <div className="spacer" />
        <div className="status-pill" title={integration?.status.settingsPath ?? ""}>
          <span className={`dot ${kind === "demo" ? "warn" : collectorOn && installed ? "on" : collectorOn ? "warn" : "err"}`} />
          {!compact && <span>{kind === "demo" ? "Demonstração" : collectorOn && installed ? "Escutando o Claude Code" : collectorOn ? "Hooks não instalados" : "Integração pausada"}</span>}
        </div>
        <button className="nav-btn" onClick={() => void useSettings.getState().update((s) => ({ ...s, general: { ...s.general, compactMode: !s.general.compactMode } }))} title="Modo compacto">
          <Icon name="menu" />
          <span>{compact ? "Expandir" : "Modo compacto"}</span>
        </button>
      </nav>
      <main className="main" data-last-update={lastEventAt}>
        {kind === "demo" && <div className="banner">{t("demo.banner")}</div>}
        {error && <div className="error-box" style={{ margin: 16 }}>{error}</div>}
        <Suspense fallback={<div className="page dim">{t("common.loading")}</div>}>
          <Page route={route} integration={integration} onIntegrationChange={setIntegration} />
        </Suspense>
      </main>
    </div>
  );
}

function Page({ route, integration, onIntegrationChange }: { route: Route; integration: IntegrationInfo | null; onIntegrationChange: (i: IntegrationInfo) => void }) {
  switch (route.page) {
    case "home":
      return <HomePage integration={integration} />;
    case "castle":
      return <CastlePage room={route.room} />;
    case "agent":
      return <AgentPage agentId={route.agentId} />;
    case "dashboard":
      return <DashboardPage />;
    case "missions":
      return <MissionsPage />;
    case "history":
      return <HistoryPage sessionId={route.sessionId} />;
    case "characters":
      return <CharactersPage />;
    case "settings":
      return <SettingsPage section={route.section} onIntegrationChange={onIntegrationChange} />;
  }
}
