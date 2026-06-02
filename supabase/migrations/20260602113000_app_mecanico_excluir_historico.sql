CREATE OR REPLACE FUNCTION public.admin_app_mecanico_excluir_ponto(
  p_acesso_id uuid,
  p_ponto_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.acessos_externos;
  v_user uuid;
  v_removidos integer := 0;
BEGIN
  SELECT * INTO v
  FROM public.acessos_externos
  WHERE id = p_acesso_id
    AND modulo = 'mecanico';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'mecanico_nao_encontrado');
  END IF;

  v_user := COALESCE(v.profile_user_id, v.id);

  DELETE FROM public.registros_ponto
  WHERE id = p_ponto_id
    AND user_id = v_user;

  GET DIAGNOSTICS v_removidos = ROW_COUNT;

  IF v_removidos = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'registro_nao_encontrado');
  END IF;

  RETURN jsonb_build_object('ok', true, 'removidos', v_removidos);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_app_mecanico_excluir_abastecimento(
  p_acesso_id uuid,
  p_abastecimento_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.acessos_externos;
  v_removidos integer := 0;
BEGIN
  SELECT * INTO v
  FROM public.acessos_externos
  WHERE id = p_acesso_id
    AND modulo = 'mecanico';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'mecanico_nao_encontrado');
  END IF;

  UPDATE public.abastecimentos
  SET
    excluido = true,
    excluido_em = now(),
    excluido_motivo = 'Excluido pelo painel do App Mecanico',
    status = 'cancelado'
  WHERE id = p_abastecimento_id
    AND acesso_externo_id = v.id
    AND COALESCE(excluido, false) = false;

  GET DIAGNOSTICS v_removidos = ROW_COUNT;

  IF v_removidos = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'registro_nao_encontrado');
  END IF;

  RETURN jsonb_build_object('ok', true, 'removidos', v_removidos);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_app_mecanico_excluir_ponto(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_app_mecanico_excluir_abastecimento(uuid, uuid) TO authenticated;
