import type { ModelPrice } from "@ids/analytics";

/**
 * Full settings document. The backend reads `general`, `claude` and `desktop`
 * (see src-tauri/src/settings.rs) and keeps the rest untouched.
 */
export interface Settings {
  general: {
    launchAtLogin: boolean;
    minimizeToTray: boolean;
    openCastleOnStart: boolean;
    toggleShortcut: string;
    language: "pt-BR" | "en";
    theme: "shadow" | "dusk" | "contrast";
    compactMode: boolean;
  };
  claude: {
    integrationEnabled: boolean;
    keepPromptExcerpt: boolean;
    specialtyOverrides: Record<string, string>;
    extraTranscriptDirs: string[];
    retentionDays: number;
  };
  desktop: {
    overlayEnabled: boolean;
    placement: "bottom" | "top" | "taskbar";
    height: number;
    widthFraction: number;
    /** Strip only as wide as the souls working. */
    autoWidth: boolean;
    align: "left" | "center" | "right";
    monitor: string | null;
    preferX11OnWayland: boolean;
    characterScale: number;
    walkSpeed: number;
    animationSpeed: number;
    showMessages: boolean;
    showNames: boolean;
    animationsEnabled: boolean;
    showFinished: boolean;
  };
  metrics: {
    prices: ModelPrice[];
    periodDays: number;
    showTokens: boolean;
    showCosts: boolean;
  };
  audio: {
    enabled: boolean;
    volume: number;
  };
  castle: {
    hiddenRooms: string[];
    roomNames: Record<string, string>;
  };
}

export const DEFAULT_SETTINGS: Settings = {
  general: {
    launchAtLogin: false,
    minimizeToTray: true,
    openCastleOnStart: true,
    toggleShortcut: "CommandOrControl+Shift+I",
    language: "pt-BR",
    theme: "shadow",
    compactMode: false,
  },
  claude: {
    integrationEnabled: true,
    keepPromptExcerpt: true,
    specialtyOverrides: {},
    extraTranscriptDirs: [],
    retentionDays: 90,
  },
  desktop: {
    overlayEnabled: true,
    placement: "bottom",
    height: 52,
    widthFraction: 1,
    autoWidth: true,
    align: "right",
    monitor: null,
    preferX11OnWayland: true,
    characterScale: 2,
    walkSpeed: 28,
    animationSpeed: 1,
    showMessages: true,
    showNames: false,
    animationsEnabled: true,
    showFinished: true,
  },
  metrics: { prices: [], periodDays: 7, showTokens: true, showCosts: true },
  audio: { enabled: false, volume: 0.5 },
  castle: { hiddenRooms: [], roomNames: {} },
};

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);

/** Deep-merge a stored document over defaults; wrong types fall back to defaults. */
export function mergeSettings(stored: unknown): Settings {
  const merge = (def: unknown, val: unknown): unknown => {
    if (isObj(def)) {
      const out: Obj = {};
      const v = isObj(val) ? val : {};
      for (const k of Object.keys(def)) out[k] = merge(def[k], v[k]);
      // keep unknown keys for forward compatibility
      for (const k of Object.keys(v)) if (!(k in def)) out[k] = v[k];
      return out;
    }
    if (val === undefined) return def;
    if (def === null) return val;
    if (Array.isArray(def)) return Array.isArray(val) ? val : def;
    return typeof val === typeof def ? val : def;
  };
  return merge(DEFAULT_SETTINGS, stored) as Settings;
}
