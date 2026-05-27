-- TOPAC RH PRO - acesso real por CPF, sem dependencia de confirmacao de e-mail.

ALTER TABLE public.cadastros_pendentes
  ADD COLUMN IF NOT EXISTS cpf text DEFAULT '';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS cpf text DEFAULT '',
  ADD COLUMN IF NOT EXISTS empresa text DEFAULT '',
  ADD COLUMN IF NOT EXISTS filial text DEFAULT '',
  ADD COLUMN IF NOT EXISTS cargo text DEFAULT 'usuario';

CREATE TABLE IF NOT EXISTS public.topac_acessos_fixos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cpf_clean text NOT NULL UNIQUE,
  nome text NOT NULL DEFAULT '',
  email text DEFAULT '',
  telefone text DEFAULT '',
  perfil text NOT NULL DEFAULT 'usuario',
  roles text[] NOT NULL DEFAULT ARRAY[]::text[],
  empresa text NOT NULL DEFAULT 'TOPAC MULTIEMPRESAS',
  filial text NOT NULL DEFAULT 'GERAL',
  ativo boolean NOT NULL DEFAULT true,
  observacoes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_topac_acessos_fixos_email
  ON public.topac_acessos_fixos (lower(email));

CREATE OR REPLACE FUNCTION public.topac_clean_cpf(p_cpf text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(COALESCE(p_cpf, ''), '\D', '', 'g');
$$;

CREATE OR REPLACE FUNCTION public.topac_roles_validas(p_roles text[])
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(array_agg(role_name ORDER BY CASE role_name
    WHEN 'admin' THEN 0
    WHEN 'diretor_geral' THEN 1
    WHEN 'financeiro' THEN 2
    WHEN 'faturamento' THEN 3
    WHEN 'almoxarifado' THEN 4
    WHEN 'operacional' THEN 5
    WHEN 'tecnico_campo' THEN 6
    WHEN 'filial_matriz' THEN 7
    WHEN 'filial_praia' THEN 8
    WHEN 'filial_goiania' THEN 9
    ELSE 99
  END), ARRAY[]::text[])
  FROM (
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
  ) roles;
$$;

INSERT INTO public.topac_acessos_fixos (cpf_clean, nome, email, perfil, roles, empresa, filial, observacoes)
VALUES
  (
    '38665547886',
    'Rodrigo de Souza Sabino',
    'adm.matriz@topac.com.br',
    'admin',
    ARRAY['admin','diretor_geral','financeiro','faturamento','almoxarifado','operacional','tecnico_campo','filial_matriz','filial_praia','filial_goiania'],
    'TOPAC MULTIEMPRESAS',
    'GERAL',
    'Acesso total inicial Rodrigo'
  ),
  (
    '19459791867',
    'Paula Rubia Faquini Goncalves',
    'financeiro@topac.com.br',
    'escritorio',
    ARRAY['financeiro','faturamento'],
    'TOPAC MULTIEMPRESAS',
    'GERAL',
    'Acesso inicial financeiro/faturamento'
  ),
  (
    '44326863838',
    'Rafaela Aparecida Del Noi',
    'fat3.matriz@topac.com.br',
    'escritorio',
    ARRAY['faturamento'],
    'TOPAC MATRIZ',
    'SAO PAULO',
    'Acesso inicial faturamento Matriz'
  )
ON CONFLICT (cpf_clean) DO UPDATE
   SET nome = EXCLUDED.nome,
       email = EXCLUDED.email,
       perfil = EXCLUDED.perfil,
       roles = EXCLUDED.roles,
       empresa = EXCLUDED.empresa,
       filial = EXCLUDED.filial,
       ativo = true,
       observacoes = EXCLUDED.observacoes,
       updated_at = now();

CREATE OR REPLACE FUNCTION public.registrar_cadastro_pendente_v2(
  p_email text,
  p_nome text,
  p_telefone text,
  p_cpf text DEFAULT '',
  p_motivo text DEFAULT 'cadastro_manual'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(trim(COALESCE(p_email, '')));
  v_cpf text := public.topac_clean_cpf(p_cpf);
  v_id uuid;
BEGIN
  IF v_email = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'email_obrigatorio');
  END IF;

  INSERT INTO public.cadastros_pendentes(email, nome_completo, telefone, cpf, status, motivo)
  VALUES (
    v_email,
    COALESCE(p_nome, ''),
    COALESCE(p_telefone, ''),
    v_cpf,
    'aguardando_liberacao',
    COALESCE(p_motivo, 'cadastro_manual')
  )
  ON CONFLICT (email) DO UPDATE
     SET nome_completo = COALESCE(NULLIF(EXCLUDED.nome_completo, ''), cadastros_pendentes.nome_completo),
         telefone = COALESCE(NULLIF(EXCLUDED.telefone, ''), cadastros_pendentes.telefone),
         cpf = COALESCE(NULLIF(EXCLUDED.cpf, ''), cadastros_pendentes.cpf),
         motivo = EXCLUDED.motivo,
         status = CASE
           WHEN cadastros_pendentes.status = 'aprovado' THEN cadastros_pendentes.status
           ELSE 'aguardando_liberacao'
         END,
         updated_at = now()
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'cpf', v_cpf);
END;
$$;

