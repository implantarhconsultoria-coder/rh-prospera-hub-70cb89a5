-- Corrige função acesso_externo_listar_portais que estava com erro de GROUP BY
CREATE OR REPLACE FUNCTION public.acesso_externo_listar_portais(p_pin text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  WITH acessos AS (
    SELECT id, cpf_clean, nome, empresa, filial, funcao, modulo, perfil_acesso
      FROM public.acessos_externos
     WHERE pin = v_pin
       AND modulo <> 'mecanico'
       AND status='ativo'
       AND acesso_liberado=true
  ),
  agrupado AS (
    SELECT
      cpf_clean,
      nome,
      MAX(COALESCE(empresa,'')) AS empresa,
      MAX(COALESCE(filial,''))  AS filial,
      MAX(COALESCE(funcao,''))  AS funcao,
      jsonb_agg(jsonb_build_object(
        'acesso_id', id,
        'modulo', modulo,
        'perfil_acesso', perfil_acesso,
        'empresa', COALESCE(empresa,''),
        'filial', COALESCE(filial,''),
        'funcao', COALESCE(funcao,'')
      ) ORDER BY modulo) AS portais
    FROM acessos
    GROUP BY cpf_clean, nome
  )
  SELECT jsonb_agg(jsonb_build_object(
    'cpf_clean', cpf_clean,
    'nome', nome,
    'empresa', empresa,
    'filial', filial,
    'funcao', funcao,
    'portais', portais
  ) ORDER BY nome)
    INTO v_result
    FROM agrupado;

  IF v_result IS NULL OR jsonb_array_length(v_result) = 0 THEN
    IF v_blocked > 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'bloqueado');
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'pin_nao_encontrado');
  END IF;

  RETURN jsonb_build_object('ok', true, 'usuarios', v_result);
END;
$function$;