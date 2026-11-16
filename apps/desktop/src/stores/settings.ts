import { create } from "zustand";
import { backend } from "../bridge/backend";
import { DEFAULT_SETTINGS, mergeSettings, type Settings } from "../settings/schema";

interface SettingsStore {
  settings: Settings;
  loaded: boolean;
  init(): Promise<void>;
  update(patch: (s: Settings) => Settings): Promise<void>;
}

let started = false;

export const useSettings = create<SettingsStore>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  async init() {
    if (started) return;
    started = true;
    const b = await backend();
    await b.onSettings((v) => set({ settings: mergeSettings(v) }));
    set({ settings: mergeSettings(await b.getSettings()), loaded: true });
  },
  async update(patch) {
    const next = patch(structuredClone(get().settings));
    set({ settings: next });
    await (await backend()).saveSettings(next);
  },
}));
