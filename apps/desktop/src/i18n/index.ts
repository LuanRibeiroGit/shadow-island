import { useSettings } from "../stores/settings";
import { en } from "./en";
import { ptBR, type Dict } from "./pt-BR";

const dicts: Record<string, Partial<Dict>> = { "pt-BR": ptBR, en };

export function translate(lang: string, key: keyof Dict): string {
  return dicts[lang]?.[key] ?? ptBR[key];
}

export function useT(): (key: keyof Dict) => string {
  const lang = useSettings((s) => s.settings.general.language);
  return (key) => translate(lang, key);
}
