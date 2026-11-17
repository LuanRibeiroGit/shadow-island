# Regras globais

## Comentários no código
Nunca escreva comentários no código. Nada de comentários explicativos, cabeçalhos de seção, JSDoc/docstrings ou comentários de "o que mudou". O código deve se explicar por nomes de variáveis, funções e estruturas.

Exceções: comentários já existentes no arquivo são preservados (não removê-los sem pedido); diretivas técnicas obrigatórias continuam permitidas (`eslint-disable`, `@ts-expect-error`, pragmas de ferramenta).

A explicação do que foi feito vai na resposta do chat ou na mensagem de commit, nunca no arquivo.

## Projeto desconhecido
Ao trabalhar em um projeto que ainda não conheço, analisar o projeto antes de escrever qualquer código e seguir os padrões existentes dele: estilo de nomenclatura, estrutura de camadas/pastas, forma de tratar erros e logs, injeção de dependência, uso de enums/constantes ao invés de literais, formato de testes.

Espelhar o código vizinho ao invés de aplicar preferências próprias. Se houver mais de um padrão no projeto, seguir o mais recente/predominante na área que está sendo alterada.

## Commits
Nunca adicionar a linha "Co-Authored-By: Claude ..." (ou qualquer variação) nas mensagens de commit, em nenhum projeto.

Mensagens de commit sempre em inglês, no formato conventional commits com escopo: `feat(migrate-account): description in english`.

## Fluxo de branches (todos os projetos)
1. Criar a branch a partir da `develop`: `feature/nome-em-ingles` (ex.: `feature/migrate-account`).
2. Fazer o trabalho nessa branch e parar aí. **Não commitar, não dar push e não criar a branch de staging sem autorização explícita do Luan.** Deixar as alterações na working tree e avisar que estão prontas.
3. Quando ele autorizar: commitar em inglês (formato acima) e dar push da branch feature.
4. Ainda só com autorização: criar uma branch a partir da `staging` com o mesmo nome, prefixada com `test/`: `test/feature/nome-em-ingles` (ex.: `test/feature/migrate-account`).
5. Fazer cherry-pick dos commits da branch feature para a branch `test/...` e dar push.

Se `develop` e `staging` estiverem divergentes e o cherry-pick conflitar, resolver preservando o que a `staging` tem a mais e avisar quais arquivos precisaram de intervenção.

## Idioma
Sempre responder em português (pt-BR), em todas as mensagens do chat, em todos os projetos, desde a primeira resposta e sem esperar pedido. Código, nomes técnicos e mensagens de commit continuam em inglês.
