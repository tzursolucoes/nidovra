# Isolamento de banco

O pacote contém `assertEnvironmentIsolation()`, a guarda de configuração prévia para futuros comandos locais de migração. A função rejeita o identificador do projeto MotoHub, ambientes remotos e conexões fora de loopback. Em desenvolvimento o destino deve ser `nidovra_dev`. Em testes o destino deve ser `nidovra_test`. A guarda não abre conexão, não executa SQL e não valida a identidade de um servidor.

Nenhuma tabela ou migration é fornecida nesta etapa. Execute `pnpm test packages/db/test/isolation.test.ts` da raiz para verificar os limites da guarda e a rejeição de parâmetros que poderiam redirecionar a conexão.
