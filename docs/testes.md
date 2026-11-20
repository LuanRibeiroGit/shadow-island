# Registro de testes

Cada rodada de testes concluída é registrada aqui, a mais recente primeiro: o que estava sendo testado, cada comando, o
resultado e os números. Falhas são copiadas literalmente.

## 2026-11-20 · Forja redecorada e castigo do Rei na bigorna

O que mudou (working tree, não commitado): forja do castelo redecorada, com os tiles novos `trough`, `grindstone`,
`coal` e `workbench` e a bigorna redesenhada em `scripts/iso_castle.py` (`assets/environments/castle-iso.png` e
`assets/manifest.json` regenerados); em `packages/game-engine/src/castle.ts`, os props novos da forja e `ANVIL_SPOTS`,
com o teste novo `has anvils a punished soul can walk to and stand at` em `castle.test.ts`. Em
`apps/desktop/src/castle/scene.ts` e `chatter.ts`, o castigo do Rei: depois de chicotear um tripulante de folga, o Rei o
manda à forja, onde ele martela na bigorna por 16 a 28 s (martelo animado, faíscas, falas próprias). Essas mudanças
foram reaplicadas por cima de um pull de 14 commits (`159c4fc..69b47f8`); `scene.ts` e `manifest.json` tiveram junção
automática, sem conflito.

Rodado por: agente `tester`.

| Comando | Resultado | Números |
| --- | --- | --- |
| `pnpm typecheck` | passou | 5 pacotes sem erros |
| `pnpm test` (Vitest) | passou | 81 testes em 14 arquivos, incluindo `castle map > has anvils a punished soul can walk to and stand at` |
| `pnpm test:e2e` (Playwright, backend de demonstração) | passou | 10 de 10 em 40.4s, incluindo `production bundle runs under the app CSP` com o manifesto regenerado |

Falhas: nenhuma.

Avisos, que não são erros: Vite, `configLoader: 'native'` (ESM em `vitest.config.ts`, `__dirname` em
`apps/desktop/vite.config.ts`).

Não rodado: `pnpm test:rust`, porque nenhum código Rust mudou.

Conferido à mão no navegador (modo demonstração), fora da suíte: forçando o Rei a chicotear o Arquiteto das Marés de
folga, ele foi mandado à bigorna (36,11), andou até lá dizendo "Tô indo, tô indo!", ficou com a animação `work` e o
martelo subindo e descendo, e falou "Tlim! ...ai, meu dedo!", "Isso aqui pesa, viu?" e "Nunca mais passeio perto dele.".

Sem cobertura automática: o castigo na tela (martelo, faíscas, falas, duração) e a aparência dos tiles novos da forja.

## 2026-11-19 · Skin do Robson e Guardiã da Lanterna com a skin do Escriba

O que mudou (working tree, não commitado): nova skin `robson`, montada por `scripts/generate-assets.py`
(`build_loose_characters`) a partir de `scripts/art/characters/robson.png` em `assets/characters/robson.png`, com quadros
de 48px e `"displayScale": 0.75` em `assets/manifest.json`. `SheetSpec` (`packages/game-engine/src/assets.ts`) ganhou
`displayScale` opcional, que `apps/desktop/src/characters/pixi.ts` multiplica na escala do `CharacterView`. Em
`packages/game-engine/src/classes.ts`, nova classe `robson`; `lantern_keeper` (Guardiã da Lanterna) passa a usar o
sprite e as cores do `ink_scribe`; `BATHROOM_REGULAR` saiu de `crew.ts` para `classes.ts`, com `ownClass(id)`, que dá a
classe `robson` ao tripulante `crew:documentation`. `apps/desktop/src/characters/CharactersPage.tsx` usa `ownClass` no
card. Teste novo em `packages/game-engine/src/crew.test.ts`: `robson wears his own skin and the lantern keeper wears the
scribe's`.

Rodado por: agente `tester`. Comandos pnpm com Node v22.23.3.

