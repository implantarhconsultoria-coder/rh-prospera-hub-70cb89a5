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
             foto_bomba_url, foto_painel_url, latitude, longitude, endereco, registro_teste, recibo_texto
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

GRANT EXECUTE ON FUNCTION public.admin_app_mecanico_historico(uuid) TO authenticated;
