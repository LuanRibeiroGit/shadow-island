import type { Agent, AgentState } from "@ids/shared";

/** Longest line a work bubble shows. */
const MAX = 46;

const clip = (s: string) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > MAX ? `${t.slice(0, MAX - 1)}…` : t;
};

/**
 * What a working agent says above its head: its REAL activity (tool, target and
 * state reported by Claude Code), worded in the first person as if it were talking.
 * Never the user's prompt, and never anything invented.
 */
export function workSpeech(a: Agent, state: AgentState): string {
  const d = a.detail?.trim() || null;
  const tool = a.currentTool;
  const on = (withDetail: (d: string) => string, bare: string) => (d ? withDetail(d) : bare);
  // States that speak for themselves, whatever the last tool was.
  if (state === "WAITING") return "Estou esperando você...";
  if (state === "SUCCESS") return "Pronto, terminei!";
  if (state === "ERROR") return clip(on((x) => `Ih, deu erro: ${x}`, "Ih, deu erro aqui..."));
  if (!tool) return state === "COMBAT" ? "Enfrentando um erro!" : "Deixa eu pensar...";
  switch (a.activity) {
    case "reading":
      return clip(on((x) => `Estou lendo ${x}`, "Estou lendo o código"));
    case "searching":
      return clip(on((x) => `Procurando ${x}`, "Procurando no código"));
    case "web_research":
      return clip(on((x) => `Pesquisando na web: ${x}`, "Pesquisando na web"));
    case "editing":
      return clip(on((x) => `Estou editando ${x}`, "Estou escrevendo código"));
    case "building":
      return clip(on((x) => `Compilando: ${x}`, "Compilando o projeto"));
    case "testing":
      return clip(on((x) => `Rodando os testes: ${x}`, "Rodando os testes"));
    case "version_control":
      return clip(on((x) => `Mexendo no git: ${x}`, "Mexendo no git"));
    case "shell":
      return clip(on((x) => `Rodando ${x}`, "Rodando um comando"));
    case "delegating":
      return clip(on((x) => `Chamando reforço: ${x}`, "Chamando um subagente"));
    case "planning":
      return clip(on((x) => `Planejando: ${x}`, "Planejando os próximos passos"));
    case "asking":
      return "Preciso te perguntar uma coisa";
    default:
      return clip(on((x) => `Usando ${tool}: ${x}`, `Usando ${tool}`));
  }
}
