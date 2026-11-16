import { create } from "zustand";
import { applyUpdates, emptyWorld, worldFromSnapshot, type World } from "@ids/event-system";
import type { Update } from "@ids/shared";
import { backend } from "../bridge/backend";

interface WorldStore {
  world: World;
  ready: boolean;
  error: string | null;
  init(): Promise<void>;
  apply(updates: Update[]): void;
}

let started = false;

export const useWorld = create<WorldStore>((set, get) => ({
  world: emptyWorld(),
  ready: false,
  error: null,
  async init() {
    if (started) return;
    started = true;
    try {
      const b = await backend();
      // Subscribe first so no update is lost between snapshot and listen.
      const pending: Update[][] = [];
      let live = false;
      await b.onUpdates((u) => (live ? get().apply(u) : pending.push(u)));
      const snap = await b.getSnapshot();
      let world = worldFromSnapshot(snap);
      for (const u of pending) world = applyUpdates(world, u);
      live = true;
      set({ world, ready: true });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e), ready: true });
    }
  },
  apply(updates) {
    set({ world: applyUpdates(get().world, updates) });
  },
}));
