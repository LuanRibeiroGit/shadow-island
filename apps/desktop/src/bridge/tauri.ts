import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Update } from "@ids/shared";
import type { Backend } from "./backend";

export function createTauriBackend(): Backend {
  const on = async <T>(event: string, cb: (p: T) => void) => listen<T>(event, (e) => cb(e.payload));
  return {
    kind: "tauri",
    getSnapshot: () => invoke("get_snapshot"),
    getAgentDetail: (id) => invoke("get_agent_detail", { id }),
    listAgents: (filter) => invoke("list_agents", { filter }),
    setAgentSpecialty: (id, specialty) => invoke("set_agent_specialty", { id, specialty }),
    deleteAgent: (id) => invoke("delete_agent", { id }),
    listSessions: (filter) => invoke("list_sessions", { filter }),
    getSessionDetail: (id) => invoke("get_session_detail", { id }),
    listEvents: (filter) => invoke("list_events", { filter }),
    listMissions: (filter) => invoke("list_missions", { filter }),
    listProjects: () => invoke("list_projects"),
    getDashboard: (periodDays) => invoke("get_dashboard", { periodDays }),
    getCharacters: () => invoke("get_characters"),
    saveCharacter: (id, data) => invoke("save_character", { id, data }),
    getSettings: () => invoke("get_settings"),
    saveSettings: (value) => invoke("save_settings", { value }),
    systemInfo: () => invoke("system_info"),
    readLogs: (lines) => invoke("read_logs", { lines }),
    exportData: () => invoke("export_data"),
    backupDatabase: () => invoke("backup_database"),
    integrationInfo: () => invoke("integration_info"),
    integrationPlan: (action) => invoke("integration_plan", { action }),
    integrationApply: (action, expectedAfter) => invoke("integration_apply", { action, expectedAfter }),
    instructionsOverview: () => invoke("instructions_overview"),
    readInstructions: (key) => invoke("instructions_read", { key }),
    saveInstructions: (key, content) => invoke("instructions_save", { key, content }),
    linkInstructions: (key) => invoke("instructions_link", { key }),
    showCastle: (route) => invoke("show_castle", { route: route ?? null }),
    setOverlayVisible: (visible) => invoke("set_overlay_visible", { visible }),
    listMonitors: () => invoke("list_monitors"),
    setOverlayContentWidth: (width, height) => invoke("set_overlay_content_width", { width, height: height ?? null }),
    overlayArea: () => invoke("overlay_area"),
    moveOverlay: (x, y) => invoke("move_overlay", { x, y }),
    setOverlayHitboxes: (boxes) => invoke("set_overlay_hitboxes", { boxes }),
    quit: () => invoke("quit_app"),
    onUpdates: (cb) => on<Update[]>("ids://updates", cb),
    onSettings: (cb) => on<unknown>("ids://settings", cb),
    onNavigate: (cb) => on<string>("ids://navigate", cb),
    onCharacters: (cb) => on<null>("ids://characters", () => cb()),
  };
}
