import type { MonsterKind } from "@ids/shared";

export interface MonsterInfo {
  kind: MonsterKind;
  name: string;
  description: string;
  /** Sprite id in the asset manifest. */
  sprite: string;
}

const MONSTERS: Record<MonsterKind, MonsterInfo> = {
  bug_monster: { kind: "bug_monster", name: "Besouro Rúnico", description: "Uma falha comum: uma ferramenta falhou.", sprite: "bug_monster" },
  error_goblin: { kind: "error_goblin", name: "Goblin do Erro", description: "Um build ou comando de compilação falhou.", sprite: "error_goblin" },
  dependency_dragon: { kind: "dependency_dragon", name: "Dragão das Dependências", description: "Uma dependência não foi encontrada ou não pôde ser instalada.", sprite: "dependency_dragon" },
  test_phantom: { kind: "test_phantom", name: "Fantasma dos Testes", description: "Um comando de teste falhou.", sprite: "test_phantom" },
  conflict_skeleton: { kind: "conflict_skeleton", name: "Esqueleto do Conflito", description: "Um conflito de versão apareceu.", sprite: "conflict_skeleton" },
  security_beast: { kind: "security_beast", name: "Fera da Segurança", description: "Um alerta de segurança ou auditoria falhou.", sprite: "security_beast" },
};

export const monsterInfo = (k: MonsterKind): MonsterInfo => MONSTERS[k] ?? MONSTERS.bug_monster;
export const allMonsters = (): MonsterInfo[] => Object.values(MONSTERS);
