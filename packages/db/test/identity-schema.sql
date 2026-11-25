BEGIN;

DO $$
BEGIN
  IF current_database() <> 'nidovra_test' THEN
    RAISE EXCEPTION 'O teste exige o banco descartável nidovra_test.';
  END IF;
END;
$$;

-- FAM-02/FAM-04: o dono deve ser administrador ativo na própria família.
INSERT INTO households (id, name, owner_auth_user_id) VALUES
  ('10000000-0000-0000-0000-000000000001', 'Família sintética A', 'titular-a'),
  ('10000000-0000-0000-0000-000000000002', 'Família sintética B', 'titular-b');
INSERT INTO memberships (household_id, auth_user_id, role) VALUES
  ('10000000-0000-0000-0000-000000000001', 'titular-a', 'admin'),
  ('10000000-0000-0000-0000-000000000002', 'titular-b', 'admin'),
  ('10000000-0000-0000-0000-000000000001', 'integrante-a', 'member');
SET CONSTRAINTS ALL IMMEDIATE;

DO $$
BEGIN
  BEGIN
    UPDATE households SET owner_auth_user_id = 'titular-b'
    WHERE id = '10000000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'O schema aceitou titular de outra família.';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;

  BEGIN
    UPDATE memberships SET status = 'revoked' WHERE auth_user_id = 'titular-a';
    RAISE EXCEPTION 'O schema aceitou revogar o titular sem sucessão.';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;

  BEGIN
    UPDATE memberships SET role = 'member' WHERE auth_user_id = 'titular-a';
    RAISE EXCEPTION 'O schema aceitou rebaixar o titular sem sucessão.';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO memberships (household_id, auth_user_id, role)
    VALUES ('10000000-0000-0000-0000-000000000001', 'integrante-a', 'member');
    RAISE EXCEPTION 'O schema aceitou vínculos repetidos.';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
END;
$$;

UPDATE memberships SET role = 'admin' WHERE auth_user_id = 'integrante-a';
UPDATE households SET owner_auth_user_id = 'integrante-a'
WHERE id = '10000000-0000-0000-0000-000000000001';
UPDATE memberships SET status = 'revoked' WHERE auth_user_id = 'titular-a';

INSERT INTO invitations (household_id, email, token_hash, expires_at)
VALUES ('10000000-0000-0000-0000-000000000001', 'teste@example.test', repeat('a', 64), now() + interval '1 hour');

DO $$
DECLARE
  changed integer;
BEGIN
  BEGIN
    INSERT INTO invitations (household_id, email, token_hash, expires_at)
    VALUES ('10000000-0000-0000-0000-000000000002', 'outro@example.test', repeat('a', 64), now() + interval '1 hour');
    RAISE EXCEPTION 'O schema aceitou o mesmo hash de convite em duas famílias.';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO invitations (household_id, email, token_hash, expires_at)
    VALUES ('10000000-0000-0000-0000-000000000001', 'TESTE@example.test', repeat('b', 64), now() + interval '1 hour');
    RAISE EXCEPTION 'O schema aceitou e-mail sem normalização.';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    UPDATE invitations SET consumed_at = expires_at WHERE token_hash = repeat('a', 64);
    RAISE EXCEPTION 'O schema aceitou consumo de convite expirado.';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- A aplicação repete esta condição no UPDATE da transação de aceitação.
  UPDATE invitations SET consumed_at = now()
  WHERE token_hash = repeat('a', 64) AND email = 'terceiro@example.test'
    AND consumed_at IS NULL AND expires_at > now();
  IF FOUND THEN
    RAISE EXCEPTION 'O predicado de aceitação permitiu outro destinatário.';
  END IF;

  UPDATE invitations SET consumed_at = now()
  WHERE token_hash = repeat('a', 64) AND email = 'teste@example.test'
    AND consumed_at IS NULL AND expires_at > now();
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed <> 1 THEN
    RAISE EXCEPTION 'O convite válido deve ser consumido uma vez.';
  END IF;

  UPDATE invitations SET consumed_at = now()
  WHERE token_hash = repeat('a', 64) AND email = 'teste@example.test'
    AND consumed_at IS NULL AND expires_at > now();
  IF FOUND THEN
    RAISE EXCEPTION 'O predicado de aceitação permitiu reutilização.';
  END IF;
END;
$$;

DO $$
BEGIN
  INSERT INTO identity_idempotency (actor_auth_user_id, operation, key, payload_hash)
  VALUES ('titular-a', 'createHousehold', '10000000-0000-0000-0000-000000000010', repeat('a', 64));

  BEGIN
    INSERT INTO identity_idempotency (actor_auth_user_id, operation, key, payload_hash)
    VALUES ('titular-a', 'createHousehold', '10000000-0000-0000-0000-000000000010', repeat('b', 64));
    RAISE EXCEPTION 'O schema aceitou duas reservas da mesma chave para o mesmo ator e operação.';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  INSERT INTO identity_idempotency (actor_auth_user_id, operation, key, payload_hash)
  VALUES ('titular-b', 'createHousehold', '10000000-0000-0000-0000-000000000010', repeat('a', 64));

  BEGIN
    UPDATE identity_idempotency SET payload_hash = 'não é hash' WHERE actor_auth_user_id = 'titular-a';
    RAISE EXCEPTION 'O schema aceitou hash fora do formato SHA-256.';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    UPDATE identity_idempotency SET result = '[]'::jsonb WHERE actor_auth_user_id = 'titular-a';
    RAISE EXCEPTION 'O schema aceitou resultado com formato que não é objeto JSON.';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  UPDATE identity_idempotency SET result = '{"householdId":"10000000-0000-0000-0000-000000000001"}'::jsonb
  WHERE actor_auth_user_id = 'titular-a';
END;
$$;

-- Mantém o teste de cobertura válido quando novas tabelas da aplicação forem criadas.
DO $$
DECLARE
  missing text;
BEGIN
  SELECT string_agg(item, ', ' ORDER BY item) INTO missing FROM (
    SELECT c.relname AS item
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
      AND coalesce(obj_description(c.oid, 'pg_class'), '') = ''
    UNION ALL
    SELECT c.relname || '.' || a.attname AS item
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
      AND a.attnum > 0 AND NOT a.attisdropped
      AND coalesce(col_description(c.oid, a.attnum), '') = ''
  ) AS lacking_comments;
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Objetos sem comentários no catálogo: %', missing;
  END IF;
END;
$$;

ROLLBACK;
