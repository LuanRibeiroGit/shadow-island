# Arquitetura

## Visão geral

| Camada | Onde | Responsabilidade |
|---|---|---|
| Relay | `crates/ids-hook` | Recebe o JSON do hook no stdin, envelopa (`{v, id, firedAtMs, payload}`) e envia ao coletor local. Se falhar, grava no spool. Sempre sai com 0 e não imprime nada. |
| Coletor | `apps/desktop/src-tauri/src/collector` | Servidor HTTP em 127.0.0.1 (porta aleatória), exige o token de `runtime.json`, limita tamanho, valida e entrega ao motor. |
| Motor | `crates/ids-core/src/engine.rs` | Thread única dona do SQLite. Deduplica por id do envelope, normaliza, atualiza agentes, missões, encontros e uso numa transação e emite atualizações. |
| Leitura | `crates/ids-core/src/db/queries.rs` | Consultas para painéis (conexão separada, WAL). |
| Plataforma | `src-tauri/src/platform` | `PlatformAdapter`: detecta X11/Wayland, GNOME/KDE, Windows; informa o nível de suporte de cada recurso e escolhe alternativas. |
| Janelas | `src-tauri/src/windows.rs` | Castelo (janela normal), faixa (transparente, sem bordas, sempre no topo), bandeja, atalho global, clique atravessando a faixa. |
| UI | `apps/desktop/src` | React + Zustand. Ponte única `bridge/backend.ts`. PixiJS para o castelo e a faixa. |

## Fluxo de um evento

1. O Claude Code dispara um hook (por exemplo `PreToolUse`). O comando registrado é o relay, com `async: true`.
2. O relay lê `runtime.json` (porta e token) e faz `POST /v1/events`. Sem app rodando, o envelope vai para
   `spool/events.jsonl`.
3. O coletor valida (versão, id, tamanho até 4 MB, `hook_event_name` conhecido, `session_id`) e manda ao motor.
4. O motor deduplica, normaliza (só metadados: nome do arquivo, `programa subcomando`, host de URL, trecho opcional de 80
   caracteres do prompt) e aplica as regras de estado.
5. Em eventos com `transcript_path`, o motor lê a transcrição a partir do último offset salvo e grava `usage` por
   `message.id` (sem duplicar).
6. As atualizações são agrupadas e emitidas em `ids://updates`; a UI aplica no estado do mundo.

## Identidade dos agentes

Veja [ADR 0002](adr/0002-identidade-dos-agentes.md). Principal: `{session_id}#main`. Subagente:
`{session_id}#{agent_id}`, com o principal como pai. A especialidade vem de `agent_type` (Explore → pesquisador,
Plan → arquiteto, palavras-chave em agentes personalizados, ou o mapeamento que o usuário definir).

## Estados

| Evento real | Estado |
|---|---|
| `SessionStart` | IDLE |
| `Stop` | SUCCESS (ou WAITING se há tarefas em segundo plano) |
| `UserPromptSubmit` | RUNNING (missão aberta) |
| `PreToolUse` Read/Grep/Glob/WebFetch… | READING / EXPLORING |
| `PreToolUse` Edit/Write | CODING |
| `PreToolUse` Bash com build | BUILDING |
| `PreToolUse` Bash com testes | TESTING |
| `PostToolUseFailure` (não interrupção) | COMBAT (monstro aparece) |
| `Notification` permission_prompt / idle_prompt / elicitation | WAITING |
| `SubagentStop` | SUCCESS (o subagente comemora e sai) |
| `StopFailure` | ERROR |

Eventos assíncronos podem chegar fora de ordem: um `PreToolUse` atrasado de uma ferramenta já concluída é ignorado, e
eventos de agentes encerrados são registrados sem "ressuscitar" o agente.

## Dados

SQLite em `<app_data_dir>/ilha-das-sombras.db` (WAL). Tabelas: projects, sessions, agents, missions, events,
usage_records, agent_statistics, activity_history, encounters, settings, characters, transcript_offsets. Retenção
configurável (padrão 90 dias).

## Linux e Windows

| Recurso | Windows | Linux X11 | Linux Wayland |
|---|---|---|---|
| Faixa transparente | sim | sim (com compositor) | sim |
| Posicionar e sempre no topo | sim | sim | não pelo protocolo: o app usa XWayland (`GDK_BACKEND=x11`) por padrão |
| Clique atravessando a faixa | sim | sim | via XWayland |
| Bandeja | sim | sim (KDE, XFCE…) | GNOME precisa da extensão AppIndicator; sem ela, fechar minimiza |
| Atalho global | sim | sim | limitado (depende do compositor) |

O nível real é detectado em tempo de execução e aparece em **Configurações › Sistema**.
