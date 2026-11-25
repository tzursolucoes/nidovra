# API Nidovra

O módulo expõe a aplicação HTTP Hono. A entrada local `src/server.ts` atende somente em `127.0.0.1:3001`. A função `createApp()` recebe a configuração validada e monta a API. A entrega atual usa Hono e seu adaptador para Node.js.

`GET /api/v1/health` responde HTTP 200 com `{"status":"ok"}` e `Cache-Control: no-store`. A rota é pública e verifica a disponibilidade do processo HTTP. Não acessa tabelas ou serviços externos, não usa chaves de idempotência e não retorna configurações. CORS permite somente origens explícitas.

`loadConfig()` exige `APP_ENV` válido e exige `ALLOWED_ORIGINS` com origens HTTPS em produção. Os erros de configuração são lançados antes de iniciar o servidor e omitem os valores recebidos. O processo de desenvolvimento assume `development` quando `APP_ENV` está ausente.

Execute `pnpm test apps/api/test/bootstrap.test.ts` da raiz para verificar o contrato de saúde e a validação de configuração. Identidade, banco, domínios financeiros e adaptador Neon Functions ainda estão pendentes.
