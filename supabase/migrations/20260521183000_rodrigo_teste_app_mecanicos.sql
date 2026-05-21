-- TOPAC RH PRO - cadastro temporario Rodrigo / teste app mecanicos.
-- Isola registros de teste para nao contaminar fechamento, financeiro, frota ou indicadores oficiais.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.acessos_externos
  ADD COLUMN IF NOT EXISTS registro_teste boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS teste_chave text,
  ADD COLUMN IF NOT EXISTS veiculo_teste text,
  ADD COLUMN IF NOT EXISTS placa_teste text;

ALTER TABLE public.registros_ponto
  ADD COLUMN IF NOT EXISTS registro_teste boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS teste_chave text;

ALTER TABLE public.abastecimentos
  ADD COLUMN IF NOT EXISTS registro_teste boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS teste_chave text;

ALTER TABLE public.acessos_externos DROP CONSTRAINT IF EXISTS acessos_externos_perfil_chk;
ALTER TABLE public.acessos_externos
  ADD CONSTRAINT acessos_externos_perfil_chk
  CHECK (perfil_acesso IN (
    'mecanico_externo',
    'mecanico_teste',
    'tecnico_campo',
    'operacional',
    'faturamento',
    'financeiro',
    'almoxarifado',
    'filial',
    'rh'
  ));

CREATE INDEX IF NOT EXISTS idx_acessos_externos_teste
  ON public.acessos_externos(teste_chave)
  WHERE registro_teste = true;

CREATE INDEX IF NOT EXISTS idx_registros_ponto_teste
  ON public.registros_ponto(teste_chave)
  WHERE registro_teste = true;

CREATE INDEX IF NOT EXISTS idx_abastecimentos_teste
  ON public.abastecimentos(teste_chave)
  WHERE registro_teste = true;

