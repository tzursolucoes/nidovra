# Nidovra — kit de desenvolvimento v1.2
Finanças da casa, em sintonia. PWA de finanças familiares, extratos e aquisições.

## Começar (Windows / VS Code)
1. Extraia o ZIP em uma pasta nova, por exemplo `D:\Projetos\Nidovra`, preservando pastas ocultas `.codex` e `.agents`.
2. Abra a pasta raiz no VS Code ou Codex CLI. Confie no workspace somente após revisar o conteúdo. Use uma versão atual do Codex com agentes e skills.
3. Envie: `Leia PROMPT_MASTER.md e execute as instruções, começando pela primeira tarefa pendente.`
4. Para retomar, envie: `Leia docs/STATUS.md e continue a próxima tarefa conforme AGENTS.md e PROMPT_MASTER.md.`

## Conteúdo
- `AGENTS.md`: regras permanentes; `PROMPT_MASTER.md`: entrada de execução.
- `docs/superpowers/specs/2026-11-25-nidovra-v12-design.md`: especificação; `docs/superpowers/plans/2026-11-25-nidovra-v12-implementation.md`: backlog e testes.
- `.codex/agents/`: oito agentes nativos; `.agents/skills/`: sete skills locais próprias.
- `docs/STATUS.md`: checkpoint; `docs/`: modelos de documentação viva.
- `.env.example`: variáveis sem segredos; `.gitignore`: proteção básica.

## Limites
Kit de instruções pronto para iniciar programação, não aplicativo implementado. Node, pnpm, Git, Codex, acesso Neon/Cloudflare e eventualmente PostgreSQL local dependem do ambiente. Superpowers e skills de fornecedores são externas e não estão incluídas; as skills locais funcionam como procedimentos complementares. Não há credenciais, banco provisionado, deploy, fixtures bancárias reais nem testes de aplicação executados. Nome escolhido após busca preliminar pública, sem garantia de marca/domínio exclusivos; verificar INPI antes de comercializar.
