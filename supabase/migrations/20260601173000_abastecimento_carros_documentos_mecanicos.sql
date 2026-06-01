CREATE OR REPLACE FUNCTION public.topac_placa_from_ativo(p_placa text, p_descricao text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_placa text;
  v_match text[];
BEGIN
  v_placa := upper(regexp_replace(coalesce(p_placa, ''), '[^A-Z0-9]', '', 'g'));
  IF v_placa <> '' THEN
    RETURN v_placa;
  END IF;

  v_match := regexp_match(upper(coalesce(p_descricao, '')), '([A-Z]{3}[0-9][A-Z0-9][0-9]{2})');
  IF v_match IS NOT NULL THEN
    RETURN v_match[1];
  END IF;

  RETURN '';
END;
$$;

GRANT EXECUTE ON FUNCTION public.topac_placa_from_ativo(text, text) TO anon, authenticated;

WITH placas(placa) AS (
  VALUES
    ('PTZ6I45'),
    ('TLK4H52'),
    ('STT6J03'),
    ('SUI1F53'),
    ('GEK6828'),
    ('TMC7G68')
)
UPDATE public.ativos a
   SET placa = p.placa,
       updated_at = now()
  FROM placas p
 WHERE a.tipo = 'veiculo'
   AND coalesce(a.placa, '') = ''
   AND upper(regexp_replace(coalesce(a.descricao, ''), '[^A-Z0-9]', '', 'g')) LIKE '%' || p.placa || '%';

WITH mapa(nome1, nome2, placa) AS (
  VALUES
    ('JERRI', '', 'PTZ6I45'),
    ('DIEGO', '', 'TLK4H52'),
    ('LEANDRO', '', 'STT6J03'),
    ('TIAGO', 'DIAS', 'SUI1F53'),
    ('NACIEL', '', 'GEK6828'),
    ('TIAGO', 'MOREIRA', 'TMC7G68')
)
UPDATE public.acessos_externos ae
   SET observacoes = trim(both E'\n' FROM concat_ws(E'\n',
       nullif(regexp_replace(coalesce(ae.observacoes, ''), 'CARRO[S]?[[:space:]]+VINCULADO[S]?[[:space:]]*:[^\n\r]*', '', 'gi'), ''),
       'Carros vinculados: ' || mapa.placa
     )),
       updated_at = now()
  FROM mapa
 WHERE ae.modulo = 'mecanico'
   AND upper(ae.nome) LIKE '%' || mapa.nome1 || '%'
   AND (mapa.nome2 = '' OR upper(ae.nome) LIKE '%' || mapa.nome2 || '%');

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

  v_placas := public._app_mecanico_placas_from_obs(v.observacoes);
  v_unidade := upper(coalesce(p.unidade, ''));
  v_empresa := upper(coalesce(v.empresa, '') || ' ' || coalesce(v.filial, ''));
  v_exige_selecao_carro := v_unidade LIKE '%GOIANIA%' OR v_unidade LIKE '%PRAIA%' OR v_empresa LIKE '%GOIANIA%' OR v_empresa LIKE '%PRAIA%';
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
        'id', px.id, 'codigo', px.codigo, 'nome', px.nome, 'unidade', px.unidade,
        'cnpj', px.cnpj, 'endereco', px.endereco, 'telefone', px.telefone, 'tipo_qr', px.tipo_qr
      ) ORDER BY px.codigo), '[]'::jsonb)
      INTO v_postos
      FROM public.postos_combustivel px
     WHERE px.codigo = ANY(COALESCE(p.posto_opcoes, ARRAY[]::text[]))
       AND px.status = 'ativo'
       AND px.deleted_at IS NULL;
  END IF;

  SELECT a.km_atual INTO v_ultimo_km
    FROM public.abastecimentos a
   WHERE a.placa IS NOT NULL
     AND upper(replace(a.placa, '-', '')) = upper(replace(coalesce(v_placa, v_placas[1], ''), '-', ''))
     AND a.km_atual IS NOT NULL
     AND COALESCE(a.excluido, false) = false
   ORDER BY a.data DESC, a.hora DESC, a.created_at DESC
   LIMIT 1;

  RETURN jsonb_build_object(
    'ok', true,
    'posto', jsonb_build_object('id', p.id, 'codigo', p.codigo, 'nome', p.nome, 'unidade', p.unidade, 'cnpj', p.cnpj, 'endereco', p.endereco, 'telefone', p.telefone, 'tipo_qr', COALESCE(p.tipo_qr, 'posto')),
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

GRANT EXECUTE ON FUNCTION public.app_mecanico_validar_qr_posto(uuid, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
