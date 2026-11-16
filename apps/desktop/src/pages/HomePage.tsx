import type { IntegrationInfo } from "@ids/shared";
import { activeAgents, activeSessions, openMissions } from "@ids/event-system";
import { useWorld } from "../stores/world";
import { useUi } from "../stores/ui";
import { CLASSES } from "@ids/game-engine";

/** Welcome screen: what the app does, integration status, quick start. */
export function HomePage({ integration }: { integration: IntegrationInfo | null }) {
  const world = useWorld((s) => s.world);
  const go = useUi((s) => s.go);
  const installed = integration?.status.fullyInstalled ?? false;
  return (
    <div className="page" style={{ maxWidth: 980 }}>
      <div style={{ position: "relative", overflow: "hidden", marginBottom: 20 }} className="px-frame">
        <img src="/environments/island-backdrop.png" alt="" style={{ width: "100%", display: "block", imageRendering: "pixelated", opacity: 0.85 }} />
        <div style={{ position: "absolute", left: 24, bottom: 20, right: 24 }}>
          <h2 style={{ fontSize: 28, textShadow: "0 2px 0 #000" }}>Bem-vindo à Ilha das Sombras</h2>
          <p style={{ maxWidth: 560, textShadow: "0 1px 0 #000" }}>
            Cada agente real do Claude Code vira um tripulante espectral. Eles leem na Biblioteca, forjam código no Ferreiro, enfrentam monstros no
            Laboratório e celebram quando a missão termina. Tudo a partir dos eventos reais, sem dados inventados.
          </p>
        </div>
      </div>

      <div className="grid two">
        <section className="card px-frame">
          <h3>1 · Integração com o Claude Code</h3>
          {integration === null ? (
            <p className="dim">Verificando…</p>
          ) : installed ? (
            <div className="ok-box">Hooks instalados em {integration.status.settingsPath}. Novas sessões do Claude Code aparecem automaticamente.</div>
          ) : (
            <>
              <p className="dim">
                O app precisa registrar hooks no seu <span className="mono">settings.json</span> do Claude Code. Você verá exatamente o que muda antes de
                confirmar, e um backup é criado.
              </p>
              <button className="btn primary" onClick={() => go({ page: "settings", section: "claude" })}>
                Revisar e instalar a integração
              </button>
            </>
          )}
        </section>
        <section className="card px-frame">
          <h3>2 · Agora mesmo</h3>
          <p>
            <strong>{activeAgents(world).length}</strong> agente(s) ativos · <strong>{activeSessions(world).length}</strong> sessão(ões) abertas ·{" "}
            <strong>{openMissions(world).length}</strong> missão(ões) em andamento
          </p>
          <div className="row">
            <button className="btn primary" onClick={() => go({ page: "castle" })}>Entrar no castelo</button>
            <button className="btn" onClick={() => go({ page: "dashboard" })}>Ver métricas</button>
          </div>
        </section>
      </div>

      <section className="card px-frame" style={{ marginTop: 14 }}>
        <h3>A tripulação</h3>
        <p className="dim" style={{ marginTop: 0 }}>A classe de cada personagem vem do tipo real do subagente (por exemplo, Explore vira Espectro Erudito). Sem tipo identificado, aparece um Fogo-Fátuo.</p>
        <div className="row" style={{ gap: 18 }}>
          {Object.values(CLASSES).map((c) => (
            <div key={c.id} style={{ display: "grid", justifyItems: "center", gap: 4, width: 96, textAlign: "center" }}>
              <div style={{ width: 48, height: 48, backgroundImage: `url(/characters/${c.sprite}.png)`, backgroundSize: `${(144 / 24) * 48}px auto`, imageRendering: "pixelated" }} />
              <small>{c.label}</small>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
