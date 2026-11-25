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

O alvo do banco e do Managed Better Auth é um projeto Neon independente em `aws-sa-east-1`. A API Hono será hospedada no Cloudflare Workers e os documentos em R2 privado. Consulte o [ADR](adr/0001-infraestrutura-hospedada.md) e os resultados confirmados em `STATUS.md`.

Os bindings HTTP `NEON_API_KEY` e `CLOUDFLARE_API_TOKEN` expõem referências de execução. O proxy do Codex Cloud substitui a referência em requisições HTTPS para o host autorizado do provedor. O Neon recebe `Authorization: Bearer`. A autenticação da Cloudflare depende do tipo de credencial. API Tokens usam Bearer, enquanto a Global API Key usa `X-Auth-Key` e `X-Auth-Email`. Mantenha a verificação TLS e registre somente códigos e metadados permitidos. Evite comandos com rastreamento de shell, saída de cabeçalhos ou persistência de segredos.

Para testar o Worker Hono local sem usar credenciais, execute a partir de `apps/api`:

```sh
rtk bypass env -u CLOUDFLARE_API_TOKEN -u NEON_API_KEY WRANGLER_SEND_METRICS=false \
  npm_config_cache=/tmp/nidovra-wrangler-npm-cache XDG_CONFIG_HOME=/tmp/nidovra-wrangler-config \
  XDG_CACHE_HOME=/tmp/nidovra-wrangler-cache \
  npx --yes --package=wrangler@4.168.0 wrangler dev --local \
  --config wrangler.jsonc --ip 127.0.0.1 --port 8789 \
  --var 'ALLOWED_ORIGINS:https://web.example.test' --persist-to /tmp/nidovra-wrangler-state
```

A sonda `GET /api/v1/health` deve responder HTTP 200. O endereço `https://web.example.test` é sintético e serve somente ao teste local. O Worker `nidovra-api` usa `https://nidovra.pages.dev` como origem permitida. `workers_dev` e URLs de preview estão desativados. A exposição pública exige uma rota dedicada e os testes de publicação do plano.

A consulta PostgreSQL via HTTP foi validada no endpoint `/sql` do host exato do compute. O hostname padrão do driver, `api.c-2.sa-east-1.aws.neon.tech`, foi bloqueado pelo proxy nesta sessão. Use a configuração de endpoint validada para testes com esse proxy e mantenha a credencial do banco exclusivamente em memória ou no gerenciador de segredos do runtime.
