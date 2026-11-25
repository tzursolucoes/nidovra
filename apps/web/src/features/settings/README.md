# Configurações da família

Oferece cadastro por e-mail, login e encerramento de sessão. O cliente consulta `GET /api/v1/session/context` ao abrir a página e após o login. A ausência de sessão na primeira visita apresenta o formulário. Após o cadastro ou uma tentativa de login com e-mail pendente de verificação, a tela oferece confirmação por código e reenvio. Ao sair, a tela descarta dados familiares e chaves mantidos em memória.

Após confirmar o código, o cliente tenta abrir o contexto da conta confirmada. Se o provedor ainda não tiver estabelecido a sessão, o cliente tenta entrar uma vez com a senha da etapa anterior, mantida apenas em memória e descartada ao confirmar ou abandonar o fluxo. Sem senha disponível, o formulário conserva o e-mail, exibe a confirmação e direciona o foco para a senha. Falhas temporárias na consulta de sessão oferecem nova tentativa, preservando a confirmação do e-mail. Em telas largas, o formulário é acompanhado por uma fotografia decorativa local. Em telas estreitas, apenas a coluna do formulário é exibida.

Os comandos de autenticação usam `POST /api/v1/auth/sign-in/email`, `POST /api/v1/auth/sign-up/email` e `POST /api/v1/auth/sign-out`. O reenvio usa `POST /api/v1/auth/send-verification-email` e a confirmação usa `POST /api/v1/auth/email-otp/verify-email`. A sessão usa cookies HTTP tratados pelo navegador. A API da mesma origem é o padrão. `VITE_API_BASE_URL` pode indicar outra origem HTTPS quando a integração de cookies e CORS tiver sido validada.

Com sessão válida, o painel mostra a família ativa e seus integrantes. Quem já criou uma família pode usá-la sozinho. Administradores podem convidar alguém gerando um código de uso único para o e-mail dessa pessoa. O administrador compartilha o código manualmente, e a pessoa convidada entra no Nidovra com o mesmo e-mail e abre **Aceitar convite**. Quem recebeu um convite antes de criar uma família pode entrar diretamente com o código. A API valida a identidade, o escopo familiar e a permissão de cada comando.

O painel se adapta a telas estreitas e largas. Criação de outra família e ingresso por convite ficam em ações separadas. Para o primeiro acesso, a orientação explica a diferença entre criar uma família e entrar em uma existente. Os módulos financeiros e a recuperação de senha permanecem no plano.

Os testes em `apps/web/test/identity-client.test.ts` verificam os contratos HTTP de sessão e autenticação, a continuação após o código, a propagação da chave de idempotência e o tratamento de falhas sem expor detalhes do servidor.
