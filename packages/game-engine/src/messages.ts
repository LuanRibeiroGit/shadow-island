import type { Agent, AgentState, Encounter } from "@ids/shared";
import { monsterInfo } from "./monsters";

/**
 * Speech bubbles derived from real events. When we do not know what the agent is
 * doing we say something generic instead of inventing a specific activity.
 */
const GENERIC: Record<AgentState, string[]> = {
  IDLE: ["Descansando na névoa…", "À espera de ordens."],
  RUNNING: ["Trabalhando…", "Em movimento…"],
  EXPLORING: ["Explorando…", "Seguindo uma pista…"],
  CODING: ["Escrevendo código…", "Implementando…"],
  READING: ["Analisando os arquivos…", "Lendo com atenção…"],
  BUILDING: ["Compilando…", "Forjando o projeto…"],
  TESTING: ["Executando testes…", "Conferindo os resultados…"],
  COMBAT: ["Investigando um problema…", "Enfrentando um obstáculo!"],
  WAITING: ["Aguardando resposta…", "Preciso da sua permissão."],
  SUCCESS: ["Missão concluída!", "Feito!"],
  ERROR: ["Algo deu errado…", "Fui interrompido por um erro."],
};

function byActivity(a: Agent): string[] | null {
  const d = a.detail;
  switch (a.activity) {
    case "reading":
      return d ? [`Lendo ${d}…`, `Analisando ${d}…`] : ["Analisando os arquivos…"];
    case "searching":
      return ["Procurando no código…", "Vasculhando os arquivos…"];
    case "web_research":
      return d && d !== "web" ? [`Consultando ${d}…`] : ["Pesquisando referências…"];
    case "editing":
      return d ? [`Editando ${d}…`, `Trabalhando em ${d}…`] : ["Implementando uma mudança…"];
    case "building":
      return d ? [`Rodando ${d}…`] : ["Compilando…"];
    case "testing":
      return d ? [`Executando ${d}…`, "Executando testes…"] : ["Executando testes…"];
    case "version_control":
      return d ? [`Usando ${d}…`] : ["Cuidando do controle de versão…"];
    case "delegating":
      return d ? [`Convocando um ${d}…`] : ["Convocando ajuda…"];
    case "planning":
      return ["Planejando os próximos passos…", "Organizando as tarefas…"];
    case "asking":
      return ["Tenho uma pergunta para você."];
    case "mcp":
      return a.currentTool ? [`Usando ${a.currentTool.split("__")[1] ?? "um conector"}…`] : null;
    case "shell":
      return d ? [`Executando ${d}…`] : ["Executando um comando…"];
    default:
      return null;
  }
}

export function candidateMessages(agent: Agent, encounter?: Encounter): string[] {
  if (agent.state === "COMBAT" && encounter) {
    const m = monsterInfo(encounter.monster);
    return [`${m.name} apareceu!`, "Investigando um problema…"];
  }
  if (agent.state === "WAITING" && agent.lastEvent === "Notification") return ["Preciso da sua permissão.", "Aguardando resposta…"];
  if (agent.state === "SUCCESS" || agent.state === "ERROR" || agent.state === "IDLE") return GENERIC[agent.state];
  if (agent.state === "RUNNING" && agent.lastEvent === "UserPromptSubmit") {
    return agent.task ? [`Nova missão: ${truncate(agent.task, 42)}`] : ["Nova missão recebida!"];
  }
  return byActivity(agent) ?? GENERIC[agent.state];
}

const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export interface Bubble {
  text: string;
  shownAt: number;
}

/**
 * Decides when a character speaks. Avoids repetition: at most one bubble every
 * `minIntervalMs` per agent, never the same text twice in a row, and the same text
 * is not repeated within `repeatWindowMs` unless the context changed.
 */
export class MessageScheduler {
  private last = new Map<string, { text: string; at: number; key: string; history: Map<string, number> }>();

  constructor(
    private readonly minIntervalMs = 7_000,
    private readonly repeatWindowMs = 60_000,
    private readonly ttlMs = 4_500,
  ) {}

  /** Returns a new bubble, the current one if still visible, or null. */
  next(agent: Agent, now: number, encounter?: Encounter): Bubble | null {
    const key = `${agent.state}|${agent.activity ?? ""}|${agent.detail ?? ""}|${encounter?.id ?? ""}`;
    const prev = this.last.get(agent.id);
    const changed = !prev || prev.key !== key;
    if (prev && now - prev.at < this.ttlMs && !changed) return { text: prev.text, shownAt: prev.at };
    if (prev && !changed && now - prev.at < this.minIntervalMs) return null;
    // Even when the context changes, do not chatter faster than every 1.2 s.
    if (prev && changed && now - prev.at < 1_200) return now - prev.at < this.ttlMs ? { text: prev.text, shownAt: prev.at } : null;

    const history = prev?.history ?? new Map<string, number>();
    const options = candidateMessages(agent, encounter);
    const fresh = options.filter((t) => t !== prev?.text && now - (history.get(t) ?? -Infinity) > this.repeatWindowMs);
    let text = fresh[0];
    if (!text) {
      if (!changed) return null; // nothing new to say
      text = options.find((t) => t !== prev?.text) ?? options[0];
    }
    if (!text) return null;
    history.set(text, now);
    if (history.size > 32) history.delete(history.keys().next().value as string);
    this.last.set(agent.id, { text, at: now, key, history });
    return { text, shownAt: now };
  }

  forget(agentId: string): void {
    this.last.delete(agentId);
  }
}
