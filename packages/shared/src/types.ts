// Mirrors of the Rust types serialized by ids-core / the Tauri commands.
// Keep in sync with crates/ids-core/src/{model,agents,missions,encounters,engine}.rs
// and crates/ids-core/src/db/queries.rs.

export const AGENT_STATES = [
  "IDLE",
  "RUNNING",
  "EXPLORING",
  "CODING",
  "READING",
  "BUILDING",
  "TESTING",
  "COMBAT",
  "WAITING",
  "SUCCESS",
  "ERROR",
] as const;
export type AgentState = (typeof AGENT_STATES)[number];

export const SPECIALTIES = [
  "architect",
  "developer",
  "researcher",
  "tester",
  "reviewer",
  "debugger",
  "documentation",
  "general",
] as const;
export type Specialty = (typeof SPECIALTIES)[number];

export type ActivityCategory =
  | "reading"
  | "searching"
  | "web_research"
  | "editing"
  | "building"
  | "testing"
  | "version_control"
  | "shell"
  | "delegating"
  | "planning"
  | "asking"
  | "mcp"
  | "other";

export const ROOMS = ["throne", "library", "forge", "laboratory", "watchtower", "treasury", "barracks"] as const;
export type Room = (typeof ROOMS)[number];

export interface Agent {
  id: string;
  sessionId: string;
  parentId: string | null;
  agentId: string | null;
  agentType: string | null;
  specialty: Specialty;
  isMain: boolean;
  name: string;
  cwd: string | null;
  state: AgentState;
  activity: ActivityCategory | null;
  currentTool: string | null;
  detail: string | null;
  task: string | null;
  room: Room;
  startedAt: number;
  updatedAt: number;
  endedAt: number | null;
  lastEvent: string | null;
}

export interface Session {
  id: string;
  projectId: number | null;
  projectName: string | null;
  cwd: string | null;
  model: string | null;
  source: string | null;
  title: string | null;
  startedAt: number;
  endedAt: number | null;
  endReason: string | null;
  lastEventAt: number;
}

export type MissionStatus = "not_started" | "in_progress" | "waiting" | "completed" | "error" | "interrupted";
export type MissionKind = "prompt" | "task" | "subagent";

export interface Mission {
  id: number;
  sessionId: string;
  agentId: string | null;
  projectId: number | null;
  kind: MissionKind;
  externalId: string;
  title: string;
  description: string | null;
  status: MissionStatus;
  startedAt: number;
  completedAt: number | null;
}

export type MonsterKind =
  | "bug_monster"
  | "error_goblin"
  | "dependency_dragon"
  | "test_phantom"
  | "conflict_skeleton"
  | "security_beast";

export type EncounterStatus = "active" | "defeated" | "retreated";

export interface Encounter {
  id: number;
  agentId: string;
  sessionId: string;
  monster: MonsterKind;
  signature: string;
  status: EncounterStatus;
  openedAt: number;
  closedAt: number | null;
}

export interface EventRecord {
  id: number;
  sessionId: string;
  agentId: string | null;
  missionId: number | null;
  eventName: string;
  toolName: string | null;
  category: ActivityCategory | null;
  detail: string | null;
  isFailure: boolean;
  firedAt: number;
}

export type Update =
  | { type: "agent"; agent: Agent }
  | { type: "session"; session: Session }
  | { type: "mission"; mission: Mission }
  | { type: "encounter"; encounter: Encounter }
  | { type: "event"; event: EventRecord }
  | { type: "usage"; sessionId: string }
  /** The user removed an agent from the crew. */
  | { type: "agentRemoved"; id: string };

export interface TokenTotals {
  input: number;
  output: number;
  cacheCreation: number;
  cacheRead: number;
  /** Number of API responses behind the totals. 0 means "unavailable", not zero. */
  records: number;
}

export interface ModelUsage {
  model: string | null;
  tokens: TokenTotals;
}

export interface AgentStats {
  toolCount: number;
  toolFailures: number;
  tasksCompleted: number;
  errors: number;
  monstersDefeated: number;
}

