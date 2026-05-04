
-- ============= POSTOS =============
CREATE TABLE IF NOT EXISTS public.postos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  cnpj TEXT,
  endereco TEXT,
  cidade TEXT,
  uf TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  observacao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.postos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "postos_admin_all" ON public.postos;
CREATE POLICY "postos_admin_all" ON public.postos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "postos_view_all" ON public.postos;
CREATE POLICY "postos_view_all" ON public.postos FOR SELECT TO authenticated USING (true);

CREATE TRIGGER trg_postos_updated BEFORE UPDATE ON public.postos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- soft-delete em vales_combustivel
ALTER TABLE public.vales_combustivel ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.vales_combustivel ADD COLUMN IF NOT EXISTS deleted_by_nome TEXT;

-- vincular posto a vale
ALTER TABLE public.vales_combustivel ADD COLUMN IF NOT EXISTS posto_id UUID REFERENCES public.postos(id) ON DELETE SET NULL;

-- ============= FECHAMENTO POR FILIAL =============
-- Sincroniza/atualiza UM fechamento da empresa+competência
CREATE OR REPLACE FUNCTION public.fechamento_filial_sincronizar(
  p_company_id UUID,
  p_competencia TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_empresa TEXT;
  v_total_func INT := 0;
  v_proventos NUMERIC := 0;
  v_descontos NUMERIC := 0;
  v_liquido NUMERIC := 0;
  v_fech RECORD;
BEGIN
  SELECT nome INTO v_empresa FROM public.empresas WHERE id = p_company_id;
  IF v_empresa IS NULL THEN RETURN jsonb_build_object('ok',false,'error','empresa_nao_encontrada'); END IF;

  -- Conta funcionários ativos da empresa
  SELECT COUNT(*)::int INTO v_total_func
  FROM public.lancamentos_mensais lm
  WHERE lm.company_id = p_company_id
    AND lm.competencia = p_competencia
    AND lm.apagado_em IS NULL;

  -- Estimativa simples: proventos = adicionais + (he50+he100)*valor_hora_aprox; descontos = atrasos+descontos+adiantamento
  -- Como cada empresa pode ter cálculo próprio, somamos os campos numéricos diretos disponíveis.
  SELECT
    COALESCE(SUM(GREATEST(0, lm.adicionais)),0)
      + COALESCE(SUM(GREATEST(0, lm.he50)),0)
      + COALESCE(SUM(GREATEST(0, lm.he100)),0)
      + COALESCE(SUM(GREATEST(0, lm.comissao_base)),0),
    COALESCE(SUM(GREATEST(0, lm.descontos_diversos)),0)
      + COALESCE(SUM(GREATEST(0, lm.adiantamento)),0)
      + COALESCE(SUM(GREATEST(0, lm.vt_desconto)),0)
  INTO v_proventos, v_descontos
  FROM public.lancamentos_mensais lm
  WHERE lm.company_id = p_company_id
    AND lm.competencia = p_competencia
    AND lm.apagado_em IS NULL;

  v_liquido := COALESCE(v_proventos,0) - COALESCE(v_descontos,0);

  SELECT * INTO v_fech FROM public.fechamentos_filial
   WHERE company_id = p_company_id AND competencia = p_competencia LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO public.fechamentos_filial(company_id, empresa_nome, competencia, status, total_funcionarios, total_proventos, total_descontos, total_liquido)
    VALUES (p_company_id, v_empresa, p_competencia,
            CASE WHEN v_total_func > 0 THEN 'aberto' ELSE 'pendente' END,
            v_total_func, v_proventos, v_descontos, v_liquido)
    RETURNING * INTO v_fech;
  ELSE
    -- Não muda status se já estiver fechado
    IF v_fech.status NOT IN ('fechado') THEN
      UPDATE public.fechamentos_filial
         SET total_funcionarios = v_total_func,
             total_proventos = v_proventos,
             total_descontos = v_descontos,
             total_liquido = v_liquido,
             status = CASE WHEN v_total_func = 0 THEN 'pendente'
                           WHEN v_fech.status = 'reaberto' THEN 'reaberto'
                           ELSE 'em_andamento' END
       WHERE id = v_fech.id
       RETURNING * INTO v_fech;
    ELSE
      UPDATE public.fechamentos_filial
         SET total_funcionarios = v_total_func,
             total_proventos = v_proventos,
             total_descontos = v_descontos,
             total_liquido = v_liquido
       WHERE id = v_fech.id
       RETURNING * INTO v_fech;
    END IF;
  END IF;

  RETURN jsonb_build_object('ok',true,'fechamento', to_jsonb(v_fech));
END $$;

-- Fechar folha
CREATE OR REPLACE FUNCTION public.fechamento_filial_executar(
  p_company_id UUID,
  p_competencia TEXT,
  p_user_id UUID,
  p_user_nome TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sync JSONB;
  v_fech RECORD;
BEGIN
  v_sync := public.fechamento_filial_sincronizar(p_company_id, p_competencia);
  SELECT * INTO v_fech FROM public.fechamentos_filial
   WHERE company_id = p_company_id AND competencia = p_competencia LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','fechamento_nao_encontrado'); END IF;
  IF v_fech.status = 'fechado' THEN RETURN jsonb_build_object('ok',false,'error','ja_fechado'); END IF;

  UPDATE public.fechamentos_filial
     SET status='fechado',
         fechado_por_user_id=p_user_id,
         fechado_por_nome=p_user_nome,
         fechado_em=now()
   WHERE id = v_fech.id RETURNING * INTO v_fech;

  -- bloqueia lançamentos
  UPDATE public.lancamentos_mensais
     SET bloqueado=true, fechamento_id=v_fech.id
   WHERE company_id=p_company_id AND competencia=p_competencia AND apagado_em IS NULL;

  INSERT INTO public.fechamentos_historico(fechamento_id, acao, user_id, usuario_nome, detalhes)
  VALUES (v_fech.id, 'fechado', p_user_id, p_user_nome,
          jsonb_build_object('total_liquido', v_fech.total_liquido, 'total_funcionarios', v_fech.total_funcionarios));

  RETURN jsonb_build_object('ok',true,'fechamento', to_jsonb(v_fech));
END $$;

-- Reabrir
CREATE OR REPLACE FUNCTION public.fechamento_filial_reabrir(
  p_fechamento_id UUID,
  p_user_id UUID,
  p_user_nome TEXT,
  p_motivo TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_fech RECORD;
BEGIN
  IF NOT public.has_role(p_user_id,'admin') THEN
    RETURN jsonb_build_object('ok',false,'error','sem_permissao');
  END IF;
  SELECT * INTO v_fech FROM public.fechamentos_filial WHERE id = p_fechamento_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','fechamento_nao_encontrado'); END IF;

  UPDATE public.fechamentos_filial
     SET status='reaberto',
         reaberto_por_user_id=p_user_id,
         reaberto_por_nome=p_user_nome,
         reaberto_em=now(),
         motivo_reabertura=p_motivo
   WHERE id=p_fechamento_id RETURNING * INTO v_fech;

  UPDATE public.lancamentos_mensais SET bloqueado=false WHERE fechamento_id=p_fechamento_id;

  INSERT INTO public.fechamentos_historico(fechamento_id, acao, user_id, usuario_nome, detalhes)
  VALUES (p_fechamento_id, 'reaberto', p_user_id, p_user_nome, jsonb_build_object('motivo', p_motivo));

  RETURN jsonb_build_object('ok',true,'fechamento', to_jsonb(v_fech));
END $$;

-- ============= QR PUBLICO COMBUSTÍVEL =============
-- Abrir vale via código sem auth
CREATE OR REPLACE FUNCTION public.validar_qr_combustivel_publico(p_codigo TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v RECORD;
BEGIN
  SELECT * INTO v FROM public.vales_combustivel
   WHERE codigo = p_codigo AND deleted_at IS NULL LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','vale_invalido'); END IF;
  IF v.status NOT IN ('ativo') THEN RETURN jsonb_build_object('ok',false,'error','vale_indisponivel','status',v.status); END IF;
  IF v.validade IS NOT NULL AND v.validade < CURRENT_DATE THEN
    RETURN jsonb_build_object('ok',false,'error','vale_vencido');
  END IF;
  RETURN jsonb_build_object('ok',true,'vale', jsonb_build_object(
    'id', v.id, 'codigo', v.codigo,
    'posto_nome', COALESCE(v.posto_nome,''),
    'posto_cnpj', COALESCE(v.posto_cnpj,''),
    'posto_endereco', COALESCE(v.posto_endereco,''),
    'valor_limite', v.valor_limite,
    'litros_limite', v.litros_limite
  ));
END $$;

-- Registrar abastecimento via público (CPF + dados)
CREATE OR REPLACE FUNCTION public.registrar_abastecimento_publico(
  p_codigo TEXT, p_cpf TEXT, p_placa TEXT, p_km NUMERIC,
  p_valor NUMERIC, p_litros NUMERIC, p_combustivel TEXT,
  p_foto_bomba_url TEXT, p_foto_painel_url TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v RECORD;
  v_func RECORD;
  v_cpf_clean TEXT;
  v_id UUID;
BEGIN
  v_cpf_clean := regexp_replace(COALESCE(p_cpf,''),'[^0-9]','','g');
  SELECT * INTO v FROM public.vales_combustivel WHERE codigo = p_codigo AND deleted_at IS NULL;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','vale_invalido'); END IF;
  IF v.status <> 'ativo' THEN RETURN jsonb_build_object('ok',false,'error','vale_indisponivel'); END IF;

  SELECT * INTO v_func FROM public.funcionarios
   WHERE regexp_replace(COALESCE(cpf,''),'[^0-9]','','g') = v_cpf_clean LIMIT 1;
  -- CPF é opcional; se não achar, segue como anônimo

  INSERT INTO public.abastecimentos(
    vale_id, vale_codigo, mecanico_nome, placa, data, hora,
    valor, litros, combustivel, km_atual, posto_nome, posto_cnpj, posto_endereco,
    foto_bomba_url, foto_painel_url, status, competencia, preenchimento
  ) VALUES (
    v.id, v.codigo, COALESCE(v_func.nome,'CPF '||v_cpf_clean), COALESCE(p_placa,''),
    CURRENT_DATE, CURRENT_TIME,
    p_valor, p_litros, COALESCE(p_combustivel,'Diesel S10'), p_km,
    v.posto_nome, v.posto_cnpj, v.posto_endereco,
    p_foto_bomba_url, p_foto_painel_url, 'pendente',
    to_char(CURRENT_DATE,'YYYY-MM'), 'manual_qr_publico'
  ) RETURNING id INTO v_id;

  UPDATE public.vales_combustivel
     SET status='utilizado', utilizado_em=now()
   WHERE id=v.id;

  RETURN jsonb_build_object('ok',true,'id',v_id);
END $$;

GRANT EXECUTE ON FUNCTION public.validar_qr_combustivel_publico(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_abastecimento_publico(TEXT,TEXT,TEXT,NUMERIC,NUMERIC,NUMERIC,TEXT,TEXT,TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fechamento_filial_sincronizar(UUID,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fechamento_filial_executar(UUID,TEXT,UUID,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fechamento_filial_reabrir(UUID,UUID,TEXT,TEXT) TO authenticated;
