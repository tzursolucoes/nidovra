# Configurações da família

Oferece cadastro por e-mail, login e encerramento de sessão. O cliente consulta `GET /api/v1/session/context` ao abrir a página e após o login. A ausência de sessão na primeira visita apresenta o formulário. Após o cadastro ou uma tentativa de login com e-mail pendente de verificação, a tela oferece confirmação por código e reenvio. Ao sair, a tela descarta dados familiares e chaves mantidos em memória.

Os comandos de autenticação usam `POST /api/v1/auth/sign-in/email`, `POST /api/v1/auth/sign-up/email` e `POST /api/v1/auth/sign-out`. O reenvio usa `POST /api/v1/auth/send-verification-email` e a confirmação usa `POST /api/v1/auth/email-otp/verify-email`. A sessão usa cookies HTTP tratados pelo navegador. A API da mesma origem é o padrão. `VITE_API_BASE_URL` pode indicar outra origem HTTPS quando a integração de cookies e CORS tiver sido validada.

Com sessão válida, a área familiar permite criar famílias, gerar códigos de convite de uso único, aceitar convites e revogar acesso conforme a permissão do usuário. A API valida a identidade, o escopo familiar e cada comando. Recuperação de senha e envio de convites por e-mail permanecem pendentes.

Os testes em `apps/web/test/identity-client.test.ts` verificam os contratos HTTP de sessão e autenticação, a propagação da chave de idempotência e o tratamento de falhas sem expor detalhes do servidor.