export interface AgentDetail {
  agent: Agent;
  stats: AgentStats | null;
  usageByModel: ModelUsage[];
  recentEvents: EventRecord[];
  missions: Mission[];
  encounters: Encounter[];
  session: Session | null;
}

export interface SessionSummary {
  session: Session;
  agentCount: number;
  eventCount: number;
  errorCount: number;
  tokens: TokenTotals;
}

export interface SessionDetail {
  summary: SessionSummary;
  agents: Agent[];
  missions: Mission[];
  timeline: EventRecord[];
  usageByModel: ModelUsage[];
  usageByAgent: [string, TokenTotals][];
}

export interface Overview {
  activeAgents: number;
  activeSessions: number;
  waitingAgents: number;
  missionsCompleted: number;
  missionsInProgress: number;
  errors: number;
  activeTimeMs: number;
  tokens: TokenTotals;
  usageByModel: ModelUsage[];
}

export interface UsageBucket {
  bucketStart: number;
  model: string | null;
  tokens: TokenTotals;
}

export interface LabeledTokens {
  id: string;
  label: string;
  model: string | null;
  tokens: TokenTotals;
}

export interface Distribution {
  key: string;
  count: number;
  durationMs: number;
}

export interface Dashboard {
  overview: Overview;
  usageSeries: UsageBucket[];
  activitySeries: Distribution[];
  bySession: LabeledTokens[];
  byAgent: LabeledTokens[];
  states: Distribution[];
  categories: Distribution[];
  from: number;
  to: number;
  bucketMs: number;
}

export interface Project {
  id: number;
  path: string;
  name: string;
  firstSeen: number;
  lastSeen: number;
}

export interface Filter {
  from?: number;
  to?: number;
  projectId?: number;
  sessionId?: string;
  agentId?: string;
  status?: string;
  category?: string;
  eventName?: string;
  limit?: number;
  offset?: number;
}

export interface Snapshot {
  agents: Agent[];
  recentAgents: Agent[];
  sessions: SessionSummary[];
  missions: Mission[];
  encounters: Encounter[];
  events: EventRecord[];
  now: number;
}

export type Support =
  | { level: "full" }
  | { level: "limited"; reason: string }
  | { level: "unsupported"; reason: string };

export interface Capabilities {
  tray: Support;
  transparentWindows: Support;
  alwaysOnTop: Support;
  windowPositioning: Support;
  clickThrough: Support;
  globalShortcuts: Support;
  autostart: Support;
  notifications: Support;
  skipTaskbar: Support;
}

export interface PlatformInfo {
  os: "linux" | "windows" | "other";
  osName: string;
  arch: string;
  sessionType: "x11" | "wayland" | "windows" | "unknown";
  desktop: "gnome" | "kde" | "other" | "windows" | "unknown";
  desktopRaw: string | null;
}

export interface SystemInfo {
  version: string;
  platform: PlatformInfo;
  capabilities: Capabilities;
  dataDir: string;
  dbPath: string;
  logPath: string;
  dbSizeBytes: number;
  autostartEnabled: boolean | null;
  debugBuild: boolean;
}

export interface IntegrationStatus {
  settingsPath: string;
  settingsExists: boolean;
  settingsValid: boolean;
  installedEvents: string[];
  missingEvents: string[];
  staleHandlers: boolean;
  hooksDisabled: boolean;
  fullyInstalled: boolean;
}

export interface CollectorSnapshot {
  running: boolean;
  port: number | null;
  received: number;
  rejected: number;
  duplicates: number;
  replayed: number;
  lastError: string | null;
  lastReceivedAt: number | null;
  spoolBytes: number;
}

export interface DbDiagnostics {
  schemaVersion: number;
  events: number;
  sessions: number;
  agents: number;
  usageRecords: number;
  lastEventAt: number | null;
  eventsLastHour: number;
}

export interface IntegrationInfo {
  status: IntegrationStatus;
  hookExecutable: string;
  hookExecutableExists: boolean;
  collector: CollectorSnapshot;
  db: DbDiagnostics;
  events: string[];
}

export interface SettingsPlan {
  settingsPath: string;
  before: string;
  after: string;
  changedEvents: string[];
  changed: boolean;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
