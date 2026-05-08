
CREATE TABLE IF NOT EXISTS public.postos_combustivel (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  nome text NOT NULL,
  cnpj text,
  endereco text,
  telefone text,
  status text NOT NULL DEFAULT 'ativo',
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
ALTER TABLE public.postos_combustivel ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "postos_admin_all" ON public.postos_combustivel;
CREATE POLICY "postos_admin_all" ON public.postos_combustivel
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "postos_auth_read" ON public.postos_combustivel;
CREATE POLICY "postos_auth_read" ON public.postos_combustivel
  FOR SELECT TO authenticated USING (true);

DROP TRIGGER IF EXISTS tg_postos_touch ON public.postos_combustivel;
CREATE TRIGGER tg_postos_touch BEFORE UPDATE ON public.postos_combustivel
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.abastecimentos ADD COLUMN IF NOT EXISTS posto_id uuid REFERENCES public.postos_combustivel(id);
ALTER TABLE public.abastecimentos ADD COLUMN IF NOT EXISTS posto_codigo text;
ALTER TABLE public.abastecimentos ADD COLUMN IF NOT EXISTS posto_telefone text;

CREATE OR REPLACE FUNCTION public.admin_posto_combustivel_upsert(
  p_id uuid, p_nome text, p_cnpj text, p_endereco text, p_telefone text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_codigo text; v_id uuid; r record;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RETURN jsonb_build_object('ok',false,'error','nao_autorizado');
  END IF;
  IF p_id IS NULL THEN
    v_codigo := 'POSTO-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
    INSERT INTO public.postos_combustivel(codigo,nome,cnpj,endereco,telefone)
      VALUES (v_codigo,p_nome,NULLIF(p_cnpj,''),NULLIF(p_endereco,''),NULLIF(p_telefone,''))
      RETURNING id INTO v_id;
  ELSE
    UPDATE public.postos_combustivel
       SET nome=p_nome, cnpj=NULLIF(p_cnpj,''), endereco=NULLIF(p_endereco,''),
           telefone=NULLIF(p_telefone,''), updated_at=now()
     WHERE id=p_id RETURNING id INTO v_id;
  END IF;
  SELECT * INTO r FROM public.postos_combustivel WHERE id=v_id;
  RETURN jsonb_build_object('ok',true,'posto',to_jsonb(r));
END;$$;

CREATE OR REPLACE FUNCTION public.admin_posto_combustivel_toggle(p_id uuid, p_bloquear boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RETURN jsonb_build_object('ok',false,'error','nao_autorizado');
  END IF;
  UPDATE public.postos_combustivel
     SET status=CASE WHEN p_bloquear THEN 'bloqueado' ELSE 'ativo' END, updated_at=now()
   WHERE id=p_id;
  RETURN jsonb_build_object('ok',true);
END;$$;

CREATE OR REPLACE FUNCTION public.app_mecanico_validar_qr_posto(p_acesso_id uuid, p_codigo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v public.acessos_externos; p public.postos_combustivel; v_codigo text;
BEGIN
  BEGIN v := public._app_mecanico_get_acesso(p_acesso_id);
  EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('ok',false,'error','acesso_nao_autorizado'); END;
  v_codigo := trim(p_codigo);
  SELECT * INTO p FROM public.postos_combustivel
   WHERE codigo=v_codigo AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok',false,'error','qr_nao_encontrado');
  END IF;
  IF p.status<>'ativo' THEN
    RETURN jsonb_build_object('ok',false,'error','qr_bloqueado');
  END IF;
  RETURN jsonb_build_object('ok',true,
    'posto', jsonb_build_object('id',p.id,'codigo',p.codigo,'nome',p.nome,'cnpj',p.cnpj,'endereco',p.endereco,'telefone',p.telefone),
    'mecanico', jsonb_build_object('nome',v.nome,'empresa',COALESCE(v.empresa,''),'filial',COALESCE(v.filial,''),'funcionario_id',v.funcionario_id));
END;$$;

CREATE OR REPLACE FUNCTION public.app_mecanico_registrar_abastecimento_posto(
  p_acesso_id uuid, p_posto_codigo text,
  p_valor numeric, p_litros numeric, p_combustivel text,
  p_km numeric, p_placa text DEFAULT NULL, p_observacao text DEFAULT NULL,
  p_foto_bomba_url text DEFAULT NULL, p_foto_painel_url text DEFAULT NULL,
  p_latitude double precision DEFAULT NULL, p_longitude double precision DEFAULT NULL, p_endereco text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v public.acessos_externos; p public.postos_combustivel; v_id uuid;
BEGIN
  BEGIN v := public._app_mecanico_get_acesso(p_acesso_id);
  EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('ok',false,'error','acesso_nao_autorizado'); END;
  SELECT * INTO p FROM public.postos_combustivel
   WHERE codigo=trim(p_posto_codigo) AND status='ativo' AND deleted_at IS NULL;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','qr_invalido'); END IF;
  INSERT INTO public.abastecimentos(
    qr_codigo, acesso_externo_id, funcionario_id, mecanico_nome, empresa, filial, placa,
    data, hora, combustivel, valor, litros, km_atual,
    posto_nome, posto_cnpj, posto_endereco, posto_id, posto_codigo, posto_telefone,
    foto_bomba_url, foto_painel_url, latitude, longitude, endereco, observacao, status, preenchimento
  ) VALUES (
    p.codigo, v.id, v.funcionario_id, v.nome, v.empresa, v.filial, NULLIF(p_placa,''),
    CURRENT_DATE, CURRENT_TIME, NULLIF(p_combustivel,''), p_valor, p_litros, p_km,
    p.nome, p.cnpj, p.endereco, p.id, p.codigo, p.telefone,
    p_foto_bomba_url, p_foto_painel_url, p_latitude, p_longitude, p_endereco, NULLIF(p_observacao,''),
    'concluido', 'qr_posto'
  ) RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok',true,'id',v_id);
END;$$;

CREATE OR REPLACE FUNCTION public.admin_posto_combustivel_historico(p_posto_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_arr jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RETURN jsonb_build_object('ok',false,'error','nao_autorizado');
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',id,'data',data,'hora',hora,'mecanico_nome',mecanico_nome,
    'empresa',empresa,'filial',filial,'placa',placa,
    'valor',valor,'litros',litros,'combustivel',combustivel,'km',km_atual,
    'foto_bomba_url',foto_bomba_url,'foto_painel_url',foto_painel_url
  ) ORDER BY data DESC, hora DESC), '[]'::jsonb) INTO v_arr
    FROM public.abastecimentos WHERE posto_id=p_posto_id;
  RETURN jsonb_build_object('ok',true,'abastecimentos',v_arr);
END;$$;

INSERT INTO public.postos_combustivel(codigo, nome, cnpj, endereco, telefone)
VALUES ('POSTO-SAODONATO', 'POSTO DE SERVIÇOS SÃO DONATO LTDA',
        '61.362.083/0001-53',
        'Rua Anhaia, 1092, Bom Retiro, São Paulo/SP, CEP 01130-000',
        '(11) 3333-6715')
ON CONFLICT (codigo) DO NOTHING;
