/**
 * Small talk of idle souls strolling around the island. Pure flavour: these lines
 * are not Claude Code events and never show up in metrics or history.
 */
export const IDLE_LINES = [
  "Que tédio...",
  "Cadê as tarefas?",
  "Hmm...",
  "Lá lá lá...",
  "Que névoa!",
  "Bonita a fonte.",
  "Alguém viu o Rei?",
  "Tô de folga!",
  "Zzz... opa.",
  "Só um cafezinho.",
  "Hoje tá calmo.",
  "Ué, sumiu todo mundo?",
  "Esse castelo range...",
  "Saudade de um deploy.",
  "Me dá um bug aí!",
  "Vida de alma...",
  "Ô frio!",
  "Bora trabalhar?",
  "Tá, tá, já vou.",
  "Eita.",
];

/** Now and then they curse (mild, comic). */
export const CURSES = [
  "Droga!",
  "Que saco!",
  "Porcaria de merge!",
  "Maldito bug!",
  "Inferno!",
  "Diabos!",
  "Merda, tropecei!",
  "Raios!",
  "Vai catar coquinho!",
  "Que porre...",
  "Bosta de névoa!",
  "Ah, vá se lascar!",
];

export function pickLine(rand: () => number = Math.random): string {
  const list = rand() < 0.22 ? CURSES : IDLE_LINES;
  return list[Math.floor(rand() * list.length)]!;
}

/** The King's lines while he strolls. */
export const KING_LINES = [
  "Hmpf.",
  "Meu reino, minhas regras.",
  "Quem manda aqui sou eu.",
  "Cadê meu relatório?",
  "Que ilha linda eu tenho.",
  "Silêncio na corte!",
  "Tô de olho.",
];

/** What he shouts when the whip cracks. */
export const KING_CURSES = [
  "Trabalha, vagabundo!",
  "Anda, seu inútil!",
  "Mais rápido, lesma!",
  "Tá dormindo, desgraçado?",
  "Bando de preguiçosos!",
  "Volta pro trabalho, peste!",
  "Mexe esse esqueleto!",
  "Sem moleza, traste!",
];

/** What a soul answers to the whip. */
export const OUCH_LINES = ["Ai!", "Ui!", "Já vou, já vou!", "Calma, majestade!", "Isso dói!", "Tô indo!", "Ô loco!", "Ai, minhas costas!"];

export const pick = (list: readonly string[], rand: () => number = Math.random): string => list[Math.floor(rand() * list.length)]!;
