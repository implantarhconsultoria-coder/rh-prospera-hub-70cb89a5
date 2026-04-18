
-- ============================================
-- FORNECEDORES
-- ============================================
CREATE TABLE public.fornecedores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  razao_social TEXT NOT NULL,
  nome_fantasia TEXT DEFAULT '',
  cnpj_cpf TEXT DEFAULT '',
  inscricao_estadual TEXT DEFAULT '',
  email TEXT DEFAULT '',
  telefone TEXT DEFAULT '',
  contato_responsavel TEXT DEFAULT '',
  endereco TEXT DEFAULT '',
  cidade TEXT DEFAULT '',
  uf TEXT DEFAULT '',
  cep TEXT DEFAULT '',
  banco TEXT DEFAULT '',
  agencia TEXT DEFAULT '',
  conta TEXT DEFAULT '',
  tipo_conta TEXT DEFAULT '',
  pix TEXT DEFAULT '',
  categoria TEXT DEFAULT 'geral',
  status TEXT NOT NULL DEFAULT 'ativo',
  observacoes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.fornecedores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin manage fornecedores" ON public.fornecedores FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Filial view fornecedores" ON public.fornecedores FOR SELECT TO authenticated USING (true);

-- ============================================
-- CONTAS BANCÁRIAS
-- ============================================
CREATE TABLE public.contas_bancarias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  nome TEXT NOT NULL,
  banco TEXT DEFAULT '',
  agencia TEXT DEFAULT '',
  conta TEXT DEFAULT '',
  tipo TEXT NOT NULL DEFAULT 'corrente',
  saldo_inicial NUMERIC NOT NULL DEFAULT 0,
  saldo_atual NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ativa',
  observacoes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.contas_bancarias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin manage contas_bancarias" ON public.contas_bancarias FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Filial view own empresa contas" ON public.contas_bancarias FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM empresas e WHERE e.id = contas_bancarias.empresa_id AND e.nome = ANY(get_user_empresas())));

-- ============================================
-- CENTROS DE CUSTO
-- ============================================
CREATE TABLE public.centros_custo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL,
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'operacional',
  empresa_id UUID REFERENCES public.empresas(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'ativo',
  descricao TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.centros_custo ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin manage centros_custo" ON public.centros_custo FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Filial view centros_custo" ON public.centros_custo FOR SELECT TO authenticated USING (true);

-- ============================================
-- CATEGORIAS FINANCEIRAS
-- ============================================
CREATE TABLE public.categorias_financeiras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'despesa',
  descricao TEXT DEFAULT '',
  ativa BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.categorias_financeiras ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin manage categorias_fin" ON public.categorias_financeiras FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "All view categorias_fin" ON public.categorias_financeiras FOR SELECT TO authenticated USING (true);

-- ============================================
-- TÍTULOS A RECEBER
-- ============================================
CREATE TABLE public.titulos_receber (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES public.clientes_fat(id) ON DELETE RESTRICT,
  contrato_id UUID REFERENCES public.contratos(id) ON DELETE SET NULL,
  fatura_id UUID REFERENCES public.faturas(id) ON DELETE SET NULL,
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  numero TEXT NOT NULL,
  competencia TEXT NOT NULL,
  data_emissao DATE NOT NULL DEFAULT CURRENT_DATE,
  data_vencimento DATE NOT NULL,
  valor_original NUMERIC NOT NULL DEFAULT 0,
  desconto NUMERIC NOT NULL DEFAULT 0,
  juros NUMERIC NOT NULL DEFAULT 0,
  multa NUMERIC NOT NULL DEFAULT 0,
  valor_pago NUMERIC NOT NULL DEFAULT 0,
  saldo NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'aberto',
  conta_bancaria_id UUID REFERENCES public.contas_bancarias(id) ON DELETE SET NULL,
  observacoes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.titulos_receber ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin manage titulos_receber" ON public.titulos_receber FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Filial view own empresa titulos_rec" ON public.titulos_receber FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM empresas e WHERE e.id = titulos_receber.empresa_id AND e.nome = ANY(get_user_empresas())));

