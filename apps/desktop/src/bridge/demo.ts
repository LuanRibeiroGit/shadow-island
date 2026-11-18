/**
 * DEMO backend — development and automated UI tests only (never bundled into the
 * desktop app's data path: `backend()` only picks it outside Tauri in dev/demo
 * mode). It replays update batches produced by the real Rust engine over the hook
 * fixtures (see crates/ids-core/examples/export_demo.rs), so the UI can be
 * exercised in a plain browser without a Claude Code session.
 */
import type { Dashboard, InstructionCategory, InstructionEntry, IntegrationInfo, SessionDetail, Snapshot, Specialty, SystemInfo, Update, AgentDetail } from "@ids/shared";
import type { Backend } from "./backend";
import data from "./demo-data.json";

const TIME_KEYS = new Set(["firedAt", "startedAt", "updatedAt", "endedAt", "completedAt", "openedAt", "closedAt", "lastEventAt", "bucketStart", "from", "to", "firstSeen", "lastSeen"]);

function shift<T>(value: T, offset: number): T {
  if (Array.isArray(value)) return value.map((v) => shift(v, offset)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = TIME_KEYS.has(k) && typeof v === "number" ? v + offset : shift(v, offset);
    }
    return out as T;
  }
  return value;
}

const STEP_MS = 1600;

let lastRoadFight = -Infinity;

