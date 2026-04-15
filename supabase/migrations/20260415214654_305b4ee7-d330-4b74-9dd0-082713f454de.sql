
-- ═══════════════════════════════════════════
-- TABELA: empresas
-- ═══════════════════════════════════════════
CREATE TABLE public.empresas (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo text NOT NULL UNIQUE,
  nome text NOT NULL,
  cnpj text NOT NULL DEFAULT '',
  cidade text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'ativa',
  observacoes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can do everything on empresas"
  ON public.empresas FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Filial users can view own empresa"
  ON public.empresas FOR SELECT TO authenticated
  USING (nome = ANY(get_user_empresas()));

-- ═══════════════════════════════════════════
-- TABELA: funcionarios
-- ═══════════════════════════════════════════
CREATE TABLE public.funcionarios (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  codigo text NOT NULL DEFAULT '',
  registro text NOT NULL DEFAULT '',
  matricula_esocial text NOT NULL DEFAULT '',
  nome text NOT NULL,
  cpf text NOT NULL DEFAULT '',
  rg text NOT NULL DEFAULT '',
  cargo text NOT NULL DEFAULT '',
  categoria text NOT NULL DEFAULT 'operacional',
  salario_base numeric NOT NULL DEFAULT 0,
  data_admissao date,
  data_exame_medico date,
  vr_ativo boolean NOT NULL DEFAULT false,
  vr_diario numeric NOT NULL DEFAULT 0,
  va_ativo boolean NOT NULL DEFAULT false,
  va_mensal numeric NOT NULL DEFAULT 0,
  vt_ativo boolean NOT NULL DEFAULT false,
  vt_diario numeric NOT NULL DEFAULT 0,
  insalubridade_ativa boolean NOT NULL DEFAULT false,
  insalubridade_valor numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'ativo',
  telefone text NOT NULL DEFAULT '',
  celular text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  endereco text NOT NULL DEFAULT '',
  pix text NOT NULL DEFAULT '',
  banco text NOT NULL DEFAULT '',
  agencia text NOT NULL DEFAULT '',
  conta text NOT NULL DEFAULT '',
  observacoes text NOT NULL DEFAULT '',
  inss numeric,
  liquido numeric,
  referencia_competencia text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.funcionarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can do everything on funcionarios"
  ON public.funcionarios FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Filial users can view own empresa funcionarios"
  ON public.funcionarios FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.empresas e
      WHERE e.id = funcionarios.company_id
      AND e.nome = ANY(get_user_empresas())
    )
  );

CREATE POLICY "Filial users can update own empresa funcionarios"
  ON public.funcionarios FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.empresas e
      WHERE e.id = funcionarios.company_id
      AND e.nome = ANY(get_user_empresas())
    )
  );

-- ═══════════════════════════════════════════
-- TABELA: lancamentos_mensais
-- ═══════════════════════════════════════════
CREATE TABLE public.lancamentos_mensais (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  funcionario_id uuid NOT NULL REFERENCES public.funcionarios(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  competencia text NOT NULL,
  faltas_dias numeric NOT NULL DEFAULT 0,
  atrasos numeric NOT NULL DEFAULT 0,
  he50 numeric NOT NULL DEFAULT 0,
  he100 numeric NOT NULL DEFAULT 0,
  adicionais numeric NOT NULL DEFAULT 0,
  descontos_diversos numeric NOT NULL DEFAULT 0,
  adiantamento numeric NOT NULL DEFAULT 0,
  vr_aplicado boolean NOT NULL DEFAULT false,
  vr_dias numeric NOT NULL DEFAULT 0,
  va_aplicado boolean NOT NULL DEFAULT false,
  vt_aplicado boolean NOT NULL DEFAULT false,
  vt_desconto numeric NOT NULL DEFAULT 0,
  comissao_base numeric NOT NULL DEFAULT 0,
  insalubridade_aplicada boolean NOT NULL DEFAULT false,
  status_conferencia text NOT NULL DEFAULT 'pendente',
  observacoes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(funcionario_id, competencia)
);

ALTER TABLE public.lancamentos_mensais ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can do everything on lancamentos"
  ON public.lancamentos_mensais FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Filial users can view own empresa lancamentos"
  ON public.lancamentos_mensais FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.empresas e
      WHERE e.id = lancamentos_mensais.company_id
      AND e.nome = ANY(get_user_empresas())
    )
  );

CREATE POLICY "Filial users can manage own empresa lancamentos"
  ON public.lancamentos_mensais FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.empresas e
      WHERE e.id = lancamentos_mensais.company_id
      AND e.nome = ANY(get_user_empresas())
    )
  );

CREATE POLICY "Filial users can update own empresa lancamentos"
  ON public.lancamentos_mensais FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.empresas e
      WHERE e.id = lancamentos_mensais.company_id
      AND e.nome = ANY(get_user_empresas())
    )
  );

-- Triggers for updated_at
CREATE TRIGGER update_empresas_updated_at
  BEFORE UPDATE ON public.empresas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_funcionarios_updated_at
  BEFORE UPDATE ON public.funcionarios
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_lancamentos_updated_at
  BEFORE UPDATE ON public.lancamentos_mensais
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
