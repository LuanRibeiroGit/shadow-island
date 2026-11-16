import type { Agent, Specialty } from "@ids/shared";

/**
 * Character classes of the spectral crew. A class is purely visual: it maps to a
 * spritesheet + default palette. Which class an agent gets comes from its real
 * specialty (or the user's choice), never from guessing.
 */
export interface CharacterClass {
  id: string;
  label: string;
  description: string;
  /** Spritesheet id in the asset manifest. */
  sprite: string;
  palette: Palette;
}

export interface Palette {
  cloak: string;
  trim: string;
  glow: string;
}

export const CLASSES: Record<string, CharacterClass> = {
  lantern_keeper: { id: "lantern_keeper", label: "Guardiã da Lanterna", description: "Agente principal: conduz a tripulação.", sprite: "lantern_keeper", palette: { cloak: "#2c4a52", trim: "#d7b45a", glow: "#7cf2c2" } },
  wraith_scholar: { id: "wraith_scholar", label: "Espectro Erudito", description: "Pesquisa e leitura.", sprite: "wraith_scholar", palette: { cloak: "#3a3f6b", trim: "#a9b4ff", glow: "#9fe7ff" } },
  spectral_smith: { id: "spectral_smith", label: "Ferreiro Espectral", description: "Implementação e construção.", sprite: "spectral_smith", palette: { cloak: "#5a3b2e", trim: "#f0a35c", glow: "#ffd28a" } },
  mist_alchemist: { id: "mist_alchemist", label: "Alquimista da Névoa", description: "Testes e validação.", sprite: "mist_alchemist", palette: { cloak: "#2f5a3a", trim: "#9be37a", glow: "#c8ff8f" } },
  bone_sentinel: { id: "bone_sentinel", label: "Sentinela de Osso", description: "Revisão de código.", sprite: "bone_sentinel", palette: { cloak: "#4b4b55", trim: "#e9e3d1", glow: "#f5f0dc" } },
  hollow_hunter: { id: "hollow_hunter", label: "Caçador do Vazio", description: "Depuração e investigação de erros.", sprite: "hollow_hunter", palette: { cloak: "#5a2a3a", trim: "#ff7a8a", glow: "#ff9fb0" } },
  ink_scribe: { id: "ink_scribe", label: "Escriba de Tinta", description: "Documentação.", sprite: "ink_scribe", palette: { cloak: "#33405a", trim: "#c9d6ff", glow: "#e2e9ff" } },
  tide_architect: { id: "tide_architect", label: "Arquiteto das Marés", description: "Arquitetura e planejamento.", sprite: "tide_architect", palette: { cloak: "#1f4f63", trim: "#7fd3e6", glow: "#b5f1ff" } },
  wisp: { id: "wisp", label: "Fogo-Fátuo", description: "Agente sem especialidade identificada.", sprite: "wisp", palette: { cloak: "#2b3f45", trim: "#8fb9b1", glow: "#b8fff0" } },
};

const BY_SPECIALTY: Record<Specialty, string> = {
  architect: "tide_architect",
  developer: "spectral_smith",
  researcher: "wraith_scholar",
  tester: "mist_alchemist",
  reviewer: "bone_sentinel",
  debugger: "hollow_hunter",
  documentation: "ink_scribe",
  general: "wisp",
};

export const SPECIALTY_LABEL: Record<Specialty, string> = {
  architect: "Arquiteto",
  developer: "Desenvolvedor",
  researcher: "Pesquisador",
  tester: "Testador",
  reviewer: "Revisor",
  debugger: "Depurador",
  documentation: "Documentação",
  general: "Geral",
};

/** User customization, stored per specialty ("specialty:tester", "specialty:main") or per agent ("agent:<id>"). */
export interface CharacterCustomization {
  name?: string;
  classId?: string;
  palette?: Partial<Palette>;
  /** Accessory/weapon overlay id from the asset manifest. */
  weapon?: string;
  scale?: number;
  hidden?: boolean;
}

export interface ResolvedCharacter {
  name: string;
  cls: CharacterClass;
  palette: Palette;
  weapon: string | null;
  scale: number;
  hidden: boolean;
}

export function resolveCharacter(agent: Agent, custom: Record<string, CharacterCustomization>): ResolvedCharacter {
  // Main agents have their own entry so customizing "Geral" does not repaint them.
  const bySpecialty = custom[agent.isMain ? "specialty:main" : `specialty:${agent.specialty}`] ?? {};
  const byAgent = custom[`agent:${agent.id}`] ?? {};
  const c: CharacterCustomization = { ...bySpecialty, ...byAgent, palette: { ...bySpecialty.palette, ...byAgent.palette } };
  const defaultClass = agent.isMain ? "lantern_keeper" : BY_SPECIALTY[agent.specialty];
  const cls = CLASSES[c.classId ?? ""] ?? CLASSES[defaultClass] ?? CLASSES.wisp!;
  return {
    name: byAgent.name?.trim() || agent.name,
    cls,
    palette: { ...cls.palette, ...c.palette },
    weapon: c.weapon ?? null,
    scale: Math.min(4, Math.max(1, c.scale ?? 2)),
    hidden: c.hidden ?? false,
  };
}
