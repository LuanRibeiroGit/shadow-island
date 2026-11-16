# ADR 0002: Identidade dos agentes e especialidades

**Status:** aceita (2026-11-16)

## Decisão

- Agente principal: `{session_id}#main`, criado no primeiro evento da sessão.
- Subagente: `{session_id}#{agent_id}` a partir de `SubagentStart` ou de qualquer evento com `agent_id`; pai é o principal.
- `SubagentStop` com `agent_type` vazio (agentes internos) não cria personagem.
- Especialidade: `Explore` → pesquisador, `Plan` → arquiteto, `general-purpose` → geral; nomes personalizados por
  palavras-chave (test, review, debug, doc…); o usuário pode fixar o mapeamento. Sem informação: Fogo-Fátuo (geral).
- Nomes de personagens vêm de uma lista original, escolhidos de forma determinística; o usuário pode renomear.

## Consequências

Sem `agent_id` nos hooks não há como separar subagentes paralelos; nesse caso, o evento conta para o principal.
