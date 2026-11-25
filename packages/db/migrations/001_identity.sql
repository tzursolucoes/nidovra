BEGIN;

CREATE TABLE households (
  id uuid DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  owner_auth_user_id text NOT NULL,
  owner_is_active_admin boolean GENERATED ALWAYS AS (true) STORED NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT households_pkey PRIMARY KEY (id),
  CONSTRAINT households_name_check CHECK (btrim(name) <> ''),
  CONSTRAINT households_status_check CHECK (status IN ('active', 'closed')),
  CONSTRAINT households_owner_auth_user_id_check CHECK (btrim(owner_auth_user_id) <> '')
);

CREATE TABLE memberships (
  id uuid DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL,
  auth_user_id text NOT NULL,
  role text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  is_active_admin boolean GENERATED ALWAYS AS (role = 'admin' AND status = 'active') STORED NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT memberships_pkey PRIMARY KEY (id),
  CONSTRAINT memberships_household_fkey FOREIGN KEY (household_id)
    REFERENCES households (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT memberships_household_user_key UNIQUE (household_id, auth_user_id),
  CONSTRAINT memberships_owner_target_key UNIQUE (household_id, auth_user_id, is_active_admin),
  CONSTRAINT memberships_auth_user_id_check CHECK (btrim(auth_user_id) <> ''),
  CONSTRAINT memberships_role_check CHECK (role IN ('admin', 'member')),
  CONSTRAINT memberships_status_check CHECK (status IN ('active', 'revoked'))
);

-- FAM-04: a transação pode trocar o titular antes de revogar o vínculo anterior.
ALTER TABLE households ADD CONSTRAINT households_owner_fkey
  FOREIGN KEY (id, owner_auth_user_id, owner_is_active_admin)
  REFERENCES memberships (household_id, auth_user_id, is_active_admin)
  ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX memberships_auth_user_index ON memberships (auth_user_id, household_id)
  WHERE status = 'active';

CREATE TABLE invitations (
  id uuid DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL,
  email text NOT NULL,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invitations_pkey PRIMARY KEY (id),
  CONSTRAINT invitations_household_fkey FOREIGN KEY (household_id)
    REFERENCES households (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT invitations_email_check CHECK (email = lower(btrim(email)) AND position('@' IN email) > 1),
  CONSTRAINT invitations_token_hash_key UNIQUE (token_hash),
  CONSTRAINT invitations_token_hash_check CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT invitations_expiry_check CHECK (expires_at > created_at),
  CONSTRAINT invitations_consumed_at_check CHECK (consumed_at >= created_at AND consumed_at < expires_at)
);

CREATE INDEX invitations_household_expiration_index ON invitations (household_id, expires_at);

CREATE TABLE identity_idempotency (
  actor_auth_user_id text NOT NULL,
  operation text NOT NULL,
  key uuid NOT NULL,
  payload_hash text NOT NULL,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT identity_idempotency_pkey PRIMARY KEY (actor_auth_user_id, operation, key),
  CONSTRAINT identity_idempotency_actor_check CHECK (btrim(actor_auth_user_id) <> ''),
  CONSTRAINT identity_idempotency_operation_check CHECK (btrim(operation) <> ''),
  CONSTRAINT identity_idempotency_hash_check CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT identity_idempotency_result_check CHECK (jsonb_typeof(result) = 'object')
);

COMMENT ON TABLE households IS 'Ambiente familiar e titular administrativo vigente. FAM-02 e FAM-04.';
COMMENT ON COLUMN households.id IS 'Identificador interno da família e chave de escopo dos seus dados.';
COMMENT ON COLUMN households.name IS 'Nome exibido aos integrantes autorizados.';
COMMENT ON COLUMN households.status IS 'Estado operacional da família: ativa ou encerrada.';
COMMENT ON COLUMN households.owner_auth_user_id IS 'Identificador externo da identidade do titular ativo e administrador desta família.';
COMMENT ON COLUMN households.owner_is_active_admin IS 'Constante técnica gerada que exige vínculo administrativo ativo na chave estrangeira do titular.';
COMMENT ON COLUMN households.created_at IS 'Instante da criação da família, com fuso horário.';
COMMENT ON COLUMN households.updated_at IS 'Instante da última alteração, atualizado pela aplicação.';
COMMENT ON CONSTRAINT households_pkey ON households IS 'Identifica de forma única o ambiente familiar.';
COMMENT ON CONSTRAINT households_name_check ON households IS 'Rejeita nome vazio ou composto somente por espaços.';
COMMENT ON CONSTRAINT households_status_check ON households IS 'Limita os estados operacionais da família.';
COMMENT ON CONSTRAINT households_owner_auth_user_id_check ON households IS 'Exige identificador externo do titular.';
COMMENT ON CONSTRAINT households_owner_fkey ON households IS 'Vincula o titular a um administrador ativo da mesma família e valida a sucessão ao fim da transação. FAM-04.';
COMMENT ON INDEX households_pkey IS 'Índice único de identificação e referência da família.';

COMMENT ON TABLE memberships IS 'Vínculos que autorizam uma identidade externa a atuar em uma família. FAM-02 e FAM-03.';
COMMENT ON COLUMN memberships.id IS 'Identificador interno do vínculo, utilizado nas operações de gestão de integrantes.';
COMMENT ON COLUMN memberships.household_id IS 'Família à qual a autorização se aplica.';
COMMENT ON COLUMN memberships.auth_user_id IS 'Identificador opaco da identidade externa, sem senha ou token.';
COMMENT ON COLUMN memberships.role IS 'Papel de administrador ou integrante dentro da família.';
COMMENT ON COLUMN memberships.status IS 'Estado ativo ou revogado do vínculo. Somente ativos autorizam operações.';
COMMENT ON COLUMN memberships.is_active_admin IS 'Indicador derivado de papel e estado para sustentar a referência ao titular.';
COMMENT ON COLUMN memberships.created_at IS 'Instante da criação do vínculo original, com fuso horário.';
COMMENT ON COLUMN memberships.updated_at IS 'Instante da última mudança de papel ou estado, atualizado pela aplicação.';
COMMENT ON CONSTRAINT memberships_pkey ON memberships IS 'Identifica de forma única o vínculo.';
COMMENT ON CONSTRAINT memberships_household_fkey ON memberships IS 'Exige família existente e restringe a remoção ou troca da sua chave.';
COMMENT ON CONSTRAINT memberships_household_user_key ON memberships IS 'Mantém um único vínculo histórico por identidade e família.';
COMMENT ON CONSTRAINT memberships_owner_target_key ON memberships IS 'Oferece chave composta para provar escopo e condição de administrador ativo.';
COMMENT ON CONSTRAINT memberships_auth_user_id_check ON memberships IS 'Rejeita identificador externo vazio.';
COMMENT ON CONSTRAINT memberships_role_check ON memberships IS 'Limita papéis aceitos pela autorização do servidor.';
COMMENT ON CONSTRAINT memberships_status_check ON memberships IS 'Limita estados aceitos na autorização do servidor.';
COMMENT ON INDEX memberships_pkey IS 'Índice único de localização de vínculo na gestão de integrantes.';
COMMENT ON INDEX memberships_household_user_key IS 'Índice único de busca da autorização de uma identidade na família.';
COMMENT ON INDEX memberships_owner_target_key IS 'Índice único que sustenta a prova referencial de titularidade.';
COMMENT ON INDEX memberships_auth_user_index IS 'Localiza famílias acessíveis por identidade sem varrer vínculos revogados.';

COMMENT ON TABLE invitations IS 'Convites privados por e-mail, com validade e consumo registrado. FAM-02.';
COMMENT ON COLUMN invitations.id IS 'Identificador interno do convite.';
COMMENT ON COLUMN invitations.household_id IS 'Família para a qual o convite concede vínculo.';
COMMENT ON COLUMN invitations.email IS 'E-mail normalizado do destinatário, tratado como dado pessoal.';
COMMENT ON COLUMN invitations.token_hash IS 'SHA-256 em hexadecimal minúsculo do token de alta entropia. O token original fica fora do banco.';
COMMENT ON COLUMN invitations.expires_at IS 'Instante exclusivo que encerra a validade do convite.';
COMMENT ON COLUMN invitations.consumed_at IS 'Instante de aceitação bem-sucedida. Nulo enquanto o convite não foi aceito.';
COMMENT ON COLUMN invitations.created_at IS 'Instante de emissão do convite, com fuso horário.';
COMMENT ON CONSTRAINT invitations_pkey ON invitations IS 'Identifica de forma única o convite.';
COMMENT ON CONSTRAINT invitations_household_fkey ON invitations IS 'Exige família existente e restringe a remoção ou troca da sua chave.';
COMMENT ON CONSTRAINT invitations_email_check ON invitations IS 'Exige forma canônica em minúsculas para comparação com o e-mail verificado.';
COMMENT ON CONSTRAINT invitations_token_hash_key ON invitations IS 'Impede reutilização do hash do token entre convites.';
COMMENT ON CONSTRAINT invitations_token_hash_check ON invitations IS 'Exige o formato hexadecimal minúsculo de SHA-256.';
COMMENT ON CONSTRAINT invitations_expiry_check ON invitations IS 'Exige validade posterior à emissão.';
COMMENT ON CONSTRAINT invitations_consumed_at_check ON invitations IS 'Limita o instante de consumo ao intervalo de validade do convite.';
COMMENT ON INDEX invitations_pkey IS 'Índice único de identificação administrativa do convite.';
COMMENT ON INDEX invitations_token_hash_key IS 'Índice único de localização de convite para aceitação pelo hash.';
COMMENT ON INDEX invitations_household_expiration_index IS 'Localiza convites da família por prazo e apoia verificações referenciais.';

COMMENT ON TABLE identity_idempotency IS 'Reservas e resultados de comandos de identidade, escopados por ator e operação. Guarda identificadores e metadados sanitizados.';
COMMENT ON COLUMN identity_idempotency.actor_auth_user_id IS 'Identidade externa autenticada que iniciou a operação.';
COMMENT ON COLUMN identity_idempotency.operation IS 'Nome estável da operação que interpreta a chave e o resultado.';
COMMENT ON COLUMN identity_idempotency.key IS 'Chave de idempotência UUID fornecida pelo cliente.';
COMMENT ON COLUMN identity_idempotency.payload_hash IS 'SHA-256 em hexadecimal minúsculo do payload semântico canônico.';
COMMENT ON COLUMN identity_idempotency.result IS 'Resultado sanitizado em objeto JSON. Nulo durante a reserva e preenchido na mesma transação da mutação.';
COMMENT ON COLUMN identity_idempotency.created_at IS 'Instante da reserva, com fuso horário.';
COMMENT ON CONSTRAINT identity_idempotency_pkey ON identity_idempotency IS 'Serializa reenvios do mesmo comando para o mesmo ator, operação e chave.';
COMMENT ON CONSTRAINT identity_idempotency_actor_check ON identity_idempotency IS 'Exige a identidade do ator do comando.';
COMMENT ON CONSTRAINT identity_idempotency_operation_check ON identity_idempotency IS 'Exige o nome da operação.';
COMMENT ON CONSTRAINT identity_idempotency_hash_check ON identity_idempotency IS 'Exige o formato hexadecimal minúsculo de SHA-256.';
COMMENT ON CONSTRAINT identity_idempotency_result_check ON identity_idempotency IS 'Exige objeto JSON quando o resultado está presente.';
COMMENT ON INDEX identity_idempotency_pkey IS 'Índice único para reencontrar e serializar a reserva no escopo do ator e operação.';

COMMIT;
