# ADR 0001 — Infraestrutura hospedada do Nidovra

**Decisão aprovada em 25/11/2026.** PostgreSQL 18 e Managed Better Auth ficam em um projeto Neon dedicado do Nidovra em `aws-sa-east-1`. A SPA Vue é publicada em um projeto Cloudflare Pages próprio. A API Hono tem como destino Cloudflare Workers. Documentos utilizam um bucket R2 privado, acessado pelas operações autorizadas da API.

A matriz regional do Neon lista PostgreSQL e Managed Better Auth em São Paulo e indica indisponibilidade regional de Functions e Object Storage. A mudança de destino da API e dos documentos preserva a região solicitada para o banco. A localização física do runtime e dos objetos deve ser verificada conforme as capacidades da Cloudflare antes de receber dados reais. [Matriz de disponibilidade Neon](https://github.com/neondatabase/website/blob/64d230169cb641bec8a40ca420926342a5b56b2c/content/docs/introduction/regions.md#product-availability)

O provisionamento é limitado a recursos gratuitos da conta autorizada. Nenhuma assinatura, cobrança ou publicação de produção está incluída. Os IDs e resultados de validação ficam em `docs/STATUS.md` após confirmação pelas APIs. Secrets HTTP do Codex Cloud servem à administração via proxy. Credenciais de runtime ficam nos mecanismos próprios dos provedores.
