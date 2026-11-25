# API Nidovra

O módulo expõe a aplicação HTTP Hono. A entrada local `src/server.ts` atende somente em `127.0.0.1:3001`. A função `createApp()` recebe a configuração validada e monta a API. A entrega atual usa Hono e seu adaptador para Node.js.

`GET /api/v1/health` responde HTTP 200 com `{"status":"ok"}` e `Cache-Control: no-store`. A rota é pública e verifica a disponibilidade do processo HTTP. Não acessa tabelas ou serviços externos, não usa chaves de idempotência e não retorna configurações. CORS permite somente origens explícitas.

`loadConfig()` exige `APP_ENV` válido e exige `ALLOWED_ORIGINS` com origens HTTPS em produção. Os erros de configuração são lançados antes de iniciar o servidor e omitem os valores recebidos. O processo de desenvolvimento assume `development` quando `APP_ENV` está ausente.

## Identidade e famílias

`createApp(config, identity)` recebe um resolvedor de sessão confiável e o repositório `IdentityStore`. Em cada operação privada, o resolvedor precisa confirmar sessão vigente, identidade e e-mail verificado. O cliente não fornece a identidade em cabeçalhos de autenticação próprios, corpo ou identificadores de rota. O servidor padrão mantém a sonda pública e responde `503` nas rotas privadas enquanto não houver adaptador de sessão configurado.

As rotas usam o prefixo `/api/v1`. Mutações exigem `Origin` presente em `ALLOWED_ORIGINS`. CORS permite credenciais somente nas origens explícitas. As respostas privadas incluem `Cache-Control: no-store`.

O Worker integra Neon Managed Better Auth em `POST /auth/sign-in/email`, `POST /auth/sign-up/email`, `POST /auth/email-otp/verify-email`, `POST /auth/send-verification-email` e `POST /auth/sign-out`. A resposta de autenticação é `{"ok":true}` ou erro controlado. O Pages faz o proxy na mesma origem. O Worker encaminha somente campos permitidos e mantém o cookie do provedor restrito a HTTPS e inacessível a JavaScript. A resolução de sessão consulta o Neon a cada requisição privada e exige e-mail confirmado para acesso aos dados.

| Operação | Entrada | Resposta |
|---|---|---|
| `GET /session/context` | Sessão vigente e com e-mail verificado | `200` com `user: { id, email }` e `memberships: [{ id, householdId, householdName, role }]` |
| `POST /households` | JSON como `{"name":"Casa"}` e cabeçalho `Idempotency-Key` UUID | `201` com `{ id, name, role: "admin" }` |
| `GET /households/:id/members` | UUID de família com vínculo ativo | `200` com `members: [{ id, authUserId, role }]` |
| `POST /households/:id/invitations` | Administração ativa, JSON como `{"email":"membro@example.test"}` e `Idempotency-Key` UUID | `201` com `{ id, email, expiresAt, token }` para compartilhamento manual |
| `POST /invitations/accept` | JSON com `token` e sessão vinculada ao e-mail convidado | `200` com `{ householdId }` |
| `DELETE /households/:id/members/:memberId` | Administração ativa e UUID interno do vínculo | `204` após revogação |

Erros usam `{ code, message, requestId }`. `401` indica sessão ausente. `403` indica verificação de e-mail pendente, origem fora da lista ou falta de papel administrativo. `404` cobre recurso inacessível e convite indisponível, inclusive e-mail divergente, expiração ou consumo anterior. `409` cobre chave reutilizada com dados diferentes e remoção do administrador titular sem transferência. `413` indica corpo acima de 8 KiB na criação ou aceitação. `422` indica dados ou chave inválidos. `503` indica integração indisponível.

O adaptador PostgreSQL usa as tabelas `households`, `memberships`, `invitations` e `identity_idempotency`. Revalida a autorização na própria operação de persistência. A criação de família e seu vínculo administrativo ocorrem na mesma transação. A criação de convites e a revogação serializam alterações por família. Convites expiram em 48 horas, só podem ser aceitos uma vez e não reativam vínculo quando emitidos antes da revogação (FAM-02/03). Reenvios com a mesma chave e os mesmos dados repetem o resultado da criação.

O token é retornado ao administrador para compartilhar, sem envio de e-mail. A API exige segredo de convite de pelo menos 32 bytes e registra somente o hash do token no banco. Preservar o segredo durante a janela de reenvio permite devolver o mesmo token. Após rotação, a mesma chave pode gerar conflito e o administrador pode emitir um novo convite. O cliente deve evitar guardar o token em armazenamento persistente ou expô-lo em logs.

Recuperação de senha, revogação global de sessões, auditoria seletiva, validação de limites por ator e transferência de titularidade permanecem pendentes. Os testes locais usam sessões simuladas e PostgreSQL descartável. A entrega do código de verificação exige um teste com endereço controlado pelo proprietário.

## Testes

`pnpm exec vitest run apps/api/test/bootstrap.test.ts apps/api/test/identity.test.ts` verifica a sonda, a configuração e o contrato HTTP. `bash apps/api/test/run-identity-db.sh` sobe PostgreSQL 18 descartável, aplica a migration e verifica autorização de persistência, criações concorrentes, expiração, reuso e revogação. O runner publica uma porta dinâmica somente em loopback e encerra o contêiner ao terminar.
