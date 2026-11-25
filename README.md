# Nidovra v1.2

O Nidovra é um projeto de finanças familiares, extratos e aquisições. O workspace contém o bootstrap local da aplicação web e da API.

O endereço de produção é [nidovra.pages.dev](https://nidovra.pages.dev). Use `main` para a continuidade do projeto.

## Executar localmente

Use Node.js 24 e pnpm 11.25.0. Na raiz, execute `pnpm install --frozen-lockfile` e `pnpm dev`. O frontend responde em `http://localhost:5173` e a sonda da API em `http://127.0.0.1:3001/api/v1/health`.

Execute `pnpm test`, `pnpm typecheck` e `pnpm build` para verificar o workspace. Consulte [Operação](docs/operations.md) para configuração e isolamento.

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
Identidade, migrações e módulos financeiros estão pendentes. O estado das verificações e dos serviços remotos está em [Estado do projeto](docs/STATUS.md). As skills locais complementam as ferramentas de desenvolvimento. Nome escolhido após busca preliminar pública, sem garantia de marca ou domínio exclusivos. Consulte o INPI antes de comercializar.