| Comando | Resultado | Números |
| --- | --- | --- |
| `pnpm typecheck` | passou | 5 pacotes sem erros (shared, analytics, event-system, game-engine, desktop) |
| `pnpm test` (Vitest) | passou | 80 testes em 14 arquivos, incluindo `crew > robson wears his own skin and the lantern keeper wears the scribe's` e `characters > validates manifests` |
| `pnpm test:e2e` (Playwright, backend de demonstração) | passou | 10 de 10 passaram em 27.5s, incluindo `castle shows the demo banner and the main agent from replayed events` e `production bundle runs under the app CSP`, que conferem o texto "Guardiã da Lanterna" |

Falhas: nenhuma.

Manifesto: o teste `validates manifests` usa um manifesto sintético, não o `assets/manifest.json` real. Conferido à
parte, com as mesmas regras de `validateManifest`, que a entrada `robson` tem as 9 animações obrigatórias (`ANIMATIONS`)
mais `sleep`, todas com `frames` e `fps` maiores que zero, e que `assets/characters/robson.png` tem 288x480, ou seja,
6 colunas por 10 linhas de 48px, compatível com o maior número de quadros (6) e de linhas (10).

Avisos, que não são erros: Vitest, "ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1)"; Vite no e2e,
"`__dirname` (vite.config.ts:10:51). Use `import.meta.dirname` instead".

Não rodado: `pnpm test:rust`, porque nenhum código Rust mudou. Sem cobertura automática: a aparência real no app
desktop (o sprite do Robson, o `displayScale` de 0.75 aplicado no `CharacterView`, a Guardiã da Lanterna desenhada com
a skin do Escriba e o card do Robson na página de personagens); nenhum teste confere pixels nem a escala renderizada.
`scripts/generate-assets.py` também não foi executado nem testado.

## 2026-11-18 · Motor: Stop com tarefa em segundo plano e subagentes silenciosos

O que mudou: correção em `crates/ids-core/src/engine.rs` para personagens que ficavam presos no overlay do desktop.
(1) Quando o agente principal recebe `Stop` e ainda há `background_tasks` (por exemplo um shell rodando), o estado passa
a ser `IDLE` em vez de `WAITING`, que deixava o personagem dizendo "Estou esperando você...". (2) Em todo `Stop`, os
subagentes da mesma sessão sem evento há 30 minutos ou mais (`SILENT_SUBAGENT_MS`) são encerrados com `finish_agent`, e a
missão deles é fechada com erro (agentes interrompidos nunca mandam `SubagentStop`). Em
`crates/ids-core/tests/engine_scenarios.rs`, `states_follow_real_events` passou a esperar `Idle` no Stop com shell em
segundo plano, e entrou o teste novo `a_stop_retires_subagents_that_went_silent`.

Rodado por: agente `tester`. Comandos pnpm com Node v22.23.3. O Playwright reaproveitou o Vite do app aberto em modo
dev (porta 1420).

| Comando | Resultado | Números |
| --- | --- | --- |
| `pnpm typecheck` | passou | 5 pacotes sem erros |
| `pnpm test` (Vitest) | passou | 79 testes em 14 arquivos |
| `pnpm test:rust` (`cargo test --workspace`) | passou | 89 testes (ids-core 48 + 12 de cenários, ids-hook 3, desktop 26), incluindo `states_follow_real_events` e `a_stop_retires_subagents_that_went_silent` |
| `pnpm test:e2e` (Playwright, backend de demonstração) | passou | 10 de 10 passaram em 26.4s |

Falhas: nenhuma.

Avisos, que não são erros: Vitest, "ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1)"; Vite no e2e,
"`__dirname` (vite.config.ts:10:51). Use `import.meta.dirname` instead".

Sem cobertura automática: o efeito no app desktop real (o personagem saindo do overlay após o `Stop` com shell em
segundo plano e após o encerramento de subagentes silenciosos). Os testes do motor cobrem a transição de estado e o
encerramento, mas nenhum e2e exercita esses dois caminhos, e o limite de 30 minutos só é testado no motor, não com
tempo real.

## 2026-11-18 · Overlay: nova rodada do e2e após corrigir o teste de CSP

