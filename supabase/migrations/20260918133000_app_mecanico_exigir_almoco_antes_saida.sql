CREATE OR REPLACE FUNCTION public.app_mecanico_registrar_ponto(
  p_acesso_id uuid,
  p_tipo text,
  p_latitude double precision DEFAULT NULL::double precision,
  p_longitude double precision DEFAULT NULL::double precision,
  p_endereco text DEFAULT NULL::text,
  p_selfie_url text DEFAULT NULL::text,
  p_dispositivo text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v public.acessos_externos;
  v_id uuid;
  v_user_id uuid;
  v_meta jsonb := '{}'::jsonb;
  v_client_id text;
  v_ocorrido_em timestamptz := now();
  v_agora timestamp without time zone;
  v_data date;
  v_hora time without time zone;
  v_entrada int := 0;
  v_almoco_inicio int := 0;
  v_almoco_fim int := 0;
  v_saida int := 0;
  v_dia_util boolean;
BEGIN
  BEGIN
    v := public._app_mecanico_get_acesso(p_acesso_id);
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'acesso_nao_autorizado');
  END;

  IF p_tipo NOT IN ('entrada','saida','almoco_inicio','almoco_fim','pausa_inicio','pausa_fim') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'tipo_invalido');
  END IF;

  IF p_dispositivo IS NOT NULL AND left(ltrim(p_dispositivo), 1) = '{' THEN
    BEGIN
      v_meta := p_dispositivo::jsonb;
    EXCEPTION WHEN OTHERS THEN
      v_meta := '{}'::jsonb;
    END;
  END IF;

  BEGIN
    IF NULLIF(v_meta ->> 'ocorrido_em', '') IS NOT NULL THEN
      v_ocorrido_em := (v_meta ->> 'ocorrido_em')::timestamptz;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_ocorrido_em := now();
  END;

  v_agora := timezone('America/Sao_Paulo', v_ocorrido_em);
  v_data := v_agora::date;
  v_hora := v_agora::time;
  v_user_id := COALESCE(v.profile_user_id, v.id);
  v_client_id := NULLIF(v_meta ->> 'client_id', '');
  v_dia_util := extract(isodow from v_data) between 1 and 5;

  IF v_client_id IS NOT NULL THEN
    SELECT rp.id INTO v_id
      FROM public.registros_ponto rp
     WHERE rp.user_id = v_user_id
       AND strpos(COALESCE(rp.dispositivo, ''), v_client_id) > 0
     ORDER BY rp.created_at DESC
     LIMIT 1;
    IF v_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'ok', true,
        'id', v_id,
        'duplicado', true,
        'data', v_data,
        'hora', to_char(v_hora,'HH24:MI:SS'),
        'data_hora_brasilia', to_char(v_agora,'YYYY-MM-DD HH24:MI:SS'),
        'timezone','America/Sao_Paulo'
      );
    END IF;
  END IF;

  IF p_latitude IS NULL OR p_longitude IS NULL
     OR p_latitude < -90 OR p_latitude > 90
     OR p_longitude < -180 OR p_longitude > 180 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'gps_obrigatorio');
  END IF;

  SELECT
    count(*) FILTER (WHERE tipo='entrada'),
    count(*) FILTER (WHERE tipo='almoco_inicio'),
    count(*) FILTER (WHERE tipo='almoco_fim'),
    count(*) FILTER (WHERE tipo='saida')
  INTO v_entrada, v_almoco_inicio, v_almoco_fim, v_saida
  FROM public.registros_ponto
  WHERE user_id = v_user_id AND data = v_data;

  IF p_tipo = 'entrada' THEN
    IF v_entrada > 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'entrada_ja_registrada'); END IF;
    IF coalesce(p_selfie_url,'') = '' THEN RETURN jsonb_build_object('ok', false, 'error', 'selfie_obrigatoria'); END IF;

  ELSIF p_tipo = 'almoco_inicio' THEN
    IF v_entrada = 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'entrada_obrigatoria'); END IF;
    IF v_saida > 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'jornada_encerrada'); END IF;
    IF v_almoco_inicio > 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'almoco_inicio_ja_registrado'); END IF;

  ELSIF p_tipo = 'almoco_fim' THEN
    IF v_entrada = 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'entrada_obrigatoria'); END IF;
    IF v_saida > 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'jornada_encerrada'); END IF;
    IF v_almoco_inicio = 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'almoco_inicio_obrigatorio'); END IF;
    IF v_almoco_fim > 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'almoco_fim_ja_registrado'); END IF;

  ELSIF p_tipo = 'saida' THEN
    IF v_entrada = 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'entrada_obrigatoria'); END IF;
    IF v_saida > 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'saida_ja_registrada'); END IF;

    -- Segunda a sexta: não encerra jornada sem passar por início e retorno do almoço.
    IF v_dia_util AND v_almoco_inicio = 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'almoco_inicio_obrigatorio');
    END IF;

    IF v_almoco_inicio > 0 AND v_almoco_fim = 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'almoco_em_aberto');
    END IF;

  ELSIF p_tipo IN ('pausa_inicio','pausa_fim') THEN
    IF v_entrada = 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'entrada_obrigatoria'); END IF;
    IF v_saida > 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'jornada_encerrada'); END IF;
  END IF;

  INSERT INTO public.registros_ponto(
    user_id,tipo,data,hora,latitude,longitude,endereco_formatado,selfie_url,dispositivo,registro_teste,data_hora_brasilia,timezone
  ) VALUES (
    v_user_id,p_tipo,v_data,v_hora,p_latitude,p_longitude,COALESCE(p_endereco,''),p_selfie_url,p_dispositivo,false,v_agora,'America/Sao_Paulo'
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'ok',true,
    'id',v_id,
    'data',v_data,
    'hora',to_char(v_hora,'HH24:MI:SS'),
    'data_hora_brasilia',to_char(v_agora,'YYYY-MM-DD HH24:MI:SS'),
    'timezone','America/Sao_Paulo',
    'funcionario_id',v.funcionario_id,
    'empresa',v.empresa,
    'filial',v.filial
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.app_mecanico_registrar_ponto(
  uuid, text, double precision, double precision, text, text, text
) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
