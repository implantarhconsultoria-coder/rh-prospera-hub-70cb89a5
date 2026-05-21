-- TOPAC RH PRO - abastecimento QR por unidade/posto e recibo mobile.
-- Mantem o fluxo existente e reforca dados reais do posto no historico.

ALTER TABLE public.postos_combustivel
  ADD COLUMN IF NOT EXISTS unidade text,
  ADD COLUMN IF NOT EXISTS tipo_qr text DEFAULT 'posto',
  ADD COLUMN IF NOT EXISTS posto_opcoes text[] DEFAULT ARRAY[]::text[];

ALTER TABLE public.abastecimentos
  ADD COLUMN IF NOT EXISTS valor_por_litro numeric,
  ADD COLUMN IF NOT EXISTS km_rodado numeric,
  ADD COLUMN IF NOT EXISTS recibo_texto text,
  ADD COLUMN IF NOT EXISTS recibo_gerado_em timestamptz,
  ADD COLUMN IF NOT EXISTS validado_por text,
  ADD COLUMN IF NOT EXISTS posto_telefone text;

INSERT INTO public.postos_combustivel(codigo, nome, unidade, cnpj, endereco, telefone, status, observacao, tipo_qr, posto_opcoes)
VALUES
  (
    'COMB-SP-001',
    'Posto de Servicos Sao Donato LTDA',
    'TOPAC MATRIZ',
    NULL,
    'Rua Anhaia, 1092, Bom Retiro, Sao Paulo/SP, CEP 01130-000',
    NULL,
    'ativo',
    'QR unico da Matriz. Carro preenchido automaticamente pelo login do mecanico.',
    'posto',
    ARRAY[]::text[]
  ),
  (
    'COMB-PG-001',
    'AUTO POSTO XIXOVA LTDA',
    'TOPAC PRAIA GRANDE',
    '46.778.064/0001-19',
    'Avenida Ayrton Senna da Silva, 500, Xixova, Praia Grande/SP, CEP 11726-500',
    NULL,
    'ativo',
    'QR unico da Praia Grande. App exige selecao do carro.',
    'posto',
    ARRAY[]::text[]
  ),
  (
    'COMB-GO-000',
    'TOPAC GOIANIA - Selecionar posto',
    'TOPAC GOIANIA',
    NULL,
    'Goiania/GO',
    NULL,
    'ativo',
    'QR unico de Goiania. App abre a selecao dos postos cadastrados.',
    'unidade',
    ARRAY['COMB-GO-001','COMB-GO-002']::text[]
  ),
  (
    'COMB-GO-001',
    'Posto Z + Z Sao Judas Tadeu LTDA',
    'TOPAC GOIANIA',
    '13.759.928/0001-04',
    'Avenida Presidente Kenedy, 1675, Quadra 49, Lote 01E, Vila Jardim Sao Judas Tadeu, Goiania/GO, CEP 74685-830',
    '(62) 98436-1976',
    'ativo',
    'Posto Goiania 1. App exige selecao do carro.',
    'posto',
    ARRAY[]::text[]
  ),
  (
    'COMB-GO-002',
    'Auto Posto Indianapolis LTDA',
    'TOPAC GOIANIA',
    '07.517.547/0001-08',
    'Av. Perimetral Norte, 7354, Jardim Diamantina, Goiania/GO, CEP 74595-350',
    '(62) 3945-0984',
    'ativo',
    'Posto Goiania 2. App exige selecao do carro.',
    'posto',
    ARRAY[]::text[]
  )
ON CONFLICT (codigo) DO UPDATE
SET nome = EXCLUDED.nome,
    unidade = EXCLUDED.unidade,
    cnpj = EXCLUDED.cnpj,
    endereco = EXCLUDED.endereco,
    telefone = EXCLUDED.telefone,
    status = 'ativo',
    observacao = EXCLUDED.observacao,
    tipo_qr = EXCLUDED.tipo_qr,
    posto_opcoes = EXCLUDED.posto_opcoes,
    updated_at = now();

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

  v_placas := public._app_mecanico_placas_from_obs(v.observacoes);
  v_unidade := upper(coalesce(p.unidade, ''));
  v_empresa := upper(coalesce(v.empresa, '') || ' ' || coalesce(v.filial, ''));
  v_exige_selecao_carro :=
    v_unidade LIKE '%GOIANIA%'
    OR v_unidade LIKE '%PRAIA%'
    OR v_empresa LIKE '%GOIANIA%'
    OR v_empresa LIKE '%PRAIA%';

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
      'ultimo_km', v_ultimo_km
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

  v_placas := public._app_mecanico_placas_from_obs(v.observacoes);
  v_unidade := upper(coalesce(p.unidade, ''));
  v_empresa := upper(coalesce(v.empresa, '') || ' ' || coalesce(v.filial, ''));
  v_exige_selecao_carro :=
    v_unidade LIKE '%GOIANIA%'
    OR v_unidade LIKE '%PRAIA%'
    OR v_empresa LIKE '%GOIANIA%'
    OR v_empresa LIKE '%PRAIA%';

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
   ORDER BY a.data DESC, a.hora DESC, a.created_at DESC
   LIMIT 1;

  v_preco_litro := round(COALESCE(p_valor, 0) / NULLIF(p_litros, 0), 3);
  v_km_rodado := CASE WHEN p_km IS NOT NULL AND v_ultimo_km IS NOT NULL AND p_km >= v_ultimo_km THEN p_km - v_ultimo_km ELSE NULL END;

  v_recibo := concat_ws(E'\n',
    'TOPAC RH PRO - RECIBO DE ABASTECIMENTO',
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
    'Data/Hora: ' || to_char(now(), 'DD/MM/YYYY HH24:MI:SS')
  );

  INSERT INTO public.abastecimentos(
    qr_codigo, acesso_externo_id, funcionario_id, mecanico_nome, empresa, filial, placa,
    data, hora, combustivel, valor, litros, valor_por_litro, km_atual, km_rodado,
    posto_nome, posto_cnpj, posto_endereco, posto_id, posto_codigo, posto_telefone,
    foto_bomba_url, foto_painel_url, latitude, longitude, endereco, observacao,
    status, preenchimento, recibo_texto, recibo_gerado_em, validado_por
  ) VALUES (
    p.codigo, v.id, v.funcionario_id, v.nome, COALESCE(v.empresa, ''), COALESCE(v.filial, ''), NULLIF(v_placa, ''),
    CURRENT_DATE, CURRENT_TIME, NULLIF(p_combustivel, ''), COALESCE(p_valor, 0), COALESCE(p_litros, 0),
    v_preco_litro, p_km, v_km_rodado,
    p.nome, p.cnpj, p.endereco, p.id, p.codigo, p.telefone,
    p_foto_bomba_url, p_foto_painel_url, p_latitude, p_longitude, p_endereco, NULLIF(p_observacao, ''),
    'concluido', 'qr_posto', v_recibo, now(), v.nome
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_id,
    'preco_litro', v_preco_litro,
    'valor_por_litro', v_preco_litro,
    'km_rodado', v_km_rodado,
    'recibo_texto', v_recibo
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.app_mecanico_validar_qr_posto(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_mecanico_registrar_abastecimento_posto(uuid, text, numeric, numeric, text, numeric, text, text, text, text, double precision, double precision, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
