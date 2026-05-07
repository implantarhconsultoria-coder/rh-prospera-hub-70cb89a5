
CREATE TABLE IF NOT EXISTS public.recibos_correcoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL CHECK (tipo IN ('vr','vt')),
  company_id TEXT NOT NULL,
  funcionario_id TEXT NOT NULL,
  competencia TEXT NOT NULL,
  -- valores originais (snapshot)
  valor_diario_original NUMERIC(12,2),
  dias_finais_original INT,
  valor_total_original NUMERIC(12,2),
  -- valores corrigidos
  valor_diario_corrigido NUMERIC(12,2),
  dias_finais_corrigido INT,
  valor_total_corrigido NUMERIC(12,2),
  observacao TEXT,
  motivo TEXT NOT NULL,
  data_pagamento DATE,
  corrigido_por_user_id UUID,
  corrigido_por_nome TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tipo, company_id, funcionario_id, competencia)
);

CREATE TABLE IF NOT EXISTS public.recibos_correcoes_historico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  correcao_id UUID,
  tipo TEXT NOT NULL,
  company_id TEXT NOT NULL,
  funcionario_id TEXT NOT NULL,
  competencia TEXT NOT NULL,
  acao TEXT NOT NULL, -- 'criada' | 'atualizada' | 'removida'
  payload JSONB,
  user_id UUID,
  usuario_nome TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.recibos_correcoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recibos_correcoes_historico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin pode ver correcoes"
  ON public.recibos_correcoes FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admin pode inserir correcoes"
  ON public.recibos_correcoes FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admin pode atualizar correcoes"
  ON public.recibos_correcoes FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admin pode apagar correcoes"
  ON public.recibos_correcoes FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admin pode ver historico correcoes"
  ON public.recibos_correcoes_historico FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admin pode inserir historico correcoes"
  ON public.recibos_correcoes_historico FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_recibos_correcoes_updated
  BEFORE UPDATE ON public.recibos_correcoes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.tg_recibos_correcoes_audit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_acao TEXT;
  v_payload JSONB;
  v_uid UUID := auth.uid();
  v_nome TEXT;
BEGIN
  SELECT COALESCE(nome_completo,email) INTO v_nome FROM public.profiles WHERE user_id=v_uid LIMIT 1;
  IF TG_OP = 'INSERT' THEN
    v_acao := 'criada';
    v_payload := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    v_acao := 'atualizada';
    v_payload := jsonb_build_object('antes', to_jsonb(OLD), 'depois', to_jsonb(NEW));
  ELSE
    v_acao := 'removida';
    v_payload := to_jsonb(OLD);
  END IF;

  INSERT INTO public.recibos_correcoes_historico(
    correcao_id, tipo, company_id, funcionario_id, competencia, acao, payload, user_id, usuario_nome
  ) VALUES (
    COALESCE(NEW.id, OLD.id),
    COALESCE(NEW.tipo, OLD.tipo),
    COALESCE(NEW.company_id, OLD.company_id),
    COALESCE(NEW.funcionario_id, OLD.funcionario_id),
    COALESCE(NEW.competencia, OLD.competencia),
    v_acao, v_payload, v_uid, v_nome
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_recibos_correcoes_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.recibos_correcoes
  FOR EACH ROW EXECUTE FUNCTION public.tg_recibos_correcoes_audit();