-- ============================================
-- RECEBIMENTOS
-- ============================================
CREATE TABLE public.recebimentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo_id UUID NOT NULL REFERENCES public.titulos_receber(id) ON DELETE CASCADE,
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  valor NUMERIC NOT NULL,
  forma_pagamento TEXT NOT NULL DEFAULT 'pix',
  conta_bancaria_id UUID REFERENCES public.contas_bancarias(id) ON DELETE SET NULL,
  observacoes TEXT DEFAULT '',
  user_id UUID NOT NULL,
  usuario_nome TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.recebimentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin manage recebimentos" ON public.recebimentos FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Filial view recebimentos via titulo" ON public.recebimentos FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM titulos_receber t JOIN empresas e ON e.id = t.empresa_id 
                 WHERE t.id = recebimentos.titulo_id AND e.nome = ANY(get_user_empresas())));
CREATE POLICY "Filial insert recebimentos" ON public.recebimentos FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM titulos_receber t JOIN empresas e ON e.id = t.empresa_id 
                 WHERE t.id = recebimentos.titulo_id AND e.nome = ANY(get_user_empresas())));

-- ============================================
-- TÍTULOS A PAGAR
-- ============================================
CREATE TABLE public.titulos_pagar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fornecedor_id UUID REFERENCES public.fornecedores(id) ON DELETE SET NULL,
  fornecedor_nome TEXT DEFAULT '',
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  categoria_id UUID REFERENCES public.categorias_financeiras(id) ON DELETE SET NULL,
  centro_custo_id UUID REFERENCES public.centros_custo(id) ON DELETE SET NULL,
  numero TEXT DEFAULT '',
  descricao TEXT NOT NULL DEFAULT '',
  competencia TEXT NOT NULL,
  data_emissao DATE NOT NULL DEFAULT CURRENT_DATE,
  data_vencimento DATE NOT NULL,
  valor_previsto NUMERIC NOT NULL DEFAULT 0,
  juros NUMERIC NOT NULL DEFAULT 0,
  multa NUMERIC NOT NULL DEFAULT 0,
  desconto NUMERIC NOT NULL DEFAULT 0,
  valor_pago NUMERIC NOT NULL DEFAULT 0,
  saldo NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'aberto',
  recorrencia TEXT DEFAULT 'unica',
  recorrencia_total INTEGER DEFAULT 1,
  recorrencia_indice INTEGER DEFAULT 1,
  anexo_url TEXT DEFAULT '',
  requer_aprovacao BOOLEAN NOT NULL DEFAULT false,
  aprovado_por UUID,
  aprovado_em TIMESTAMPTZ,
  observacoes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.titulos_pagar ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin manage titulos_pagar" ON public.titulos_pagar FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Filial view own empresa titulos_pag" ON public.titulos_pagar FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM empresas e WHERE e.id = titulos_pagar.empresa_id AND e.nome = ANY(get_user_empresas())));
CREATE POLICY "Filial insert titulos_pag" ON public.titulos_pagar FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM empresas e WHERE e.id = titulos_pagar.empresa_id AND e.nome = ANY(get_user_empresas())));

-- ============================================
-- PAGAMENTOS
-- ============================================
CREATE TABLE public.pagamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo_id UUID NOT NULL REFERENCES public.titulos_pagar(id) ON DELETE CASCADE,
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  valor NUMERIC NOT NULL,
  forma_pagamento TEXT NOT NULL DEFAULT 'pix',
  conta_bancaria_id UUID REFERENCES public.contas_bancarias(id) ON DELETE SET NULL,
  observacoes TEXT DEFAULT '',
  user_id UUID NOT NULL,
  usuario_nome TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.pagamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin manage pagamentos" ON public.pagamentos FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Filial view pagamentos via titulo" ON public.pagamentos FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM titulos_pagar t JOIN empresas e ON e.id = t.empresa_id 
                 WHERE t.id = pagamentos.titulo_id AND e.nome = ANY(get_user_empresas())));
CREATE POLICY "Filial insert pagamentos" ON public.pagamentos FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM titulos_pagar t JOIN empresas e ON e.id = t.empresa_id 
                 WHERE t.id = pagamentos.titulo_id AND e.nome = ANY(get_user_empresas())));