O que mudou desde a rodada anterior (logo abaixo): só `apps/desktop/e2e/csp.spec.ts`. O teste
`production bundle runs under the app CSP` agora pega um id do atributo `data-roamers` da página principal do overlay,
abre `overlay.html?agent=<id>` e espera `data-crew="1"`; continua verificando o fundo transparente e a ausência de erros
sob a CSP. Nenhum outro código mudou.

Rodado por: agente `tester`. Comandos pnpm com Node v22.23.3. O Playwright reaproveitou o Vite do app aberto em modo
dev (porta 1420).

| Comando | Resultado | Números |
| --- | --- | --- |
| `pnpm typecheck` | passou | 5 pacotes sem erros (inclui `apps/desktop`, onde está o teste alterado) |
| `pnpm test:e2e` (Playwright, backend de demonstração) | passou | 10 de 10 passaram em 23.9s, incluindo `production bundle runs under the app CSP` (8.1s) e `overlay opens one small window per working soul` (6.1s) |

Falhas: nenhuma.

Avisos do Vite, que não são erros: "`__dirname` (vite.config.ts:10:51). Use `import.meta.dirname` instead".

Não rodado nesta rodada: `pnpm test` (Vitest) e `pnpm test:rust`, porque nenhum código além do e2e mudou; os
resultados da rodada anterior valem (79 testes Vitest, 88 testes Rust). Continua sem cobertura automática o mesmo da
rodada anterior: as janelas reais `roamer-*` no app desktop (abertura e fechamento, movimento pela tela, hitboxes por
janela, `move_overlay`/`overlay_area` por janela, `claim_road_fight` entre janelas, outros monitores).

## 2026-11-18 · Overlay: modo roam com uma janela pequena por personagem (rodada final antes do commit)

O que mudou: no modo roam, cada personagem ganha a sua própria janela pequena. No Rust, um registro de janelas
`roamer-*` (`apps/desktop/src-tauri/src/roam.rs`, novo), os comandos `sync_roamers` e `claim_road_fight`,
`move_overlay` e `overlay_area` por janela, hitboxes por janela e o `roam_spawn` em
`apps/desktop/src-tauri/src/platform/geometry.rs`. No front, a janela de cada agente é aberta como
`overlay.html?agent=<id>` e se move pela tela desviando das outras (`Roamer` em `apps/desktop/src/overlay/roam.ts`); o
modo solo fica em `apps/desktop/src/overlay/scene.ts`. O e2e do overlay foi trocado para
`overlay opens one small window per working soul`. O working tree também traz as mudanças do Grimório (instruções por
categoria) e das instruções em `instructions/`, já testadas hoje, que entraram nesta rodada sem alteração.

Rodado por: agente `tester`. Comandos pnpm com Node v22.23.3.

| Comando | Resultado | Números |
| --- | --- | --- |
| `pnpm typecheck` | passou | 5 pacotes sem erros |
| `pnpm test` (Vitest) | passou | 79 testes em 14 arquivos; dos quais 32 em `apps/desktop/src/overlay` (labels 6, road 9, roam 12, sendo 4 em `roamer windows`, crew 5) |
| `pnpm test:rust` (`cargo test --workspace`) | passou | 88 testes (ids-core 48 + 11 de cenários, ids-hook 3, desktop 26), 6 deles em `roam::tests` e 10 em `platform::geometry::tests`, incluindo `newcomers_are_born_a_window_away_from_everyone` e `the_first_roamer_is_born_in_the_middle_of_the_bottom_lane` |
| `pnpm test:e2e` (Playwright, backend de demonstração) | falhou | 9 de 10 passaram; falhou `production bundle runs under the app CSP`. `overlay opens one small window per working soul` passou |

Falha (reproduzida ao rodar `e2e/csp.spec.ts` sozinho), `apps/desktop/e2e/csp.spec.ts:8`,
`production bundle runs under the app CSP`:

