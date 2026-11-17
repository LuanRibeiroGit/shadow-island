# Registro de testes

Cada rodada de testes concluída é registrada aqui, a mais recente primeiro: o que estava sendo testado, cada comando, o
resultado e os números. Falhas são copiadas literalmente.

## 2026-11-16 · Combate da arena: mais dano, renascimento e golpe final

O que mudou: a sombra da tarefa perde 6% de vida por golpe e 30% a cada ação nova do agente; quando a vida zera com a
tarefa em andamento ela morre e outra nasce cerca de 1 s depois; quando a tarefa termina o personagem dá um golpe final
(`apps/desktop/src/castle/scene.ts`). Também foram criados `CLAUDE.md` e `.claude/agents/git-reviewer.md` (só texto).

Rodado por: subagente de teste (genérico; o agente `tester` do projeto só carrega a partir da próxima sessão).

| Comando | Resultado | Números |
| --- | --- | --- |
| `pnpm typecheck` | passou | 5 pacotes sem erros |
| `pnpm test` (Vitest) | passou | 44 testes em 10 arquivos |
| `pnpm test:e2e` (Playwright, backend de demonstração) | passou | 9 testes (8 em `app.spec.ts`, 1 em `csp.spec.ts`) |

Falhas: nenhuma.

Não rodou: `cargo test --workspace` (nenhum código Rust mudou).

Conferido à mão no navegador (modo demonstração), fora da suíte: em uma tarefa do agente principal a sombra morreu três
vezes e renasceu antes do golpe final; durante o golpe final o personagem tocou a animação de ataque virado para ela.
A captura de tela do golpe final saiu depois de a sombra sumir, então o efeito visual dele não foi visto em imagem.

Não coberto por teste automático: todo o combate (dano, morte, renascimento, golpe final). Nenhum teste e2e nem do
Vitest o exercita.

## 2026-11-16 · Duelos da arena: distância, dano e barra de vida

O que mudou: os postos da arena ficaram a três casas uns dos outros e um agente novo não escolhe mais um posto já
ocupado (`STATIONS.laboratory` em `packages/game-engine/src/castle.ts`, `sync` em `apps/desktop/src/castle/scene.ts`);
a sombra da tarefa pisca em vermelho a cada golpe, tem barra de vida e morre quando a tarefa termina
(`scene.ts`, `MonsterView.setHurt` em `apps/desktop/src/characters/pixi.ts`).

Rodado por: subagente de teste (genérico; o agente `tester` do projeto só carrega a partir da próxima sessão).

| Comando | Resultado | Números |
| --- | --- | --- |
| `pnpm typecheck` | passou | 5 pacotes sem erros |
| `pnpm test` (Vitest) | passou | 44 testes em 10 arquivos |
| `pnpm test:e2e` (Playwright, backend de demonstração) | passou | 9 testes (8 em `app.spec.ts`, 1 em `csp.spec.ts`) |

Falhas: nenhuma.

Não rodou: `cargo test --workspace` (nenhum código Rust mudou).

Conferido à mão no navegador (modo demonstração), fora da suíte: com dois duelos ao mesmo tempo, cada agente ficou em
um posto diferente (39,24 e 36,21); a sombra ficou vermelha ao apanhar; a barra de vida apareceu sobre ela, abaixo da
linha dos nomes, e foi caindo (100% → 55% em cerca de 20 s, com três trocas de ação do agente).

Não coberto por teste automático: a barra de vida e o efeito de dano. Nenhum teste e2e os exercita; só o typecheck e a
conferência manual acima.

## 2026-11-16 · Fala do agente no balão de trabalho

O que mudou: o balão sobre o agente que está trabalhando passou a mostrar o que ele está fazendo, em primeira pessoa
(`apps/desktop/src/castle/speech.ts`), em vez do texto do pedido do usuário.

Rodado por: subagente de teste (genérico; o agente `tester` do projeto só carrega a partir da próxima sessão).

| Comando | Resultado | Números |
| --- | --- | --- |
| `pnpm typecheck` | passou | 5 pacotes sem erros |
| `pnpm test` (Vitest) | passou | 44 testes em 10 arquivos |
| `pnpm test:e2e` (Playwright, backend de demonstração) | passou | 9 testes (8 em `app.spec.ts`, 1 em `csp.spec.ts`) |

Falhas: nenhuma.

Não rodou: `cargo test --workspace` (nenhum código Rust mudou).

Não coberto por teste automático: a aparência do balão no castelo. Os testes de `speech.test.ts` cobrem o texto da
fala; o desenho na tela não foi conferido nesta rodada.
