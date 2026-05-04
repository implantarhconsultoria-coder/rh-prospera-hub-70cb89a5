UPDATE public.links_acesso_publico
   SET status = 'ativo'
 WHERE slug IN ('op-sp','op-pg','op-go','financeiro','faturamento','rh','almoxarifado','mecanicos','matriz','filial-pg','filial-go')
   AND status <> 'ativo';

CREATE OR REPLACE FUNCTION public.validar_acesso_cpf_slug(p_slug text, p_cpf text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_link RECORD;
  v_func RECORD;
  v_perm RECORD;
  v_empresa_nome TEXT;
  v_cpf_clean TEXT;
  v_acesso_status TEXT;
  v_slug TEXT;
  v_modulo TEXT;
  v_unidade TEXT;
  v_link_nome TEXT;
  v_link_id UUID;
  v_empresas_permitidas TEXT[];
BEGIN
  v_cpf_clean := regexp_replace(COALESCE(p_cpf,''), '[^0-9]', '', 'g');
  v_slug := lower(COALESCE(p_slug, ''));

  IF length(v_cpf_clean) <> 11 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cpf_invalido');
  END IF;

  SELECT * INTO v_link
  FROM public.links_acesso_publico
  WHERE lower(slug) = v_slug
  LIMIT 1;

  IF FOUND THEN
    v_modulo := v_link.modulo;
    v_unidade := v_link.unidade;
    v_link_nome := v_link.nome;
    v_link_id := v_link.id;
    v_empresas_permitidas := v_link.empresas_permitidas;
  ELSE
    v_modulo := CASE
      WHEN v_slug IN ('op-sp','op-pg','op-go') THEN 'operacional'
      WHEN v_slug = 'financeiro' THEN 'financeiro'
      WHEN v_slug = 'faturamento' THEN 'faturamento'
      WHEN v_slug = 'rh' THEN 'rh'
      WHEN v_slug = 'almoxarifado' THEN 'almoxarifado'
      WHEN v_slug = 'mecanicos' THEN 'mecanicos'
      WHEN v_slug IN ('matriz','filial-pg','filial-go') THEN 'filial'
      ELSE NULL
    END;
    IF v_modulo IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'cpf_nao_encontrado');
    END IF;
    v_unidade := CASE
      WHEN v_slug = 'op-sp' THEN 'SP'
      WHEN v_slug = 'op-pg' THEN 'Praia Grande'
      WHEN v_slug = 'op-go' THEN 'Goiânia'
      WHEN v_slug = 'matriz' THEN 'Matriz'
      WHEN v_slug = 'filial-pg' THEN 'Praia Grande'
      WHEN v_slug = 'filial-go' THEN 'Goiânia'
      ELSE ''
    END;
    v_link_nome := 'Acesso ' || v_slug;
    v_link_id := NULL;
    v_empresas_permitidas := NULL;
  END IF;

  SELECT f.*, e.nome AS empresa_nome
    INTO v_func
  FROM public.funcionarios f
  LEFT JOIN public.empresas e ON e.id = f.company_id
  WHERE regexp_replace(COALESCE(f.cpf,''), '[^0-9]', '', 'g') = v_cpf_clean
  LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO public.acesso_cpf_logs(cpf, modulo, unidade, resultado, motivo)
    VALUES (v_cpf_clean, v_modulo, v_unidade, 'negado', 'cpf_nao_encontrado');
    RETURN jsonb_build_object('ok', false, 'error', 'cpf_nao_encontrado');
  END IF;

  v_empresa_nome := COALESCE(v_func.empresa_nome, '');
  v_acesso_status := lower(COALESCE(v_func.acesso_status, v_func.status, 'ativo'));

  IF v_acesso_status = 'desligado' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'funcionario_desligado');
  ELSIF v_acesso_status IN ('ferias', 'férias') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'funcionario_ferias');
  ELSIF v_acesso_status IN ('bloqueado', 'inativo') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'funcionario_bloqueado');
  END IF;

  IF array_length(v_empresas_permitidas, 1) IS NOT NULL
     AND v_empresa_nome <> ''
     AND NOT (v_empresa_nome = ANY (v_empresas_permitidas)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unidade_incorreta');
  END IF;

  IF v_modulo = 'operacional' THEN
    SELECT access_token, link_status, link_bloqueado
      INTO v_perm
    FROM public.tecnicos_campo
    WHERE funcionario_id = v_func.id
    LIMIT 1;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'tecnico_nao_encontrado');
    END IF;
    IF v_perm.link_status = 'revogado' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'revoked_link');
    END IF;
    IF v_perm.link_status = 'bloqueado' OR COALESCE(v_perm.link_bloqueado, false) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'blocked_link');
    END IF;
    IF COALESCE(v_perm.access_token, '') = '' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_token');
    END IF;

    IF v_link_id IS NOT NULL THEN
      UPDATE public.links_acesso_publico
         SET ultimo_acesso_em = now(), total_acessos = total_acessos + 1
       WHERE id = v_link_id;
    END IF;

    INSERT INTO public.acesso_cpf_logs(cpf, modulo, unidade, resultado, motivo, funcionario_id)
    VALUES (v_cpf_clean, v_modulo, v_unidade, 'autorizado', '', v_func.id);

    RETURN jsonb_build_object(
      'ok', true,
      'modulo', 'operacional',
      'unidade', v_unidade,
      'link_nome', v_link_nome,
      'usuario', jsonb_build_object(
        'funcionario_id', v_func.id,
        'cpf', v_cpf_clean,
        'nome', v_func.nome,
        'empresa', v_empresa_nome,
        'cargo', v_func.cargo,
        'setor', COALESCE(v_func.setor, ''),
        'company_id', v_func.company_id
      ),
      'tecnico_token', v_perm.access_token
    );
  END IF;

  SELECT id, status, total_acessos
    INTO v_perm
  FROM public.funcionario_modulos
  WHERE funcionario_id = v_func.id
    AND modulo = v_modulo
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sem_permissao_modulo');
  END IF;

  IF v_perm.status <> 'ativo' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'modulo_bloqueado');
  END IF;

  UPDATE public.funcionario_modulos
     SET ultimo_acesso_em = now(), total_acessos = COALESCE(v_perm.total_acessos, 0) + 1
   WHERE id = v_perm.id;

  IF v_link_id IS NOT NULL THEN
    UPDATE public.links_acesso_publico
       SET ultimo_acesso_em = now(), total_acessos = total_acessos + 1
     WHERE id = v_link_id;
  END IF;

  INSERT INTO public.acesso_cpf_logs(cpf, modulo, unidade, resultado, motivo, funcionario_id)
  VALUES (v_cpf_clean, v_modulo, v_unidade, 'autorizado', '', v_func.id);

  RETURN jsonb_build_object(
    'ok', true,
    'modulo', v_modulo,
    'unidade', v_unidade,
    'link_nome', v_link_nome,
    'usuario', jsonb_build_object(
      'funcionario_id', v_func.id,
      'cpf', v_cpf_clean,
      'nome', v_func.nome,
      'empresa', v_empresa_nome,
      'cargo', v_func.cargo,
      'setor', COALESCE(v_func.setor, ''),
      'company_id', v_func.company_id
    )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.validar_acesso_cpf_slug(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validar_acesso_cpf_slug(text, text) TO anon, authenticated, service_role;