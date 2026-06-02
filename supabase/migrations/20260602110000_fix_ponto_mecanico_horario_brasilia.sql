ALTER TABLE public.registros_ponto
  ADD COLUMN IF NOT EXISTS data_hora_brasilia timestamp without time zone,
  ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'America/Sao_Paulo';

UPDATE public.registros_ponto
SET
  data_hora_brasilia = timezone('America/Sao_Paulo', created_at),
  timezone = 'America/Sao_Paulo',
  data = timezone('America/Sao_Paulo', created_at)::date,
  hora = timezone('America/Sao_Paulo', created_at)::time
WHERE created_at IS NOT NULL;

ALTER TABLE public.registros_ponto
  ALTER COLUMN data SET DEFAULT (timezone('America/Sao_Paulo', now())::date),
  ALTER COLUMN hora SET DEFAULT (timezone('America/Sao_Paulo', now())::time),
  ALTER COLUMN timezone SET NOT NULL;

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
  v_agora timestamp without time zone := timezone('America/Sao_Paulo', now());
  v_data date := timezone('America/Sao_Paulo', now())::date;
  v_hora time without time zone := timezone('America/Sao_Paulo', now())::time;
BEGIN
  BEGIN
    v := public._app_mecanico_get_acesso(p_acesso_id);
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'acesso_nao_autorizado');
  END;

  IF p_tipo NOT IN ('entrada','saida','almoco_inicio','almoco_fim','pausa_inicio','pausa_fim') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'tipo_invalido');
  END IF;

  INSERT INTO public.registros_ponto(
    user_id,
    tipo,
    data,
    hora,
    latitude,
    longitude,
    endereco_formatado,
    selfie_url,
    dispositivo,
    registro_teste,
    data_hora_brasilia,
    timezone
  )
  VALUES (
    COALESCE(v.profile_user_id, v.id),
    p_tipo,
    v_data,
    v_hora,
    p_latitude,
    p_longitude,
    COALESCE(p_endereco, ''),
    p_selfie_url,
    p_dispositivo,
    COALESCE(v.registro_teste, false),
    v_agora,
    'America/Sao_Paulo'
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_id,
    'data', v_data,
    'hora', to_char(v_hora, 'HH24:MI:SS'),
    'data_hora_brasilia', to_char(v_agora, 'YYYY-MM-DD HH24:MI:SS'),
    'timezone', 'America/Sao_Paulo'
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.app_mecanico_registrar_ponto(uuid, text, double precision, double precision, text, text, text) TO anon, authenticated;
