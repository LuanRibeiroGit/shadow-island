import { create } from "zustand";
import type { CharacterCustomization } from "@ids/game-engine";
import { backend } from "../bridge/backend";

interface CharactersStore {
  custom: Record<string, CharacterCustomization>;
  init(): Promise<void>;
  save(id: string, c: CharacterCustomization): Promise<void>;
}

let started = false;

export const useCharacters = create<CharactersStore>((set, get) => ({
  custom: {},
  async init() {
    if (started) return;
    started = true;
    const b = await backend();
    const load = async () => set({ custom: Object.fromEntries((await b.getCharacters()) as [string, CharacterCustomization][]) });
    await b.onCharacters(load);
    await load();
  },
  async save(id, c) {
    set({ custom: { ...get().custom, [id]: c } });
    await (await backend()).saveCharacter(id, c);
  },
}));
