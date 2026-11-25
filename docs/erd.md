# Diagrama do banco de dados

O diagrama representa as tabelas da migration `001_identity.sql` verificadas em PostgreSQL 18. Consulte o [dicionário de dados](data-dictionary.md) para tipos, índices e restrições.

```mermaid
erDiagram
    HOUSEHOLDS ||--|{ MEMBERSHIPS : autoriza
    HOUSEHOLDS ||--o{ INVITATIONS : emite
    MEMBERSHIPS ||--o| HOUSEHOLDS : titulariza

    HOUSEHOLDS {
        uuid id PK
        text name
        text status
        text owner_auth_user_id FK
        boolean owner_is_active_admin FK
        timestamptz created_at
        timestamptz updated_at
    }
    MEMBERSHIPS {
        uuid id PK
        uuid household_id FK
        text auth_user_id
        text role
        text status
        boolean is_active_admin
        timestamptz created_at
        timestamptz updated_at
    }
    INVITATIONS {
        uuid id PK
        uuid household_id FK
        text email
        text token_hash UK
        timestamptz expires_at
        timestamptz consumed_at
        timestamptz created_at
    }
    IDENTITY_IDEMPOTENCY {
        text actor_auth_user_id PK
        text operation PK
        uuid key PK
        text payload_hash
        jsonb result
        timestamptz created_at
    }
```

`households.id` participa também da FK composta do titular. A FK assegura que cada família tenha um titular ativo e administrador dentro de seus próprios vínculos. Um vínculo pode titularizar sua própria família. A validação ocorre no fim da transação por padrão, com `NO ACTION` em atualização e exclusão. As FKs de família em `memberships` e `invitations` usam `RESTRICT` em atualização e exclusão.

Os IDs do provedor de identidade são referências lógicas. Uma identidade pode ter vários vínculos históricos, com no máximo um ativo pelo índice parcial de `001a_identity_single_family.sql`. `identity_idempotency` tem chave independente por ator, operação e UUID do cliente, inclusive para comandos que criam uma família. Nenhuma dessas relações exige alterar objetos do provedor de identidade.