```
Error: expect(locator).not.toHaveAttribute(expected) failed

Locator:  locator('.overlay-root')
Expected: not "0"
Received: "0"
Timeout:  10000ms

Call log:
  - Expect "not toHaveAttribute" locator('.overlay-root') with timeout 10000ms
  - waiting for locator('.overlay-root')
    9 × locator resolved to <div data-crew="0" data-roamers="" class="overlay-root">…</div>
      - unexpected value "0"
    15 × locator resolved to <div data-crew="0" class="overlay-root" data-roamers="sess-0001#main">…</div>
       - unexpected value "0"

  20 |   await page.goto(`${BASE}/overlay.html`);
  21 |   // Only working agents appear on the desktop, over a transparent background.
> 22 |   await expect(page.locator(".overlay-root")).not.toHaveAttribute("data-crew", "0", { timeout: 10_000 });
```

Causa provável (sem correção nesta rodada): o teste de CSP ainda abre `overlay.html` sem `?agent=` e espera
`data-crew` diferente de 0. Com a mudança, essa página no modo roam só abre as janelas dos personagens (`data-roamers`) e
fica com `data-crew="0"`, exatamente o que o novo e2e do overlay espera. O bundle de produção sob a CSP carregou o
castelo; a parte do overlay do teste não chegou às verificações de fundo transparente e de erros de console.

Avisos do Vite, que não são erros: "ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1)" e "`__dirname`
(vite.config.ts:10:51). Use `import.meta.dirname` instead".

Não coberto por teste automático: o app desktop não foi aberto pelo teste, então as janelas reais `roamer-*` (abertura e
fechamento, movimento pela tela desviando umas das outras, hitboxes por janela, `move_overlay`/`overlay_area` por janela,
`claim_road_fight` entre janelas, outros monitores) não foram vistas funcionando; só a lógica pura em `roam.rs`,
`geometry.rs` e `roam.ts` foi testada. O desenho em canvas de `scene.ts` no modo solo só foi coberto indiretamente (o e2e
confere o canvas, `data-crew="1"` e o balão de até 150 px numa janela de 160x90). O overlay do bundle de produção sob a
CSP ficou sem verificação por causa da falha acima.

## 2026-11-18 · Overlay: modo roam na largura da área de trabalho, uma luta por personagem e balões sem sobreposição

O que mudou: no modo roam, a faixa do overlay ocupa a largura da área de trabalho e mantém a altura de antes. Cada
personagem anda para o seu lado, com uma separação mínima. Cada personagem tem a sua luta de estrada contra o próprio
mob, com barra de vida, de 4 a 8 golpes e ataques em intervalos sorteados, com pelo menos 1,5 s entre o início de lutas
diferentes. Os balões e os nomes não se sobrepõem: têm largura limitada com reticências e se revezam. Arquivos alterados:
`apps/desktop/src/overlay/roam.ts`, `apps/desktop/src/overlay/road.ts`, `apps/desktop/src/overlay/labels.ts` (novo),
`apps/desktop/src/overlay/scene.ts`, `apps/desktop/src/overlay/OverlayApp.tsx`, `apps/desktop/src/overlay/road.test.ts`,
`apps/desktop/src/overlay/roam.test.ts`, `apps/desktop/src/overlay/labels.test.ts` (novo),
`apps/desktop/e2e/app.spec.ts`, `apps/desktop/src-tauri/src/platform/geometry.rs`,
`apps/desktop/src-tauri/src/platform/mod.rs`, `apps/desktop/src-tauri/src/windows.rs` e
`apps/desktop/src/settings/SettingsPage.tsx`. O working tree também traz as mudanças do Grimório testadas na rodada
anterior de hoje, que entraram nesta rodada sem alteração.

Rodado por: agente `tester`. Comandos pnpm com Node v22.23.3.

| Comando | Resultado | Números |
| --- | --- | --- |
| `pnpm typecheck` | passou | 5 pacotes sem erros |
| `pnpm test` (Vitest) | passou | 75 testes em 14 arquivos; dos quais 28 em `apps/desktop/src/overlay` (labels 6, roam 8, road 9, crew 5) |
| `pnpm test:rust` (`cargo test --workspace`) | passou | 80 testes (ids-core 48 + 11 de cenários, ids-hook 3, desktop 18), 8 deles em `platform::geometry::tests`, incluindo `roams_on_a_low_strip_as_wide_as_the_work_area` e `roams_at_the_dropped_height_but_never_over_the_taskbar` |
| `pnpm test:e2e` (Playwright, backend de demonstração) | passou | 10 testes, incluindo `overlay page renders the crew strip` (balões com no máximo 150 px e sem sobreposição) |

