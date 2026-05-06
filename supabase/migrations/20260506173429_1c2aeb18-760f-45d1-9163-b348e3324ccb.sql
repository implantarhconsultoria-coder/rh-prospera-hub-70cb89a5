
-- ============ App Mecânico — RPCs isoladas e seguras ============

-- Helper interno: valida acesso e retorna o registro
CREATE OR REPLACE FUNCTION public._app_mecanico_get_acesso(p_acesso_id uuid)
RETURNS public.acessos_externos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.acessos_externos;
BEGIN
  SELECT * INTO v FROM public.acessos_externos
   WHERE id = p_acesso_id
     AND modulo = 'mecanico'
     AND perfil_acesso = 'mecanico_externo'
     AND status = 'ativo'
     AND acesso_liberado = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'acesso_nao_autorizado';
  END IF;
  RETURN v;
END;
$$;

-- 1) Validar acesso e retornar dados do mecânico
CREATE OR REPLACE FUNCTION public.app_mecanico_validar_acesso(p_acesso_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.acessos_externos;
  v_func RECORD;
  v_veiculo RECORD;
BEGIN
  BEGIN
    v := public._app_mecanico_get_acesso(p_acesso_id);
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'acesso_nao_autorizado');
  END;

  UPDATE public.acessos_externos SET ultimo_acesso_em = now() WHERE id = v.id;

  -- Funcionário (sem CPF, sem salário)
  IF v.funcionario_id IS NOT NULL THEN
    SELECT id, nome, cargo, company_id
      INTO v_func FROM public.funcionarios WHERE id = v.funcionario_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'mecanico', jsonb_build_object(
      'acesso_id', v.id,
      'nome', v.nome,
      'empresa', COALESCE(v.empresa, ''),
      'filial', COALESCE(v.filial, ''),
      'funcao', COALESCE(v.funcao, ''),
      'funcionario_id', v.funcionario_id
    )
  );
END;
$$;

-- 2) Registrar ponto (entrada/saída)
CREATE OR REPLACE FUNCTION public.app_mecanico_registrar_ponto(
  p_acesso_id uuid,
  p_tipo text,
  p_latitude double precision DEFAULT NULL,
  p_longitude double precision DEFAULT NULL,
  p_endereco text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.acessos_externos;
  v_id uuid;
BEGIN
  BEGIN v := public._app_mecanico_get_acesso(p_acesso_id);
  EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('ok', false, 'error', 'acesso_nao_autorizado'); END;

  IF p_tipo NOT IN ('entrada','saida','pausa_inicio','pausa_fim') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'tipo_invalido');
  END IF;

  INSERT INTO public.registros_ponto(user_id, tipo, data, hora, latitude, longitude, endereco_formatado)
  VALUES (
    -- usa profile_user_id se houver, senão um uuid sentinela do acesso (não usa auth.uid)
    COALESCE(v.profile_user_id, v.id),
    p_tipo, CURRENT_DATE, CURRENT_TIME, p_latitude, p_longitude, p_endereco
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

-- 3) Listar chamados do mecânico
CREATE OR REPLACE FUNCTION public.app_mecanico_listar_chamados(p_acesso_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.acessos_externos;
  v_arr jsonb;
BEGIN
  BEGIN v := public._app_mecanico_get_acesso(p_acesso_id);
  EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('ok', false, 'error', 'acesso_nao_autorizado'); END;

  IF v.funcionario_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'chamados', '[]'::jsonb);
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.created_at DESC), '[]'::jsonb)
    INTO v_arr
    FROM public.chamados c
   WHERE c.colaborador_id = v.funcionario_id;

  RETURN jsonb_build_object('ok', true, 'chamados', v_arr);
END;
$$;

-- 4) Atualizar status do chamado (somente do próprio mecânico)
CREATE OR REPLACE FUNCTION public.app_mecanico_atualizar_chamado(
  p_acesso_id uuid,
  p_chamado_id uuid,
  p_acao text,
  p_observacao text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.acessos_externos;
  v_count int;
BEGIN
  BEGIN v := public._app_mecanico_get_acesso(p_acesso_id);
  EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('ok', false, 'error', 'acesso_nao_autorizado'); END;

  IF v.funcionario_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sem_vinculo_funcionario');
  END IF;

  IF p_acao = 'iniciar' THEN
    UPDATE public.chamados
       SET status = 'em_atendimento', aceito_em = COALESCE(aceito_em, now()),
           observacoes = COALESCE(p_observacao, observacoes), updated_at = now()
     WHERE id = p_chamado_id AND colaborador_id = v.funcionario_id;
  ELSIF p_acao = 'finalizar' THEN
    UPDATE public.chamados
       SET status = 'concluido', concluido_em = now(),
           observacoes = COALESCE(p_observacao, observacoes), updated_at = now()
     WHERE id = p_chamado_id AND colaborador_id = v.funcionario_id;
  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'acao_invalida');
  END IF;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'chamado_nao_encontrado');
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 5) Histórico do mecânico (ponto + chamados)
CREATE OR REPLACE FUNCTION public.app_mecanico_listar_historico(p_acesso_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.acessos_externos;
  v_pontos jsonb;
  v_chamados jsonb;
BEGIN
  BEGIN v := public._app_mecanico_get_acesso(p_acesso_id);
  EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('ok', false, 'error', 'acesso_nao_autorizado'); END;

  SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.data DESC, p.hora DESC), '[]'::jsonb)
    INTO v_pontos
    FROM (
      SELECT id, tipo, data, hora, endereco_formatado, latitude, longitude
        FROM public.registros_ponto
       WHERE user_id = COALESCE(v.profile_user_id, v.id)
       ORDER BY data DESC, hora DESC
       LIMIT 50
    ) p;

  IF v.funcionario_id IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.created_at DESC), '[]'::jsonb)
      INTO v_chamados
      FROM (
        SELECT id, cliente, tipo_servico, status, created_at, concluido_em
          FROM public.chamados
         WHERE colaborador_id = v.funcionario_id
         ORDER BY created_at DESC
         LIMIT 50
      ) c;
  ELSE
    v_chamados := '[]'::jsonb;
  END IF;

  RETURN jsonb_build_object('ok', true, 'pontos', v_pontos, 'chamados', v_chamados);
END;
$$;

-- 6) Registrar KM (reaproveita registros_ponto com tipo 'km'? não — usa tabela própria se houver, senão observação livre)
-- Manter simples: cria função que insere em chamados como observação? Não, melhor abastecimento/km tem suas próprias tabelas.
-- Vamos simplesmente registrar km como ponto tipo 'km' (extensão futura).
