# Regras de negócio

| Regra | Implementação local | Evidência e pendências |
|---|---|---|
| FAM-01 | `apps/api/src/middleware/auth.ts` exige sessão resolvida no servidor e e-mail verificado. | `apps/api/test/identity.test.ts` verifica rejeições de sessão e e-mail. Cadastro, login, recuperação e revogação da sessão no provedor ainda aguardam a integração hospedada. |
| FAM-02 | `apps/api/src/modules/identity/` e `packages/db/migrations/001_identity.sql` verificam associação ativa e papel, armazenam hash do convite e consomem o token na transação que garante o vínculo. | `apps/api/test/identity.test.ts`, `apps/api/test/identity-db.test.ts` e `packages/db/test/identity-schema.sql`. A entrega de convite por e-mail ainda está pendente. |
| FAM-03 | A API revalida o vínculo antes de cada operação de família. O PostgreSQL conserva o registro de revogação e condiciona mutações ao vínculo ativo. | Testes HTTP e de integração PostgreSQL para revogação, acesso cruzado e convites concorrentes. Documentos e trilha de auditoria aguardam os módulos que os utilizam. |
| FAM-04 | A chave estrangeira diferida impede que a família fique sem titular ativo e administrador. | `packages/db/test/identity-schema.sql` verifica rejeição da remoção sem sucessão e a troca de titular em transação. As operações de exclusão e sucessão pela API ainda estão pendentes. |

Consulte os critérios e as regras financeiras da [especificação](superpowers/specs/2026-11-25-nidovra-v12-design.md).
