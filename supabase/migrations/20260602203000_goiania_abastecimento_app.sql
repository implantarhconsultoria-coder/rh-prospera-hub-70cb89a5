ALTER TABLE public.abastecimentos
  ADD COLUMN IF NOT EXISTS foto_placa_url text;

WITH veiculos(descricao, placa) AS (
  VALUES
    ('Honda/CG 150 Sport', 'NFX8173'),
    ('VW/Gol 1.0L MC5', 'QTP6H84'),
    ('VW/Nova Saveiro CS', 'OMV6480'),
    ('Chevrolet/Montana LS2', 'FYC6433'),
    ('VW/Nova Saveiro CS', 'FLN9450')
)
UPDATE public.ativos a
   SET descricao = v.descricao,
       placa = v.placa,
       empresa = 'TOPAC FILIAL GOIANIA',
       tipo = 'veiculo',
       status = 'ativo',
       observacao = trim(both E'\n' FROM concat_ws(E'\n',
         nullif(coalesce(a.observacao, ''), ''),
         'Liberado para abastecimento QR Code Goiania'
       )),
       updated_at = now()
  FROM veiculos v
 WHERE a.tipo = 'veiculo'
   AND public.topac_placa_from_ativo(a.placa, a.descricao) = v.placa;

WITH veiculos(descricao, placa) AS (
  VALUES
    ('Honda/CG 150 Sport', 'NFX8173'),
    ('VW/Gol 1.0L MC5', 'QTP6H84'),
    ('VW/Nova Saveiro CS', 'OMV6480'),
    ('Chevrolet/Montana LS2', 'FYC6433'),
    ('VW/Nova Saveiro CS', 'FLN9450')
)
INSERT INTO public.ativos(tipo, descricao, placa, empresa, status, observacao)
SELECT 'veiculo',
       v.descricao,
       v.placa,
       'TOPAC FILIAL GOIANIA',
       'ativo',
       'Liberado para abastecimento QR Code Goiania'
  FROM veiculos v
 WHERE NOT EXISTS (
   SELECT 1
     FROM public.ativos a
    WHERE a.tipo = 'veiculo'
      AND public.topac_placa_from_ativo(a.placa, a.descricao) = v.placa
 );

WITH alvos(nome1, nome2) AS (
  VALUES
    ('FRANCINALDO', 'GIL'),
    ('ABINADAB', ''),
    ('IGOR', 'ABREU'),
    ('NATAN', 'ALVES'),
    ('PAULO', 'ALVES'),
    ('GABRIEL', 'SOUZA'),
    ('ALDENEI', '')
),
base AS (
  SELECT DISTINCT ON (regexp_replace(coalesce(f.cpf, ''), '[^0-9]', '', 'g'))
         f.id AS funcionario_id,
         f.nome,
         f.cpf,
         regexp_replace(coalesce(f.cpf, ''), '[^0-9]', '', 'g') AS cpf_clean,
         COALESCE(NULLIF(f.cargo, ''), 'Operacional') AS funcao,
         COALESCE(NULLIF(e.nome, ''), 'TOPAC FILIAL GOIANIA') AS empresa,
         COALESCE(NULLIF(e.cidade, ''), 'GOIANIA') AS filial
    FROM public.funcionarios f
    LEFT JOIN public.empresas e ON e.id = f.company_id
    JOIN alvos a
      ON upper(f.nome) LIKE '%' || a.nome1 || '%'
     AND (a.nome2 = '' OR upper(f.nome) LIKE '%' || a.nome2 || '%')
   WHERE length(regexp_replace(coalesce(f.cpf, ''), '[^0-9]', '', 'g')) = 11
     AND (
       upper(coalesce(e.nome, '')) LIKE '%GOI%'
       OR upper(coalesce(e.codigo, '')) LIKE '%GYN%'
       OR upper(coalesce(e.cidade, '')) LIKE '%GOI%'
     )
   ORDER BY regexp_replace(coalesce(f.cpf, ''), '[^0-9]', '', 'g'), f.nome
)
INSERT INTO public.acessos_externos(
  nome, cpf, cpf_clean, pin, empresa, filial, funcao,
  perfil_acesso, modulo, status, acesso_liberado, funcionario_id, observacoes
)
SELECT b.nome,
       b.cpf_clean,
       b.cpf_clean,
       right(b.cpf_clean, 4),
       'TOPAC FILIAL GOIANIA',
       COALESCE(NULLIF(b.filial, ''), 'GOIANIA'),
       b.funcao,
       'mecanico_externo',
       'mecanico',
       'ativo',
       true,
       b.funcionario_id,
       '{"origem":"liberacao_app_goiania_abastecimento","motorista_fixo":false,"exige_selecao_carro":true,"veiculos_livres_goiania":true}'
  FROM base b
