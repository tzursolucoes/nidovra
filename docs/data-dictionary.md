# Dicionário de dados

`packages/db/migrations/001_identity.sql` cria quatro tabelas no schema `public` para FAM-02 a FAM-04. Todos os instantes usam `timestamptz`. Os identificadores externos de identidade são strings opacas do provedor. O Nidovra não define chaves estrangeiras para tabelas gerenciadas pelo Neon Auth.

## `households`

| Coluna | Tipo | Nula | Padrão ou geração | Significado |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | Não | `gen_random_uuid()` | Identificador interno e chave do escopo familiar. |
| `name` | `text` | Não | — | Nome da família para os integrantes autorizados. |
| `status` | `text` | Não | `active` | `active` para ativa e `closed` para encerrada. |
| `owner_auth_user_id` | `text` | Não | — | Identidade externa do titular administrativo. |
| `owner_is_active_admin` | `boolean` | Não | `true`, gerado | Componente técnico da chave estrangeira do titular. |
| `created_at` | `timestamptz` | Não | `now()` | Criação da família. |
| `updated_at` | `timestamptz` | Não | `now()` | Última alteração, mantida pela aplicação. |

- PK `households_pkey` sobre `id`, com índice único associado.
- FK `households_owner_fkey` de `(id, owner_auth_user_id, owner_is_active_admin)` para `memberships(household_id, auth_user_id, is_active_admin)`. Exige exatamente um titular ativo e administrador da própria família. A ação é `NO ACTION` nas atualizações e exclusões. A validação diferida permite criar a família e o vínculo ou transferir a titularidade em uma única transação.
- `households_name_check`, `households_status_check` e `households_owner_auth_user_id_check` exigem nome e titular preenchidos e limitam os estados da família.

## `memberships`

| Coluna | Tipo | Nula | Padrão ou geração | Significado |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | Não | `gen_random_uuid()` | Identificador interno do vínculo. |
| `household_id` | `uuid` | Não | — | Família à qual o vínculo pertence. |
| `auth_user_id` | `text` | Não | — | Identidade externa autorizada pelo vínculo. |
| `role` | `text` | Não | — | `admin` para administrador ou `member` para integrante. |
| `status` | `text` | Não | `active` | `active` para ativo ou `revoked` para revogado. |
| `is_active_admin` | `boolean` | Não | Gerado de `role` e `status` | Verdadeiro apenas para vínculo administrativo vigente. |
| `created_at` | `timestamptz` | Não | `now()` | Criação do vínculo original. |
| `updated_at` | `timestamptz` | Não | `now()` | Última alteração, mantida pela aplicação. |

- PK `memberships_pkey` sobre `id`, com índice único associado.
- FK `memberships_household_fkey` sobre `household_id` para `households.id`, com `ON DELETE RESTRICT` e `ON UPDATE RESTRICT`. Cada família tem um ou mais vínculos e cada vínculo pertence a exatamente uma família.
- Chave única `memberships_household_user_key` sobre `(household_id, auth_user_id)`. A revogação preserva o vínculo e uma reativação atualiza a mesma linha.
- Chave única `memberships_owner_target_key` sobre `(household_id, auth_user_id, is_active_admin)`, alvo da FK do titular.
- Índice parcial `memberships_auth_user_index` em `(auth_user_id, household_id)` para consultar vínculos ativos de uma identidade.
- `memberships_auth_user_id_check`, `memberships_role_check` e `memberships_status_check` validam identidade, papel e estado. As operações de leitura e escrita da aplicação devem consultar vínculo e família ativos.

## `invitations`

| Coluna | Tipo | Nula | Padrão ou geração | Significado |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | Não | `gen_random_uuid()` | Identificador interno do convite. |
| `household_id` | `uuid` | Não | — | Família para a qual o convite concede vínculo. |
| `email` | `text` | Não | — | E-mail normalizado do destinatário, dado pessoal. |
| `token_hash` | `text` | Não | — | SHA-256 do token, em 64 caracteres hexadecimais minúsculos. A aplicação mantém o token original fora do banco. |
| `expires_at` | `timestamptz` | Não | — | Fim exclusivo da validade. |
| `consumed_at` | `timestamptz` | Sim | — | Aceitação do convite. |
| `created_at` | `timestamptz` | Não | `now()` | Emissão do convite. |

- PK `invitations_pkey` sobre `id`, com índice único associado.
- FK `invitations_household_fkey` sobre `household_id` para `households.id`, com `ON DELETE RESTRICT` e `ON UPDATE RESTRICT`. Cada família tem zero ou mais convites.
- Chave única `invitations_token_hash_key` sobre `token_hash`, utilizada na busca de convites.
- Índice `invitations_household_expiration_index` em `(household_id, expires_at)` para buscas por prazo dentro da família.
- `invitations_email_check`, `invitations_token_hash_check`, `invitations_expiry_check` e `invitations_consumed_at_check` validam representação, validade e instante de consumo.
- A aceitação usa atualização condicional por hash, e-mail verificado, validade e `consumed_at IS NULL`. O consumo e o vínculo ocorrem na mesma transação.

## `identity_idempotency`

| Coluna | Tipo | Nula | Padrão ou geração | Significado |
| --- | --- | --- | --- | --- |
| `actor_auth_user_id` | `text` | Não | — | Identidade autenticada que solicitou a operação. |
| `operation` | `text` | Não | — | Identificador estável do comando. |
| `key` | `uuid` | Não | — | Chave de idempotência fornecida pelo cliente. |
| `payload_hash` | `text` | Não | — | SHA-256 em hexadecimal minúsculo do payload canônico. |
| `result` | `jsonb` | Sim | — | Objeto sanitizado, preenchido na mesma transação que grava o resultado. |
| `created_at` | `timestamptz` | Não | `now()` | Reserva da chave. |

- PK composta `identity_idempotency_pkey` sobre `(actor_auth_user_id, operation, key)`, com índice único associado. O escopo por ator e operação também cobre comandos que criam uma família.
- `identity_idempotency_actor_check`, `identity_idempotency_operation_check`, `identity_idempotency_hash_check` e `identity_idempotency_result_check` validam chaves, hash e forma do resultado. O código da aplicação deve persistir somente os dados necessários à repetição do comando, sem tokens ou senhas.