-- ============================================
-- MOVIMENTAÇÕES BANCÁRIAS
-- ============================================
CREATE TABLE public.movimentacoes_bancarias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_bancaria_id UUID NOT NULL REFERENCES public.contas_bancarias(id) ON DELETE CASCADE,
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  tipo TEXT NOT NULL,
  valor NUMERIC NOT NULL,
  descricao TEXT DEFAULT '',
  recebimento_id UUID REFERENCES public.recebimentos(id) ON DELETE SET NULL,
  pagamento_id UUID REFERENCES public.pagamentos(id) ON DELETE SET NULL,
  conciliado BOOLEAN NOT NULL DEFAULT false,
  data_conciliacao TIMESTAMPTZ,
  conciliacao_id UUID,
  origem TEXT DEFAULT 'manual',
  user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.movimentacoes_bancarias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin manage movimentacoes" ON public.movimentacoes_bancarias FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Filial view movimentacoes" ON public.movimentacoes_bancarias FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM contas_bancarias cb JOIN empresas e ON e.id = cb.empresa_id 
                 WHERE cb.id = movimentacoes_bancarias.conta_bancaria_id AND e.nome = ANY(get_user_empresas())));

-- ============================================
-- CONCILIAÇÕES
-- ============================================
CREATE TABLE public.conciliacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_bancaria_id UUID NOT NULL REFERENCES public.contas_bancarias(id) ON DELETE CASCADE,
  data_inicio DATE NOT NULL,
  data_fim DATE NOT NULL,
  total_interno NUMERIC NOT NULL DEFAULT 0,
  total_extrato NUMERIC NOT NULL DEFAULT 0,
  divergencia NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pendente',
  observacao TEXT DEFAULT '',
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.conciliacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin manage conciliacoes" ON public.conciliacoes FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

-- ============================================
-- RENEGOCIAÇÕES
-- ============================================
CREATE TABLE public.renegociacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo_receber_id UUID REFERENCES public.titulos_receber(id) ON DELETE CASCADE,
  titulo_pagar_id UUID REFERENCES public.titulos_pagar(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL DEFAULT 'parcelamento',
  valor_original NUMERIC NOT NULL DEFAULT 0,
  valor_novo NUMERIC NOT NULL DEFAULT 0,
  desconto_concedido NUMERIC NOT NULL DEFAULT 0,
  parcelas INTEGER NOT NULL DEFAULT 1,
  data_negociacao DATE NOT NULL DEFAULT CURRENT_DATE,
  motivo TEXT DEFAULT '',
  observacao TEXT DEFAULT '',
  autorizado_por UUID NOT NULL,
  autorizado_por_nome TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.renegociacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin manage renegociacoes" ON public.renegociacoes FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Filial view renegociacoes" ON public.renegociacoes FOR SELECT TO authenticated USING (true);

-- ============================================
-- TENTATIVAS DE COBRANÇA (inadimplência)
-- ============================================
CREATE TABLE public.cobrancas_tentativas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo_id UUID NOT NULL REFERENCES public.titulos_receber(id) ON DELETE CASCADE,
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  canal TEXT NOT NULL DEFAULT 'email',
  resultado TEXT NOT NULL DEFAULT 'sem_retorno',
  observacao TEXT DEFAULT '',
  proximo_contato DATE,
  user_id UUID NOT NULL,
  usuario_nome TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.cobrancas_tentativas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin manage cobrancas" ON public.cobrancas_tentativas FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Filial view cobrancas" ON public.cobrancas_tentativas FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM titulos_receber t JOIN empresas e ON e.id = t.empresa_id 
                 WHERE t.id = cobrancas_tentativas.titulo_id AND e.nome = ANY(get_user_empresas())));

