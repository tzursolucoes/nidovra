# Configurações da família

Exibe a sessão e as famílias retornadas pela API. Permite criar uma família, gerar um código de convite de uso único e aceitar um convite. O cliente usa a API da mesma origem por padrão. `VITE_API_BASE_URL` pode indicar uma origem HTTPS explícita quando a integração de cookies e CORS tiver sido validada. Códigos e chaves de idempotência ficam em memória durante a sessão da página.

A API é responsável por validar a identidade, o escopo familiar e a permissão de cada comando. Para administradores, a tela exibe o identificador da conta antes de confirmar a remoção de outro integrante. Login, recuperação de senha e entrega de convites por e-mail aguardam a integração com o provedor.

Os testes em `apps/web/test/identity-client.test.ts` verificam o contrato HTTP, a propagação da chave de idempotência e a apresentação de falhas sem expor detalhes do servidor.