Falhas: nenhuma. Avisos do Vite, que não são erros: "ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1)" e
"`__dirname` (vite.config.ts:10:51). Use `import.meta.dirname` instead".

Não coberto por teste automático: o app desktop não foi aberto, então a janela real do overlay (largura da área de
trabalho, altura, posição acima da barra de tarefas, outros monitores), as mudanças em `windows.rs` e `platform/mod.rs`
fora do cálculo de geometria e a tela de configurações (`SettingsPage.tsx`) com o backend real não foram vistas
funcionando. O desenho em canvas de `scene.ts` (barra de vida, mob piscando em vermelho, animação das lutas) só foi
coberto indiretamente: o e2e confere que o canvas aparece e que os balões não se sobrepõem, não o que é desenhado.

## 2026-11-18 · Grimório: instruções por categoria (pessoal e trabalho)

O que mudou: a página Grimório foi adaptada à nova estrutura de instruções por categoria (`instructions/pessoal/` e
`instructions/trabalho/`). Arquivos alterados: `crates/ids-core/src/instructions.rs`,
`apps/desktop/src-tauri/src/commands/instructions.rs`, `packages/shared/src/types.ts`, `apps/desktop/src/bridge/demo.ts`,
`apps/desktop/src/grimoire/GrimoirePage.tsx`, `apps/desktop/src/styles/theme.css` e `apps/desktop/e2e/app.spec.ts`.

Rodado por: agente `tester`. Comandos pnpm com Node v22.23.3.

| Comando | Resultado | Números |
| --- | --- | --- |
| `pnpm typecheck` | passou | 5 pacotes sem erros |
| `pnpm test` (Vitest) | passou | 62 testes em 13 arquivos |
| `pnpm test:rust` (`cargo test --workspace`) | passou | 80 testes (ids-core 48 + 11 de cenários, ids-hook 3, desktop 18), 20 deles em `instructions::tests` |
| `pnpm test:e2e` (Playwright, backend de demonstração) | passou | 10 testes, incluindo `grimoire edits, saves and links the global, category and project instructions` |

Falhas: nenhuma. Observação de ambiente: o Node padrão do shell é o v18.20.8, e com ele o `pnpm test` nem inicia
("SyntaxError: The requested module 'node:util' does not provide an export named 'styleText'", vindo do rolldown). A
rodada foi feita com o Node v22.23.3 do nvm. Avisos do Vite, que não são erros: "ESM syntax in a file loaded as CommonJS
(vitest.config.ts:1:1)" e "`__dirname` (vite.config.ts:10:51). Use `import.meta.dirname` instead".

Não coberto por teste automático: o app desktop não foi aberto, então o Grimório com o backend real (leitura de
`instructions/pessoal/` e `instructions/trabalho/` e o botão Vincular gravando nos arquivos reais) e o visual do
`theme.css` não foram vistos funcionando.

## 2026-11-17 · Grimório: cabeçalho do editor em duas colunas

O que mudou: no cabeçalho do editor, o título e os caminhos ficam à esquerda, cortados com reticências (o caminho
completo aparece ao passar o mouse), e a etiqueta e os botões ficam fixos à direita (`GrimoirePage.tsx`, `theme.css`).

Rodado por: agente `tester`. Comandos pnpm com Node v22.23.3.

| Comando | Resultado | Números |
| --- | --- | --- |
| `pnpm typecheck` | passou | 5 pacotes sem erros |
| `pnpm test` (Vitest) | passou | 62 testes em 13 arquivos |
| `pnpm test:e2e` (Playwright, backend de demonstração) | passou | 10 testes |

Falhas: nenhuma.

Conferido à mão: um print do Grimório no modo demonstração, em 1100x700, mostrou o cabeçalho numa linha só, sem
sobreposição.

