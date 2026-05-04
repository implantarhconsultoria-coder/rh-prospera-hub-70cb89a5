-- Flag para liberar/bloquear acesso CPF individualmente
ALTER TABLE public.funcionarios
  ADD COLUMN IF NOT EXISTS acesso_cpf_liberado BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_func_cpf_liberado ON public.funcionarios(acesso_cpf_liberado) WHERE acesso_cpf_liberado = true;

-- Atualiza validar_acesso_cpf_slug para respeitar a flag
CREATE OR REPLACE FUNCTION public.validar_acesso_cpf_slug(p_slug text, p_cpf text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_func RECORD;
  v_perm RECORD;
  v_empresa_nome TEXT;
  v_cpf_clean TEXT;
  v_acesso_status TEXT;
  v_slug TEXT;
  v_area TEXT;
  v_filial TEXT;
  v_modulo TEXT;
  v_unidade TEXT;
  v_link_nome TEXT;
  v_token TEXT;
  v_tec_id UUID;
  v_profile RECORD;
BEGIN
  v_cpf_clean := regexp_replace(COALESCE(p_cpf,''), '[^0-9]', '', 'g');
  v_slug := lower(trim(COALESCE(p_slug, '')));

  IF length(v_cpf_clean) <> 11 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cpf_invalido');
  END IF;

  v_area := NULL; v_filial := NULL;
  CASE v_slug
    WHEN 'op-sp' THEN v_area := 'operacional'; v_filial := 'sp';
    WHEN 'op-pg' THEN v_area := 'operacional'; v_filial := 'praia_grande';
    WHEN 'op-go' THEN v_area := 'operacional'; v_filial := 'goiania';
    WHEN 'fat-sp' THEN v_area := 'faturamento'; v_filial := 'sp';
    WHEN 'fat-pg' THEN v_area := 'faturamento'; v_filial := 'praia_grande';
    WHEN 'fat-go' THEN v_area := 'faturamento'; v_filial := 'goiania';
    WHEN 'fin-sp' THEN v_area := 'financeiro'; v_filial := 'sp';
    WHEN 'fin-pg' THEN v_area := 'financeiro'; v_filial := 'praia_grande';
    WHEN 'fin-go' THEN v_area := 'financeiro'; v_filial := 'goiania';
    WHEN 'rh-sp' THEN v_area := 'rh'; v_filial := 'sp';
    WHEN 'rh-pg' THEN v_area := 'rh'; v_filial := 'praia_grande';
    WHEN 'rh-go' THEN v_area := 'rh'; v_filial := 'goiania';
    WHEN 'alm-sp' THEN v_area := 'almoxarifado'; v_filial := 'sp';
    WHEN 'alm-pg' THEN v_area := 'almoxarifado'; v_filial := 'praia_grande';
    WHEN 'alm-go' THEN v_area := 'almoxarifado'; v_filial := 'goiania';
    WHEN 'docrh-sp' THEN v_area := 'documentos_rh'; v_filial := 'sp';
    WHEN 'docrh-pg' THEN v_area := 'documentos_rh'; v_filial := 'praia_grande';
    WHEN 'docrh-go' THEN v_area := 'documentos_rh'; v_filial := 'goiania';
    WHEN 'filial-pg' THEN v_area := 'filial'; v_filial := 'praia_grande';
    WHEN 'filial-go' THEN v_area := 'filial'; v_filial := 'goiania';
    WHEN 'filial-sp' THEN v_area := 'filial'; v_filial := 'sp';
    WHEN 'matriz'    THEN v_area := 'filial'; v_filial := 'sp';
    WHEN 'filial'    THEN v_area := 'filial'; v_filial := NULL;
    WHEN 'financeiro' THEN v_area := 'financeiro'; v_filial := NULL;
    WHEN 'faturamento' THEN v_area := 'faturamento'; v_filial := NULL;
    WHEN 'rh' THEN v_area := 'rh'; v_filial := NULL;
    WHEN 'almoxarifado' THEN v_area := 'almoxarifado'; v_filial := NULL;
    WHEN 'mecanicos' THEN v_area := 'operacional'; v_filial := NULL;
    WHEN 'operacional' THEN v_area := 'operacional'; v_filial := NULL;
    ELSE v_area := NULL;
  END CASE;

  IF v_area IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'link_invalido');
  END IF;

  v_unidade := CASE v_filial
    WHEN 'sp' THEN 'SP'
    WHEN 'praia_grande' THEN 'Praia Grande'
    WHEN 'goiania' THEN 'Goiânia'
    ELSE ''
  END;
  v_link_nome := v_area || COALESCE(' · ' || NULLIF(v_unidade,''), '');
  v_modulo := CASE WHEN v_filial IS NULL THEN v_area ELSE v_area || '_' || v_filial END;

  -- 1) Funcionário
  SELECT f.*, e.nome AS empresa_nome
    INTO v_func
  FROM public.funcionarios f
  LEFT JOIN public.empresas e ON e.id = f.company_id
  WHERE regexp_replace(COALESCE(f.cpf,''), '[^0-9]', '', 'g') = v_cpf_clean
  LIMIT 1;

  -- 2) Profile (admin)
  IF NOT FOUND THEN
    SELECT p.user_id, p.nome_completo, p.email, p.cpf_clean
      INTO v_profile
    FROM public.profiles p
    WHERE p.cpf_clean = v_cpf_clean
    LIMIT 1;

    IF FOUND AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_profile.user_id AND role = 'admin') THEN
      INSERT INTO public.acesso_cpf_logs(cpf, modulo, unidade, resultado, motivo)
      VALUES (v_cpf_clean, v_modulo, v_unidade, 'autorizado', 'admin_via_profile');
      RETURN jsonb_build_object(
        'ok', true,
        'modulo', v_area, 'area', v_area, 'filial', v_filial,
        'unidade', v_unidade, 'link_nome', v_link_nome,
        'usuario', jsonb_build_object(
          'funcionario_id', NULL, 'cpf', v_cpf_clean,
          'nome', COALESCE(v_profile.nome_completo, v_profile.email,''),
          'empresa', '', 'cargo', 'admin', 'setor', '', 'company_id', NULL
        )
      );
    END IF;

    INSERT INTO public.acesso_cpf_logs(cpf, modulo, unidade, resultado, motivo)
    VALUES (v_cpf_clean, v_modulo, v_unidade, 'negado', 'cpf_sem_permissao_cadastrada');
    RETURN jsonb_build_object('ok', false, 'error', 'cpf_sem_permissao_cadastrada');
  END IF;

  v_empresa_nome := COALESCE(v_func.empresa_nome, '');
  v_acesso_status := lower(trim(COALESCE(v_func.acesso_status, v_func.status, 'ativo')));

  -- NOVO: bloqueio admin
  IF COALESCE(v_func.acesso_cpf_liberado, true) = false THEN
    INSERT INTO public.acesso_cpf_logs(cpf, modulo, unidade, resultado, motivo, funcionario_id)
    VALUES (v_cpf_clean, v_modulo, v_unidade, 'negado', 'acesso_bloqueado_admin', v_func.id);
    RETURN jsonb_build_object('ok', false, 'error', 'acesso_bloqueado_admin');
  END IF;

  IF v_acesso_status IN ('desligado','bloqueado','inativo','ferias','férias') THEN
    INSERT INTO public.acesso_cpf_logs(cpf, modulo, unidade, resultado, motivo, funcionario_id)
    VALUES (v_cpf_clean, v_modulo, v_unidade, 'negado', 'acesso_bloqueado', v_func.id);
    RETURN jsonb_build_object('ok', false, 'error', 'acesso_bloqueado', 'status', v_acesso_status);
  END IF;

  SELECT id, status INTO v_perm
  FROM public.funcionario_modulos
  WHERE funcionario_id = v_func.id AND modulo = v_modulo
  LIMIT 1;

  IF NOT FOUND AND v_filial IS NOT NULL THEN
    SELECT id, status INTO v_perm
    FROM public.funcionario_modulos
    WHERE funcionario_id = v_func.id AND modulo = v_area
    LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    INSERT INTO public.acesso_cpf_logs(cpf, modulo, unidade, resultado, motivo, funcionario_id)
    VALUES (v_cpf_clean, v_modulo, v_unidade, 'negado', 'sem_permissao_modulo', v_func.id);
    RETURN jsonb_build_object('ok', false, 'error', 'sem_permissao_modulo');
  END IF;

  IF lower(COALESCE(v_perm.status,'ativo')) = 'bloqueado' THEN
    INSERT INTO public.acesso_cpf_logs(cpf, modulo, unidade, resultado, motivo, funcionario_id)
    VALUES (v_cpf_clean, v_modulo, v_unidade, 'negado', 'acesso_bloqueado', v_func.id);
    RETURN jsonb_build_object('ok', false, 'error', 'acesso_bloqueado');
  END IF;

  UPDATE public.funcionario_modulos
     SET ultimo_acesso_em = now(),
         total_acessos = COALESCE(total_acessos,0) + 1,
         status = 'ativo'
   WHERE id = v_perm.id;

  IF v_area = 'operacional' THEN
    SELECT id, access_token INTO v_tec_id, v_token
    FROM public.tecnicos_campo WHERE funcionario_id = v_func.id LIMIT 1;
    IF v_tec_id IS NULL THEN
      v_token := public.gen_tecnico_access_token();
      BEGIN
        INSERT INTO public.tecnicos_campo (funcionario_id, access_token, link_status, link_bloqueado, status)
        VALUES (v_func.id, v_token, 'ativo', false, 'ativo')
        RETURNING access_token INTO v_token;
      EXCEPTION WHEN OTHERS THEN v_token := COALESCE(v_token, ''); END;
    ELSIF COALESCE(v_token,'') = '' THEN
      v_token := public.gen_tecnico_access_token();
      BEGIN
        UPDATE public.tecnicos_campo SET access_token = v_token, link_status='ativo' WHERE id = v_tec_id;
      EXCEPTION WHEN OTHERS THEN v_token := COALESCE(v_token, ''); END;
    END IF;

    INSERT INTO public.acesso_cpf_logs(cpf, modulo, unidade, resultado, motivo, funcionario_id)
    VALUES (v_cpf_clean, v_modulo, v_unidade, 'autorizado', '', v_func.id);

    RETURN jsonb_build_object(
      'ok', true, 'modulo', 'operacional', 'area', v_area, 'filial', v_filial,
      'unidade', v_unidade, 'link_nome', v_link_nome,
      'tecnico_token', COALESCE(v_token,''),
      'usuario', jsonb_build_object(
        'funcionario_id', v_func.id, 'cpf', v_cpf_clean,
        'nome', COALESCE(v_func.nome,''), 'empresa', COALESCE(v_empresa_nome,''),
        'cargo', COALESCE(v_func.cargo,''), 'setor', COALESCE(v_func.setor,''),
        'company_id', v_func.company_id
      )
    );
  END IF;

  INSERT INTO public.acesso_cpf_logs(cpf, modulo, unidade, resultado, motivo, funcionario_id)
  VALUES (v_cpf_clean, v_modulo, v_unidade, 'autorizado', '', v_func.id);

  RETURN jsonb_build_object(
    'ok', true, 'modulo', v_area, 'area', v_area, 'filial', v_filial,
    'unidade', v_unidade, 'link_nome', v_link_nome,
    'usuario', jsonb_build_object(
      'funcionario_id', v_func.id, 'cpf', v_cpf_clean,
      'nome', COALESCE(v_func.nome,''), 'empresa', COALESCE(v_empresa_nome,''),
      'cargo', COALESCE(v_func.cargo,''), 'setor', COALESCE(v_func.setor,''),
      'company_id', v_func.company_id
    )
  );
END;
$function$;