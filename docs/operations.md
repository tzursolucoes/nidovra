# Operação

## Desenvolvimento local

Use Node.js 24 e pnpm 11.25.0. Na raiz do repositório execute:

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm build
pnpm dev
```

Em ambientes com diretório pessoal somente para leitura, defina `XDG_DATA_HOME`, `XDG_CACHE_HOME` e `XDG_STATE_HOME` para diretórios graváveis antes de executar os comandos do pnpm. Mantenha o mesmo valor durante a instalação e os testes.

O Vite atende em `localhost:5173`. Ele encaminha `/api` para a API Hono na porta `3001`. Verifique o servidor e o proxy por `GET /api/v1/health` em cada porta. Ambos devem retornar HTTP 200 e `{"status":"ok"}`. Uma rota web sem arquivo correspondente deve retornar o HTML da SPA.

O processo local da API assume `APP_ENV=development` quando iniciado por `pnpm dev`. Para executar o artefato compilado diretamente, configure `APP_ENV` e rode `node apps/api/dist/server.js`. `ALLOWED_ORIGINS` pode substituir a origem padrão de desenvolvimento. Use uma lista explícita separada por vírgulas, com HTTPS quando `APP_ENV=production`. Consulte `.env.example` para variáveis futuras de integração.

## Isolamento

A guarda em `packages/db` aceita somente URLs PostgreSQL com IP de loopback, sem parâmetros, e bases `nidovra_dev` ou `nidovra_test` conforme o ambiente. Migrações ainda precisam chamar a guarda antes da conexão. Credenciais reais ficam no gerenciador de segredos e nenhuma migration deve utilizar o projeto MotoHub `falling-river-62191222`.

## Infraestrutura remota

O build estático da SPA fica em `apps/web/dist`. No Cloudflare Pages, o comportamento de SPA mantém o fallback para a raiz quando o build não contém `404.html` na raiz. [Documentação do Cloudflare Pages](https://github.com/cloudflare/cloudflare-docs/blob/production/src/content/docs/pages/configuration/serving-pages.mdx).

A região `aws-sa-east-1` é o alvo do projeto Neon independente. A matriz consultada aponta que Neon Functions e Object Storage não estão disponíveis em São Paulo. O provisionamento permanece bloqueado enquanto o desenho regional não for resolvido e autorizado. [Matriz de disponibilidade Neon](https://github.com/neondatabase/website/blob/64d230169cb641bec8a40ca420926342a5b56b2c/content/docs/introduction/regions.md#product-availability).