Não rodou: `cargo test`, porque nenhum código Rust mudou desde a rodada anterior.

## 2026-11-17 · Grimório: um item por repositório e etiquetas alinhadas

O que mudou: as pastas onde o Claude Code rodou agora sobem até a raiz do repositório git (`repo_root` e
`repo_projects` em `crates/ids-core/src/instructions.rs`). Subpastas como `castle` e `src` viram o repositório delas, e
pastas fora de qualquer repositório saem da lista. As etiquetas de status da lista não quebram mais linha (`theme.css`).

Rodado por: agente `tester`. Comandos pnpm com Node v22.23.3.

| Comando | Resultado | Números |
| --- | --- | --- |
| `cargo test -p ids-core instructions` | passou | 11 testes, incluindo o novo `subfolders_collapse_into_their_repository` |
| `cargo test -p ilha-das-sombras` | passou | 18 testes |
| `pnpm typecheck` | passou | 5 pacotes sem erros |
| `pnpm test:e2e` (Playwright, backend de demonstração) | passou | 10 testes |

Falhas: nenhuma.

Não rodou: `pnpm test` (Vitest), porque nenhum código TypeScript coberto por ele mudou.

Não coberto por teste automático: o alinhamento visual das etiquetas.

## 2026-11-17 · Main reunida: roaming, Dracula, Grimório e trabalho em andamento

O que mudou: a `feature/roaming-battles` (tripulação livre e tema Dracula) entrou na `main` por merge, junto com o
Grimório. Por cima foi aplicado o trabalho que estava guardado: batalhas no caminho da tripulação (`overlay/road.ts`,
`overlay/crew.ts`), comemoração antes de sumir da área de trabalho e preços oficiais da Anthropic. Os conflitos em
`settings.rs`, `theme.css` e neste arquivo foram resolvidos mantendo os dois lados.

Rodado por: agente `tester`. Comandos Node com Node v22.23.3.

| Comando | Resultado | Números |
| --- | --- | --- |
| `pnpm typecheck` | passou | 5 projetos sem erros |
| `pnpm test` (Vitest) | passou | 62 testes em 13 arquivos |
| `pnpm test:e2e` (Playwright, backend de demonstração) | passou | 10 testes |
| `cargo test --workspace` | passou | 70 testes (ids-core 38 + 11 de cenários, ids-hook 3, desktop 18) |

Falhas: nenhuma. Avisos do Vite, que não são erros: "ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1)" e
"`__dirname` (vite.config.ts:10:51). Use `import.meta.dirname` instead".

Não coberto por teste automático: o app desktop não foi aberto, então o overlay real e o vínculo do Grimório não foram
vistos funcionando.

## 2026-11-17 · Grimório: editor das instruções do Claude Code

O que mudou: a página nova Grimório (`apps/desktop/src/grimoire/GrimoirePage.tsx`) edita `instructions/global.md` e
`instructions/projects/<projeto>.md`. O botão Vincular faz `~/.claude/CLAUDE.md` e o `CLAUDE.local.md` de cada projeto
importarem esses arquivos com `@`. A lógica fica em `crates/ids-core/src/instructions.rs`, os comandos Tauri em
`apps/desktop/src-tauri/src/commands/instructions.rs` e a configuração nova é `instructions.dir`.

Rodado por: agente `tester`.

| Comando | Resultado | Números |
| --- | --- | --- |
| `pnpm typecheck` | passou | 5 pacotes sem erros |
| `pnpm test` (Vitest) | passou com Node 22 | 44 testes em 10 arquivos |
| `pnpm test:e2e` (Playwright, backend de demonstração) | passou com Node 22 | 10 testes, incluindo o novo do Grimório |
| `cargo test -p ids-core instructions` | passou | 10 testes |
| `cargo test -p ilha-das-sombras settings` | passou | 3 testes, incluindo o novo `instructions_dir_is_read` |

Falhas: nenhuma. Com o Node padrão do shell (v18.20.8), o Vitest não inicia:
`SyntaxError: The requested module 'node:util' does not provide an export named 'styleText'`. Por isso as etapas 2 e 3
rodaram com o Node v22.23.3 do nvm.

