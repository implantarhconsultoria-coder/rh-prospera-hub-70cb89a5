ALTER TABLE public.registros_ponto
  ADD COLUMN IF NOT EXISTS acesso_externo_id uuid REFERENCES public.acessos_externos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS mecanico_nome text,
  ADD COLUMN IF NOT EXISTS empresa text,
  ADD COLUMN IF NOT EXISTS filial text,
  ADD COLUMN IF NOT EXISTS registro_teste boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS teste_chave text,
  ADD COLUMN IF NOT EXISTS data_hora_brasilia timestamp without time zone,
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'America/Sao_Paulo';

ALTER TABLE public.acessos_externos
  ADD COLUMN IF NOT EXISTS registro_teste boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS teste_chave text;

CREATE INDEX IF NOT EXISTS idx_registros_ponto_acesso_data_brasilia
  ON public.registros_ponto(acesso_externo_id, data DESC, hora DESC);

CREATE OR REPLACE FUNCTION public.app_mecanico_status_dia(p_acesso_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.acessos_externos;
  v_count int;
  v_hoje date := timezone('America/Sao_Paulo', now())::date;
BEGIN
  BEGIN
    v := public._app_mecanico_get_acesso(p_acesso_id);
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'acesso_nao_autorizado');
  END;

  SELECT count(*) INTO v_count
    FROM public.registros_ponto
   WHERE (
      acesso_externo_id = v.id
      OR (v.profile_user_id IS NOT NULL AND user_id = v.profile_user_id)
      OR user_id = v.id
   )
     AND data = v_hoje
     AND COALESCE(registro_teste, false) = COALESCE(v.registro_teste, false);

  RETURN jsonb_build_object('ok', true, 'batidas_hoje', v_count, 'data_brasilia', v_hoje);
END;
$$;

CREATE OR REPLACE FUNCTION public.app_mecanico_registrar_ponto(
  p_acesso_id uuid,
  p_tipo text,
  p_latitude double precision DEFAULT NULL,
  p_longitude double precision DEFAULT NULL,
  p_endereco text DEFAULT NULL,
  p_selfie_url text DEFAULT NULL,
  p_dispositivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  IF p_tipo NOT IN ('entrada', 'saida', 'almoco_inicio', 'almoco_fim', 'almoco_saida', 'almoco_volta') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'tipo_invalido');
  END IF;

  INSERT INTO public.registros_ponto(
    user_id, tipo, data, hora, latitude, longitude, endereco_formatado, selfie_url,
    acesso_externo_id, mecanico_nome, empresa, filial, dispositivo, registro_teste,
    teste_chave, data_hora_brasilia, timezone
  ) VALUES (
    COALESCE(v.profile_user_id, v.id),
    CASE
      WHEN p_tipo = 'almoco_saida' THEN 'almoco_inicio'
      WHEN p_tipo = 'almoco_volta' THEN 'almoco_fim'
      ELSE p_tipo
    END,
    v_data, v_hora, p_latitude, p_longitude, COALESCE(p_endereco, ''), p_selfie_url,
    v.id, v.nome, COALESCE(v.empresa, ''), COALESCE(v.filial, ''), p_dispositivo,
    COALESCE(v.registro_teste, false), NULLIF(v.teste_chave, ''), v_agora, 'America/Sao_Paulo'
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_id,
    'registro_teste', COALESCE(v.registro_teste, false),
    'tipo', p_tipo,
    'data', v_data,
    'hora', to_char(v_hora, 'HH24:MI:SS'),
    'timezone', 'America/Sao_Paulo'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.app_mecanico_status_dia(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_mecanico_registrar_ponto(uuid, text, double precision, double precision, text, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.app_mecanico_listar_historico(p_acesso_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.acessos_externos;
  v_user uuid;
  v_pontos jsonb;
  v_abast jsonb;
  v_chamados jsonb;
BEGIN
  BEGIN
    v := public._app_mecanico_get_acesso(p_acesso_id);
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'acesso_nao_autorizado');
  END;

  v_user := COALESCE(v.profile_user_id, v.id);

  SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.data DESC, p.hora DESC), '[]'::jsonb)
    INTO v_pontos
    FROM (
      SELECT *
        FROM public.registros_ponto
       WHERE (
          acesso_externo_id = v.id
          OR user_id = v_user
       )
         AND COALESCE(registro_teste, false) = COALESCE(v.registro_teste, false)
       ORDER BY data DESC, hora DESC
       LIMIT 80
    ) p;

  SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.data DESC, a.hora DESC), '[]'::jsonb)
    INTO v_abast
    FROM (
      SELECT *
        FROM public.abastecimentos
       WHERE acesso_externo_id = v.id
         AND COALESCE(excluido, false) = false
       ORDER BY data DESC, hora DESC
       LIMIT 80
    ) a;

  SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.created_at DESC), '[]'::jsonb)
    INTO v_chamados
    FROM (
      SELECT *
        FROM public.chamados
       WHERE colaborador_id = v.funcionario_id
       ORDER BY created_at DESC
       LIMIT 80
    ) c;

  RETURN jsonb_build_object('ok', true, 'pontos', v_pontos, 'abastecimentos', v_abast, 'chamados', v_chamados);
END;
$$;

GRANT EXECUTE ON FUNCTION public.app_mecanico_listar_historico(uuid) TO anon, authenticated;
