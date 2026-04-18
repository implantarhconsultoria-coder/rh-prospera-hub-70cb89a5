
-- ============================================================
-- MÓDULO DE FATURAMENTO — schema completo
-- ============================================================

-- 1. CLIENTES (pagadores)
CREATE TABLE public.clientes_fat (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  razao_social text NOT NULL,
  nome_fantasia text DEFAULT '',
  cnpj_cpf text DEFAULT '',
  inscricao_estadual text DEFAULT '',
  email text DEFAULT '',
  telefone text DEFAULT '',
  contato_responsavel text DEFAULT '',
  endereco text DEFAULT '',
  cidade text DEFAULT '',
  uf text DEFAULT '',
  cep text DEFAULT '',
  observacoes text DEFAULT '',
  status text NOT NULL DEFAULT 'ativo',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. CONTRATOS
CREATE TABLE public.contratos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero text NOT NULL,
  cliente_id uuid NOT NULL REFERENCES public.clientes_fat(id) ON DELETE RESTRICT,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  tipo text NOT NULL DEFAULT 'locacao',
  data_inicio date NOT NULL,
  data_fim date,
  regra_faturamento text NOT NULL DEFAULT 'mensal_fixo',
  periodicidade text NOT NULL DEFAULT 'mensal',
  dia_vencimento integer DEFAULT 10,
  indice_reajuste text DEFAULT 'IPCA',
  percentual_reajuste numeric DEFAULT 0,
  data_base_reajuste date,
  proximo_reajuste date,
  valor_mensal numeric NOT NULL DEFAULT 0,
  observacoes text DEFAULT '',
  status text NOT NULL DEFAULT 'ativo',
  arquivo_url text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. EQUIPAMENTOS VINCULADOS AO CONTRATO
CREATE TABLE public.contrato_equipamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id uuid NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  ativo_id uuid REFERENCES public.ativos(id) ON DELETE SET NULL,
  descricao_livre text DEFAULT '',
  patrimonio text DEFAULT '',
  placa text DEFAULT '',
  data_envio date,
  data_retorno date,
  valor_unitario numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'ativo',
  observacao text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4. MEDIÇÕES
CREATE TABLE public.medicoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id uuid NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  competencia text NOT NULL,
  data_inicio date NOT NULL,
  data_fim date NOT NULL,
  total numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pendente',
  observacoes text DEFAULT '',
  aprovada_por uuid,
  aprovada_em timestamptz,
  fatura_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 5. ITENS DA MEDIÇÃO
CREATE TABLE public.medicao_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medicao_id uuid NOT NULL REFERENCES public.medicoes(id) ON DELETE CASCADE,
  contrato_equipamento_id uuid REFERENCES public.contrato_equipamentos(id) ON DELETE SET NULL,
  descricao text NOT NULL DEFAULT '',
  dias_faturaveis numeric DEFAULT 0,
  quantidade numeric NOT NULL DEFAULT 1,
  valor_unitario numeric NOT NULL DEFAULT 0,
  ajuste numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  observacao text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 6. FATURAS
CREATE TABLE public.faturas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero text NOT NULL,
  contrato_id uuid NOT NULL REFERENCES public.contratos(id) ON DELETE RESTRICT,
  cliente_id uuid NOT NULL REFERENCES public.clientes_fat(id) ON DELETE RESTRICT,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  medicao_id uuid REFERENCES public.medicoes(id) ON DELETE SET NULL,
  competencia text NOT NULL,
  data_emissao date NOT NULL DEFAULT CURRENT_DATE,
  data_vencimento date NOT NULL,
  data_pagamento date,
  subtotal numeric NOT NULL DEFAULT 0,
  descontos numeric NOT NULL DEFAULT 0,
  acrescimos numeric NOT NULL DEFAULT 0,
  reajuste_aplicado numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  valor_pago numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'prevista',
  observacoes text DEFAULT '',
  arquivo_pdf_url text DEFAULT '',
  enviada_em timestamptz,
  destinatarios text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 7. ITENS DA FATURA
CREATE TABLE public.fatura_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fatura_id uuid NOT NULL REFERENCES public.faturas(id) ON DELETE CASCADE,
  contrato_equipamento_id uuid REFERENCES public.contrato_equipamentos(id) ON DELETE SET NULL,
  descricao text NOT NULL DEFAULT '',
  quantidade numeric NOT NULL DEFAULT 1,
  valor_unitario numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  observacao text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 8. REAJUSTES
CREATE TABLE public.reajustes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id uuid NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  data_aplicacao date NOT NULL DEFAULT CURRENT_DATE,
  indice text DEFAULT '',
  percentual numeric NOT NULL DEFAULT 0,
  valor_anterior numeric NOT NULL DEFAULT 0,
  valor_novo numeric NOT NULL DEFAULT 0,
  observacao text DEFAULT '',
  status text NOT NULL DEFAULT 'aplicado',
  aplicado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 9. PENDÊNCIAS
CREATE TABLE public.faturamento_pendencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL,
  descricao text NOT NULL,
  contrato_id uuid REFERENCES public.contratos(id) ON DELETE CASCADE,
  fatura_id uuid REFERENCES public.faturas(id) ON DELETE CASCADE,
  cliente_id uuid REFERENCES public.clientes_fat(id) ON DELETE CASCADE,
  severidade text NOT NULL DEFAULT 'media',
  status text NOT NULL DEFAULT 'aberta',
  resolvida_por uuid,
  resolvida_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 10. HISTÓRICO / AUDITORIA
CREATE TABLE public.faturamento_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  usuario_nome text DEFAULT '',
  acao text NOT NULL,
  entidade text NOT NULL,
  entidade_id uuid,
  contrato_id uuid REFERENCES public.contratos(id) ON DELETE SET NULL,
  cliente_id uuid REFERENCES public.clientes_fat(id) ON DELETE SET NULL,
  fatura_id uuid REFERENCES public.faturas(id) ON DELETE SET NULL,
  detalhes jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- ÍNDICES
-- ============================================================
CREATE INDEX idx_contratos_cliente ON public.contratos(cliente_id);
CREATE INDEX idx_contratos_empresa ON public.contratos(empresa_id);
CREATE INDEX idx_contratos_status ON public.contratos(status);
CREATE INDEX idx_contrato_equip_contrato ON public.contrato_equipamentos(contrato_id);
CREATE INDEX idx_contrato_equip_ativo ON public.contrato_equipamentos(ativo_id);
CREATE INDEX idx_medicoes_contrato ON public.medicoes(contrato_id);
CREATE INDEX idx_medicoes_status ON public.medicoes(status);
CREATE INDEX idx_faturas_contrato ON public.faturas(contrato_id);
CREATE INDEX idx_faturas_cliente ON public.faturas(cliente_id);
CREATE INDEX idx_faturas_empresa ON public.faturas(empresa_id);
CREATE INDEX idx_faturas_status ON public.faturas(status);
CREATE INDEX idx_faturas_vencimento ON public.faturas(data_vencimento);
CREATE INDEX idx_reajustes_contrato ON public.reajustes(contrato_id);
CREATE INDEX idx_pendencias_status ON public.faturamento_pendencias(status);
CREATE INDEX idx_historico_contrato ON public.faturamento_historico(contrato_id);
CREATE INDEX idx_historico_fatura ON public.faturamento_historico(fatura_id);

-- ============================================================
-- TRIGGERS updated_at
-- ============================================================
CREATE TRIGGER trg_clientes_fat_updated BEFORE UPDATE ON public.clientes_fat
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_contratos_updated BEFORE UPDATE ON public.contratos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_contrato_equip_updated BEFORE UPDATE ON public.contrato_equipamentos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_medicoes_updated BEFORE UPDATE ON public.medicoes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_faturas_updated BEFORE UPDATE ON public.faturas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- ENABLE RLS
-- ============================================================
ALTER TABLE public.clientes_fat ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contratos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contrato_equipamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medicoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medicao_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fatura_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reajustes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faturamento_pendencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faturamento_historico ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- CLIENTES_FAT: admin total; filial vê todos (cliente é compartilhado)
CREATE POLICY "Admin manage clientes_fat" ON public.clientes_fat FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Filial view clientes_fat" ON public.clientes_fat FOR SELECT TO authenticated
  USING (true);

-- CONTRATOS: admin total; filial só sua empresa
CREATE POLICY "Admin manage contratos" ON public.contratos FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Filial view own empresa contratos" ON public.contratos FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM empresas e WHERE e.id = contratos.empresa_id AND e.nome = ANY (get_user_empresas())));
CREATE POLICY "Filial update own empresa contratos" ON public.contratos FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM empresas e WHERE e.id = contratos.empresa_id AND e.nome = ANY (get_user_empresas())));
CREATE POLICY "Filial insert own empresa contratos" ON public.contratos FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM empresas e WHERE e.id = contratos.empresa_id AND e.nome = ANY (get_user_empresas())));

