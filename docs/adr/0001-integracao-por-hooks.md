# ADR 0001: Integração por hooks assíncronos e relay local

**Status:** aceita (2026-11-16)

## Contexto

O app precisa saber o que cada agente do Claude Code está fazendo, em tempo real, sem atrasar nem alterar o Claude Code,
em Linux e Windows. A documentação oficial de hooks (code.claude.com/docs/en/hooks) descreve eventos de ciclo de vida
(SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, PostToolUseFailure, SubagentStart/Stop, Stop, StopFailure,
Notification, TaskCreated/TaskCompleted, SessionEnd) com `session_id`, `transcript_path`, `cwd` e, dentro de subagentes,
`agent_id`/`agent_type`. Hooks de comando aceitam `async: true`.

## Decisão

- Registrar um único executável, `ids-hook`, como hook de comando em forma exec (`command` + `args`), `async: true`,
  `timeout: 10`, para os 13 eventos acima, no `settings.json` do usuário.
- O relay apenas envelopa e envia o JSON para `127.0.0.1` com um token aleatório, ou grava num spool. Não interpreta nada,
  não executa nada vindo do evento, não escreve no stdout e sempre retorna 0.
- Tokens: lidos de `transcript_path` (linhas `assistant` com `message.usage`), incrementalmente, apenas sob raízes
  permitidas (`~/.claude` e as que o usuário adicionar).
- Instalação só com confirmação explícita: o app mostra o diff, grava com backup, troca atômica e recusa se o arquivo
  mudou depois da revisão ou se não é JSON válido. Remoção tira apenas as entradas cujo comando é o nosso relay.

## Alternativas descartadas

- Hooks HTTP diretos: não há forma assíncrona documentada para todos os eventos, e o Claude Code esperaria a resposta.
- Ler só transcrições: não dá estado em tempo real de subagentes nem notificações de permissão.
- Hook síncrono com script interpretado (Python/Node): adiciona latência e dependências no Windows.

## Consequências

- Eventos podem chegar fora de ordem (tratado no motor).
- Sessões abertas antes da instalação só passam a enviar eventos depois de reiniciadas.
- Se o usuário ativar `disableAllHooks`, o app avisa que não vai receber nada.
