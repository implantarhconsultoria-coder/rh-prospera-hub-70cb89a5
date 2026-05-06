
-- ========= App Mecânico v2: ponto com selfie/empresa/dispositivo + abastecimento + histórico admin =========

-- 1) Colunas adicionais em registros_ponto
ALTER TABLE public.registros_ponto
  ADD COLUMN IF NOT EXISTS acesso_externo_id uuid,
  ADD COLUMN IF NOT EXISTS mecanico_nome text,
  ADD COLUMN IF NOT EXISTS empresa text,
  ADD COLUMN IF NOT EXISTS filial text,
  ADD COLUMN IF NOT EXISTS dispositivo text;

-- Permite que registros_ponto tenha user_id null (mecânicos externos sem profile_user_id)
ALTER TABLE public.registros_ponto ALTER COLUMN user_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_registros_ponto_acesso ON public.registros_ponto(acesso_externo_id);

-- 2) Coluna acesso_externo_id em abastecimentos (para histórico do mecânico)
ALTER TABLE public.abastecimentos
  ADD COLUMN IF NOT EXISTS acesso_externo_id uuid,
  ADD COLUMN IF NOT EXISTS endereco text,
  ADD COLUMN IF NOT EXISTS observacao text,
  ADD COLUMN IF NOT EXISTS empresa text,
  ADD COLUMN IF NOT EXISTS filial text,
  ADD COLUMN IF NOT EXISTS qr_codigo text;

CREATE INDEX IF NOT EXISTS idx_abast_acesso ON public.abastecimentos(acesso_externo_id);

