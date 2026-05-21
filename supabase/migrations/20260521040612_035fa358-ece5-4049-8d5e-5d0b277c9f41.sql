
-- =========================================================
-- Pacote mobile/admin — funções de leitura (sem alterar dados)
-- =========================================================

-- Helper interno: deriva escopo de unidade a partir do role
CREATE OR REPLACE FUNCTION public._mobile_admin_unidade(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM user_roles WHERE user_id = _user_id AND role = 'filial_praia') THEN 'PRAIA'
    WHEN EXISTS (SELECT 1 FROM user_roles WHERE user_id = _user_id AND role = 'filial_goiania') THEN 'GOIANIA'
    ELSE 'MATRIZ'
  END;
$$;

-- Permissões detalhadas por módulo
CREATE OR REPLACE FUNCTION public.fn_mobile_admin_permissoes(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
  v_modulos text[] := ARRAY['rh','faturamento','financeiro','abastecimento','documentos-rh','config'];
  v_arr jsonb := '[]'::jsonb;
  m text;
BEGIN
  v_is_admin := public.has_role(p_user_id, 'admin');

  IF v_is_admin THEN
    FOREACH m IN ARRAY v_modulos LOOP
      v_arr := v_arr || jsonb_build_object(
        'modulo', m,
        'pode_visualizar', true,
        'pode_criar', true,
        'pode_editar', true,
        'pode_excluir', true,
        'pode_aprovar', true
      );
    END LOOP;
  ELSE
    FOREACH m IN ARRAY v_modulos LOOP
      v_arr := v_arr || (
        SELECT jsonb_build_object(
          'modulo', m,
          'pode_visualizar', COALESCE(bool_or(pu.pode_ver), false),
          'pode_criar',      COALESCE(bool_or(pu.pode_criar), false),
          'pode_editar',     COALESCE(bool_or(pu.pode_editar), false),
          'pode_excluir',    COALESCE(bool_or(pu.pode_excluir), false),
          'pode_aprovar',    COALESCE(bool_or(pu.pode_aprovar), false)
        )
        FROM public.permissoes_usuario pu
        WHERE pu.usuario_id = p_user_id AND pu.modulo = m AND pu.ativo = true
      );
    END LOOP;
  END IF;

  RETURN jsonb_build_object('ok', true, 'permissoes', v_arr);
END;
$$;

-- Status dos módulos (lista só os liberados, com escopo)
CREATE OR REPLACE FUNCTION public.fn_mobile_admin_status_modulos(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_perm jsonb;
  v_unidade text;
  v_is_admin boolean;
  v_modulos jsonb := '[]'::jsonb;
  v_titulos jsonb := jsonb_build_object(
    'rh', 'Recursos Humanos',
    'faturamento', 'Faturamento',
    'financeiro', 'Financeiro',
    'abastecimento', 'Abastecimento',
    'documentos-rh', 'Documentos RH',
    'config', 'Configurações'
  );
  v_rotas jsonb := jsonb_build_object(
    'rh', '/mobile/admin/rh',
    'faturamento', '/mobile/admin/faturamento',
    'financeiro', '/mobile/admin/financeiro',
    'abastecimento', '/mobile/admin/abastecimento',
    'documentos-rh', '/mobile/admin/documentos-rh',
    'config', '/mobile/admin/config'
  );
  v_icones jsonb := jsonb_build_object(
    'rh', 'users',
    'faturamento', 'receipt',
    'financeiro', 'banknote',
    'abastecimento', 'fuel',
    'documentos-rh', 'folder',
    'config', 'settings'
  );
  v_escopo jsonb := jsonb_build_object(
    'rh', true, 'faturamento', false, 'financeiro', false,
    'abastecimento', true, 'documentos-rh', true, 'config', false
  );
  r jsonb;
BEGIN
  v_is_admin := public.has_role(p_user_id, 'admin');
  v_unidade  := public._mobile_admin_unidade(p_user_id);
  v_perm     := public.fn_mobile_admin_permissoes(p_user_id);

  FOR r IN SELECT * FROM jsonb_array_elements(v_perm->'permissoes') LOOP
    IF (r->>'pode_visualizar')::boolean THEN
      v_modulos := v_modulos || jsonb_build_object(
        'modulo', r->>'modulo',
        'titulo', v_titulos->>(r->>'modulo'),
        'rota',   v_rotas->>(r->>'modulo'),
        'icone',  v_icones->>(r->>'modulo'),
        'escopo_unidade', (v_escopo->>(r->>'modulo'))::boolean,
        'unidade', CASE WHEN (v_escopo->>(r->>'modulo'))::boolean THEN v_unidade ELSE NULL END,
        'pode_criar',  (r->>'pode_criar')::boolean,
        'pode_editar', (r->>'pode_editar')::boolean
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'unidade', v_unidade,
    'is_admin', v_is_admin,
    'financeiro_global_liberado', v_is_admin,
    'modulos', v_modulos
  );
END;
$$;

-- Home mobile/admin
CREATE OR REPLACE FUNCTION public.fn_mobile_admin_home(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile RECORD;
  v_status jsonb;
  v_perm jsonb;
  v_modulos_count int;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sem_usuario');
  END IF;

  SELECT nome_completo, email INTO v_profile FROM public.profiles WHERE user_id = p_user_id LIMIT 1;

  v_status := public.fn_mobile_admin_status_modulos(p_user_id);
  v_perm   := public.fn_mobile_admin_permissoes(p_user_id);
  v_modulos_count := jsonb_array_length(COALESCE(v_status->'modulos', '[]'::jsonb));

  IF v_modulos_count = 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'sem_acesso',
      'mensagem', 'Acesso mobile/admin não liberado para este usuário.'
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'layout', 'mobile-admin',
    'titulo', 'TOPAC RH PRO',
    'subtitulo', 'Central Mobile/Admin · ' || COALESCE(v_status->>'unidade','MATRIZ'),
    'usuario', jsonb_build_object(
      'id', p_user_id,
      'nome', COALESCE(v_profile.nome_completo, v_profile.email, 'Usuário'),
      'email', v_profile.email,
      'is_admin', (v_status->>'is_admin')::boolean,
      'unidade', v_status->>'unidade'
    ),
    'financeiro_global_liberado', (v_status->>'financeiro_global_liberado')::boolean,
    'modulos', v_status->'modulos',
    'permissoes', v_perm->'permissoes'
  );
END;
$$;

-- Liberação de acesso (admin libera outro usuário)
CREATE OR REPLACE FUNCTION public.fn_liberar_acesso_mobile_admin(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_modulos text[] := ARRAY['rh','faturamento','financeiro','abastecimento','documentos-rh','config'];
  m text;
BEGIN
  IF v_caller IS NULL OR NOT public.has_role(v_caller, 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'nao_autorizado');
  END IF;

  FOREACH m IN ARRAY v_modulos LOOP
    INSERT INTO public.permissoes_usuario(usuario_id, modulo, pode_ver, pode_criar, pode_editar, ativo)
    VALUES (p_user_id, m, true, true, true, true)
    ON CONFLICT DO NOTHING;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'liberado_para', p_user_id);
END;
$$;
