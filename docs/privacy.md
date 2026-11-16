# Privacidade e segurança

- **Tudo local.** Nenhum dado sai da máquina. O coletor escuta apenas em 127.0.0.1 e exige um token aleatório gerado a
  cada execução (arquivo `runtime.json` com permissão restrita).
- **Sem conteúdo de conversa.** Guardamos metadados: nome do evento, ferramenta, nome do arquivo (sem o caminho), início de
  comandos (`npm test`, `git status`), host de URLs, e, se ativado, os primeiros 80 caracteres do prompt como título da
  missão. Das transcrições, só `message.id`, `model`, `usage` e o horário.
- **Sem credenciais.** O app não lê nem guarda tokens de autenticação do Claude.
- **Nada é executado a partir de eventos.** O relay não interpreta o payload; o motor valida tudo (tamanho, formato, nomes).
- **Transcrições** só são lidas sob `~/.claude` (respeitando `CLAUDE_CONFIG_DIR`) e diretórios que você adicionar, e só
  arquivos `.jsonl`.
- **Configurações do Claude Code** só mudam quando você confirma o diff. Há backup em `<dados>/backups/`.
- **Logs** não registram payloads, prompts ou caminhos completos.
- **Exportar / apagar.** Configurações › Sistema exporta tudo em JSON e faz backup do banco. Para apagar, remova a
  integração e apague a pasta de dados mostrada nessa tela.
