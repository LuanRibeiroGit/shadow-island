# ADR 0003: Somente dados reais, com selo de qualidade

**Status:** aceita (2026-11-16)

- Todo número exibido tem uma qualidade: **Real** (informado pelo Claude Code), **Calculado** (derivado localmente de dados
  reais), **Estimado** (custo com preços do usuário) ou **Indisponível**.
- Contagem de tokens com `records = 0` é "Indisponível", nunca zero.
- O app não traz tabela de preços. Custo só aparece para modelos com preço configurado e indica a cobertura.
- Missões não têm porcentagem de progresso, porque o Claude Code não informa progresso.
- Monstro só é "derrotado" quando a mesma ação (ferramenta + alvo) depois tem sucesso.
- O modo demonstração existe apenas fora do app desktop (desenvolvimento e testes de UI), exibe um aviso permanente e
  reproduz saídas reais do motor gravadas a partir de fixtures. Ele recusa instalar hooks.
