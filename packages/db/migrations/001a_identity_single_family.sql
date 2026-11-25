BEGIN;

-- Bloqueia gravações durante a checagem do legado e a aplicação da nova regra.
LOCK TABLE public.memberships IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.memberships
    WHERE status = 'active'
    GROUP BY auth_user_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Há contas com mais de um vínculo familiar ativo. Resolva os vínculos existentes antes de aplicar a regra.'
      USING ERRCODE = '23505';
  END IF;
END;
$$;

CREATE UNIQUE INDEX memberships_one_active_per_user_uidx
  ON public.memberships (auth_user_id) WHERE status = 'active';

COMMENT ON INDEX public.memberships_one_active_per_user_uidx IS
  'FAM-02: limita cada identidade verificada a um vínculo familiar ativo e preserva o histórico de vínculos revogados.';

COMMIT;
