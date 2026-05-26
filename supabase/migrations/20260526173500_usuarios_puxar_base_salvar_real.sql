-- TOPAC RH PRO - usuarios: puxar dados reais da base e salvar vinculo/permissoes.

ALTER TABLE public.acessos_externos
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS email_corporativo text,
  ADD COLUMN IF NOT EXISTS telefone text,
  ADD COLUMN IF NOT EXISTS profile_user_id uuid;

ALTER TABLE public.funcionarios
  ADD COLUMN IF NOT EXISTS cpf text DEFAULT '',
  ADD COLUMN IF NOT EXISTS telefone text DEFAULT '',
  ADD COLUMN IF NOT EXISTS celular text DEFAULT '',
  ADD COLUMN IF NOT EXISTS email text DEFAULT '',
  ADD COLUMN IF NOT EXISTS cargo text DEFAULT '',
  ADD COLUMN IF NOT EXISTS company_id uuid,
  ADD COLUMN IF NOT EXISTS empresa_id uuid,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'ativo';

CREATE OR REPLACE FUNCTION public.topac_norm_text(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(
    translate(
      lower(trim(COALESCE(p_text, ''))),
      'áàãâäéèêëíìîïóòõôöúùûüçñÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇÑ',
      'aaaaaeeeeiiiiooooouuuucnaaaaaeeeeiiiiooooouuuucn'
    ),
    '[^a-z0-9]+',
    '',
    'g'
  );
$$;

CREATE OR REPLACE FUNCTION public.topac_role_from_acesso(p_modulo text, p_perfil text, p_filial text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN lower(COALESCE(p_perfil, p_modulo, '')) LIKE '%financeiro%' OR lower(COALESCE(p_modulo, '')) = 'financeiro' THEN 'financeiro'
    WHEN lower(COALESCE(p_perfil, p_modulo, '')) LIKE '%faturamento%' OR lower(COALESCE(p_modulo, '')) = 'faturamento' THEN 'faturamento'
    WHEN lower(COALESCE(p_perfil, p_modulo, '')) LIKE '%almox%' OR lower(COALESCE(p_modulo, '')) = 'almoxarifado' THEN 'almoxarifado'
    WHEN lower(COALESCE(p_perfil, p_modulo, '')) LIKE '%tecnico%' OR lower(COALESCE(p_modulo, '')) = 'campo' THEN 'tecnico_campo'
    WHEN lower(COALESCE(p_perfil, p_modulo, '')) LIKE '%mecanico%' OR lower(COALESCE(p_modulo, '')) IN ('mecanico', 'operacional') THEN 'operacional'
    WHEN lower(COALESCE(p_perfil, p_modulo, '')) LIKE '%filial%' AND public.topac_norm_text(p_filial) LIKE '%praia%' THEN 'filial_praia'
    WHEN lower(COALESCE(p_perfil, p_modulo, '')) LIKE '%filial%' AND (public.topac_norm_text(p_filial) LIKE '%goian%' OR public.topac_norm_text(p_filial) LIKE '%gyn%') THEN 'filial_goiania'
    WHEN lower(COALESCE(p_perfil, p_modulo, '')) LIKE '%filial%' THEN 'filial_matriz'
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.topac_vincular_usuario_base(
  p_user_id uuid,
  p_email text,
  p_nome text,
  p_telefone text,
  p_cpf text,
  p_empresa text,
  p_filial text,
  p_cargo text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(trim(COALESCE(p_email, '')));
  v_nome_norm text := public.topac_norm_text(p_nome);
  v_cpf_clean text := regexp_replace(COALESCE(p_cpf, ''), '\D', '', 'g');
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.acessos_externos ae
     SET profile_user_id = p_user_id,
         email = COALESCE(NULLIF(ae.email, ''), NULLIF(v_email, '')),
         email_corporativo = COALESCE(NULLIF(ae.email_corporativo, ''), NULLIF(v_email, '')),
         telefone = COALESCE(NULLIF(ae.telefone, ''), NULLIF(p_telefone, '')),
         empresa = COALESCE(NULLIF(ae.empresa, ''), NULLIF(p_empresa, '')),
         filial = COALESCE(NULLIF(ae.filial, ''), NULLIF(p_filial, '')),
         funcao = COALESCE(NULLIF(ae.funcao, ''), NULLIF(p_cargo, '')),
         updated_at = now()
   WHERE ae.profile_user_id = p_user_id
      OR (v_email <> '' AND lower(COALESCE(ae.email, ae.email_corporativo, '')) = v_email)
      OR (v_cpf_clean <> '' AND regexp_replace(COALESCE(ae.cpf_clean, ae.cpf, ''), '\D', '', 'g') = v_cpf_clean)
      OR (length(v_nome_norm) >= 8 AND public.topac_norm_text(ae.nome) = v_nome_norm);

  UPDATE public.funcionarios f
     SET email = COALESCE(NULLIF(f.email, ''), NULLIF(v_email, '')),
         telefone = COALESCE(NULLIF(f.telefone, ''), NULLIF(p_telefone, '')),
         celular = COALESCE(NULLIF(f.celular, ''), NULLIF(p_telefone, '')),
         cpf = COALESCE(NULLIF(f.cpf, ''), NULLIF(p_cpf, '')),
         cargo = COALESCE(NULLIF(f.cargo, ''), NULLIF(p_cargo, '')),
         updated_at = now()
   WHERE EXISTS (
          SELECT 1
            FROM public.acessos_externos ae
           WHERE ae.funcionario_id = f.id
             AND ae.profile_user_id = p_user_id
        )
      OR (v_email <> '' AND lower(COALESCE(f.email, '')) = v_email)
      OR (v_cpf_clean <> '' AND regexp_replace(COALESCE(f.cpf, ''), '\D', '', 'g') = v_cpf_clean)
      OR (length(v_nome_norm) >= 8 AND public.topac_norm_text(f.nome) = v_nome_norm);
END;
$$;

DROP FUNCTION IF EXISTS public.admin_listar_usuarios_v2();
CREATE OR REPLACE FUNCTION public.admin_listar_usuarios_v2()
RETURNS TABLE (
  user_id uuid,
  pending_id uuid,
  origem text,
  email text,
  nome_completo text,
  telefone text,
  cpf text,
  empresa text,
  filial text,
  cargo text,
  created_at timestamptz,
  email_confirmed boolean,
  email_confirmed_manual boolean,
  blocked boolean,
  status_cadastro text,
  email_rate_limited boolean,
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
  SELECT *
    FROM (
      SELECT
        au.id AS user_id,
        cp.id AS pending_id,
        'auth'::text AS origem,
        lower(COALESCE(au.email, p.email, ae.email, ae.email_corporativo, cp.email, '')) AS email,
        COALESCE(NULLIF(p.nome_completo, ''), au.raw_user_meta_data->>'nome_completo', cp.nome_completo, ae.nome, f.nome, '') AS nome_completo,
        COALESCE(NULLIF(p.telefone, ''), au.raw_user_meta_data->>'telefone', cp.telefone, ae.telefone, f.telefone, f.celular, '') AS telefone,
        COALESCE(NULLIF(p.cpf, ''), ae.cpf, f.cpf, '') AS cpf,
        COALESCE(NULLIF(p.empresa, ''), ae.empresa, e.nome, '') AS empresa,
        COALESCE(NULLIF(p.filial, ''), ae.filial, '') AS filial,
        COALESCE(NULLIF(p.cargo, ''), ae.funcao, f.cargo, 'usuario') AS cargo,
        COALESCE(cp.created_at, au.created_at) AS created_at,
        (au.email_confirmed_at IS NOT NULL OR COALESCE(cp.email_confirmed_manual, false)) AS email_confirmed,
        COALESCE(cp.email_confirmed_manual, false) AS email_confirmed_manual,
        ((au.banned_until IS NOT NULL AND au.banned_until > now()) OR COALESCE(cp.bloqueado, false)) AS blocked,
        COALESCE(cp.status, 'aguardando_liberacao') AS status_cadastro,
        (COALESCE(cp.status = 'email_rate_limit', false) AND au.email_confirmed_at IS NULL AND NOT COALESCE(cp.email_confirmed_manual, false)) AS email_rate_limited,
        ur.role AS role,
        ur.role_id AS role_id,
        COALESCE(roles.roles, acesso_roles.roles, ARRAY[]::text[]) AS roles
      FROM auth.users au
      LEFT JOIN public.profiles p ON p.user_id = au.id
      LEFT JOIN public.cadastros_pendentes cp ON cp.auth_user_id = au.id OR lower(cp.email) = lower(COALESCE(au.email, ''))
      LEFT JOIN LATERAL (
        SELECT a.*
          FROM public.acessos_externos a
         WHERE a.profile_user_id = au.id
            OR lower(COALESCE(a.email, a.email_corporativo, '')) = lower(COALESCE(au.email, ''))
            OR (regexp_replace(COALESCE(p.cpf, ''), '\D', '', 'g') <> ''
                AND regexp_replace(COALESCE(a.cpf_clean, a.cpf, ''), '\D', '', 'g') = regexp_replace(COALESCE(p.cpf, ''), '\D', '', 'g'))
            OR (
              length(public.topac_norm_text(COALESCE(p.nome_completo, au.raw_user_meta_data->>'nome_completo', cp.nome_completo, ''))) >= 8
              AND public.topac_norm_text(a.nome) = public.topac_norm_text(COALESCE(p.nome_completo, au.raw_user_meta_data->>'nome_completo', cp.nome_completo, ''))
            )
         ORDER BY
           CASE
             WHEN a.profile_user_id = au.id THEN 0
             WHEN lower(COALESCE(a.email, a.email_corporativo, '')) = lower(COALESCE(au.email, '')) THEN 1
             WHEN regexp_replace(COALESCE(a.cpf_clean, a.cpf, ''), '\D', '', 'g') = regexp_replace(COALESCE(p.cpf, ''), '\D', '', 'g') AND regexp_replace(COALESCE(p.cpf, ''), '\D', '', 'g') <> '' THEN 2
             ELSE 3
           END,
           a.updated_at DESC NULLS LAST,
           a.created_at DESC
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
      LEFT JOIN LATERAL (
        SELECT array_agg(role_name ORDER BY CASE role_name
           WHEN 'admin' THEN 0
           WHEN 'diretor_geral' THEN 1
           WHEN 'financeiro' THEN 2
           WHEN 'faturamento' THEN 3
           WHEN 'almoxarifado' THEN 4
           WHEN 'operacional' THEN 5
           ELSE 9
        END) AS roles
        FROM (
          SELECT DISTINCT public.topac_role_from_acesso(a.modulo, a.perfil_acesso, a.filial) AS role_name
            FROM public.acessos_externos a
           WHERE public.topac_role_from_acesso(a.modulo, a.perfil_acesso, a.filial) IS NOT NULL
             AND (
              a.profile_user_id = au.id
              OR lower(COALESCE(a.email, a.email_corporativo, '')) = lower(COALESCE(au.email, ''))
              OR (regexp_replace(COALESCE(p.cpf, ''), '\D', '', 'g') <> ''
                  AND regexp_replace(COALESCE(a.cpf_clean, a.cpf, ''), '\D', '', 'g') = regexp_replace(COALESCE(p.cpf, ''), '\D', '', 'g'))
              OR (
                length(public.topac_norm_text(COALESCE(p.nome_completo, au.raw_user_meta_data->>'nome_completo', cp.nome_completo, ''))) >= 8
                AND public.topac_norm_text(a.nome) = public.topac_norm_text(COALESCE(p.nome_completo, au.raw_user_meta_data->>'nome_completo', cp.nome_completo, ''))
              )
            )
        ) mapped
      ) acesso_roles ON true

      UNION ALL

      SELECT
        cp.id AS user_id,
        cp.id AS pending_id,
        'pendente'::text AS origem,
        cp.email,
        COALESCE(NULLIF(cp.nome_completo, ''), ae.nome, f.nome, '') AS nome_completo,
        COALESCE(NULLIF(cp.telefone, ''), ae.telefone, f.telefone, f.celular, '') AS telefone,
        COALESCE(ae.cpf, f.cpf, '') AS cpf,
        COALESCE(ae.empresa, e.nome, '') AS empresa,
        COALESCE(ae.filial, '') AS filial,
        COALESCE(ae.funcao, f.cargo, 'usuario') AS cargo,
        cp.created_at,
        cp.email_confirmed_manual AS email_confirmed,
        cp.email_confirmed_manual,
        cp.bloqueado AS blocked,
        cp.status AS status_cadastro,
        (cp.status = 'email_rate_limit' AND NOT cp.email_confirmed_manual) AS email_rate_limited,
        NULL::text AS role,
        NULL::uuid AS role_id,
        COALESCE(acesso_roles.roles, ARRAY[]::text[]) AS roles
      FROM public.cadastros_pendentes cp
      LEFT JOIN LATERAL (
        SELECT a.*
          FROM public.acessos_externos a
         WHERE lower(COALESCE(a.email, a.email_corporativo, '')) = lower(cp.email)
            OR (
              length(public.topac_norm_text(cp.nome_completo)) >= 8
              AND public.topac_norm_text(a.nome) = public.topac_norm_text(cp.nome_completo)
            )
         ORDER BY
           CASE WHEN lower(COALESCE(a.email, a.email_corporativo, '')) = lower(cp.email) THEN 0 ELSE 1 END,
           a.updated_at DESC NULLS LAST,
           a.created_at DESC
         LIMIT 1
      ) ae ON true
      LEFT JOIN public.funcionarios f ON f.id = ae.funcionario_id
      LEFT JOIN public.empresas e ON e.id = COALESCE(f.company_id, f.empresa_id)
      LEFT JOIN LATERAL (
        SELECT array_agg(role_name ORDER BY CASE role_name
           WHEN 'admin' THEN 0
           WHEN 'diretor_geral' THEN 1
           WHEN 'financeiro' THEN 2
           WHEN 'faturamento' THEN 3
           WHEN 'almoxarifado' THEN 4
           WHEN 'operacional' THEN 5
           ELSE 9
        END) AS roles
        FROM (
          SELECT DISTINCT public.topac_role_from_acesso(a.modulo, a.perfil_acesso, a.filial) AS role_name
            FROM public.acessos_externos a
           WHERE public.topac_role_from_acesso(a.modulo, a.perfil_acesso, a.filial) IS NOT NULL
             AND (
              lower(COALESCE(a.email, a.email_corporativo, '')) = lower(cp.email)
              OR (
                length(public.topac_norm_text(cp.nome_completo)) >= 8
                AND public.topac_norm_text(a.nome) = public.topac_norm_text(cp.nome_completo)
              )
            )
        ) mapped
      ) acesso_roles ON true
      WHERE cp.auth_user_id IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM auth.users au WHERE lower(au.email) = cp.email
        )
    ) usuarios
   ORDER BY usuarios.created_at DESC;
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

  PERFORM public.topac_vincular_usuario_base(p_user_id, v_email, p_nome, p_telefone, p_cpf, p_empresa, p_filial, p_cargo);

  UPDATE public.cadastros_pendentes
     SET auth_user_id = p_user_id,
         status = CASE WHEN COALESCE(array_length(v_roles, 1), 0) > 0 THEN 'aprovado' ELSE 'aguardando_liberacao' END,
         email_confirmed_manual = CASE WHEN COALESCE(array_length(v_roles, 1), 0) > 0 THEN true ELSE email_confirmed_manual END,
         email_confirmed_at = CASE WHEN COALESCE(array_length(v_roles, 1), 0) > 0 THEN COALESCE(email_confirmed_at, now()) ELSE email_confirmed_at END,
         aprovado_por = CASE WHEN COALESCE(array_length(v_roles, 1), 0) > 0 THEN auth.uid() ELSE aprovado_por END,
         aprovado_em = CASE WHEN COALESCE(array_length(v_roles, 1), 0) > 0 THEN COALESCE(aprovado_em, now()) ELSE aprovado_em END,
         updated_at = now()
   WHERE auth_user_id = p_user_id
      OR lower(email) = v_email;

  IF COALESCE(array_length(v_roles, 1), 0) > 0 THEN
    UPDATE auth.users
       SET email_confirmed_at = COALESCE(email_confirmed_at, now()),
           banned_until = NULL,
           updated_at = now()
     WHERE id = p_user_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'roles', COALESCE(to_jsonb(v_roles), '[]'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_aprovar_cadastro_pendente(
  p_pending_id uuid,
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
  v_pending public.cadastros_pendentes%ROWTYPE;
  v_user_id uuid;
  v_email text;
  v_result jsonb;
BEGIN
  IF NOT public._topac_admin_usuario_autorizado() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'nao_autorizado');
  END IF;

  IF COALESCE(array_length(COALESCE(p_roles, ARRAY[]::text[]), 1), 0) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'selecione_perfil_ou_modulo');
  END IF;

  SELECT * INTO v_pending
    FROM public.cadastros_pendentes
   WHERE id = p_pending_id;

  IF v_pending.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cadastro_pendente_nao_encontrado');
  END IF;

  v_user_id := v_pending.auth_user_id;
  IF v_user_id IS NULL THEN
    SELECT au.id INTO v_user_id
      FROM auth.users au
     WHERE lower(au.email) = v_pending.email
     ORDER BY au.created_at DESC
     LIMIT 1;
  END IF;

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'usuario_auth_nao_criado',
      'message', 'Cadastro esta pendente, mas ainda nao existe usuario Auth. Refaca o cadastro para criar a conta antes de aprovar.'
    );
  END IF;

  SELECT lower(COALESCE(email, v_pending.email)) INTO v_email
    FROM auth.users
   WHERE id = v_user_id;

  SELECT public.admin_salvar_usuario_acesso(
    v_user_id,
    COALESCE(NULLIF(p_nome, ''), v_pending.nome_completo, ''),
    COALESCE(NULLIF(p_telefone, ''), v_pending.telefone, ''),
    p_cpf,
    p_empresa,
    p_filial,
    p_cargo,
    p_roles
  ) INTO v_result;

  IF COALESCE((v_result->>'ok')::boolean, false) IS NOT TRUE THEN
    RETURN v_result;
  END IF;

  UPDATE public.cadastros_pendentes
     SET auth_user_id = v_user_id,
         status = 'aprovado',
         email_confirmed_manual = true,
         email_confirmed_at = COALESCE(email_confirmed_at, now()),
         aprovado_por = auth.uid(),
         aprovado_em = now(),
         bloqueado = false,
         updated_at = now()
   WHERE id = p_pending_id;

  PERFORM public.topac_vincular_usuario_base(
    v_user_id,
    v_email,
    COALESCE(NULLIF(p_nome, ''), v_pending.nome_completo, ''),
    COALESCE(NULLIF(p_telefone, ''), v_pending.telefone, ''),
    p_cpf,
    p_empresa,
    p_filial,
    p_cargo
  );

  RETURN jsonb_build_object('ok', true, 'user_id', v_user_id, 'roles', v_result->'roles');
END;
$$;

GRANT EXECUTE ON FUNCTION public.topac_norm_text(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.topac_role_from_acesso(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.topac_vincular_usuario_base(uuid, text, text, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_listar_usuarios_v2() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_salvar_usuario_acesso(uuid, text, text, text, text, text, text, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_aprovar_cadastro_pendente(uuid, text, text, text, text, text, text, text[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
