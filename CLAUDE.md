# Regras de trabalho neste repositório

Regras do dono do projeto para o Claude Code. Valem em toda sessão.

## Testes: sempre pelo agente de teste, sempre registrados

- Rode os testes pelo subagente `tester` (`.claude/agents/tester.md`): typecheck, Vitest e Playwright.
- Toda vez que uma rodada de testes terminar, registre-a no topo de `docs/testes.md`: data, o que estava sendo testado,
  cada comando com o resultado e os números, as falhas copiadas literalmente, e o que não foi coberto.

## Git e GitHub: sempre pelo agente de git

- Tudo que envolve git ou GitHub (commit, push, pull, branches, pull requests, `gh`) é feito pelo subagente
  `git-reviewer` (`.claude/agents/git-reviewer.md`). A sessão principal não roda esses comandos por conta própria.
- Commit e push só quando o dono do projeto pedir. Ao pedir ao agente, informe a linha de coautoria do commit.

## Por que os agentes têm esses nomes

O aplicativo mostra cada subagente real como um tripulante do castelo, e a função dele vem do nome do tipo do subagente
(`crates/ids-core/src/classify.rs`). `tester` contém "test", então quem trabalha é o Testador (Alquimista da Névoa);
`git-reviewer` contém "review", então quem trabalha é o Revisor (Sentinela de Osso). Não renomeie esses agentes sem
conferir essa regra.

Se um desses agentes não estiver disponível na sessão (foram criados em 2026-11-16 e só carregam em sessões novas), use
o subagente genérico para o mesmo trabalho e diga isso ao dono do projeto.
