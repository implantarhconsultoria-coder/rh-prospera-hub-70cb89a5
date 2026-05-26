-- TOPAC RH PRO - fallback operacional para cadastro bloqueado por rate limit de e-mail.

CREATE TABLE IF NOT EXISTS public.cadastros_pendentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  nome_completo text NOT NULL DEFAULT '',
  telefone text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'aguardando_liberacao'
    CHECK (status IN ('aguardando_liberacao', 'email_rate_limit', 'email_pendente', 'aprovado', 'bloqueado', 'rejeitado')),
  auth_user_id uuid NULL,
  email_confirmed_manual boolean NOT NULL DEFAULT false,
  email_confirmed_at timestamptz NULL,
  aprovado_por uuid NULL,
  aprovado_em timestamptz NULL,
  bloqueado boolean NOT NULL DEFAULT false,
  motivo text NOT NULL DEFAULT '',
  ultimo_erro_email text NULL,
  resend_count integer NOT NULL DEFAULT 0,
  last_resend_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cadastros_pendentes_status ON public.cadastros_pendentes(status);
CREATE INDEX IF NOT EXISTS idx_cadastros_pendentes_auth_user_id ON public.cadastros_pendentes(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_cadastros_pendentes_email_lower ON public.cadastros_pendentes(lower(email));

ALTER TABLE public.cadastros_pendentes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cadastros_pendentes_admin_all ON public.cadastros_pendentes;
CREATE POLICY cadastros_pendentes_admin_all
ON public.cadastros_pendentes
FOR ALL
TO authenticated
USING (public._topac_admin_usuario_autorizado())
WITH CHECK (public._topac_admin_usuario_autorizado());

CREATE OR REPLACE FUNCTION public.registrar_cadastro_pendente(
  p_email text,
  p_nome text,
  p_telefone text,
  p_motivo text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_email text := lower(trim(COALESCE(p_email, '')));
  v_status text;
  v_user_id uuid;
  v_id uuid;
  v_saved_status text;
BEGIN
  IF v_email = '' OR position('@' IN v_email) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'email_invalido');
  END IF;

  SELECT au.id INTO v_user_id
    FROM auth.users au
   WHERE lower(au.email) = v_email
   ORDER BY au.created_at DESC
   LIMIT 1;

  v_status := CASE
    WHEN lower(COALESCE(p_motivo, '')) LIKE '%rate%' OR lower(COALESCE(p_motivo, '')) LIKE '%limit%' THEN 'email_rate_limit'
    WHEN v_user_id IS NULL THEN 'aguardando_liberacao'
    ELSE 'email_pendente'
  END;

  INSERT INTO public.cadastros_pendentes(
    email,
    nome_completo,
    telefone,
    status,
    auth_user_id,
    motivo,
    ultimo_erro_email
  )
  VALUES (
    v_email,
    COALESCE(NULLIF(trim(p_nome), ''), ''),
    COALESCE(NULLIF(trim(p_telefone), ''), ''),
    v_status,
    v_user_id,
    COALESCE(p_motivo, ''),
    NULLIF(COALESCE(p_motivo, ''), '')
  )
  ON CONFLICT (email) DO UPDATE
     SET nome_completo = COALESCE(NULLIF(EXCLUDED.nome_completo, ''), public.cadastros_pendentes.nome_completo),
         telefone = COALESCE(NULLIF(EXCLUDED.telefone, ''), public.cadastros_pendentes.telefone),
         auth_user_id = COALESCE(public.cadastros_pendentes.auth_user_id, EXCLUDED.auth_user_id),
         status = CASE
           WHEN public.cadastros_pendentes.status IN ('aprovado', 'bloqueado') THEN public.cadastros_pendentes.status
           WHEN EXCLUDED.status = 'email_rate_limit' THEN 'email_rate_limit'
           ELSE COALESCE(NULLIF(public.cadastros_pendentes.status, ''), EXCLUDED.status)
         END,
         motivo = COALESCE(NULLIF(EXCLUDED.motivo, ''), public.cadastros_pendentes.motivo),
         ultimo_erro_email = COALESCE(EXCLUDED.ultimo_erro_email, public.cadastros_pendentes.ultimo_erro_email),
         updated_at = now()
  RETURNING id, status INTO v_id, v_saved_status;

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_id,
    'email', v_email,
    'auth_user_id', v_user_id,
    'status', v_saved_status
  );
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
        lower(COALESCE(au.email, p.email, ae.email, cp.email, '')) AS email,
        COALESCE(NULLIF(p.nome_completo, ''), au.raw_user_meta_data->>'nome_completo', cp.nome_completo, ae.nome, '') AS nome_completo,
        COALESCE(NULLIF(p.telefone, ''), au.raw_user_meta_data->>'telefone', cp.telefone, ae.telefone, '') AS telefone,
        COALESCE(NULLIF(p.cpf, ''), ae.cpf, f.cpf, '') AS cpf,
        COALESCE(NULLIF(p.empresa, ''), ae.empresa, e.nome, '') AS empresa,
        COALESCE(NULLIF(p.filial, ''), ae.filial, '') AS filial,
        COALESCE(NULLIF(p.cargo, ''), ae.funcao, 'usuario') AS cargo,
        COALESCE(cp.created_at, au.created_at) AS created_at,
        (au.email_confirmed_at IS NOT NULL OR COALESCE(cp.email_confirmed_manual, false)) AS email_confirmed,
        COALESCE(cp.email_confirmed_manual, false) AS email_confirmed_manual,
        ((au.banned_until IS NOT NULL AND au.banned_until > now()) OR COALESCE(cp.bloqueado, false)) AS blocked,
        COALESCE(cp.status, 'aguardando_liberacao') AS status_cadastro,
        COALESCE(cp.status = 'email_rate_limit', false) AS email_rate_limited,
        ur.role AS role,
        ur.role_id AS role_id,
        COALESCE(roles.roles, ARRAY[]::text[]) AS roles
      FROM auth.users au
      LEFT JOIN public.profiles p ON p.user_id = au.id
      LEFT JOIN public.cadastros_pendentes cp ON cp.auth_user_id = au.id OR lower(cp.email) = lower(COALESCE(au.email, ''))
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

      UNION ALL

      SELECT
        cp.id AS user_id,
        cp.id AS pending_id,
        'pendente'::text AS origem,
        cp.email,
        cp.nome_completo,
        cp.telefone,
        ''::text AS cpf,
        ''::text AS empresa,
        ''::text AS filial,
        'usuario'::text AS cargo,
        cp.created_at,
        cp.email_confirmed_manual AS email_confirmed,
        cp.email_confirmed_manual,
        cp.bloqueado AS blocked,
        cp.status AS status_cadastro,
        (cp.status = 'email_rate_limit') AS email_rate_limited,
        NULL::text AS role,
        NULL::uuid AS role_id,
        ARRAY[]::text[] AS roles
      FROM public.cadastros_pendentes cp
      WHERE cp.auth_user_id IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM auth.users au WHERE lower(au.email) = cp.email
        )
    ) usuarios
   ORDER BY usuarios.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_confirmar_email_manual(
  p_user_id uuid DEFAULT NULL,
  p_pending_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid := p_user_id;
  v_pending_id uuid := p_pending_id;
  v_email text;
BEGIN
  IF NOT public._topac_admin_usuario_autorizado() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'nao_autorizado');
  END IF;

  IF v_pending_id IS NOT NULL THEN
    SELECT COALESCE(auth_user_id, v_user_id), email
      INTO v_user_id, v_email
      FROM public.cadastros_pendentes
     WHERE id = v_pending_id;
  END IF;

  IF v_user_id IS NOT NULL THEN
    UPDATE auth.users
       SET email_confirmed_at = COALESCE(email_confirmed_at, now()),
           updated_at = now()
     WHERE id = v_user_id
     RETURNING lower(email) INTO v_email;

    IF v_email IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'usuario_auth_nao_encontrado');
    END IF;
  END IF;

  IF v_pending_id IS NULL AND v_email IS NOT NULL THEN
    SELECT id INTO v_pending_id
      FROM public.cadastros_pendentes
     WHERE email = v_email
     LIMIT 1;
  END IF;

  IF v_pending_id IS NOT NULL THEN
    UPDATE public.cadastros_pendentes
       SET auth_user_id = COALESCE(auth_user_id, v_user_id),
           email_confirmed_manual = true,
           email_confirmed_at = COALESCE(email_confirmed_at, now()),
           status = CASE WHEN status = 'email_rate_limit' THEN 'aguardando_liberacao' ELSE status END,
           updated_at = now()
     WHERE id = v_pending_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'user_id', v_user_id, 'pending_id', v_pending_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_marcar_reenvio_confirmacao(
  p_email text,
  p_ok boolean DEFAULT true,
  p_error text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_email text := lower(trim(COALESCE(p_email, '')));
BEGIN
  IF NOT public._topac_admin_usuario_autorizado() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'nao_autorizado');
  END IF;

  INSERT INTO public.cadastros_pendentes(email, status, ultimo_erro_email, resend_count, last_resend_at)
  VALUES (
    v_email,
    CASE WHEN p_ok THEN 'email_pendente' ELSE 'email_rate_limit' END,
    NULLIF(COALESCE(p_error, ''), ''),
    1,
    now()
  )
  ON CONFLICT (email) DO UPDATE
     SET resend_count = public.cadastros_pendentes.resend_count + 1,
         last_resend_at = now(),
         ultimo_erro_email = CASE WHEN p_ok THEN NULL ELSE NULLIF(COALESCE(p_error, ''), '') END,
         status = CASE
           WHEN p_ok AND public.cadastros_pendentes.status = 'email_rate_limit' THEN 'email_pendente'
           WHEN NOT p_ok THEN 'email_rate_limit'
           ELSE public.cadastros_pendentes.status
         END,
         updated_at = now();

  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_bloquear_cadastro_pendente(
  p_pending_id uuid,
  p_bloquear boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public._topac_admin_usuario_autorizado() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'nao_autorizado');
  END IF;

  UPDATE public.cadastros_pendentes
     SET bloqueado = COALESCE(p_bloquear, true),
         status = CASE WHEN COALESCE(p_bloquear, true) THEN 'bloqueado' ELSE 'aguardando_liberacao' END,
         updated_at = now()
   WHERE id = p_pending_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_excluir_cadastro_pendente(p_pending_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public._topac_admin_usuario_autorizado() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'nao_autorizado');
  END IF;

  DELETE FROM public.cadastros_pendentes WHERE id = p_pending_id;
  RETURN jsonb_build_object('ok', true);
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

  IF COALESCE(array_length(v_roles, 1), 0) = 0 THEN
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
      'message', 'Cadastro esta pendente, mas ainda nao existe usuario Auth. Reenvie a confirmacao ou use o fallback de cadastro antes de aprovar.'
    );
  END IF;

  SELECT lower(COALESCE(email, v_pending.email)) INTO v_email
    FROM auth.users
   WHERE id = v_user_id;

  INSERT INTO public.profiles(user_id, email, nome_completo, telefone, cpf, empresa, filial, cargo)
  VALUES (
    v_user_id,
    COALESCE(v_email, v_pending.email),
    COALESCE(NULLIF(p_nome, ''), v_pending.nome_completo, ''),
    COALESCE(NULLIF(p_telefone, ''), v_pending.telefone, ''),
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
   WHERE user_id = v_user_id
     AND NOT (role::text = ANY(v_roles));

  FOREACH v_role IN ARRAY v_roles LOOP
    INSERT INTO public.user_roles(user_id, role)
    VALUES (v_user_id, v_role::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END LOOP;

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

  UPDATE auth.users
     SET email_confirmed_at = COALESCE(email_confirmed_at, now()),
         banned_until = NULL,
         updated_at = now()
   WHERE id = v_user_id;

  RETURN jsonb_build_object('ok', true, 'user_id', v_user_id, 'roles', COALESCE(to_jsonb(v_roles), '[]'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(COALESCE(NEW.email, ''));
BEGIN
  INSERT INTO public.profiles(user_id, email, nome_completo, telefone)
  VALUES (
    NEW.id,
    v_email,
    COALESCE(NEW.raw_user_meta_data->>'nome_completo', NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'telefone', '')
  )
  ON CONFLICT (user_id) DO UPDATE
     SET email = EXCLUDED.email,
         nome_completo = COALESCE(NULLIF(public.profiles.nome_completo, ''), EXCLUDED.nome_completo),
         telefone = COALESCE(NULLIF(public.profiles.telefone, ''), EXCLUDED.telefone),
         updated_at = now();

  UPDATE public.cadastros_pendentes
     SET auth_user_id = NEW.id,
         status = CASE WHEN status = 'email_rate_limit' THEN 'email_pendente' ELSE status END,
         updated_at = now()
   WHERE email = v_email;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

GRANT EXECUTE ON FUNCTION public.registrar_cadastro_pendente(text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_listar_usuarios_v2() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_confirmar_email_manual(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_marcar_reenvio_confirmacao(text, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_bloquear_cadastro_pendente(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_excluir_cadastro_pendente(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_aprovar_cadastro_pendente(uuid, text, text, text, text, text, text, text[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
