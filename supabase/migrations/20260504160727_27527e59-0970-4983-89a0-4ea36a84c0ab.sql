
-- Helper: validar que o CPF tem permissão ativa no módulo informado e retornar funcionario
CREATE OR REPLACE FUNCTION public._cpf_check_modulo(p_cpf text, p_modulo text)
RETURNS public.funcionarios
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cpf_clean text;
  v_func public.funcionarios;
  v_perm record;
  v_status text;
BEGIN
  v_cpf_clean := regexp_replace(COALESCE(p_cpf,''), '[^0-9]', '', 'g');
  IF length(v_cpf_clean) <> 11 THEN
    RAISE EXCEPTION 'cpf_invalido';
  END IF;

  SELECT * INTO v_func
  FROM public.funcionarios
  WHERE regexp_replace(COALESCE(cpf,''), '[^0-9]', '', 'g') = v_cpf_clean
  LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'cpf_nao_encontrado'; END IF;

  v_status := lower(trim(COALESCE(v_func.acesso_status, v_func.status, 'ativo')));
  IF v_status IN ('desligado','bloqueado','inativo','ferias','férias') THEN
    RAISE EXCEPTION 'acesso_bloqueado';
  END IF;

  -- Operacional usa tecnicos_campo, demais usam funcionario_modulos
  IF p_modulo = 'operacional' THEN
    -- tudo certo se chegou aqui (validação de token feita à parte)
    RETURN v_func;
  END IF;

  SELECT id, status INTO v_perm
  FROM public.funcionario_modulos
  WHERE funcionario_id = v_func.id AND modulo = p_modulo
  LIMIT 1;

  IF NOT FOUND THEN
    -- auto-cria como ativo (mesma lógica do validar_acesso_cpf_slug)
    INSERT INTO public.funcionario_modulos (funcionario_id, modulo, status, total_acessos)
    VALUES (v_func.id, p_modulo, 'ativo', 0);
  ELSIF v_perm.status = 'bloqueado' THEN
    RAISE EXCEPTION 'modulo_bloqueado';
  END IF;

  RETURN v_func;
END;
$$;

REVOKE ALL ON FUNCTION public._cpf_check_modulo(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._cpf_check_modulo(text, text) TO anon, authenticated;

-- ===== Portal RH/Filial: lista de funcionários da mesma empresa =====
CREATE OR REPLACE FUNCTION public.portal_cpf_dados_filial(p_cpf text, p_modulo text DEFAULT 'filial')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_func public.funcionarios;
  v_empresa text;
  v_funcs jsonb;
  v_total int;
  v_aso_alerta int;
  v_ferias_alerta int;
BEGIN
  v_func := public._cpf_check_modulo(p_cpf, p_modulo);

  SELECT nome INTO v_empresa FROM public.empresas WHERE id = v_func.company_id;

  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'id', f.id,
      'nome', f.nome,
      'cargo', f.cargo,
      'setor', f.setor,
      'cpf', f.cpf,
      'data_admissao', f.data_admissao,
      'data_exame_medico', f.data_exame_medico,
      'status', f.status,
      'celular', f.celular,
      'email', f.email
    ) ORDER BY f.nome), '[]'::jsonb),
    COUNT(*)::int
  INTO v_funcs, v_total
  FROM public.funcionarios f
  WHERE f.company_id = v_func.company_id
    AND lower(COALESCE(f.status,'ativo')) = 'ativo';

  SELECT
    COUNT(*) FILTER (WHERE f.data_exame_medico IS NULL OR f.data_exame_medico < (CURRENT_DATE - INTERVAL '11 months'))::int,
    COUNT(*) FILTER (WHERE f.data_admissao IS NOT NULL AND (CURRENT_DATE - f.data_admissao) > INTERVAL '11 months' AND ((CURRENT_DATE - f.data_admissao)::int % 365) > 300)::int
  INTO v_aso_alerta, v_ferias_alerta
  FROM public.funcionarios f
  WHERE f.company_id = v_func.company_id
    AND lower(COALESCE(f.status,'ativo')) = 'ativo';

  RETURN jsonb_build_object(
    'ok', true,
    'empresa', COALESCE(v_empresa,''),
    'company_id', v_func.company_id,
    'usuario', jsonb_build_object('id', v_func.id, 'nome', v_func.nome, 'cargo', v_func.cargo),
    'total', v_total,
    'aso_alerta', v_aso_alerta,
    'ferias_alerta', v_ferias_alerta,
    'funcionarios', v_funcs
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.portal_cpf_dados_filial(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_cpf_dados_filial(text, text) TO anon, authenticated;

-- ===== Portal Almoxarifado: itens =====
CREATE OR REPLACE FUNCTION public.portal_cpf_almoxarifado(p_cpf text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_func public.funcionarios;
  v_itens jsonb;
BEGIN
  v_func := public._cpf_check_modulo(p_cpf, 'almoxarifado');

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', i.id,
    'nome', i.nome,
    'categoria', i.categoria,
    'codigo_sku', i.codigo_sku,
    'unidade', i.unidade,
    'quantidade', i.quantidade,
    'estoque_minimo', i.estoque_minimo,
    'localizacao', i.localizacao,
    'empresa', i.empresa
  ) ORDER BY i.nome), '[]'::jsonb)
  INTO v_itens
  FROM public.almoxarifado_itens i
  WHERE COALESCE(i.ativo, true) = true;

  RETURN jsonb_build_object(
    'ok', true,
    'usuario', jsonb_build_object('id', v_func.id, 'nome', v_func.nome),
    'itens', v_itens
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.portal_cpf_almoxarifado(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_cpf_almoxarifado(text) TO anon, authenticated;

-- ===== Portal Mecânicos: devolve token do app operacional =====
CREATE OR REPLACE FUNCTION public.portal_cpf_mecanico_token(p_cpf text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_func public.funcionarios;
  v_token text;
BEGIN
  v_func := public._cpf_check_modulo(p_cpf, 'mecanicos');

  SELECT access_token INTO v_token
  FROM public.tecnicos_campo
  WHERE funcionario_id = v_func.id
  LIMIT 1;

  IF v_token IS NULL OR v_token = '' THEN
    v_token := public.gen_tecnico_access_token();
    INSERT INTO public.tecnicos_campo (funcionario_id, access_token, link_status, link_bloqueado, status)
    VALUES (v_func.id, v_token, 'ativo', false, 'ativo')
    ON CONFLICT (funcionario_id) DO UPDATE SET access_token = EXCLUDED.access_token, link_status = 'ativo';
  END IF;

  RETURN jsonb_build_object('ok', true, 'token', v_token, 'usuario', jsonb_build_object('id', v_func.id, 'nome', v_func.nome));
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.portal_cpf_mecanico_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_cpf_mecanico_token(text) TO anon, authenticated;