Não rodou: as suítes Rust inteiras, só os filtros `instructions` e `settings`.

Não coberto por teste automático: os comandos Tauri reais (o e2e usa o backend de demonstração) e o vínculo de verdade em
`~/.claude/CLAUDE.md` e nas pastas dos projetos. O app não foi aberto.

## 2026-11-17 · Preços oficiais da Anthropic

O que mudou: entrou uma tabela de referência com os preços oficiais da Anthropic (`ANTHROPIC_PRICES`) e a função
`mergeReferencePrices` em `packages/analytics/src/pricing.ts`. Em `apps/desktop/src/settings/PricesSection.tsx` entrou o
botão "Usar preços oficiais da Anthropic", e `apps/desktop/src/dashboard/DashboardPage.tsx` ganhou um texto de dica.
Branch `feature/roaming-battles`.

Rodado por: agente `tester`. Typecheck com o Node padrão (v18.20.8). Vitest e Playwright com Node v22.23.3, porque no
v18 o Vitest não sobe (veja abaixo).

| Comando | Resultado | Números |
| --- | --- | --- |
| `pnpm typecheck` | passou | 5 projetos sem erros |
| `pnpm test` (Vitest, Node v18.20.8) | falhou na inicialização | 0 testes rodaram |
| `pnpm test` (Vitest, Node v22.23.3) | passou | 62 testes em 13 arquivos |
| `vitest run packages/analytics/src/analytics.test.ts` | passou | 10 testes (2 novos: tabela de referência Anthropic e merge sem sobrescrever) |
| `pnpm test:e2e` (Playwright, backend de demonstração) | passou | 9 testes |

Falhas: nenhuma nos testes. O erro de inicialização do Vitest no Node v18, copiado literalmente:

```
SyntaxError: The requested module 'node:util' does not provide an export named 'styleText'
```

Não rodou: `cargo test`, porque nenhum código Rust mudou.