-- ============================================
-- IMPOSTOS
-- ============================================
CREATE TABLE public.impostos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL,
  base_calculo NUMERIC NOT NULL DEFAULT 0,
  aliquota NUMERIC NOT NULL DEFAULT 0,
  valor NUMERIC NOT NULL DEFAULT 0,
  retido BOOLEAN NOT NULL DEFAULT false,
  competencia TEXT NOT NULL,
  fatura_id UUID REFERENCES public.faturas(id) ON DELETE SET NULL,
  titulo_pagar_id UUID REFERENCES public.titulos_pagar(id) ON DELETE SET NULL,
  empresa_id UUID REFERENCES public.empresas(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.impostos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin manage impostos" ON public.impostos FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Filial view impostos" ON public.impostos FOR SELECT TO authenticated USING (true);

-- ============================================
-- CONFIGURAÇÕES FINANCEIRAS
-- ============================================
CREATE TABLE public.config_financeiro (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chave TEXT NOT NULL UNIQUE,
  valor TEXT NOT NULL DEFAULT '',
  descricao TEXT DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.config_financeiro ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin manage config_fin" ON public.config_financeiro FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "All view config_fin" ON public.config_financeiro FOR SELECT TO authenticated USING (true);

INSERT INTO public.config_financeiro (chave, valor, descricao) VALUES
  ('valor_minimo_aprovacao', '5000', 'Valor mínimo em R$ que exige aprovação para pagamento'),
  ('juros_dia_padrao', '0.033', 'Juros ao dia padrão (% por dia, ex: 0.033 = 1% ao mês)'),
  ('multa_atraso_padrao', '2', 'Multa por atraso padrão (%)');

INSERT INTO public.categorias_financeiras (nome, tipo) VALUES
  ('Locação de Equipamentos', 'receita'),
  ('Manutenção / Serviço', 'receita'),
  ('Folha de Pagamento', 'despesa'),
  ('Combustível', 'despesa'),
  ('Manutenção de Frota', 'despesa'),
  ('Aluguel', 'despesa'),
  ('Energia / Água / Internet', 'despesa'),
  ('Impostos', 'despesa'),
  ('Materiais / Almoxarifado', 'despesa'),
  ('Outras Receitas', 'receita'),
  ('Outras Despesas', 'despesa');

-- ============================================
-- TRIGGERS DE TIMESTAMP
-- ============================================
CREATE TRIGGER trg_fornecedores_upd BEFORE UPDATE ON public.fornecedores FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_contas_bancarias_upd BEFORE UPDATE ON public.contas_bancarias FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_centros_custo_upd BEFORE UPDATE ON public.centros_custo FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_titulos_receber_upd BEFORE UPDATE ON public.titulos_receber FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_titulos_pagar_upd BEFORE UPDATE ON public.titulos_pagar FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_conciliacoes_upd BEFORE UPDATE ON public.conciliacoes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- TRIGGER: atualiza saldo título a receber
-- ============================================
CREATE OR REPLACE FUNCTION public.update_saldo_titulo_receber()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_total_pago NUMERIC;
  v_titulo RECORD;
BEGIN
  SELECT COALESCE(SUM(valor),0) INTO v_total_pago
  FROM public.recebimentos WHERE titulo_id = COALESCE(NEW.titulo_id, OLD.titulo_id);
  SELECT * INTO v_titulo FROM public.titulos_receber WHERE id = COALESCE(NEW.titulo_id, OLD.titulo_id);
  UPDATE public.titulos_receber
  SET valor_pago = v_total_pago,
      saldo = (v_titulo.valor_original + v_titulo.juros + v_titulo.multa - v_titulo.desconto - v_total_pago),
      status = CASE
        WHEN v_total_pago >= (v_titulo.valor_original + v_titulo.juros + v_titulo.multa - v_titulo.desconto) THEN 'pago'
        WHEN v_total_pago > 0 THEN 'parcial'
        WHEN v_titulo.data_vencimento < CURRENT_DATE THEN 'vencido'
        ELSE 'aberto'
      END,
      updated_at = now()
  WHERE id = COALESCE(NEW.titulo_id, OLD.titulo_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_recebimentos_saldo
AFTER INSERT OR UPDATE OR DELETE ON public.recebimentos
FOR EACH ROW EXECUTE FUNCTION public.update_saldo_titulo_receber();

-- ============================================
-- TRIGGER: atualiza saldo título a pagar
-- ============================================
CREATE OR REPLACE FUNCTION public.update_saldo_titulo_pagar()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_total_pago NUMERIC;
  v_titulo RECORD;
BEGIN
  SELECT COALESCE(SUM(valor),0) INTO v_total_pago
  FROM public.pagamentos WHERE titulo_id = COALESCE(NEW.titulo_id, OLD.titulo_id);
  SELECT * INTO v_titulo FROM public.titulos_pagar WHERE id = COALESCE(NEW.titulo_id, OLD.titulo_id);
  UPDATE public.titulos_pagar
  SET valor_pago = v_total_pago,
      saldo = (v_titulo.valor_previsto + v_titulo.juros + v_titulo.multa - v_titulo.desconto - v_total_pago),
      status = CASE
        WHEN v_total_pago >= (v_titulo.valor_previsto + v_titulo.juros + v_titulo.multa - v_titulo.desconto) THEN 'pago'
        WHEN v_total_pago > 0 THEN 'parcial'
        WHEN v_titulo.data_vencimento < CURRENT_DATE THEN 'vencido'
        ELSE 'aberto'
      END,
      updated_at = now()
  WHERE id = COALESCE(NEW.titulo_id, OLD.titulo_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_pagamentos_saldo
AFTER INSERT OR UPDATE OR DELETE ON public.pagamentos
FOR EACH ROW EXECUTE FUNCTION public.update_saldo_titulo_pagar();

-- ============================================
-- TRIGGER: atualiza saldo conta bancária + cria movimentação
-- ============================================
CREATE OR REPLACE FUNCTION public.cria_mov_recebimento()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.conta_bancaria_id IS NOT NULL THEN
    INSERT INTO public.movimentacoes_bancarias (conta_bancaria_id, data, tipo, valor, descricao, recebimento_id, user_id, origem)
    VALUES (NEW.conta_bancaria_id, NEW.data, 'entrada', NEW.valor, 'Recebimento título ' || NEW.titulo_id, NEW.id, NEW.user_id, 'recebimento');
    UPDATE public.contas_bancarias SET saldo_atual = saldo_atual + NEW.valor, updated_at = now() WHERE id = NEW.conta_bancaria_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_recebimento_mov AFTER INSERT ON public.recebimentos
FOR EACH ROW EXECUTE FUNCTION public.cria_mov_recebimento();

CREATE OR REPLACE FUNCTION public.cria_mov_pagamento()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.conta_bancaria_id IS NOT NULL THEN
    INSERT INTO public.movimentacoes_bancarias (conta_bancaria_id, data, tipo, valor, descricao, pagamento_id, user_id, origem)
    VALUES (NEW.conta_bancaria_id, NEW.data, 'saida', NEW.valor, 'Pagamento título ' || NEW.titulo_id, NEW.id, NEW.user_id, 'pagamento');
    UPDATE public.contas_bancarias SET saldo_atual = saldo_atual - NEW.valor, updated_at = now() WHERE id = NEW.conta_bancaria_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pagamento_mov AFTER INSERT ON public.pagamentos
FOR EACH ROW EXECUTE FUNCTION public.cria_mov_pagamento();

-- ============================================
-- ÍNDICES
-- ============================================
CREATE INDEX idx_titulos_receber_cliente ON public.titulos_receber(cliente_id);
CREATE INDEX idx_titulos_receber_status ON public.titulos_receber(status);
CREATE INDEX idx_titulos_receber_venc ON public.titulos_receber(data_vencimento);
CREATE INDEX idx_titulos_pagar_fornecedor ON public.titulos_pagar(fornecedor_id);
CREATE INDEX idx_titulos_pagar_status ON public.titulos_pagar(status);
CREATE INDEX idx_titulos_pagar_venc ON public.titulos_pagar(data_vencimento);
CREATE INDEX idx_mov_conta ON public.movimentacoes_bancarias(conta_bancaria_id, data);
CREATE INDEX idx_recebimentos_titulo ON public.recebimentos(titulo_id);
CREATE INDEX idx_pagamentos_titulo ON public.pagamentos(titulo_id);
