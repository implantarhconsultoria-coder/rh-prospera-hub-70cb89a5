-- Links diretos temporarios para operacao TOPAC sem validacao de e-mail.

CREATE OR REPLACE FUNCTION public.topac_acesso_direto_link(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slug text := lower(trim(COALESCE(p_slug, '')));
  v_titulo text := '';
  v_nome text := '';
  v_rows jsonb := '[]'::jsonb;
BEGIN
  IF v_slug IN ('mecanicos', 'mecanico', 'campo') THEN
    RETURN jsonb_build_object('ok', true, 'redirect', '/modulos');
  END IF;

  IF v_slug IN ('praia-grande', 'praia', 'pg') THEN
    v_titulo := 'Praia Grande';
    v_nome := 'Acesso Praia Grande';

    SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.modulo), '[]'::jsonb)
      INTO v_rows
      FROM (
        SELECT DISTINCT ON (a.modulo)
          a.id::text AS acesso_id,
          a.modulo,
          COALESCE(a.perfil_acesso, a.modulo) AS perfil_acesso,
          COALESCE(a.empresa, '') AS empresa,
          COALESCE(a.filial, '') AS filial,
          COALESCE(a.funcao, '') AS funcao,
          COALESCE(a.nome, v_nome) AS nome,
          COALESCE(a.cpf_clean, '') AS cpf_clean
        FROM public.acessos_externos a
        WHERE a.modulo IN ('filial', 'faturamento')
          AND a.status = 'ativo'
          AND a.acesso_liberado = true
          AND COALESCE(a.ativo, true) = true
          AND (upper(COALESCE(a.empresa, '')) LIKE '%PRAIA%' OR upper(COALESCE(a.filial, '')) LIKE '%PRAIA%')
        ORDER BY a.modulo,
          CASE
            WHEN upper(COALESCE(a.funcao, '')) LIKE '%GERENTE%' THEN 0
            WHEN upper(COALESCE(a.nome, '')) LIKE '%ANTONIO%' THEN 1
            ELSE 9
          END,
          a.created_at
      ) x;
  ELSIF v_slug IN ('goiania', 'goiania-go', 'go') THEN
    v_titulo := 'Goiania';
    v_nome := 'Acesso Goiania';

    SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.modulo), '[]'::jsonb)
      INTO v_rows
      FROM (
        SELECT DISTINCT ON (a.modulo)
          a.id::text AS acesso_id,
          a.modulo,
          COALESCE(a.perfil_acesso, a.modulo) AS perfil_acesso,
          COALESCE(a.empresa, '') AS empresa,
          COALESCE(a.filial, '') AS filial,
          COALESCE(a.funcao, '') AS funcao,
          COALESCE(a.nome, v_nome) AS nome,
          COALESCE(a.cpf_clean, '') AS cpf_clean
        FROM public.acessos_externos a
        WHERE a.modulo IN ('filial', 'faturamento')
          AND a.status = 'ativo'
          AND a.acesso_liberado = true
          AND COALESCE(a.ativo, true) = true
          AND (
            upper(COALESCE(a.empresa, '')) LIKE '%GOIAN%'
            OR upper(COALESCE(a.filial, '')) LIKE '%GOIAN%'
            OR upper(COALESCE(a.empresa, '')) LIKE '%GOIÂN%'
            OR upper(COALESCE(a.filial, '')) LIKE '%GOIÂN%'
          )
        ORDER BY a.modulo,
          CASE
            WHEN upper(COALESCE(a.funcao, '')) LIKE '%GERENTE%' THEN 0
            ELSE 9
          END,
          a.created_at
      ) x;
  ELSIF v_slug IN ('faturamento-sp', 'faturamento-matriz', 'matriz-faturamento', 'sp') THEN
    v_titulo := 'Faturamento Sao Paulo';
    v_nome := 'Faturamento Sao Paulo';

    SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.modulo), '[]'::jsonb)
      INTO v_rows
      FROM (
        SELECT DISTINCT ON (a.modulo)
          a.id::text AS acesso_id,
          a.modulo,
          COALESCE(a.perfil_acesso, a.modulo) AS perfil_acesso,
          COALESCE(a.empresa, '') AS empresa,
          COALESCE(a.filial, '') AS filial,
          COALESCE(a.funcao, '') AS funcao,
          COALESCE(a.nome, v_nome) AS nome,
          COALESCE(a.cpf_clean, '') AS cpf_clean
        FROM public.acessos_externos a
        WHERE a.modulo = 'faturamento'
          AND a.status = 'ativo'
          AND a.acesso_liberado = true
          AND COALESCE(a.ativo, true) = true
          AND (
            upper(COALESCE(a.filial, '')) LIKE '%SAO PAULO%'
            OR upper(COALESCE(a.filial, '')) LIKE '%SÃO PAULO%'
            OR upper(COALESCE(a.empresa, '')) LIKE '%MATRIZ%'
          )
        ORDER BY a.modulo,
          CASE
            WHEN public.topac_norm_text(a.nome) LIKE '%rafaela%' THEN 0
            WHEN public.topac_norm_text(a.nome) LIKE '%douglas%' THEN 1
            WHEN public.topac_norm_text(a.nome) LIKE '%kayky%' THEN 2
            ELSE 9
          END,
          a.created_at
      ) x;
  ELSIF v_slug IN ('paula', 'paula-financeiro', 'paula-faturamento') THEN
    v_titulo := 'Paula - Financeiro e Faturamento';
    v_nome := 'Paula Rubia Faquini Goncalves';

    SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.modulo), '[]'::jsonb)
      INTO v_rows
      FROM (
        SELECT DISTINCT ON (a.modulo)
          a.id::text AS acesso_id,
          a.modulo,
          COALESCE(a.perfil_acesso, a.modulo) AS perfil_acesso,
          COALESCE(a.empresa, '') AS empresa,
          COALESCE(a.filial, '') AS filial,
          COALESCE(a.funcao, '') AS funcao,
          COALESCE(a.nome, v_nome) AS nome,
          COALESCE(a.cpf_clean, '') AS cpf_clean
        FROM public.acessos_externos a
        WHERE a.cpf_clean = '19459791867'
          AND a.modulo IN ('financeiro', 'faturamento')
          AND a.status = 'ativo'
          AND a.acesso_liberado = true
          AND COALESCE(a.ativo, true) = true
        ORDER BY a.modulo, a.created_at
      ) x;
  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'link_nao_encontrado');
  END IF;

  IF jsonb_array_length(v_rows) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sem_acesso_configurado', 'titulo', v_titulo);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'slug', v_slug,
    'titulo', v_titulo,
    'nome', v_nome,
    'cpf_clean', COALESCE(v_rows->0->>'cpf_clean', 'link-direto'),
    'portais', v_rows
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.topac_acesso_direto_link(text) TO anon, authenticated;