CREATE OR REPLACE FUNCTION public._app_mecanico_get_acesso(p_acesso_id uuid)
RETURNS public.acessos_externos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.acessos_externos;
BEGIN
  SELECT * INTO v
  FROM public.acessos_externos
  WHERE id = p_acesso_id
    AND modulo = 'mecanico'
    AND perfil_acesso IN ('mecanico_externo', 'mecanico_teste')
    AND status = 'ativo'
    AND acesso_liberado = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'acesso_nao_autorizado';
  END IF;

  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.app_mecanico_validar_acesso(p_acesso_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.acessos_externos;
BEGIN
  BEGIN
    v := public._app_mecanico_get_acesso(p_acesso_id);
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'acesso_nao_autorizado');
  END;

  UPDATE public.acessos_externos
  SET ultimo_acesso_em = now()
  WHERE id = v.id;

  RETURN jsonb_build_object(
    'ok', true,
    'mecanico', jsonb_build_object(
      'acesso_id', v.id,
      'nome', v.nome,
      'empresa', COALESCE(v.empresa, ''),
      'filial', COALESCE(v.filial, ''),
      'funcao', COALESCE(v.funcao, ''),
      'funcionario_id', v.funcionario_id,
      'perfil_acesso', v.perfil_acesso,
      'registro_teste', COALESCE(v.registro_teste, false),
      'teste_chave', COALESCE(v.teste_chave, ''),
      'veiculo_teste', COALESCE(v.veiculo_teste, ''),
      'placa_teste', COALESCE(v.placa_teste, '')
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.acesso_externo_validar_pin(p_pin text, p_modulo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pin text;
  v_count int;
  v_blocked_count int;
  v_result jsonb;
BEGIN
  v_pin := regexp_replace(COALESCE(p_pin, ''), '[^0-9]', '', 'g');

  IF length(v_pin) <> 4 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'pin_invalido');
  END IF;

  SELECT count(*) INTO v_blocked_count
  FROM public.acessos_externos
  WHERE pin = v_pin
    AND modulo = p_modulo
    AND (status = 'bloqueado' OR acesso_liberado = false);

  SELECT count(*) INTO v_count
  FROM public.acessos_externos
  WHERE pin = v_pin
    AND modulo = p_modulo
    AND status = 'ativo'
    AND acesso_liberado = true;

  IF v_count = 0 THEN
    IF v_blocked_count > 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'bloqueado');
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'pin_nao_encontrado');
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'id', id,
    'nome', nome,
    'empresa', COALESCE(empresa, ''),
    'filial', COALESCE(filial, ''),
    'funcao', COALESCE(funcao, ''),
    'perfil_acesso', perfil_acesso,
    'funcionario_id', funcionario_id,
    'registro_teste', COALESCE(registro_teste, false)
  ) ORDER BY nome)
  INTO v_result
  FROM public.acessos_externos
  WHERE pin = v_pin
    AND modulo = p_modulo
    AND status = 'ativo'
    AND acesso_liberado = true;

  RETURN jsonb_build_object('ok', true, 'count', v_count, 'usuarios', COALESCE(v_result, '[]'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.app_mecanico_registrar_ponto(
  p_acesso_id uuid,
  p_tipo text,
  p_latitude double precision DEFAULT NULL,
  p_longitude double precision DEFAULT NULL,
  p_endereco text DEFAULT NULL,
  p_selfie_url text DEFAULT NULL,
  p_dispositivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.acessos_externos;
  v_id uuid;
BEGIN
  BEGIN
    v := public._app_mecanico_get_acesso(p_acesso_id);
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'acesso_nao_autorizado');
  END;

  IF p_tipo NOT IN ('entrada', 'saida', 'almoco_inicio', 'almoco_fim') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'tipo_invalido');
  END IF;

  INSERT INTO public.registros_ponto(
    user_id, tipo, data, hora, latitude, longitude, endereco_formatado, selfie_url,
    acesso_externo_id, mecanico_nome, empresa, filial, dispositivo, registro_teste, teste_chave
  ) VALUES (
    v.profile_user_id, p_tipo, CURRENT_DATE, CURRENT_TIME, p_latitude, p_longitude, p_endereco, p_selfie_url,
    v.id, v.nome, COALESCE(v.empresa, ''), COALESCE(v.filial, ''), p_dispositivo,
    COALESCE(v.registro_teste, false), NULLIF(v.teste_chave, '')
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_id,
    'registro_teste', COALESCE(v.registro_teste, false),
    'tipo', p_tipo,
    'data', CURRENT_DATE,
    'hora', CURRENT_TIME
  );
END;
$$;

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
  v_abastecimentos jsonb;
BEGIN
  BEGIN
    v := public._app_mecanico_get_acesso(p_acesso_id);
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'acesso_nao_autorizado');
  END;

  SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.data DESC, p.hora DESC), '[]'::jsonb)
    INTO v_pontos
    FROM (
      SELECT id, tipo, data, hora, endereco_formatado, latitude, longitude, selfie_url,
             registro_teste, teste_chave
        FROM public.registros_ponto
       WHERE acesso_externo_id = v.id
       ORDER BY data DESC, hora DESC
       LIMIT 80
    ) p;

  IF v.funcionario_id IS NOT NULL AND COALESCE(v.registro_teste, false) = false THEN
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

  SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.data DESC, a.hora DESC), '[]'::jsonb)
    INTO v_abastecimentos
    FROM (
      SELECT id, data, hora, mecanico_nome, empresa, filial, placa, posto_nome, posto_cnpj,
             combustivel, litros, valor_por_litro, valor, km_atual, status, observacao,
             foto_bomba_url, foto_painel_url, registro_teste, teste_chave, recibo_texto
        FROM public.abastecimentos
       WHERE acesso_externo_id = v.id
         AND COALESCE(excluido, false) = false
       ORDER BY data DESC, hora DESC
       LIMIT 100
    ) a;

  RETURN jsonb_build_object(
    'ok', true,
    'registro_teste', COALESCE(v.registro_teste, false),
    'pontos', v_pontos,
    'chamados', v_chamados,
    'abastecimentos', v_abastecimentos
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_app_mecanico_historico(p_acesso_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.acessos_externos;
  v_pontos jsonb;
  v_abastecimentos jsonb;
BEGIN
  SELECT * INTO v
  FROM public.acessos_externos
  WHERE id = p_acesso_id
    AND modulo = 'mecanico'
    AND perfil_acesso IN ('mecanico_externo', 'mecanico_teste');

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'acesso_nao_encontrado');
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.data DESC, p.hora DESC), '[]'::jsonb)
    INTO v_pontos
    FROM (
      SELECT id, tipo, data, hora, latitude, longitude, endereco_formatado, selfie_url,
             registro_teste, teste_chave
        FROM public.registros_ponto
       WHERE acesso_externo_id = v.id
       ORDER BY data DESC, hora DESC
       LIMIT 120
    ) p;

  SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.data DESC, a.hora DESC), '[]'::jsonb)
    INTO v_abastecimentos
    FROM (
      SELECT id, data, hora, mecanico_nome, empresa, filial, placa, posto_nome, posto_cnpj,
             combustivel, litros, valor_por_litro, valor, km_atual, status, observacao,
             foto_bomba_url, foto_painel_url, registro_teste, teste_chave, recibo_texto
        FROM public.abastecimentos
       WHERE acesso_externo_id = v.id
         AND COALESCE(excluido, false) = false
       ORDER BY data DESC, hora DESC
       LIMIT 120
    ) a;

  RETURN jsonb_build_object(
    'ok', true,
    'registro_teste', COALESCE(v.registro_teste, false),
    'pontos', v_pontos,
    'abastecimentos', v_abastecimentos
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.app_mecanico_validar_qr_posto(p_acesso_id uuid, p_codigo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.acessos_externos;
  p public.postos_combustivel;
  v_codigo text;
  v_placas text[];
  v_placa text;
  v_ultimo_km numeric;
  v_unidade text;
  v_empresa text;
  v_exige_selecao_carro boolean;
  v_postos jsonb := '[]'::jsonb;
BEGIN
  BEGIN
    v := public._app_mecanico_get_acesso(p_acesso_id);
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'acesso_nao_autorizado');
  END;

  v_codigo := upper(trim(coalesce(p_codigo, '')));

  SELECT *
    INTO p
    FROM public.postos_combustivel
   WHERE upper(trim(codigo)) = v_codigo
     AND deleted_at IS NULL
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'qr_nao_encontrado');
  END IF;

  IF p.status <> 'ativo' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'qr_bloqueado');
  END IF;

  IF COALESCE(v.registro_teste, false) THEN
    v_placas := ARRAY[COALESCE(NULLIF(v.placa_teste, ''), 'PEU0TST')];
  ELSE
    v_placas := public._app_mecanico_placas_from_obs(v.observacoes);
  END IF;

  v_unidade := upper(coalesce(p.unidade, ''));
  v_empresa := upper(coalesce(v.empresa, '') || ' ' || coalesce(v.filial, ''));
  v_exige_selecao_carro :=
    COALESCE(v.registro_teste, false) = false
    AND (
      v_unidade LIKE '%GOIANIA%'
      OR v_unidade LIKE '%PRAIA%'
      OR v_empresa LIKE '%GOIANIA%'
      OR v_empresa LIKE '%PRAIA%'
    );

  v_placa := CASE
    WHEN v_exige_selecao_carro THEN NULL
    ELSE NULLIF(v_placas[1], '')
  END;

  IF COALESCE(p.tipo_qr, 'posto') = 'unidade' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', px.id,
        'codigo', px.codigo,
        'nome', px.nome,
        'unidade', px.unidade,
        'cnpj', px.cnpj,
        'endereco', px.endereco,
        'telefone', px.telefone
      ) ORDER BY px.codigo), '[]'::jsonb)
      INTO v_postos
      FROM public.postos_combustivel px
     WHERE px.codigo = ANY(COALESCE(p.posto_opcoes, ARRAY[]::text[]))
       AND px.status = 'ativo'
       AND px.deleted_at IS NULL;
  END IF;

  SELECT a.km_atual
    INTO v_ultimo_km
    FROM public.abastecimentos a
   WHERE a.placa IS NOT NULL
     AND upper(replace(a.placa, '-', '')) = upper(replace(coalesce(v_placa, v_placas[1], ''), '-', ''))
     AND a.km_atual IS NOT NULL
     AND COALESCE(a.excluido, false) = false
     AND COALESCE(a.registro_teste, false) = COALESCE(v.registro_teste, false)
   ORDER BY a.data DESC, a.hora DESC, a.created_at DESC
   LIMIT 1;

  RETURN jsonb_build_object(
    'ok', true,
    'posto', jsonb_build_object(
      'id', p.id,
      'codigo', p.codigo,
      'nome', p.nome,
      'unidade', p.unidade,
      'cnpj', p.cnpj,
      'endereco', p.endereco,
      'telefone', p.telefone,
      'tipo_qr', COALESCE(p.tipo_qr, 'posto')
    ),
    'postos', v_postos,
    'mecanico', jsonb_build_object(
      'nome', v.nome,
      'empresa', COALESCE(v.empresa, ''),
      'filial', COALESCE(v.filial, ''),
      'funcionario_id', v.funcionario_id,
      'placa', v_placa,
      'carros', COALESCE((SELECT jsonb_agg(x) FROM unnest(v_placas) x), '[]'::jsonb),
      'exige_selecao_carro', v_exige_selecao_carro,
      'ultimo_km', v_ultimo_km,
      'registro_teste', COALESCE(v.registro_teste, false),
      'veiculo_teste', COALESCE(v.veiculo_teste, '')
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.app_mecanico_registrar_abastecimento_posto(
  p_acesso_id uuid,
  p_posto_codigo text,
  p_valor numeric,
  p_litros numeric,
  p_combustivel text,
  p_km numeric,
  p_placa text DEFAULT NULL,
  p_observacao text DEFAULT NULL,
  p_foto_bomba_url text DEFAULT NULL,
  p_foto_painel_url text DEFAULT NULL,
  p_latitude double precision DEFAULT NULL,
  p_longitude double precision DEFAULT NULL,
  p_endereco text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.acessos_externos;
  p public.postos_combustivel;
  v_id uuid;
  v_placas text[];
  v_placa text;
  v_unidade text;
  v_empresa text;
  v_exige_selecao_carro boolean;
  v_ultimo_km numeric;
  v_preco_litro numeric;
  v_km_rodado numeric;
  v_recibo text;
BEGIN
  BEGIN
    v := public._app_mecanico_get_acesso(p_acesso_id);
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'acesso_nao_autorizado');
  END;

  IF COALESCE(p_foto_bomba_url, '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'foto_bomba_obrigatoria');
  END IF;

  IF COALESCE(p_foto_painel_url, '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'foto_painel_obrigatoria');
  END IF;

  IF COALESCE(p_valor, 0) <= 0 OR COALESCE(p_litros, 0) <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'valor_litros_obrigatorios');
  END IF;

  SELECT *
    INTO p
    FROM public.postos_combustivel
   WHERE upper(trim(codigo)) = upper(trim(coalesce(p_posto_codigo, '')))
     AND status = 'ativo'
     AND deleted_at IS NULL
   LIMIT 1;

  IF NOT FOUND OR COALESCE(p.tipo_qr, 'posto') = 'unidade' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'posto_invalido');
  END IF;

  IF COALESCE(v.registro_teste, false) THEN
    v_placas := ARRAY[COALESCE(NULLIF(v.placa_teste, ''), 'PEU0TST')];
  ELSE
    v_placas := public._app_mecanico_placas_from_obs(v.observacoes);
  END IF;

  v_unidade := upper(coalesce(p.unidade, ''));
  v_empresa := upper(coalesce(v.empresa, '') || ' ' || coalesce(v.filial, ''));
  v_exige_selecao_carro :=
    COALESCE(v.registro_teste, false) = false
    AND (
      v_unidade LIKE '%GOIANIA%'
      OR v_unidade LIKE '%PRAIA%'
      OR v_empresa LIKE '%GOIANIA%'
      OR v_empresa LIKE '%PRAIA%'
    );

  v_placa := upper(coalesce(nullif(p_placa, ''), CASE WHEN v_exige_selecao_carro THEN NULL ELSE v_placas[1] END));

  IF coalesce(v_placa, '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'placa_obrigatoria');
  END IF;

  SELECT a.km_atual
    INTO v_ultimo_km
    FROM public.abastecimentos a
   WHERE a.placa IS NOT NULL
     AND upper(replace(a.placa, '-', '')) = upper(replace(coalesce(v_placa, ''), '-', ''))
     AND a.km_atual IS NOT NULL
     AND COALESCE(a.excluido, false) = false
     AND COALESCE(a.registro_teste, false) = COALESCE(v.registro_teste, false)
   ORDER BY a.data DESC, a.hora DESC, a.created_at DESC
   LIMIT 1;

  v_preco_litro := round(COALESCE(p_valor, 0) / NULLIF(p_litros, 0), 3);
  v_km_rodado := CASE WHEN p_km IS NOT NULL AND v_ultimo_km IS NOT NULL AND p_km >= v_ultimo_km THEN p_km - v_ultimo_km ELSE NULL END;

  v_recibo := concat_ws(E'\n',
    CASE WHEN COALESCE(v.registro_teste, false) THEN 'TOPAC RH PRO - RECIBO DE ABASTECIMENTO (TESTE)' ELSE 'TOPAC RH PRO - RECIBO DE ABASTECIMENTO' END,
    'Funcionario: ' || COALESCE(v.nome, ''),
    'Empresa/Unidade: ' || COALESCE(v.empresa, '') || CASE WHEN COALESCE(v.filial, '') <> '' THEN ' - ' || v.filial ELSE '' END,
    'Veiculo: ' || COALESCE(v_placa, ''),
    'Posto: ' || COALESCE(p.nome, ''),
    'CNPJ: ' || COALESCE(p.cnpj, ''),
    'Endereco: ' || COALESCE(p.endereco, ''),
    'Telefone: ' || COALESCE(p.telefone, ''),
    'Combustivel: ' || COALESCE(p_combustivel, ''),
    'Litros: ' || COALESCE(p_litros::text, ''),
    'Valor por litro: ' || COALESCE(v_preco_litro::text, ''),
    'Valor total: ' || COALESCE(p_valor::text, ''),
    'KM: ' || COALESCE(p_km::text, ''),
    'Validado por: ' || COALESCE(v.nome, ''),
    'Data/Hora: ' || to_char(now(), 'DD/MM/YYYY HH24:MI:SS'),
    CASE WHEN COALESCE(v.registro_teste, false) THEN 'Registro de teste: nao impacta relatorios oficiais.' ELSE NULL END
  );

  INSERT INTO public.abastecimentos(
    qr_codigo, acesso_externo_id, funcionario_id, mecanico_nome, empresa, filial, placa,
    data, hora, combustivel, valor, litros, valor_por_litro, km_atual, km_rodado,
    posto_nome, posto_cnpj, posto_endereco, posto_id, posto_codigo, posto_telefone,
    foto_bomba_url, foto_painel_url, latitude, longitude, endereco, observacao,
    status, preenchimento, recibo_texto, recibo_gerado_em, validado_por,
    registro_teste, teste_chave
  ) VALUES (
    p.codigo, v.id, v.funcionario_id, v.nome, COALESCE(v.empresa, ''), COALESCE(v.filial, ''), NULLIF(v_placa, ''),
    CURRENT_DATE, CURRENT_TIME, NULLIF(p_combustivel, ''), COALESCE(p_valor, 0), COALESCE(p_litros, 0),
    v_preco_litro, p_km, v_km_rodado,
    p.nome, p.cnpj, p.endereco, p.id, p.codigo, p.telefone,
    p_foto_bomba_url, p_foto_painel_url, p_latitude, p_longitude, p_endereco, NULLIF(p_observacao, ''),
    'concluido', 'qr_posto', v_recibo, now(), v.nome,
    COALESCE(v.registro_teste, false), NULLIF(v.teste_chave, '')
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_id,
    'preco_litro', v_preco_litro,
    'valor_por_litro', v_preco_litro,
    'km_rodado', v_km_rodado,
    'recibo_texto', v_recibo,
    'registro_teste', COALESCE(v.registro_teste, false)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_criar_teste_rodrigo_mecanico(p_placa text DEFAULT 'PEU0TST')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cpf text := '38665547886';
  v_id uuid;
  v_placa text := upper(regexp_replace(COALESCE(NULLIF(p_placa, ''), 'PEU0TST'), '[^A-Za-z0-9]', '', 'g'));
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sem_permissao');
  END IF;

  IF length(v_placa) < 5 THEN
    v_placa := 'PEU0TST';
  END IF;

  INSERT INTO public.acessos_externos(
    nome, cpf, cpf_clean, pin, empresa, filial, funcao, perfil_acesso, modulo,
    status, acesso_liberado, funcionario_id, observacoes,
    registro_teste, teste_chave, veiculo_teste, placa_teste
  )
  VALUES (
    'Rodrigo de Souza Sabino',
    '386.655.478-86',
    v_cpf,
    right(v_cpf, 4),
    'TOPAC MATRIZ',
    'MATRIZ',
    'MECANICO TESTE',
    'mecanico_teste',
    'mecanico',
    'ativo',
    true,
    NULL,
    'TESTE - App dos Mecanicos/Ponto/Abastecimento. Carro vinculado: ' || v_placa || ' | Veiculo: Peugeot',
    true,
    'rodrigo-app-mecanico',
    'Peugeot',
    v_placa
  )
  ON CONFLICT (cpf_clean, modulo) DO UPDATE
  SET nome = EXCLUDED.nome,
      cpf = EXCLUDED.cpf,
      pin = EXCLUDED.pin,
      empresa = EXCLUDED.empresa,
      filial = EXCLUDED.filial,
      funcao = EXCLUDED.funcao,
      perfil_acesso = EXCLUDED.perfil_acesso,
      status = 'ativo',
      acesso_liberado = true,
      funcionario_id = NULL,
      observacoes = EXCLUDED.observacoes,
      registro_teste = true,
      teste_chave = 'rodrigo-app-mecanico',
      veiculo_teste = 'Peugeot',
      placa_teste = v_placa,
      updated_at = now()
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_id,
    'nome', 'Rodrigo de Souza Sabino',
    'pin', right(v_cpf, 4),
    'placa', v_placa,
    'link', '/acesso-mecanico'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_excluir_teste_rodrigo_mecanico()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids uuid[];
  v_pontos int := 0;
  v_abastecimentos int := 0;
  v_acessos int := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sem_permissao');
  END IF;

  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[])
    INTO v_ids
    FROM public.acessos_externos
   WHERE registro_teste = true
     AND teste_chave = 'rodrigo-app-mecanico';

  DELETE FROM public.registros_ponto
   WHERE registro_teste = true
     AND (
       teste_chave = 'rodrigo-app-mecanico'
       OR acesso_externo_id = ANY(v_ids)
     );
  GET DIAGNOSTICS v_pontos = ROW_COUNT;

  DELETE FROM public.abastecimentos
   WHERE registro_teste = true
     AND (
       teste_chave = 'rodrigo-app-mecanico'
       OR acesso_externo_id = ANY(v_ids)
     );
  GET DIAGNOSTICS v_abastecimentos = ROW_COUNT;

  DELETE FROM public.acessos_externos
   WHERE registro_teste = true
     AND teste_chave = 'rodrigo-app-mecanico';
  GET DIAGNOSTICS v_acessos = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'acessos_removidos', v_acessos,
    'pontos_removidos', v_pontos,
    'abastecimentos_removidos', v_abastecimentos
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.app_mecanico_validar_acesso(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acesso_externo_validar_pin(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_mecanico_registrar_ponto(uuid, text, double precision, double precision, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_mecanico_listar_historico(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_app_mecanico_historico(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.app_mecanico_validar_qr_posto(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_mecanico_registrar_abastecimento_posto(uuid, text, numeric, numeric, text, numeric, text, text, text, text, double precision, double precision, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_criar_teste_rodrigo_mecanico(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_excluir_teste_rodrigo_mecanico() TO authenticated;

SELECT public.admin_criar_teste_rodrigo_mecanico('PEU0TST');

NOTIFY pgrst, 'reload schema';