-- CONTRATO_EQUIPAMENTOS: segue regra do contrato pai
CREATE POLICY "Admin manage contrato_equip" ON public.contrato_equipamentos FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Filial manage contrato_equip via contrato" ON public.contrato_equipamentos FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM contratos c JOIN empresas e ON e.id = c.empresa_id
    WHERE c.id = contrato_equipamentos.contrato_id AND e.nome = ANY (get_user_empresas())))
  WITH CHECK (EXISTS (SELECT 1 FROM contratos c JOIN empresas e ON e.id = c.empresa_id
    WHERE c.id = contrato_equipamentos.contrato_id AND e.nome = ANY (get_user_empresas())));

-- MEDICOES
CREATE POLICY "Admin manage medicoes" ON public.medicoes FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Filial manage medicoes via contrato" ON public.medicoes FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM contratos c JOIN empresas e ON e.id = c.empresa_id
    WHERE c.id = medicoes.contrato_id AND e.nome = ANY (get_user_empresas())))
  WITH CHECK (EXISTS (SELECT 1 FROM contratos c JOIN empresas e ON e.id = c.empresa_id
    WHERE c.id = medicoes.contrato_id AND e.nome = ANY (get_user_empresas())));

-- MEDICAO_ITENS
CREATE POLICY "Admin manage medicao_itens" ON public.medicao_itens FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Filial manage medicao_itens" ON public.medicao_itens FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM medicoes m JOIN contratos c ON c.id = m.contrato_id JOIN empresas e ON e.id = c.empresa_id
    WHERE m.id = medicao_itens.medicao_id AND e.nome = ANY (get_user_empresas())))
  WITH CHECK (EXISTS (SELECT 1 FROM medicoes m JOIN contratos c ON c.id = m.contrato_id JOIN empresas e ON e.id = c.empresa_id
    WHERE m.id = medicao_itens.medicao_id AND e.nome = ANY (get_user_empresas())));

