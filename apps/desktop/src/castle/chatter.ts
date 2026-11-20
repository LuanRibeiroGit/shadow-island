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

/** The bathroom regular, hurrying there. */
export const WC_RUSH_LINES = [
  "Sai da frente, é urgente!",
  "Não vai dar tempo!",
  "Ai, minha barriga...",
  "Tô ruim da barriga!",
  "De novo não...",
  "Licença, licença, licença!",
  "Foi aquele ensopado...",
  "Segura, segura, segura!",
];

/** ...and once he is sitting there. */
export const WC_LINES = [
  "Tô ruim da barriga...",
  "Ocupado!",
  "Tem gente!",
  "Cadê o papel?!",
  "Acabou o papel!",
  "Ai ai ai...",
  "Nunca mais como aquilo.",
  "Alguém traz papel, por favor!",
  "Isso não é normal...",
  "Vai demorar.",
  "Ufff...",
  "Não entra ninguém!",
];

/** ...and on his way out. */
export const WC_RELIEF_LINES = ["Ufa, que alívio.", "Não entrem lá agora.", "Dez minutos, no mínimo.", "Agora vai.", "Acho que passou.", "Abram a janela..."];

/** A soul the King just whipped, sent to the forge: on its way there... */
export const FORGE_GO_LINES = ["Tô indo, tô indo!", "Já vou pra bigorna...", "Que injustiça!", "Lá vou eu de novo.", "Calma, majestade!"];

/** ...and hammering at the anvil. */
export const FORGE_LINES = [
  "Tlim! Tlim! Tlim!",
  "Já tô batendo, majestade!",
  "Ai, minhas costas...",
  "Quem mandou eu cochilar...",
  "Mais uma espada pro Rei.",
  "Isso aqui pesa, viu?",
  "Tlim! ...ai, meu dedo!",
  "Nunca mais passeio perto dele.",
];

export const pick = (list: readonly string[], rand: () => number = Math.random): string => list[Math.floor(rand() * list.length)]!;

/** Small talk when two off-duty souls meet. Lines alternate: first soul, second soul, ... */
export const CHATS: readonly (readonly string[])[] = [
  ["E aí, de folga?", "Até aparecer tarefa.", "Tomara que demore."],
  ["Viu o Rei hoje?", "Vi. Tá de mau humor.", "Novidade..."],
  ["Que névoa, hein?", "Nem enxergo a fonte.", "Melhor assim."],
  ["Dormiu bem?", "Sonhei com um bug.", "Credo.", "Acordei suando."],
  ["Bora na biblioteca?", "Só se tiver café.", "Fechado."],
  ["Ouvi um deploy ontem.", "Sexta-feira?", "Sexta-feira.", "Coragem."],
  ["Esse castelo range.", "É o vento.", "Ou o Rei."],
  ["Quantos testes passaram?", "Todos, juro.", "Sei..."],
  ["Tá fazendo o quê?", "Nada. E você?", "Te ajudando."],
  ["Bonito o trono novo.", "Só não senta lá.", "Nem pensar."],
  ["Me empresta a lanterna?", "Devolve inteira.", "Prometo nada."],
  ["Saudade de trabalhar.", "Mentira.", "É, mentira."],
];

/** Now and then they quarrel (mild, comic). */
export const FIGHTS: readonly (readonly string[])[] = [
  ["Sai da frente!", "Sai você!", "Folgado!", "Abusado!"],
  ["Foi você que quebrou o build!", "Eu?! Foi você!", "Mentiroso!", "Vai catar coquinho!"],
  ["Devolve minha caneta!", "Que caneta?!", "Ladrão!", "Ah, vá se lascar!"],
  ["Você ronca!", "Você fala dormindo!", "Calúnia!"],
  ["Pisou no meu manto!", "Manto feio mesmo.", "Repete!", "Feio. Feio!"],
  ["Esse código é seu?", "É, por quê?", "Que porcaria!", "Faz melhor então!"],
  ["O Rei gosta mais de mim.", "Ele chicoteia você mais.", "Inveja!", "Droga, é verdade."],
];

export function pickChat(rand: () => number = Math.random): { lines: readonly string[]; fight: boolean } {
  const fight = rand() < 0.28;
  const list = fight ? FIGHTS : CHATS;
  return { lines: list[Math.floor(rand() * list.length)]!, fight };
}
