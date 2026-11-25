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

O banco e o Managed Better Auth ficam no projeto Neon independente em `aws-sa-east-1`. A API Hono roda no Cloudflare Workers. Para os documentos, o destino escolhido é um bucket privado em Garage no VPS. O serviço de armazenamento aguarda provisionamento. Consulte o [ADR de infraestrutura](adr/0001-infraestrutura-hospedada.md), o [ADR de armazenamento](adr/0002-armazenamento-vps.md) e os resultados confirmados em `STATUS.md`.

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

A sonda `GET /api/v1/health` deve responder HTTP 200. O endereço `https://web.example.test` é sintético e serve somente ao teste local. O Worker `nidovra-api` usa `https://nidovra.pages.dev` como origem permitida. O endpoint do Worker em `workers.dev` atende à aplicação de produção. As URLs de preview do Worker ficam desativadas. Valide a sonda com a origem de produção e confirme que as rotas privadas retornam HTTP 503 enquanto a integração de identidade estiver indisponível.

Publique o build de produção do projeto Pages `nidovra` a partir de `apps/web`, mantendo `VITE_API_BASE_URL` vazio. O Wrangler inclui `apps/web/functions` quando for executado desse diretório. O navegador usa `https://nidovra.pages.dev/api/v1/*`; o proxy encaminha as requisições ao Worker. Confira HTML, fallback SPA e a sonda em `/api/v1/health` antes de concluir a publicação.

Configure `NEON_AUTH_BASE_URL`, `DATABASE_URL` e `INVITATION_TOKEN_SECRET` nos segredos do Worker. A conexão de runtime deve usar a role dedicada `nidovra_app` com TLS e privilégio de leitura e escrita apenas nas tabelas de identidade. Valide a origem exata do Pages na lista de origens confiáveis do Neon e mantenha a verificação de e-mail obrigatória com código OTP. O SMTP compartilhado do Neon permite validar os primeiros acessos, com limites de envio. [Checklist de Auth do Neon](https://neon.com/docs/auth/production-checklist)

A consulta PostgreSQL via HTTP foi validada no endpoint `/sql` do host exato do compute. O hostname padrão do driver, `api.c-2.sa-east-1.aws.neon.tech`, foi bloqueado pelo proxy nesta sessão. Use a configuração de endpoint validada para testes com esse proxy e mantenha a credencial do banco exclusivamente em memória ou no gerenciador de segredos do runtime.

## VPS de documentos

| Dado operacional | Valor informado pelo proprietário |
| --- | --- |
| Host de administração SSH | `184.107.88.100` |
| Porta SSH | `22` |
| Usuário de acesso inicial | `root` |
| Estado | Dados recebidos. Conexão e ambiente ainda por verificar. |

O SSH é destinado à administração do servidor. Guarde as credenciais administrativas em um cofre e restrinja o acesso operacional a uma conta dedicada por chave SSH. O Worker deve usar uma credencial S3 exclusiva, de escopo limitado ao bucket privado do Nidovra.

Antes de ativar uploads, valide o espaço disponível, a identidade do host, o domínio e o TLS do endpoint S3. Confirme pelo terminal a gravação e a leitura de um arquivo sintético, a rejeição de acesso anônimo ou de outra família e a restauração de um backup mantido fora do VPS. Registre em `STATUS.md` o endpoint aprovado e a evidência de verificação, sem credenciais.