-- 3) Storage buckets policies (buckets já existem, garantir policies)
-- ponto-selfies: insert público para mecânicos (via SECURITY DEFINER) + leitura via signed url
DO $$
BEGIN
  -- Permite ANYONE fazer upload assinado para mecanico (apenas via app, mas como bucket é privado, precisa policy de insert)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Mecanico app pode upload selfie ponto') THEN
    CREATE POLICY "Mecanico app pode upload selfie ponto" ON storage.objects
      FOR INSERT TO anon, authenticated
      WITH CHECK (bucket_id = 'ponto-selfies');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Mecanico app pode upload abastecimento') THEN
    CREATE POLICY "Mecanico app pode upload abastecimento" ON storage.objects
      FOR INSERT TO anon, authenticated
      WITH CHECK (bucket_id = 'abastecimento-fotos');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Admin pode ler selfies ponto') THEN
    CREATE POLICY "Admin pode ler selfies ponto" ON storage.objects
      FOR SELECT TO authenticated
      USING (bucket_id = 'ponto-selfies' AND has_role(auth.uid(), 'admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Admin pode ler fotos abastecimento') THEN
    CREATE POLICY "Admin pode ler fotos abastecimento" ON storage.objects
      FOR SELECT TO authenticated
      USING (bucket_id = 'abastecimento-fotos' AND has_role(auth.uid(), 'admin'));
  END IF;
END $$;

-- 4) Atualizar RPC app_mecanico_registrar_ponto (com selfie, empresa, dispositivo, endereco)
CREATE OR REPLACE FUNCTION public.app_mecanico_registrar_ponto(
  p_acesso_id uuid,
  p_tipo text,
  p_latitude double precision DEFAULT NULL,
  p_longitude double precision DEFAULT NULL,
  p_endereco text DEFAULT NULL,
  p_selfie_url text DEFAULT NULL,
  p_dispositivo text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v public.acessos_externos;
  v_id uuid;
BEGIN
  BEGIN v := public._app_mecanico_get_acesso(p_acesso_id);
  EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('ok', false, 'error', 'acesso_nao_autorizado'); END;

  IF p_tipo NOT IN ('entrada','saida','almoco_inicio','almoco_fim','pausa_inicio','pausa_fim') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'tipo_invalido');
  END IF;

  INSERT INTO public.registros_ponto(
    user_id, tipo, data, hora, latitude, longitude, endereco_formatado,
    selfie_url, acesso_externo_id, mecanico_nome, empresa, filial, dispositivo
  ) VALUES (
    v.profile_user_id,  -- pode ser NULL agora
    p_tipo, CURRENT_DATE, CURRENT_TIME, p_latitude, p_longitude, p_endereco,
    p_selfie_url, v.id, v.nome, v.empresa, v.filial, p_dispositivo
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

-- 5) Verificar se já fez entrada hoje (para decidir se exige selfie)
CREATE OR REPLACE FUNCTION public.app_mecanico_status_dia(p_acesso_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v public.acessos_externos;
  v_qtd int;
  v_ultimo text;
BEGIN
  BEGIN v := public._app_mecanico_get_acesso(p_acesso_id);
  EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('ok', false, 'error', 'acesso_nao_autorizado'); END;

  SELECT COUNT(*) INTO v_qtd FROM public.registros_ponto
   WHERE acesso_externo_id = v.id AND data = CURRENT_DATE;

  SELECT tipo INTO v_ultimo FROM public.registros_ponto
   WHERE acesso_externo_id = v.id AND data = CURRENT_DATE
   ORDER BY hora DESC LIMIT 1;

  RETURN jsonb_build_object('ok', true, 'batidas_hoje', v_qtd, 'ultimo_tipo', COALESCE(v_ultimo,''));
END;
$$;

-- 6) RPC para registrar abastecimento (via app mecânico)
CREATE OR REPLACE FUNCTION public.app_mecanico_registrar_abastecimento(
  p_acesso_id uuid,
  p_qr_codigo text,
  p_valor numeric,
  p_litros numeric,
  p_combustivel text,
  p_km numeric,
  p_placa text DEFAULT NULL,
  p_posto_nome text DEFAULT NULL,
  p_observacao text DEFAULT NULL,
  p_foto_bomba_url text DEFAULT NULL,
  p_foto_painel_url text DEFAULT NULL,
  p_latitude double precision DEFAULT NULL,
  p_longitude double precision DEFAULT NULL,
  p_endereco text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v public.acessos_externos;
  vc RECORD;
  v_id uuid;
  v_codigo_norm text;
BEGIN
  BEGIN v := public._app_mecanico_get_acesso(p_acesso_id);
  EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('ok', false, 'error', 'acesso_nao_autorizado'); END;

  IF COALESCE(p_foto_bomba_url,'') = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'foto_bomba_obrigatoria');
  END IF;
  IF COALESCE(p_foto_painel_url,'') = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'foto_painel_obrigatoria');
  END IF;

  v_codigo_norm := upper(trim(coalesce(p_qr_codigo,'')));
  SELECT * INTO vc FROM public.vales_combustivel
   WHERE deleted_at IS NULL
     AND (codigo = p_qr_codigo OR upper(trim(codigo)) = v_codigo_norm)
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'qr_nao_encontrado');
  END IF;
  IF vc.status IN ('bloqueado','cancelado') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'qr_bloqueado');
  END IF;

  INSERT INTO public.abastecimentos(
    vale_id, vale_codigo, qr_codigo, mecanico_nome, placa,
    valor, litros, combustivel, km_atual,
    posto_nome, posto_cnpj, posto_endereco,
    foto_bomba_url, foto_painel_url,
    latitude, longitude, endereco,
    acesso_externo_id, empresa, filial,
    observacao, status, preenchimento, competencia
  ) VALUES (
    vc.id, vc.codigo, vc.codigo, v.nome, COALESCE(p_placa,''),
    COALESCE(p_valor,0), COALESCE(p_litros,0), COALESCE(p_combustivel,'Diesel S10'), p_km,
    COALESCE(NULLIF(p_posto_nome,''), vc.posto_nome), vc.posto_cnpj, vc.posto_endereco,
    p_foto_bomba_url, p_foto_painel_url,
    p_latitude, p_longitude, p_endereco,
    v.id, COALESCE(v.empresa,''), COALESCE(v.filial,''),
    COALESCE(p_observacao,''), 'enviado', 'app_mecanico',
    to_char(CURRENT_DATE, 'YYYY-MM')
  ) RETURNING id INTO v_id;

  -- Mantém vale ativo (vitalício) — não marca como utilizado
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

