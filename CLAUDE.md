# Regras de trabalho neste repositório

Regras do dono do projeto para o Claude Code. Valem em toda sessão.

## Testes: sempre pelo agente de teste, sempre registrados

- Rode os testes pelo subagente `tester` (`.claude/agents/tester.md`): typecheck, Vitest e Playwright.
- Toda vez que uma rodada de testes terminar, registre-a no topo de `docs/testes.md`: data, o que estava sendo testado,
  cada comando com o resultado e os números, as falhas copiadas literalmente, e o que não foi coberto.

## Branches: direto na main

Este repositório só tem a branch `main`. Aqui não vale o fluxo global de `develop`, `feature/*` e `test/*`: o trabalho
é feito e commitado direto na `main`, e o push vai para a `origin/main` quando o dono do projeto pedir.

## Instruções do Claude Code: Grimório

As instruções globais e as de cada projeto ficam em `instructions/` (`global.md` e `projects/<projeto>.md`) e são
editadas pela página Grimório do app. O botão Vincular faz o `~/.claude/CLAUDE.md` e o `CLAUDE.local.md` de cada
projeto importarem esses arquivos com `@`. Edite as instruções em `instructions/`, não nos arquivos vinculados.

## Git e GitHub: sempre pelo agente de git

- Tudo que envolve git ou GitHub (commit, push, pull, branches, pull requests, `gh`) é feito pelo subagente
  `git-fixer` (`.claude/agents/git-fixer.md`). A sessão principal não roda esses comandos por conta própria.
- Testes e git são sempre de agentes diferentes: nunca use o mesmo subagente para os dois.
- Commit e push só quando o dono do projeto pedir. Ao pedir ao agente, informe a linha de coautoria do commit.

## Por que os agentes têm esses nomes

O aplicativo mostra cada subagente real como um tripulante do castelo, e a função dele vem do nome do tipo do subagente
(`crates/ids-core/src/classify.rs`). `tester` contém "test", então quem trabalha é o Testador (Alquimista da Névoa);
`git-fixer` contém "fix", então quem trabalha é a Depuradora (Lanceira das Sombras), escolhida pelo dono do projeto para
o git. Não renomeie esses agentes sem conferir essa regra.

Se um desses agentes não estiver disponível na sessão (foram criados em 2026-11-16 e só carregam em sessões novas), use
o subagente genérico para o mesmo trabalho e diga isso ao dono do projeto. Nesse caso os dois trabalhos aparecem no
castelo com o mesmo tripulante (o Geral), porque o tipo do subagente é o mesmo.