export function createDemoBackend(): Backend {
  const doc = data as unknown as {
    baseTime: number;
    endTime: number;
    steps: Update[][];
    sessions: Snapshot["sessions"];
    sessionDetails: SessionDetail[];
    agents: Snapshot["agents"];
    agentDetails: AgentDetail[];
    events: Snapshot["events"];
    missions: Snapshot["missions"];
    projects: unknown[];
    dashboard: Dashboard;
  };
  const staticOffset = Date.now() - doc.endTime;
  const S = <T>(v: T) => shift(v, staticOffset);
  let settings: unknown = {};
  let characters: [string, unknown][] = [];
  const listeners = new Set<(u: Update[]) => void>();
  const settingsListeners = new Set<(v: unknown) => void>();
  const charListeners = new Set<() => void>();

  let step = 0;
  const tick = () => {
    const batch = doc.steps[step];
    if (batch) {
      const offset = Date.now() - (doc.baseTime + step * 4000);
      // A function the user gave an agent survives the replay, as it does in the real engine.
      const shifted = shift(batch, offset).map((u) => (u.type === "agent" && specialties.has(u.agent.id) ? { ...u, agent: { ...u.agent, specialty: specialties.get(u.agent.id)! } } : u));
      listeners.forEach((l) => l(shifted));
    }
    step += 1;
    const delay = step >= doc.steps.length ? 8000 : STEP_MS;
    if (step >= doc.steps.length) step = 0;
    setTimeout(tick, delay);
  };
  setTimeout(tick, 800);

  const info: SystemInfo = {
    version: "0.1.0-demo",
    platform: { os: "linux", osName: "navegador (demo)", arch: "wasm", sessionType: "unknown", desktop: "unknown", desktopRaw: null },
    capabilities: {
      tray: { level: "unsupported", reason: "Modo demonstração no navegador" },
      transparentWindows: { level: "full" },
      alwaysOnTop: { level: "unsupported", reason: "Modo demonstração" },
      windowPositioning: { level: "unsupported", reason: "Modo demonstração" },
      clickThrough: { level: "unsupported", reason: "Modo demonstração" },
      globalShortcuts: { level: "unsupported", reason: "Modo demonstração" },
      autostart: { level: "unsupported", reason: "Modo demonstração" },
      notifications: { level: "unsupported", reason: "Modo demonstração" },
      skipTaskbar: { level: "unsupported", reason: "Modo demonstração" },
    },
    dataDir: "(demo)",
    dbPath: "(demo)",
    logPath: "(demo)",
    dbSizeBytes: 0,
    autostartEnabled: null,
    debugBuild: true,
  };

  const integration: IntegrationInfo = {
    status: { settingsPath: "~/.claude/settings.json", settingsExists: true, settingsValid: true, installedEvents: [], missingEvents: ["SessionStart", "Stop"], staleHandlers: false, hooksDisabled: false, fullyInstalled: false },
    hookExecutable: "(demo)",
    hookExecutableExists: false,
    collector: { running: false, port: null, received: 0, rejected: 0, duplicates: 0, replayed: 0, lastError: null, lastReceivedAt: null, spoolBytes: 0 },
    db: { schemaVersion: 1, events: doc.events.length, sessions: doc.sessions.length, agents: doc.agents.length, usageRecords: 0, lastEventAt: null, eventsLastHour: 0 },
    events: ["SessionStart", "SessionEnd", "UserPromptSubmit", "PreToolUse", "PostToolUse", "PostToolUseFailure", "SubagentStart", "SubagentStop", "Stop", "StopFailure", "Notification", "TaskCreated", "TaskCompleted"],
  };

  const categoryImport = (c: InstructionCategory) => `@~/(demo)/instructions/${c}/${c}.md`;
  const instructionFiles = new Map<string, string>([
    ["global", "# Regras globais\n\nSempre responder em português.\n"],
    ["pessoal/pessoal", "# Projetos pessoais\n\nCommits direto na main.\n"],
    ["trabalho/trabalho", "# Projetos de trabalho\n\nBranches feature/* a partir da develop.\n"],
    ["pessoal/projects/ilha-das-sombras", `${categoryImport("pessoal")}\n\n# Ilha das Sombras\n`],
  ]);
  const linkedInstructions = new Set<string>();
  const instructionEntry = (key: string, name: string, projectPath: string | null, category: InstructionCategory | null, slug: string | null): InstructionEntry => ({
    key,
    name,
    slug,
    category,
    file: category || key === "global" ? `(demo)/instructions/${key}.md` : "",
    exists: instructionFiles.has(key),
    bytes: new TextEncoder().encode(instructionFiles.get(key) ?? "").length,
    projectPath,
    target: key === "global" ? "~/.claude/CLAUDE.md" : slug ? projectPath && `${projectPath}/CLAUDE.local.md` : null,
    linked: linkedInstructions.has(key),
  });
  const demoProjects = [{ name: "ilha-das-sombras", path: "/demo/ilha-das-sombras" }, { name: "loja-online", path: "/demo/loja-online" }];
  const demoCategories: InstructionCategory[] = ["pessoal", "trabalho"];
  const projectKey = (key: string) => /^(pessoal|trabalho)\/projects\/(.+)$/.exec(key) as [string, InstructionCategory, string] | null;
  const withCategoryImport = (category: InstructionCategory, content: string) => {
    const own = categoryImport(category);
    const lines = content.split("\n").filter((l) => !demoCategories.some((c) => c !== category && l.trim() === categoryImport(c)));
    return lines.some((l) => l.trim() === own) ? lines.join("\n") : `${own}\n${lines.join("\n")}`;
  };
  const demoProjectEntry = (p: { name: string; path: string }) => {
    const category = demoCategories.find((c) => instructionFiles.has(`${c}/projects/${p.name}`)) ?? null;
    return instructionEntry(category ? `${category}/projects/${p.name}` : `projects/${p.name}`, p.name, p.path, category, p.name);
  };

  const removedAgents = new Set<string>();
  const specialties = new Map<string, Specialty>();
  const reject = (what: string) => Promise.reject(new Error(`${what} não está disponível no modo demonstração.`));

  return {
    kind: "demo",
    getSnapshot: async () => ({ agents: [], recentAgents: [], sessions: [], missions: [], encounters: [], events: [], now: Date.now() }),
    getAgentDetail: async (id) => S(doc.agentDetails.find((d) => d.agent.id === id) ?? null),
    listAgents: async () => S(doc.agents.filter((a) => !removedAgents.has(a.id)).map((a) => ({ ...a, specialty: specialties.get(a.id) ?? a.specialty }))),
    setAgentSpecialty: async (id, specialty) => {
      specialties.set(id, specialty);
      const a = doc.agents.find((x) => x.id === id);
      if (a) listeners.forEach((l) => l([{ type: "agent", agent: { ...a, specialty, updatedAt: Date.now() } }]));
    },
    deleteAgent: async (id) => {
      removedAgents.add(id);
      listeners.forEach((l) => l([{ type: "agentRemoved", id }]));
    },
    listSessions: async (f) => S(doc.sessions.filter((s) => !f.projectId || s.session.projectId === f.projectId)),
    getSessionDetail: async (id) => S(doc.sessionDetails.find((d) => d.summary.session.id === id) ?? null),
    listEvents: async (f) =>
      S(
        doc.events.filter(
          (e) =>
            (!f.sessionId || e.sessionId === f.sessionId) &&
            (!f.agentId || e.agentId === f.agentId) &&
            (!f.category || e.category === f.category) &&
            (!f.eventName || e.eventName === f.eventName) &&
            (f.status !== "failure" || e.isFailure),
        ),
      ),
    listMissions: async (f) => S(doc.missions.filter((m) => (!f.status || m.status === f.status) && (!f.category || m.kind === f.category))),
    listProjects: async () => S(doc.projects) as never,
    getDashboard: async () => S(doc.dashboard),
    getCharacters: async () => characters,
    saveCharacter: async (id, d) => {
      characters = [...characters.filter(([k]) => k !== id), [id, d]];
      charListeners.forEach((l) => l());
    },
    getSettings: async () => settings,
    saveSettings: async (v) => {
      settings = v;
      settingsListeners.forEach((l) => l(v));
    },
    systemInfo: async () => info,
    readLogs: async () => ["(modo demonstração: sem logs)"],
    exportData: () => reject("Exportar"),
    backupDatabase: () => reject("Backup"),
    integrationInfo: async () => integration,
    integrationPlan: () => reject("Instalar a integração"),
    integrationApply: () => reject("Instalar a integração"),
    instructionsOverview: async () => ({
      root: "(demo)/instructions",
      global: instructionEntry("global", "Global", null, null, null),
      categories: demoCategories.map((c) => instructionEntry(`${c}/${c}`, c === "pessoal" ? "Pessoal" : "Trabalho", null, c, null)),
      projects: demoProjects.map(demoProjectEntry),
    }),
    readInstructions: async (key) => instructionFiles.get(key) ?? "",
    saveInstructions: async (key, content) => {
      const project = projectKey(key);
      instructionFiles.set(key, project ? withCategoryImport(project[1], content) : content);
    },
    linkInstructions: async (key) => {
      const project = projectKey(key);
      if (key !== "global" && !project) throw new Error("As regras de categoria não são vinculadas: elas entram pelos arquivos dos projetos.");
      const changed = !linkedInstructions.has(key);
      linkedInstructions.add(key);
      if (project) instructionFiles.set(key, withCategoryImport(project[1], instructionFiles.get(key) ?? ""));
      else if (!instructionFiles.has(key)) instructionFiles.set(key, "");
      const path = project ? demoProjects.find((p) => p.name === project[2])?.path : null;
      return { target: path ? `${path}/CLAUDE.local.md` : "~/.claude/CLAUDE.md", changed, adopted: false, keptLocal: false, backup: null };
    },
    showCastle: async () => {},
    setOverlayVisible: async () => {},
    listMonitors: async () => [],
    setOverlayContentWidth: async () => {},
    overlayArea: async () => {
      const screen = { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight };
      return { name: null, window: screen, monitor: screen, work: screen };
    },
    moveOverlay: async () => [],
    syncRoamers: async () => {},
    claimRoadFight: async (staggerMs) => {
      const now = Date.now();
      if (now - lastRoadFight < staggerMs) return false;
      lastRoadFight = now;
      return true;
    },
    setOverlayHitboxes: async () => {},
    quit: async () => {},
    onUpdates: async (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    onSettings: async (cb) => {
      settingsListeners.add(cb);
      return () => settingsListeners.delete(cb);
    },
    onNavigate: async () => () => {},
    onCharacters: async (cb) => {
      charListeners.add(cb);
      return () => charListeners.delete(cb);
    },
  };
}
