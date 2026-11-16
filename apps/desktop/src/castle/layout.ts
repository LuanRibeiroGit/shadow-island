// The castle map itself lives in @ids/game-engine (castle.ts); this file keeps
// the restoration progression shown under the castle.

/** Aesthetic restoration levels unlocked by REAL completed missions. */
export const RESTORATION_THRESHOLDS = [0, 1, 10, 50, 150, 400];

export function restorationLevel(completedMissions: number): number {
  let lvl = 0;
  RESTORATION_THRESHOLDS.forEach((t, i) => {
    if (completedMissions >= t) lvl = i;
  });
  return lvl;
}

export const RESTORATION_LABEL = [
  "Ruínas na névoa",
  "Primeira chama acesa",
  "Estandartes erguidos",
  "Cristais despertos",
  "Tesouro recuperado",
  "Castelo restaurado",
];