-- FATURAS
CREATE POLICY "Admin manage faturas" ON public.faturas FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Filial view own empresa faturas" ON public.faturas FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM empresas e WHERE e.id = faturas.empresa_id AND e.nome = ANY (get_user_empresas())));
CREATE POLICY "Filial update own empresa faturas" ON public.faturas FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM empresas e WHERE e.id = faturas.empresa_id AND e.nome = ANY (get_user_empresas())));
CREATE POLICY "Filial insert own empresa faturas" ON public.faturas FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM empresas e WHERE e.id = faturas.empresa_id AND e.nome = ANY (get_user_empresas())));

-- FATURA_ITENS
CREATE POLICY "Admin manage fatura_itens" ON public.fatura_itens FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Filial manage fatura_itens" ON public.fatura_itens FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM faturas f JOIN empresas e ON e.id = f.empresa_id
    WHERE f.id = fatura_itens.fatura_id AND e.nome = ANY (get_user_empresas())))
  WITH CHECK (EXISTS (SELECT 1 FROM faturas f JOIN empresas e ON e.id = f.empresa_id
    WHERE f.id = fatura_itens.fatura_id AND e.nome = ANY (get_user_empresas())));

-- REAJUSTES
CREATE POLICY "Admin manage reajustes" ON public.reajustes FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Filial view reajustes via contrato" ON public.reajustes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM contratos c JOIN empresas e ON e.id = c.empresa_id
    WHERE c.id = reajustes.contrato_id AND e.nome = ANY (get_user_empresas())));

-- PENDÊNCIAS
CREATE POLICY "Admin manage pendencias" ON public.faturamento_pendencias FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Filial view pendencias" ON public.faturamento_pendencias FOR SELECT TO authenticated
  USING (
    contrato_id IS NULL OR EXISTS (SELECT 1 FROM contratos c JOIN empresas e ON e.id = c.empresa_id
      WHERE c.id = faturamento_pendencias.contrato_id AND e.nome = ANY (get_user_empresas()))
  );

-- HISTÓRICO
CREATE POLICY "Admin view all historico" ON public.faturamento_historico FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated insert historico" ON public.faturamento_historico FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Filial view historico via contrato" ON public.faturamento_historico FOR SELECT TO authenticated
  USING (
    contrato_id IS NOT NULL AND EXISTS (SELECT 1 FROM contratos c JOIN empresas e ON e.id = c.empresa_id
      WHERE c.id = faturamento_historico.contrato_id AND e.nome = ANY (get_user_empresas()))
  );

-- ============================================================
-- STORAGE BUCKET para PDFs
-- ============================================================
INSERT INTO storage.buckets (id, name, public) VALUES ('faturamento-docs', 'faturamento-docs', true)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read faturamento-docs" ON storage.objects FOR SELECT
  USING (bucket_id = 'faturamento-docs');
CREATE POLICY "Authenticated upload faturamento-docs" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'faturamento-docs');
CREATE POLICY "Authenticated update faturamento-docs" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'faturamento-docs');
CREATE POLICY "Authenticated delete faturamento-docs" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'faturamento-docs');