ON CONFLICT (cpf_clean, modulo) DO UPDATE
   SET nome = EXCLUDED.nome,
       empresa = EXCLUDED.empresa,
       filial = EXCLUDED.filial,
       funcao = EXCLUDED.funcao,
       perfil_acesso = 'mecanico_externo',
       status = 'ativo',
       acesso_liberado = true,
       funcionario_id = EXCLUDED.funcionario_id,
       observacoes = EXCLUDED.observacoes,
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
  v_is_goiania boolean;
  v_exige_selecao_carro boolean;
  v_postos jsonb := '[]'::jsonb;
  v_veiculos jsonb := '[]'::jsonb;
BEGIN
  BEGIN
    v := public._app_mecanico_get_acesso(p_acesso_id);
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'acesso_nao_autorizado');
  END;

  v_codigo := upper(trim(coalesce(p_codigo, '')));
  SELECT * INTO p
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

  v_unidade := upper(coalesce(p.unidade, ''));
  v_empresa := upper(coalesce(v.empresa, '') || ' ' || coalesce(v.filial, ''));
  v_is_goiania := v_unidade LIKE '%GOI%' OR v_empresa LIKE '%GOI%';
  v_exige_selecao_carro :=
    v_is_goiania
    OR v_unidade LIKE '%PRAIA%'
    OR v_empresa LIKE '%PRAIA%';

  IF v_is_goiania THEN
    v_placas := ARRAY['NFX8173', 'QTP6H84', 'OMV6480', 'FYC6433', 'FLN9450'];
  ELSE
    v_placas := public._app_mecanico_placas_from_obs(v.observacoes);
  END IF;

  v_placa := CASE WHEN v_exige_selecao_carro THEN NULL ELSE NULLIF(v_placas[1], '') END;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'ativo_id', av.id,
      'placa', COALESCE(NULLIF(av.placa_norm, ''), x.placa),
      'descricao', COALESCE(NULLIF(av.descricao, ''), x.placa),
      'renavam', COALESCE(av.renavam, ''),
      'chassi', COALESCE(av.chassi, ''),
      'ano_fabricacao', COALESCE(av.ano_fabricacao, ''),
      'ano_modelo', COALESCE(av.ano_modelo, ''),
      'documento_url', COALESCE(av.arquivo_url, '')
    ) ORDER BY x.placa), '[]'::jsonb)
    INTO v_veiculos
    FROM unnest(COALESCE(v_placas, ARRAY[]::text[])) AS x(placa)
    LEFT JOIN LATERAL (
      SELECT a.*,
             public.topac_placa_from_ativo(a.placa, a.descricao) AS placa_norm
        FROM public.ativos a
       WHERE a.tipo = 'veiculo'
         AND public.topac_placa_from_ativo(a.placa, a.descricao) = upper(regexp_replace(x.placa, '[^A-Z0-9]', '', 'g'))
       ORDER BY CASE WHEN coalesce(a.arquivo_url, '') <> '' THEN 0 ELSE 1 END,
                a.updated_at DESC NULLS LAST
       LIMIT 1
    ) av ON true;

  IF COALESCE(p.tipo_qr, 'posto') = 'unidade' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', px.id,
        'codigo', px.codigo,
        'nome', px.nome,
        'unidade', px.unidade,
        'cnpj', px.cnpj,
        'endereco', px.endereco,
        'telefone', px.telefone,
        'tipo_qr', px.tipo_qr
      ) ORDER BY px.codigo), '[]'::jsonb)
      INTO v_postos
      FROM public.postos_combustivel px
     WHERE px.codigo = ANY(COALESCE(p.posto_opcoes, ARRAY[]::text[]))
       AND px.status = 'ativo'
       AND px.deleted_at IS NULL;
  END IF;

  IF v_placa IS NOT NULL THEN
    SELECT a.km_atual INTO v_ultimo_km
      FROM public.abastecimentos a
     WHERE a.placa IS NOT NULL
       AND upper(regexp_replace(a.placa, '[^A-Z0-9]', '', 'g')) = upper(regexp_replace(v_placa, '[^A-Z0-9]', '', 'g'))
       AND a.km_atual IS NOT NULL
       AND COALESCE(a.excluido, false) = false
     ORDER BY a.data DESC, a.hora DESC, a.created_at DESC
     LIMIT 1;
  END IF;

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
      'veiculos', v_veiculos,
      'exige_selecao_carro', v_exige_selecao_carro,
      'ultimo_km', v_ultimo_km
    )
  );
