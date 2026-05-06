-- RPC unificado: lista todos os portais externos liberados para um PIN (exceto mecânico)
CREATE OR REPLACE FUNCTION public.acesso_externo_listar_portais(p_pin text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pin text;
  v_blocked int;
  v_result jsonb;
BEGIN
  v_pin := regexp_replace(COALESCE(p_pin,''), '[^0-9]', '', 'g');
  IF length(v_pin) <> 4 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'pin_invalido');
  END IF;

  -- bloqueios (qualquer registro não-mecânico bloqueado deste PIN)
  SELECT COUNT(*) INTO v_blocked
    FROM public.acessos_externos
   WHERE pin = v_pin
     AND modulo <> 'mecanico'
     AND (status='bloqueado' OR acesso_liberado=false);

  -- Lista todos os acessos liberados (não-mecânico) agrupados por usuário (cpf_clean+nome)
  SELECT jsonb_agg(u ORDER BY u->>'nome') INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'cpf_clean', cpf_clean,
      'nome', nome,
      'empresa', COALESCE(empresa,''),
      'filial', COALESCE(filial,''),
      'funcao', COALESCE(funcao,''),
      'portais', jsonb_agg(jsonb_build_object(
        'acesso_id', id,
        'modulo', modulo,
        'perfil_acesso', perfil_acesso,
        'empresa', COALESCE(empresa,''),
        'filial', COALESCE(filial,''),
        'funcao', COALESCE(funcao,'')
      ) ORDER BY modulo)
    ) AS u
    FROM public.acessos_externos
    WHERE pin = v_pin
      AND modulo <> 'mecanico'
      AND status='ativo'
      AND acesso_liberado=true
    GROUP BY cpf_clean, nome
  ) sub;

  IF v_result IS NULL OR jsonb_array_length(v_result) = 0 THEN
    IF v_blocked > 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'bloqueado');
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'pin_nao_encontrado');
  END IF;

  RETURN jsonb_build_object('ok', true, 'usuarios', v_result);
END;
$$;