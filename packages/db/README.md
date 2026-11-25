# Banco de dados local

O pacote contém `assertEnvironmentIsolation()`, a guarda de configuração prévia para futuros comandos locais de migração. A função rejeita o identificador do projeto MotoHub, ambientes remotos e conexões fora de loopback. Em desenvolvimento o destino deve ser `nidovra_dev`. Em testes o destino deve ser `nidovra_test`. A guarda não abre conexão, não executa SQL e não valida a identidade de um servidor.

## Identidade e família

A migration `migrations/001_identity.sql` depende de PostgreSQL 18 e cria `households`, `memberships`, `invitations` e `identity_idempotency`. Ela mantém um titular ativo e administrador por família mediante FK composta diferida. Criação de família e sucessão do titular devem incluir o vínculo na mesma transação. O consumo de convite e as alterações de vínculo seguem o fluxo transacional descrito no [dicionário de dados](../../docs/data-dictionary.md). Veja também o [ERD](../../docs/erd.md).

O pacote não gerencia credenciais de usuário nem objetos do provedor de identidade. Um executor de migrações que aceite configuração de conexão deve usar a guarda anterior antes de conectar.

## Testes

- `pnpm test packages/db/test/isolation.test.ts` verifica a guarda de configuração.
- `bash packages/db/test/run-schema.sh` executa as migrations e o teste SQL em um contêiner PostgreSQL 18 descartável, sem portas publicadas e sem rede externa. O teste verifica restrições referenciais, sucessão do titular, unicidade e validade do convite, escopo de idempotência e comentários de tabelas e colunas no catálogo PostgreSQL.