CREATE OR REPLACE FUNCTION public.topac_resolver_acesso_cpf(
  p_cpf text DEFAULT '',
  p_email text DEFAULT '',
  p_nome text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cpf text := public.topac_clean_cpf(p_cpf);
  v_email text := lower(trim(COALESCE(p_email, '')));
  v_nome_norm text := public.topac_norm_text(p_nome);
  v_fixo public.topac_acessos_fixos%ROWTYPE;
  v_acesso public.acessos_externos%ROWTYPE;
  v_roles_acesso text[] := ARRAY[]::text[];
  v_roles text[] := ARRAY[]::text[];
  v_nome text := COALESCE(p_nome, '');
  v_empresa text := 'TOPAC MULTIEMPRESAS';
  v_filial text := 'GERAL';
  v_cargo text := 'usuario';
  v_perfil text := 'usuario';
BEGIN
  IF v_cpf = '' AND v_email = '' AND v_nome_norm = '' THEN
    RETURN jsonb_build_object('ok', true, 'authorized', false, 'roles', '[]'::jsonb, 'reason', 'cpf_nao_informado');
  END IF;

  SELECT *
    INTO v_fixo
    FROM public.topac_acessos_fixos f
   WHERE f.ativo = true
     AND (
       (v_cpf <> '' AND f.cpf_clean = v_cpf)
       OR (v_email <> '' AND lower(COALESCE(f.email, '')) = v_email)
     )
   ORDER BY CASE WHEN v_cpf <> '' AND f.cpf_clean = v_cpf THEN 0 ELSE 1 END
   LIMIT 1;

  SELECT a.*
    INTO v_acesso
    FROM public.acessos_externos a
   WHERE COALESCE(a.acesso_liberado, true) = true
     AND COALESCE(a.status, 'ativo') <> 'bloqueado'
     AND (
       (v_cpf <> '' AND public.topac_clean_cpf(COALESCE(a.cpf_clean, a.cpf, '')) = v_cpf)
       OR (v_email <> '' AND lower(COALESCE(a.email, a.email_corporativo, '')) = v_email)
       OR (length(v_nome_norm) >= 8 AND public.topac_norm_text(a.nome) = v_nome_norm)
     )
   ORDER BY
     CASE
       WHEN v_cpf <> '' AND public.topac_clean_cpf(COALESCE(a.cpf_clean, a.cpf, '')) = v_cpf THEN 0
       WHEN v_email <> '' AND lower(COALESCE(a.email, a.email_corporativo, '')) = v_email THEN 1
       ELSE 2
     END,
     a.updated_at DESC NULLS LAST,
     a.created_at DESC
   LIMIT 1;

  IF v_acesso.id IS NOT NULL THEN
    SELECT public.topac_roles_validas(array_agg(role_name))
      INTO v_roles_acesso
      FROM (
        SELECT DISTINCT public.topac_role_from_acesso(a.modulo, a.perfil_acesso, a.filial) AS role_name
          FROM public.acessos_externos a
         WHERE COALESCE(a.acesso_liberado, true) = true
           AND COALESCE(a.status, 'ativo') <> 'bloqueado'
           AND public.topac_role_from_acesso(a.modulo, a.perfil_acesso, a.filial) IS NOT NULL
           AND (
             (v_cpf <> '' AND public.topac_clean_cpf(COALESCE(a.cpf_clean, a.cpf, '')) = v_cpf)
             OR (v_email <> '' AND lower(COALESCE(a.email, a.email_corporativo, '')) = v_email)
             OR (length(v_nome_norm) >= 8 AND public.topac_norm_text(a.nome) = v_nome_norm)
           )
      ) mapped;
  END IF;

  v_roles := public.topac_roles_validas(COALESCE(v_fixo.roles, ARRAY[]::text[]) || COALESCE(v_roles_acesso, ARRAY[]::text[]));

  IF COALESCE(array_length(v_roles, 1), 0) = 0 THEN
    RETURN jsonb_build_object(
      'ok', true,
      'authorized', false,
      'cpf', v_cpf,
      'email', v_email,
      'roles', '[]'::jsonb,
      'reason', 'aguardando_liberacao'
    );
  END IF;

  v_nome := COALESCE(NULLIF(v_fixo.nome, ''), NULLIF(v_acesso.nome, ''), NULLIF(p_nome, ''), 'Usuario TOPAC');
  v_empresa := COALESCE(NULLIF(v_fixo.empresa, ''), NULLIF(v_acesso.empresa, ''), 'TOPAC MULTIEMPRESAS');
  v_filial := COALESCE(NULLIF(v_fixo.filial, ''), NULLIF(v_acesso.filial, ''), 'GERAL');
  v_cargo := COALESCE(NULLIF(v_fixo.perfil, ''), NULLIF(v_acesso.funcao, ''), 'usuario');
  v_perfil := COALESCE(NULLIF(v_fixo.perfil, ''), NULLIF(v_acesso.perfil_acesso, ''), 'usuario');
  v_cpf := COALESCE(NULLIF(v_cpf, ''), NULLIF(v_fixo.cpf_clean, ''), public.topac_clean_cpf(COALESCE(v_acesso.cpf_clean, v_acesso.cpf, '')));
  v_email := COALESCE(NULLIF(v_email, ''), lower(NULLIF(v_fixo.email, '')), lower(NULLIF(v_acesso.email, '')), lower(NULLIF(v_acesso.email_corporativo, '')), '');

  RETURN jsonb_build_object(
    'ok', true,
    'authorized', true,
    'cpf', v_cpf,
    'email', v_email,
    'nome', v_nome,
    'empresa', v_empresa,
    'filial', v_filial,
    'cargo', v_cargo,
    'perfil', v_perfil,
    'roles', to_jsonb(v_roles)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.topac_aplicar_acesso_por_cpf(
  p_user_id uuid,
  p_cpf text DEFAULT '',
  p_email text DEFAULT '',
  p_nome text DEFAULT '',
  p_telefone text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_email text := lower(trim(COALESCE(p_email, '')));
  v_cpf text := public.topac_clean_cpf(p_cpf);
  v_nome text := COALESCE(p_nome, '');
  v_telefone text := COALESCE(p_telefone, '');
  v_result jsonb;
  v_roles text[] := ARRAY[]::text[];
  v_role text;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_id_obrigatorio');
  END IF;

  IF COALESCE(auth.role(), '') <> 'service_role'
     AND auth.uid() IS DISTINCT FROM p_user_id
     AND NOT public._topac_admin_usuario_autorizado() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'nao_autorizado');
  END IF;

  IF v_email = '' OR v_cpf = '' OR v_nome = '' OR v_telefone = '' THEN
    SELECT
      COALESCE(NULLIF(v_email, ''), lower(au.email), ''),
      COALESCE(NULLIF(v_cpf, ''), NULLIF(public.topac_clean_cpf(p.cpf), ''), NULLIF(public.topac_clean_cpf(au.raw_user_meta_data->>'cpf'), ''), ''),
      COALESCE(NULLIF(v_nome, ''), NULLIF(p.nome_completo, ''), au.raw_user_meta_data->>'nome_completo', ''),
      COALESCE(NULLIF(v_telefone, ''), NULLIF(p.telefone, ''), au.raw_user_meta_data->>'telefone', '')
      INTO v_email, v_cpf, v_nome, v_telefone
      FROM auth.users au
      LEFT JOIN public.profiles p ON p.user_id = au.id
     WHERE au.id = p_user_id;
  END IF;

  INSERT INTO public.profiles(user_id, email, nome_completo, telefone, cpf, cargo)
  VALUES (p_user_id, v_email, v_nome, v_telefone, v_cpf, 'usuario')
  ON CONFLICT (user_id) DO UPDATE
     SET email = COALESCE(NULLIF(EXCLUDED.email, ''), profiles.email),
         nome_completo = COALESCE(NULLIF(EXCLUDED.nome_completo, ''), profiles.nome_completo),
         telefone = COALESCE(NULLIF(EXCLUDED.telefone, ''), profiles.telefone),
         cpf = COALESCE(NULLIF(EXCLUDED.cpf, ''), profiles.cpf),
         updated_at = now();

  v_result := public.topac_resolver_acesso_cpf(v_cpf, v_email, v_nome);

  IF COALESCE((v_result->>'authorized')::boolean, false) IS NOT TRUE THEN
    DELETE FROM public.user_roles WHERE user_id = p_user_id;

    UPDATE public.cadastros_pendentes
       SET auth_user_id = p_user_id,
           cpf = COALESCE(NULLIF(v_cpf, ''), cpf),
           status = 'aguardando_liberacao',
           motivo = COALESCE(NULLIF(motivo, ''), 'cpf_nao_autorizado'),
           updated_at = now()
     WHERE auth_user_id = p_user_id
        OR lower(email) = v_email;

    RETURN v_result || jsonb_build_object('ok', true, 'status', 'aguardando_liberacao');
  END IF;

  SELECT COALESCE(array_agg(value::text), ARRAY[]::text[])
    INTO v_roles
    FROM jsonb_array_elements_text(v_result->'roles') AS value;

  UPDATE public.profiles
     SET nome_completo = COALESCE(NULLIF(v_result->>'nome', ''), nome_completo),
         email = COALESCE(NULLIF(v_email, ''), NULLIF(v_result->>'email', ''), email),
         telefone = COALESCE(NULLIF(v_telefone, ''), telefone),
         cpf = COALESCE(NULLIF(v_result->>'cpf', ''), cpf),
         empresa = COALESCE(NULLIF(v_result->>'empresa', ''), empresa),
         filial = COALESCE(NULLIF(v_result->>'filial', ''), filial),
         cargo = COALESCE(NULLIF(v_result->>'cargo', ''), cargo),
         updated_at = now()
   WHERE user_id = p_user_id;

  DELETE FROM public.user_roles
   WHERE user_id = p_user_id
     AND NOT (role = ANY(v_roles));

  FOREACH v_role IN ARRAY v_roles LOOP
    INSERT INTO public.user_roles(user_id, role)
    VALUES (p_user_id, v_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END LOOP;

  UPDATE public.acessos_externos ae
     SET profile_user_id = p_user_id,
         email = COALESCE(NULLIF(ae.email, ''), NULLIF(v_email, '')),
         email_corporativo = COALESCE(NULLIF(ae.email_corporativo, ''), NULLIF(v_email, '')),
         updated_at = now()
   WHERE (v_cpf <> '' AND public.topac_clean_cpf(COALESCE(ae.cpf_clean, ae.cpf, '')) = v_cpf)
      OR (v_email <> '' AND lower(COALESCE(ae.email, ae.email_corporativo, '')) = v_email);

  UPDATE public.cadastros_pendentes
     SET auth_user_id = p_user_id,
         cpf = COALESCE(NULLIF(v_result->>'cpf', ''), cpf),
         status = 'aprovado',
         email_confirmed_manual = true,
         email_confirmed_at = COALESCE(email_confirmed_at, now()),
         aprovado_em = COALESCE(aprovado_em, now()),
         updated_at = now()
   WHERE auth_user_id = p_user_id
      OR lower(email) = v_email;

  UPDATE auth.users
     SET email_confirmed_at = COALESCE(email_confirmed_at, now()),
         banned_until = NULL,
         updated_at = now()
   WHERE id = p_user_id;

  PERFORM public.topac_vincular_usuario_base(
    p_user_id,
    v_email,
    v_result->>'nome',
    v_telefone,
    v_result->>'cpf',
    v_result->>'empresa',
    v_result->>'filial',
    v_result->>'cargo'
  );

  RETURN v_result || jsonb_build_object('ok', true, 'status', 'aprovado');
END;
$$;

CREATE OR REPLACE FUNCTION public.topac_aplicar_acesso_usuario(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  RETURN public.topac_aplicar_acesso_por_cpf(p_user_id);
END;
$$;

REVOKE ALL ON FUNCTION public.topac_aplicar_acesso_por_cpf(uuid, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.topac_aplicar_acesso_usuario(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.topac_aplicar_acesso_por_cpf(uuid, text, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.topac_aplicar_acesso_usuario(uuid) FROM anon;

GRANT EXECUTE ON FUNCTION public.registrar_cadastro_pendente_v2(text, text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.topac_resolver_acesso_cpf(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.topac_aplicar_acesso_por_cpf(uuid, text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.topac_aplicar_acesso_usuario(uuid) TO authenticated, service_role;
