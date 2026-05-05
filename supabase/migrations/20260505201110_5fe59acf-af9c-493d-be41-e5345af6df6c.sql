
-- Tabela de clientes do DN4 (cadastro próprio, isolado de clientes_fat)
CREATE TABLE IF NOT EXISTS public.clientes_dn4 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  cnpj_cpf TEXT,
  endereco TEXT,
  empresa_vinculada TEXT,
  forma_pagamento_padrao TEXT,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clientes_dn4_nome ON public.clientes_dn4 (nome);

ALTER TABLE public.clientes_dn4 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin total clientes_dn4" ON public.clientes_dn4
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_clientes_dn4_updated
  BEFORE UPDATE ON public.clientes_dn4
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Tabela principal de faturamentos DN4
CREATE TABLE IF NOT EXISTS public.faturamento_dn4 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID REFERENCES public.clientes_dn4(id) ON DELETE SET NULL,
  cliente_nome TEXT NOT NULL,
  cnpj_cpf TEXT,
  empresa_filial TEXT,
  numero_pedido TEXT,
  data_servico DATE,
  data_emissao DATE NOT NULL DEFAULT CURRENT_DATE,
  descricao TEXT NOT NULL,
  quantidade NUMERIC(14,3) NOT NULL DEFAULT 1,
  valor_unitario NUMERIC(14,2) NOT NULL DEFAULT 0,
  valor_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  forma_pagamento TEXT,
  vencimento DATE,
  observacoes TEXT,
  status TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente','em_conferencia','emitido','finalizado','cancelado','com_erro')),
  competencia TEXT,
  criado_por_user_id UUID,
  criado_por_nome TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dn4_status ON public.faturamento_dn4 (status);
CREATE INDEX IF NOT EXISTS idx_dn4_cliente ON public.faturamento_dn4 (cliente_id);
CREATE INDEX IF NOT EXISTS idx_dn4_competencia ON public.faturamento_dn4 (competencia);
CREATE INDEX IF NOT EXISTS idx_dn4_vencimento ON public.faturamento_dn4 (vencimento);

ALTER TABLE public.faturamento_dn4 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin total faturamento_dn4" ON public.faturamento_dn4
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_dn4_updated
  BEFORE UPDATE ON public.faturamento_dn4
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger: garante valor_total = quantidade * valor_unitario e competencia automática
CREATE OR REPLACE FUNCTION public.dn4_normalize()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.valor_total := ROUND(COALESCE(NEW.quantidade,0) * COALESCE(NEW.valor_unitario,0), 2);
  IF NEW.competencia IS NULL OR NEW.competencia = '' THEN
    NEW.competencia := to_char(COALESCE(NEW.data_emissao, CURRENT_DATE), 'YYYY-MM');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_dn4_normalize
  BEFORE INSERT OR UPDATE ON public.faturamento_dn4
  FOR EACH ROW EXECUTE FUNCTION public.dn4_normalize();
