# Ilha das Sombras

Aplicativo desktop (Linux e Windows) que transforma a atividade **real** do Claude Code em um RPG em pixel art. Cada agente
(o principal e cada subagente) vira um tripulante espectral que anda numa faixa transparente perto da barra de tarefas e
trabalha nas salas de um castelo em ruínas numa ilha enevoada. Tudo vem dos eventos de hooks e das transcrições locais do
Claude Code. Nada é inventado: quando um dado não existe, a tela mostra **Indisponível**.

Tema, personagens, monstros e arte são originais.

## O que tem

- **Tripulação na área de trabalho**: janela transparente, sem bordas, sempre no topo, posicionada acima da barra de
  tarefas. Um personagem por agente real, com animação conforme o estado (lendo, codificando, testando, em combate,
  aguardando você, concluído, erro), balões de fala a partir dos eventos e um cartão de detalhes ao clicar.
- **Castelo**: Sala do Trono (agente principal e missão atual), Biblioteca (leitura e pesquisa), Ferreiro (edição e
  build), Laboratório (testes e erros), Torre de Observação (sessões, notificações e linha do tempo), Tesouraria (tokens
  e custos) e Quartel (agentes em espera). O castelo é restaurado conforme missões reais são concluídas.
- **Agentes**: detalhe com estado, tarefa, ferramenta atual, diretório, modelos, tokens por modelo, tempo, missões,
  monstros enfrentados e histórico.
- **Monstros**: uma falha real de ferramenta abre um encontro (Fantasma dos Testes, Dragão das Dependências etc.). Ele só é
  "derrotado" quando a mesma ação depois tem sucesso; senão, recua quando o agente termina.
- **Missões**: cada prompt, tarefa (TaskCreated/TaskCompleted) e subagente. Sem porcentagens inventadas.
- **Métricas**: tokens por modelo, sessão e agente (das transcrições), chamadas de ferramentas, tempo por estado, custo
  estimado com preços que **você** configura. Cada número tem selo: Real, Calculado, Estimado ou Indisponível.
- **Histórico** com filtros (período, projeto, sessão, tipo de atividade, evento, falhas) e linha do tempo por sessão.
- **Personalização** de classe, cores, tamanho e visibilidade por especialidade ou por agente.
- **Configurações**: instalar, verificar e remover a integração com prévia exata do `settings.json`; diagnóstico de
  eventos; preços; recursos da plataforma; logs; exportação e backup.

## Como funciona

```
Claude Code ──hook assíncrono──► ids-hook (relay, ~2 ms) ──HTTP 127.0.0.1 + token──► app (coletor)
                                       └── se o app estiver fechado: spool local ──► reprocessado ao abrir
transcript_path (JSONL) ──leitura incremental (só usage/model)──► tokens por resposta
```

Os hooks são `async: true`: o Claude Code nunca espera pelo app e nada que o app faça bloqueia ou altera o
funcionamento dele. Detalhes em [docs/architecture.md](docs/architecture.md) e nas [ADRs](docs/adr).

## Rodando

Pré-requisitos: Rust estável, Node 22, pnpm 10. No Linux, as bibliotecas do WebKitGTK (veja
[docs/build-linux.md](docs/build-linux.md)); no Windows, WebView2 e as ferramentas de build do Visual Studio (veja
[docs/build-windows.md](docs/build-windows.md)).

```bash
pnpm install
pnpm dev          # prepara o relay e abre o app em modo desenvolvimento
pnpm build        # gera os pacotes da plataforma atual
```

Na primeira execução, abra **Configurações › Claude Code › Instalar integração**, revise o diff e confirme.

Testes:

```bash
pnpm typecheck && pnpm test     # TypeScript estrito + Vitest
cargo test --workspace          # núcleo, relay, instalador, plataforma
pnpm test:e2e                   # Playwright contra o backend de demonstração
```

`pnpm web:dev` abre só a interface no navegador com dados de demonstração gravados a partir dos testes (com aviso
visível). O build de produção não inclui esses dados.

## Estrutura

```
crates/ids-core     núcleo: validação e normalização de eventos, agentes, missões, monstros, uso, SQLite, instalador
crates/ids-hook     relay chamado pelo Claude Code
apps/desktop        app Tauri 2 (src-tauri em Rust; src em React + PixiJS)
packages/shared     tipos compartilhados (espelho dos tipos Rust)
packages/event-system   estado do mundo a partir das atualizações
packages/game-engine    animações, mensagens, classes, monstros, movimento
packages/analytics      agregação, preços e formatação
assets              arte original (gerada por scripts/generate-assets.py)
docs                arquitetura, ADRs, privacidade, build
```