-- 7) Atualizar listar_historico para incluir abastecimentos
CREATE OR REPLACE FUNCTION public.app_mecanico_listar_historico(p_acesso_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v public.acessos_externos;
  v_pontos jsonb;
  v_chamados jsonb;
  v_abast jsonb;
BEGIN
  BEGIN v := public._app_mecanico_get_acesso(p_acesso_id);
  EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('ok', false, 'error', 'acesso_nao_autorizado'); END;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'tipo', tipo, 'data', data, 'hora', hora,
    'latitude', latitude, 'longitude', longitude,
    'endereco', endereco_formatado, 'selfie_url', selfie_url
  ) ORDER BY data DESC, hora DESC), '[]'::jsonb)
  INTO v_pontos FROM public.registros_ponto
   WHERE acesso_externo_id = v.id
   ORDER BY data DESC, hora DESC LIMIT 50;

  IF v.funcionario_id IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', id, 'cliente', cliente, 'tipo_servico', tipo_servico, 'status', status,
      'created_at', created_at
    ) ORDER BY created_at DESC), '[]'::jsonb)
    INTO v_chamados FROM public.chamados
     WHERE colaborador_id = v.funcionario_id
     ORDER BY created_at DESC LIMIT 30;
  ELSE
    v_chamados := '[]'::jsonb;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'data', data, 'hora', hora, 'placa', placa,
    'valor', valor, 'litros', litros, 'km', km_atual,
    'posto', posto_nome, 'combustivel', combustivel,
    'foto_bomba_url', foto_bomba_url, 'foto_painel_url', foto_painel_url,
    'status', status
  ) ORDER BY data DESC, hora DESC), '[]'::jsonb)
  INTO v_abast FROM public.abastecimentos
   WHERE acesso_externo_id = v.id
   ORDER BY data DESC, hora DESC LIMIT 30;

  RETURN jsonb_build_object('ok', true, 'pontos', v_pontos, 'chamados', v_chamados, 'abastecimentos', v_abast);
END;
$$;

-- 8) RPC admin: listar mecanicos + histórico por mecanico
CREATE OR REPLACE FUNCTION public.admin_app_mecanico_historico(p_acesso_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v public.acessos_externos;
  v_pontos jsonb;
  v_abast jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sem_permissao');
  END IF;

  SELECT * INTO v FROM public.acessos_externos WHERE id = p_acesso_id AND modulo = 'mecanico';
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'mecanico_nao_encontrado'); END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'tipo', tipo, 'data', data, 'hora', hora,
    'latitude', latitude, 'longitude', longitude,
    'endereco', endereco_formatado, 'selfie_url', selfie_url, 'dispositivo', dispositivo
  ) ORDER BY data DESC, hora DESC), '[]'::jsonb)
  INTO v_pontos FROM public.registros_ponto WHERE acesso_externo_id = v.id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'data', data, 'hora', hora, 'placa', placa,
    'valor', valor, 'litros', litros, 'km', km_atual,
    'posto', posto_nome, 'combustivel', combustivel,
    'foto_bomba_url', foto_bomba_url, 'foto_painel_url', foto_painel_url,
    'latitude', latitude, 'longitude', longitude, 'endereco', endereco,
    'qr_codigo', qr_codigo, 'status', status
  ) ORDER BY data DESC, hora DESC), '[]'::jsonb)
  INTO v_abast FROM public.abastecimentos WHERE acesso_externo_id = v.id;

  RETURN jsonb_build_object(
    'ok', true,
    'mecanico', jsonb_build_object('id', v.id, 'nome', v.nome, 'empresa', v.empresa, 'filial', v.filial, 'funcao', v.funcao),
    'pontos', v_pontos,
    'abastecimentos', v_abast
  );
END;
$$;