END;
$$;

DROP FUNCTION IF EXISTS public.app_mecanico_registrar_abastecimento_posto(
  uuid, text, numeric, numeric, text, numeric, text, text, text, text, double precision, double precision, text
);

DROP FUNCTION IF EXISTS public.app_mecanico_registrar_abastecimento_posto(
  uuid, text, numeric, numeric, text, numeric, text, text, text, text, text, double precision, double precision, text
);

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
  p_foto_placa_url text DEFAULT NULL,
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
  v_is_goiania boolean;
  v_exige_selecao_carro boolean;
  v_ultimo_km numeric;
  v_preco_litro numeric;
  v_km_rodado numeric;
  v_recibo text;
  v_agora timestamp;
BEGIN
  BEGIN
    v := public._app_mecanico_get_acesso(p_acesso_id);
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'acesso_nao_autorizado');
  END;

  IF COALESCE(p_foto_placa_url, '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'foto_placa_obrigatoria');
  END IF;

  IF COALESCE(p_foto_bomba_url, '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'foto_bomba_obrigatoria');
  END IF;

  IF COALESCE(p_foto_painel_url, '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'foto_painel_obrigatoria');
  END IF;

  IF COALESCE(p_valor, 0) <= 0 OR COALESCE(p_litros, 0) <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'valor_litros_obrigatorios');
  END IF;

  IF COALESCE(p_km, 0) <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'km_obrigatorio');
  END IF;

  SELECT * INTO p
    FROM public.postos_combustivel
   WHERE upper(trim(codigo)) = upper(trim(coalesce(p_posto_codigo, '')))
     AND status = 'ativo'
     AND deleted_at IS NULL
   LIMIT 1;

  IF NOT FOUND OR COALESCE(p.tipo_qr, 'posto') = 'unidade' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'posto_invalido');
  END IF;

  v_unidade := upper(coalesce(p.unidade, ''));
  v_empresa := upper(coalesce(v.empresa, '') || ' ' || coalesce(v.filial, ''));
  v_is_goiania := v_unidade LIKE '%GOI%' OR v_empresa LIKE '%GOI%';
  v_exige_selecao_carro :=
    v_is_goiania
    OR v_unidade LIKE '%PRAIA%'
    OR v_empresa LIKE '%PRAIA%';

  IF v_is_goiania THEN
    v_placas := ARRAY['NFX8173', 'QTP6H84', 'OMV6480', 'FYC6433', 'FLN9450'];
  ELSE
    v_placas := public._app_mecanico_placas_from_obs(v.observacoes);
  END IF;

  v_placa := upper(regexp_replace(coalesce(nullif(p_placa, ''), CASE WHEN v_exige_selecao_carro THEN NULL ELSE v_placas[1] END), '[^A-Z0-9]', '', 'g'));

  IF coalesce(v_placa, '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'placa_obrigatoria');
  END IF;

  IF v_is_goiania AND NOT (v_placa = ANY(v_placas)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'veiculo_fora_goiania');
  END IF;

  SELECT a.km_atual INTO v_ultimo_km
    FROM public.abastecimentos a
   WHERE a.placa IS NOT NULL
     AND upper(regexp_replace(a.placa, '[^A-Z0-9]', '', 'g')) = v_placa
     AND a.km_atual IS NOT NULL
     AND COALESCE(a.excluido, false) = false
   ORDER BY a.data DESC, a.hora DESC, a.created_at DESC
   LIMIT 1;

  IF v_ultimo_km IS NOT NULL AND p_km < v_ultimo_km THEN
    RETURN jsonb_build_object('ok', false, 'error', 'km_menor_que_anterior', 'ultimo_km', v_ultimo_km);
  END IF;

  v_preco_litro := round(COALESCE(p_valor, 0) / NULLIF(p_litros, 0), 3);

  IF v_preco_litro < 1.5 OR v_preco_litro > 30 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'preco_litro_fora_padrao', 'preco_litro', v_preco_litro);
  END IF;

  v_km_rodado := CASE WHEN p_km IS NOT NULL AND v_ultimo_km IS NOT NULL THEN p_km - v_ultimo_km ELSE NULL END;
  v_agora := timezone('America/Sao_Paulo', now());

  v_recibo := concat_ws(E'\n',
    'TOPAC RH PRO - RECIBO DE ABASTECIMENTO',
    'Funcionario: ' || COALESCE(v.nome, ''),
    'Empresa/Unidade: ' || COALESCE(v.empresa, '') || CASE WHEN COALESCE(v.filial, '') <> '' THEN ' - ' || v.filial ELSE '' END,
    'Veiculo/Placa: ' || COALESCE(v_placa, ''),
    'Posto: ' || COALESCE(p.nome, ''),
    'CNPJ: ' || COALESCE(p.cnpj, ''),
    'Endereco: ' || COALESCE(p.endereco, ''),
    'Telefone: ' || COALESCE(p.telefone, ''),
    'Combustivel: ' || COALESCE(p_combustivel, ''),
    'Litros: ' || COALESCE(p_litros::text, ''),
    'Valor por litro: ' || COALESCE(v_preco_litro::text, ''),
    'Valor total: ' || COALESCE(p_valor::text, ''),
    'KM: ' || COALESCE(p_km::text, ''),
    'Foto da frente/placa: ' || COALESCE(p_foto_placa_url, ''),
    'Foto da bomba: ' || COALESCE(p_foto_bomba_url, ''),
    'Foto do painel/KM: ' || COALESCE(p_foto_painel_url, ''),
    'Validado por: ' || COALESCE(v.nome, ''),
    'Data/Hora: ' || to_char(v_agora, 'DD/MM/YYYY HH24:MI:SS')
  );

  INSERT INTO public.abastecimentos(
    qr_codigo, acesso_externo_id, funcionario_id, mecanico_nome, empresa, filial, placa,
    data, hora, competencia, combustivel, valor, litros, valor_por_litro, km_atual, km_rodado,
    posto_nome, posto_cnpj, posto_endereco, posto_id, posto_codigo, posto_telefone,
    foto_placa_url, foto_bomba_url, foto_painel_url, latitude, longitude, endereco, observacao,
    status, preenchimento, recibo_texto, recibo_gerado_em, validado_por
  ) VALUES (
    p.codigo, v.id, v.funcionario_id, v.nome, COALESCE(v.empresa, ''), COALESCE(v.filial, ''), NULLIF(v_placa, ''),
    v_agora::date, v_agora::time, to_char(v_agora, 'YYYY-MM'), NULLIF(p_combustivel, ''), COALESCE(p_valor, 0), COALESCE(p_litros, 0),
    v_preco_litro, p_km, v_km_rodado,
    p.nome, p.cnpj, p.endereco, p.id, p.codigo, p.telefone,
    p_foto_placa_url, p_foto_bomba_url, p_foto_painel_url, p_latitude, p_longitude, p_endereco, NULLIF(p_observacao, ''),
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

CREATE OR REPLACE FUNCTION public.admin_app_mecanico_historico(p_acesso_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.acessos_externos;
  v_user uuid;
  v_pontos jsonb;
  v_abastecimentos jsonb;
BEGIN
  SELECT * INTO v
  FROM public.acessos_externos
  WHERE id = p_acesso_id
    AND modulo = 'mecanico';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'mecanico_nao_encontrado');
  END IF;

  v_user := COALESCE(v.profile_user_id, v.id);

  SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.data DESC, p.hora DESC), '[]'::jsonb)
    INTO v_pontos
    FROM (
      SELECT id, tipo, data, hora, latitude, longitude, endereco_formatado, selfie_url,
             dispositivo, registro_teste, created_at
        FROM public.registros_ponto
       WHERE user_id = v_user
       ORDER BY data DESC, hora DESC
       LIMIT 120
    ) p;

  SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.data DESC, a.hora DESC), '[]'::jsonb)
    INTO v_abastecimentos
    FROM (
      SELECT id, data, hora, mecanico_nome, empresa, filial, placa, posto_nome, posto_cnpj,
             combustivel, litros, valor_por_litro, valor, km_atual, km_rodado, status, observacao,
             foto_placa_url, foto_bomba_url, foto_painel_url, latitude, longitude, endereco,
             registro_teste, recibo_texto
        FROM public.abastecimentos
       WHERE acesso_externo_id = v.id
         AND COALESCE(excluido, false) = false
       ORDER BY data DESC, hora DESC
       LIMIT 120
    ) a;

  RETURN jsonb_build_object(
    'ok', true,
    'mecanico', jsonb_build_object(
      'id', v.id,
      'nome', v.nome,
      'empresa', v.empresa,
      'filial', v.filial,
      'funcao', v.funcao
    ),
    'pontos', v_pontos,
    'abastecimentos', v_abastecimentos
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.app_mecanico_validar_qr_posto(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_mecanico_registrar_abastecimento_posto(uuid, text, numeric, numeric, text, numeric, text, text, text, text, text, double precision, double precision, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_app_mecanico_historico(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
