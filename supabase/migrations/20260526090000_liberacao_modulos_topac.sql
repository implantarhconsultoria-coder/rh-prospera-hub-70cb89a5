-- TOPAC RH PRO - liberacao real de usuarios, modulos e DN4 por permissao.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cpf text DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS empresa text DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS filial text DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cargo text DEFAULT 'usuario';

CREATE OR REPLACE FUNCTION public._topac_admin_usuario_autorizado()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1
        FROM auth.users au
       WHERE au.id = auth.uid()
         AND lower(au.email) = 'adm.matriz@topac.com.br'
    );
$$;

CREATE OR REPLACE FUNCTION public.admin_listar_usuarios_v2()
RETURNS TABLE (
  user_id uuid,
  email text,
  nome_completo text,
  telefone text,
  cpf text,
  empresa text,
  filial text,
  cargo text,
  created_at timestamptz,
  email_confirmed boolean,
  blocked boolean,
  role text,
  role_id uuid,
  roles text[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public._topac_admin_usuario_autorizado() THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    au.id AS user_id,
    lower(COALESCE(au.email, p.email, ae.email, '')) AS email,
    COALESCE(NULLIF(p.nome_completo, ''), au.raw_user_meta_data->>'nome_completo', ae.nome, '') AS nome_completo,
    COALESCE(NULLIF(p.telefone, ''), au.raw_user_meta_data->>'telefone', ae.telefone, '') AS telefone,
    COALESCE(NULLIF(p.cpf, ''), ae.cpf, f.cpf, '') AS cpf,
    COALESCE(NULLIF(p.empresa, ''), ae.empresa, e.nome, '') AS empresa,
    COALESCE(NULLIF(p.filial, ''), ae.filial, '') AS filial,
    COALESCE(NULLIF(p.cargo, ''), ae.funcao, '') AS cargo,
    au.created_at,
    au.email_confirmed_at IS NOT NULL AS email_confirmed,
    au.banned_until IS NOT NULL AND au.banned_until > now() AS blocked,
    ur.role AS role,
    ur.role_id AS role_id,
    COALESCE(roles.roles, ARRAY[]::text[]) AS roles
  FROM auth.users au
  LEFT JOIN public.profiles p ON p.user_id = au.id
  LEFT JOIN LATERAL (
    SELECT *
      FROM public.acessos_externos a
     WHERE lower(COALESCE(a.email, a.email_corporativo, '')) = lower(COALESCE(au.email, ''))
        OR a.profile_user_id = au.id
     ORDER BY a.created_at DESC
     LIMIT 1
  ) ae ON true
  LEFT JOIN public.funcionarios f ON f.id = ae.funcionario_id
  LEFT JOIN public.empresas e ON e.id = COALESCE(f.company_id, f.empresa_id)
  LEFT JOIN LATERAL (
    SELECT
      r.id AS role_id,
      r.role::text AS role
      FROM public.user_roles r
     WHERE r.user_id = au.id
     ORDER BY CASE r.role::text
       WHEN 'admin' THEN 0
       WHEN 'diretor_geral' THEN 1
       WHEN 'financeiro' THEN 2
       WHEN 'faturamento' THEN 3
       WHEN 'almoxarifado' THEN 4
       WHEN 'operacional' THEN 5
       ELSE 9
     END, r.created_at DESC
     LIMIT 1
  ) ur ON true
  LEFT JOIN LATERAL (
    SELECT array_agg(r.role::text ORDER BY CASE r.role::text
       WHEN 'admin' THEN 0
       WHEN 'diretor_geral' THEN 1
       WHEN 'financeiro' THEN 2
       WHEN 'faturamento' THEN 3
       WHEN 'almoxarifado' THEN 4
       WHEN 'operacional' THEN 5
       ELSE 9
     END, r.created_at DESC) AS roles
      FROM public.user_roles r
     WHERE r.user_id = au.id
  ) roles ON true
  ORDER BY au.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_salvar_usuario_acesso(
  p_user_id uuid,
  p_nome text,
  p_telefone text,
  p_cpf text,
  p_empresa text,
  p_filial text,
  p_cargo text,
  p_roles text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_email text;
  v_role text;
  v_roles text[] := ARRAY(
    SELECT DISTINCT role_name
      FROM unnest(COALESCE(p_roles, ARRAY[]::text[])) role_name
     WHERE role_name = ANY(ARRAY[
       'admin',
       'diretor_geral',
       'filial_matriz',
       'filial_praia',
       'filial_goiania',
       'almoxarifado',
       'tecnico_campo',
       'operacional',
       'faturamento',
       'financeiro'
     ])
  );
BEGIN
  IF NOT public._topac_admin_usuario_autorizado() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'nao_autorizado');
  END IF;

  SELECT lower(COALESCE(email, '')) INTO v_email
    FROM auth.users
   WHERE id = p_user_id;

  IF v_email IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'usuario_nao_encontrado');
  END IF;

  INSERT INTO public.profiles(user_id, email, nome_completo, telefone, cpf, empresa, filial, cargo)
  VALUES (
    p_user_id,
    v_email,
    COALESCE(p_nome, ''),
    COALESCE(p_telefone, ''),
    COALESCE(p_cpf, ''),
    COALESCE(p_empresa, ''),
    COALESCE(p_filial, ''),
    COALESCE(NULLIF(p_cargo, ''), 'usuario')
  )
  ON CONFLICT (user_id) DO UPDATE
     SET email = EXCLUDED.email,
         nome_completo = EXCLUDED.nome_completo,
         telefone = EXCLUDED.telefone,
         cpf = EXCLUDED.cpf,
         empresa = EXCLUDED.empresa,
         filial = EXCLUDED.filial,
         cargo = EXCLUDED.cargo,
         updated_at = now();

  DELETE FROM public.user_roles
   WHERE user_id = p_user_id
     AND NOT (role::text = ANY(v_roles));

  FOREACH v_role IN ARRAY v_roles LOOP
    INSERT INTO public.user_roles(user_id, role)
    VALUES (p_user_id, v_role::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'roles', COALESCE(to_jsonb(v_roles), '[]'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_excluir_usuario(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public._topac_admin_usuario_autorizado() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'nao_autorizado');
  END IF;

  IF p_user_id = auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'nao_pode_excluir_proprio_usuario');
  END IF;

  DELETE FROM public.user_roles WHERE user_id = p_user_id;
  DELETE FROM public.profiles WHERE user_id = p_user_id;
  DELETE FROM auth.users WHERE id = p_user_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

DO $$
DECLARE
  t text;
  allowed text := '(public.has_role(auth.uid(), ''admin'') OR public.has_role(auth.uid(), ''faturamento'') OR public.has_role(auth.uid(), ''financeiro'') OR public.has_role(auth.uid(), ''operacional''))';
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'importacoes_dn4',
    'staging_clientes_dn4',
    'staging_equipamentos_dn4',
    'staging_representantes_dn4',
    'staging_historico_locacao_dn4',
    'dn4_registros_migrados'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS topac_dn4_module_access_20260526 ON public.%I', t);
      EXECUTE format('CREATE POLICY topac_dn4_module_access_20260526 ON public.%I FOR ALL TO authenticated USING (%s) WITH CHECK (%s)', t, allowed, allowed);
    END IF;
  END LOOP;
END $$;

DROP POLICY IF EXISTS topac_dn4_storage_module_access_20260526 ON storage.objects;
CREATE POLICY topac_dn4_storage_module_access_20260526
ON storage.objects
FOR ALL TO authenticated
USING (
  bucket_id = 'dn4-imports'
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'faturamento')
    OR public.has_role(auth.uid(), 'financeiro')
    OR public.has_role(auth.uid(), 'operacional')
  )
)
WITH CHECK (
  bucket_id = 'dn4-imports'
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'faturamento')
    OR public.has_role(auth.uid(), 'financeiro')
    OR public.has_role(auth.uid(), 'operacional')
  )
);

GRANT EXECUTE ON FUNCTION public.admin_listar_usuarios_v2() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_salvar_usuario_acesso(uuid, text, text, text, text, text, text, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_excluir_usuario(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
