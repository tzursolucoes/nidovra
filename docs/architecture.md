# Arquitetura

O repositório é um workspace pnpm com `apps/web` (SPA Vue/Vite), `apps/api` (Hono) e `packages/db` (validação local do alvo de migração). O TypeScript usa configuração estrita compartilhada. A aplicação web tem fallback SPA, e o proxy de desenvolvimento encaminha somente caminhos da API para a porta local do Hono.

A rota pública `GET /api/v1/health` mede disponibilidade HTTP sem carregar segredos, serviços remotos ou banco. Autorização por família será aplicada às rotas que precisarem acessar dados. Nenhuma tabela está definida no bootstrap.

Consulte a especificação em `docs/superpowers/specs/` para a arquitetura pretendida e `docs/operations.md` para os limites do ambiente executável.
