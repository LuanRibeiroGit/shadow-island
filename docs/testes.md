# Registro de testes

Cada rodada de testes concluída é registrada aqui, a mais recente primeiro: o que estava sendo testado, cada comando, o
resultado e os números. Falhas são copiadas literalmente.

## 2026-11-17 · Tema Dracula

O que mudou: novo tema `dracula`, com a paleta do Dracula do VS Code. Ele entrou no tipo `theme`
(`apps/desktop/src/settings/schema.ts`), virou uma opção no seletor de tema (`apps/desktop/src/settings/SettingsPage.tsx`)
e ganhou um bloco `:root[data-theme="dracula"]` com variáveis e overrides de componentes
(`apps/desktop/src/styles/theme.css`). Branch `feature/dracula-theme`.

Rodado por: agente `tester`.

| Comando | Resultado | Números |
| --- | --- | --- |
| `pnpm typecheck` (Node v18.20.8) | passou | 5 projetos sem erros |
| `pnpm test` (Vitest, Node v22.23.3) | passou | 44 testes em 10 arquivos, 0 pulados |
| `pnpm test:e2e` (Playwright, Node v22.23.3) | passou | 9 testes (8 em `app.spec.ts`, 1 em `csp.spec.ts`), 0 pulados |

Falhas de ambiente, já contornadas:

- Com o Node padrão do shell (v18.20.8) o Vitest não executou nenhum teste. O erro veio de `rolldown@1.2.19`:
  ```
  SyntaxError: The requested module 'node:util' does not provide an export named 'styleText'
      at ModuleJob._instantiate (node:internal/modules/esm/module_job:123:21)
  ```
  A suíte rodou depois com o Node v22.23.3 do nvm, trocado só no PATH daquele comando. O repositório não tem `.nvmrc`
  nem `engines`.
- Na primeira tentativa os 9 testes do Playwright falharam com
  `browserType.launch: Executable doesn't exist at /home/luan-ribeiro/.cache/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-linux64/chrome-headless-shell`.
  O navegador foi instalado com `pnpm --filter @ids/desktop exec playwright install chromium-headless-shell` e os 9
  passaram.

Não rodou: `cargo test --workspace`, porque nenhum código Rust mudou.

Sem teste automático: nenhum teste cobre temas. Ficaram de fora a opção nova no seletor, a aplicação de
`data-theme="dracula"` e o resultado visual. A rodada mostra apenas que as outras telas continuam funcionando.

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