Sem teste automático: o botão "Usar preços oficiais da Anthropic" e o texto de dica do dashboard. Nenhum teste e2e usa
esses dois. Os testes e2e de custo/preço de `apps/desktop/e2e/app.spec.ts` ("dashboard labels data quality and never
invents a cost" e "configuring a price turns the cost into an estimate") passaram, mas configuram o preço à mão.

## 2026-11-17 · Comemoração antes de sumir da área de trabalho

O que mudou: quem acabou de terminar a tarefa continua no overlay comemorando durante os 4 s de `SUCCESS_HOLD_MS` e só
depois some. Isso inclui subagentes já encerrados, que ficam em `world.recentAgents`. A lógica fica em
`apps/desktop/src/overlay/crew.ts`, e o `OverlayApp.tsx` usa `desktopCrew` e `nextCrewChange`, com um timer que
reavalia a lista quando a comemoração acaba. Branch `feature/roaming-battles`.

Rodado por: agente `tester`. Vitest e Playwright com Node v22.23.3.

| Comando | Resultado | Números |
| --- | --- | --- |
| `pnpm typecheck` | passou | 5 projetos sem erros |
| `pnpm test` (Vitest) | passou | 60 testes em 13 arquivos (5 novos em `crew.test.ts`) |
| `pnpm test:e2e` (Playwright, backend de demonstração) | passou | 9 testes |

Falhas: nenhuma.

Não rodou: `cargo test`, porque nenhum código Rust mudou.

Sem teste automático: a comemoração na área de trabalho real e o timer do `OverlayApp.tsx`. Só `desktopCrew` e
`nextCrewChange` têm teste unitário.

## 2026-11-17 · Batalhas no caminho da tripulação livre

O que mudou: enquanto anda pela tela, a tripulação encontra uma sombra a cada 260 a 900 px percorridos e para para
lutar. Os golpes vêm a cada 444 ms e tiram 20% de vida cada um. A sombra tem barra de vida e pisca em vermelho a cada
golpe. Quando morre, some com um efeito, a tripulação comemora e volta a andar. A lógica fica em
`apps/desktop/src/overlay/road.ts` e a integração em `scene.ts` e `OverlayApp.tsx`. A janela ficou mais larga para caber
a sombra dos dois lados (`roam.ts`). A `drawLifeBar` saiu de `castle/scene.ts` e foi para `characters/pixi.ts`. Branch
`feature/roaming-battles`.

Rodado por: agente `tester`. Vitest e Playwright com Node v22.23.3.

| Comando | Resultado | Números |
| --- | --- | --- |
| `pnpm typecheck` | passou | 5 projetos sem erros |
| `pnpm test` (Vitest) | passou | 55 testes em 12 arquivos (4 novos em `road.test.ts`) |
| `pnpm test:e2e` (Playwright, backend de demonstração) | passou | 9 testes |

Falhas: nenhuma.

Não rodou: `cargo test`, porque nenhum código Rust mudou.

Sem teste automático: a luta desenhada no overlay. Ficaram de fora o aparecimento da sombra, a barra de vida, o piscar,
a morte com efeito e a comemoração. A arena do castelo, que agora importa a `drawLifeBar`, só foi validada pelo
typecheck.

## 2026-11-17 · Balão de fala mais baixo na tripulação livre

O que mudou: o balão ficou logo acima da cabeça. A base dele fica 6×escala px abaixo do topo do quadro do sprite, e ele
só aparece se houver 24px livres acima. O espaço reservado para o balão na janela caiu de 32 para 20px (`BUBBLE_ROOM` em
`apps/desktop/src/overlay/roam.ts`). Só mudou TypeScript. Branch `feature/roaming-crew`.

Rodado por: agente `tester`. Vitest e Playwright com Node v22.23.3.

| Comando | Resultado | Números |
| --- | --- | --- |
| `pnpm typecheck` | passou | 5 projetos sem erros |
| `pnpm test` (Vitest) | passou | 51 testes em 11 arquivos |
| `pnpm test:e2e` (Playwright, backend de demonstração) | passou | 9 testes |

Falhas: nenhuma.

Não rodou: `cargo test`, porque nenhum código Rust mudou.

Sem teste automático: a posição do balão na tela. Nenhum teste confere onde ele aparece, e a altura da janela só é
coberta pelas expectativas de `roamSize` em `roam.test.ts`.

## 2026-11-17 · Tripulação andando livre pela tela

O que mudou: o overlay da área de trabalho agora é uma janela pequena, do tamanho dos personagens e do balão, e é a
própria janela que atravessa o monitor (`apps/desktop/src/overlay/roam.ts`, `OverlayApp.tsx`, `scene.ts`). Os
personagens dizem a atividade real (`workSpeech`). Dá para arrastá-los com o mouse, e o ponto onde foram soltos fica
salvo junto com o monitor. No Rust entraram `roam_rect` e `monitor_at` em `platform/geometry.rs`, os campos `roam` e
`free_position` em `settings.rs` e os comandos `overlay_area` e `move_overlay`. Na tela de configurações entrou a opção
"Andar livre pela tela". Branch `feature/roaming-crew`.

Rodado por: agente `tester`. Comandos Node com Node v22.23.3.

| Comando | Resultado | Números |
| --- | --- | --- |
| `pnpm typecheck` | passou | 5 projetos sem erros |
| `pnpm test` (Vitest) | passou | 51 testes em 11 arquivos (6 novos em `roam.test.ts`, 1 novo em `schema.test.ts`) |
| `pnpm test:e2e` (Playwright, backend de demonstração) | passou | 9 testes |
| `cargo test --workspace --locked` | passou | 59 testes (4 novos: 3 em `platform::geometry`, 1 em `settings`) |

Falhas: nenhuma.

Não rodou: `cargo clippy`, que o CI não usa, o build do frontend e o `tauri build`.

Sem teste automático: o comportamento real da janela no desktop. Ficaram de fora a janela andando pelo monitor, o
arraste com o mouse de verdade, a posição salva depois de reiniciar, vários monitores físicos, a transparência no
Wayland, no X11 e no Windows, e a fala gerada por eventos reais do Claude Code.

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
