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
