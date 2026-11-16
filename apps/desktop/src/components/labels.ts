import type { AgentState, MissionStatus, Room } from "@ids/shared";

export const STATE_LABEL: Record<AgentState, string> = {
  IDLE: "Descansando",
  RUNNING: "Trabalhando",
  EXPLORING: "Explorando",
  CODING: "Codificando",
  READING: "Lendo",
  BUILDING: "Construindo",
  TESTING: "Testando",
  COMBAT: "Em combate",
  WAITING: "Aguardando",
  SUCCESS: "Concluído",
  ERROR: "Erro",
};

export const STATE_CLASS: Partial<Record<AgentState, string>> = {
  SUCCESS: "ok",
  ERROR: "err",
  COMBAT: "err",
  WAITING: "warn",
  TESTING: "info",
};

export const MISSION_LABEL: Record<MissionStatus, string> = {
  not_started: "Não iniciada",
  in_progress: "Em andamento",
  waiting: "Aguardando",
  completed: "Concluída",
  error: "Com erro",
  interrupted: "Interrompida",
};

export const MISSION_CLASS: Record<MissionStatus, string> = {
  not_started: "",
  in_progress: "info",
  waiting: "warn",
  completed: "ok",
  error: "err",
  interrupted: "warn",
};

export const ROOM_LABEL: Record<Room, string> = {
  throne: "Sala do Trono",
  library: "Biblioteca",
  forge: "Ferreiro",
  laboratory: "Arena",
  watchtower: "Torre de Observação",
  treasury: "Tesouraria",
  barracks: "Quartel",
};

export const EVENT_LABEL: Record<string, string> = {
  SessionStart: "Sessão iniciada",
  SessionEnd: "Sessão encerrada",
  UserPromptSubmit: "Nova missão (prompt)",
  PreToolUse: "Ferramenta iniciada",
  PostToolUse: "Ferramenta concluída",
  PostToolUseFailure: "Ferramenta falhou",
  SubagentStart: "Subagente convocado",
  SubagentStop: "Subagente concluiu",
  Stop: "Resposta concluída",
  StopFailure: "Falha da API",
  Notification: "Notificação",
  TaskCreated: "Tarefa criada",
  TaskCompleted: "Tarefa concluída",
};

export const CATEGORY_LABEL: Record<string, string> = {
  reading: "Leitura",
  searching: "Busca",
  web_research: "Pesquisa web",
  editing: "Edição",
  building: "Build",
  testing: "Testes",
  version_control: "Controle de versão",
  shell: "Terminal",
  delegating: "Delegação",
  planning: "Planejamento",
  asking: "Perguntas",
  mcp: "Conectores (MCP)",
  other: "Outros",
};

export function timeAgo(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return `há ${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `há ${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `há ${h} h`;
  return new Date(ts).toLocaleDateString("pt-BR");
}

export const fmtTime = (ts: number) => new Date(ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
export const fmtDateTime = (ts: number) => new Date(ts).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

/** User-facing text for a thrown value (no "Error:" prefix). */
export const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));
