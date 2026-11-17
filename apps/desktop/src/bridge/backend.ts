import type {
  AgentDetail,
  Dashboard,
  EventRecord,
  Filter,
  IntegrationInfo,
  InstructionsOverview,
  LinkOutcome,
  Mission,
  Project,
  Rect,
  SessionDetail,
  SessionSummary,
  SettingsPlan,
  Snapshot,
  SystemInfo,
  Update,
  Agent,
  Specialty,
} from "@ids/shared";

/**
 * The only door between the UI and the native side. Components never call Tauri
 * directly, so the UI can be exercised in a browser with the demo backend
 * (development / automated UI tests only).
 */
export interface Backend {
  readonly kind: "tauri" | "demo";
  getSnapshot(): Promise<Snapshot>;
  getAgentDetail(id: string): Promise<AgentDetail | null>;
  listAgents(filter: Filter): Promise<Agent[]>;
  /** Change an agent's function; the change arrives through onUpdates. */
  setAgentSpecialty(id: string, specialty: Specialty): Promise<void>;
  /** Remove an agent from the crew; the removal arrives through onUpdates. */
  deleteAgent(id: string): Promise<void>;
  listSessions(filter: Filter): Promise<SessionSummary[]>;
  getSessionDetail(id: string): Promise<SessionDetail | null>;
  listEvents(filter: Filter): Promise<EventRecord[]>;
  listMissions(filter: Filter): Promise<Mission[]>;
  listProjects(): Promise<Project[]>;
  getDashboard(periodDays: number): Promise<Dashboard>;
  getCharacters(): Promise<[string, unknown][]>;
  saveCharacter(id: string, data: unknown): Promise<void>;

  getSettings(): Promise<unknown>;
  saveSettings(value: unknown): Promise<void>;
  systemInfo(): Promise<SystemInfo>;
  readLogs(lines?: number): Promise<string[]>;
  exportData(): Promise<string>;
  backupDatabase(): Promise<string>;

  integrationInfo(): Promise<IntegrationInfo>;
  integrationPlan(action: "install" | "remove"): Promise<SettingsPlan>;
  integrationApply(action: "install" | "remove", expectedAfter: string): Promise<string | null>;

  instructionsOverview(): Promise<InstructionsOverview | null>;
  readInstructions(key: string): Promise<string>;
  saveInstructions(key: string, content: string): Promise<void>;
  linkInstructions(key: string): Promise<LinkOutcome>;

  showCastle(route?: string): Promise<void>;
  setOverlayVisible(visible: boolean): Promise<void>;
  listMonitors(): Promise<MonitorInfo[]>;
  setOverlayContentWidth(width: number): Promise<void>;
  setOverlayHitboxes(boxes: Rect[]): Promise<void>;
  quit(): Promise<void>;

  onUpdates(cb: (updates: Update[]) => void): Promise<() => void>;
  onSettings(cb: (value: unknown) => void): Promise<() => void>;
  onNavigate(cb: (route: string) => void): Promise<() => void>;
  onCharacters(cb: () => void): Promise<() => void>;
}

export const isTauri = (): boolean => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

let instance: Promise<Backend> | null = null;

export function backend(): Promise<Backend> {
  if (!instance) {
    instance = isTauri()
      ? import("./tauri").then((m) => m.createTauriBackend())
      : import.meta.env.DEV || import.meta.env.MODE === "demo"
        ? import("./demo").then((m) => m.createDemoBackend())
        : Promise.reject(new Error("Ilha das Sombras precisa ser executada pelo aplicativo desktop."));
  }
  return instance;
}

export interface MonitorInfo {
  name: string;
  width: number;
  height: number;
  primary: boolean;
}
