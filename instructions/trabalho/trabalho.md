# Projetos de trabalho

Regras que valem em todo projeto de trabalho, além das globais.

## Fluxo de branches
1. Criar a branch a partir da `develop`: `feature/nome-em-ingles` (ex.: `feature/migrate-account`).
2. Fazer o trabalho nessa branch e parar aí. **Não commitar, não dar push e não criar a branch de staging sem autorização explícita do Luan.**
3. Quando ele autorizar: commitar em inglês (formato definido no global) e dar push da branch feature.
4. Ainda só com autorização: criar uma branch a partir da `staging` com o mesmo nome, prefixada com `test/`: `test/feature/nome-em-ingles` (ex.: `test/feature/migrate-account`).
5. Fazer cherry-pick dos commits da branch feature para a branch `test/...` e dar push.

Se `develop` e `staging` estiverem divergentes e o cherry-pick conflitar, resolver preservando o que a `staging` tem a mais e avisar quais arquivos precisaram de intervenção.

## Pull requests
Quando o Luan pedir para subir as branches, além do push abrir as pull requests:
- `feature/nome-em-ingles` → `develop`.
- `test/feature/nome-em-ingles` → `staging`.

Antes de criar as PRs:
1. Perguntar ao Luan o link da task do ClickUp. Quase sempre existe uma; só seguir sem link se ele disser que não há.
2. Rodar o build do projeto (`npm run build` ou o script de build do `package.json`). Se o build falhar, não criar a PR: mostrar o erro e esperar.

A descrição segue o template do repositório (`.github/pull_request_template.md`), com as seções nesta ordem:

```
## 📑 Descrição
Resumo curto e fácil de entender do que foi feito.

## 📋 Requisitos
Não há (ou os requisitos, se existirem)

## 📝 Tarefas
<link da task do ClickUp>

## 📱 Evidências

## ⚙️ Build
Saída final do build, em bloco de código.
```

As duas PRs (develop e staging) levam a mesma descrição.

## ClickUp
Tudo que envolve o ClickUp passa pelo subagente `clickup-planner` (`~/.claude/agents/clickup-planner.md`): ler uma task pelo link, publicar o resumo, comentar ou atualizar campos. A sessão principal não chama o MCP do ClickUp por conta própria.

Só mexer no ClickUp quando o Luan pedir. A exceção é o resumo da seção abaixo, que é publicado sem precisar pedir.

Ao delegar, mandar no pedido tudo que o agente precisa, porque ele não vê a conversa: o link da task, o que fazer e, para publicar, o texto pronto do resumo. Mudança de status, responsáveis ou outros campos só quando o Luan pedir, e isso vai escrito no pedido ao agente.

Se o `clickup-planner` não estiver disponível na sessão (agentes novos só carregam em sessões novas), usar o subagente genérico com as mesmas instruções e avisar o Luan.

## Resumo para a task do ClickUp
Quando o Luan enviar o link de uma task do ClickUp, escrever um resumo do que foi feito para colocar na task:

1. Descrição curta e fácil de entender, para uma pessoa leiga: o que mudou para quem usa, sem termos técnicos.
2. Se o trabalho criou uma feature flag no banco, informar o nome dela e o valor que precisa receber: se é booleana (e qual valor liga a funcionalidade) ou, se não for, exatamente o que precisa ser colocado nela.
3. No fim, os links das PRs, cada link seguido da linha que identifica ambiente e projeto, primeiro staging e depois develop:

```
<link>
STG - IBK

<link>
STG - Back

<link>
DEV - IBK

<link>
DEV - Back
```

Quando o trabalho for do backoffice (`bankeiro-inovanti-admin`), os links do admin entram também:

```
<link>
STG - Admin

<link>
DEV - Admin
```

Só listar os projetos que tiveram PR. IBK é o `bankeiro-inovanti-ibk`, Back é o `bankeiro-inovanti-backend` e Admin é o `bankeiro-inovanti-admin`.

Depois que as PRs forem abertas, publicar o resumo na task sem esperar pedido, pelo `clickup-planner`, sempre como comentário da task e nunca na descrição. Mostrar no chat o texto publicado.
