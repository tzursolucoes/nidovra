# Arquitetura

O repositório é um workspace pnpm com `apps/web` (SPA Vue/Vite), `apps/api` (Hono) e `packages/db` (validação local do alvo de migração). O TypeScript usa configuração estrita compartilhada. A aplicação web tem fallback SPA, e o proxy de desenvolvimento encaminha somente caminhos da API para a porta local do Hono.

A rota pública `GET /api/v1/health` mede disponibilidade HTTP sem carregar segredos, serviços remotos ou banco. O módulo de identidade usa um resolvedor de sessão e revalida a associação familiar em cada operação privada. A migration de identidade está descrita no dicionário e no ERD.

O [ADR de infraestrutura hospedada](adr/0001-infraestrutura-hospedada.md) registra PostgreSQL 18 e Managed Better Auth no Neon São Paulo, SPA no Cloudflare Pages e API Hono em Workers. O Pages encaminha `/api/v1/*` ao Worker para manter a sessão no domínio da aplicação. A decisão posterior adota Garage com API S3 privada no VPS para os originais dos documentos. [ADR do armazenamento de documentos](adr/0002-armazenamento-vps.md)
