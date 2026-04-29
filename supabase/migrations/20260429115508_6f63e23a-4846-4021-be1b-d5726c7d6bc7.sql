
-- 1) acoes_log universal
CREATE TABLE IF NOT EXISTS public.acoes_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modulo text NOT NULL,
  entidade text NOT NULL,
  entidade_id text,
  acao text NOT NULL,
  funcionario_id uuid REFERENCES public.funcionarios(id) ON DELETE SET NULL,
  funcionario_nome text,
  cpf text,
  empresa text,
  user_id uuid,
  user_email text,
  origem text DEFAULT 'app',
  antes jsonb,
  depois jsonb,
  arquivo_url text,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_acoes_log_func ON public.acoes_log(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_acoes_log_entidade ON public.acoes_log(entidade, entidade_id);
CREATE INDEX IF NOT EXISTS idx_acoes_log_modulo ON public.acoes_log(modulo, created_at DESC);

ALTER TABLE public.acoes_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_acoes_log" ON public.acoes_log
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "auth_insert_acoes_log" ON public.acoes_log
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "auth_select_acoes_log" ON public.acoes_log
  FOR SELECT TO authenticated
  USING (true);

-- Permite inserções vindas de portais CPF (sem auth) — registro confiável é feito via edge/RPC service-role
CREATE POLICY "anon_insert_acoes_log" ON public.acoes_log
  FOR INSERT TO anon
  WITH CHECK (true);

-- 2) apontamento contabilidade
CREATE TABLE IF NOT EXISTS public.apontamentos_contabilidade (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.empresas(id) ON DELETE CASCADE,
  empresa_nome text,
  competencia text NOT NULL,
  status text NOT NULL DEFAULT 'aberto',
  total_geral numeric NOT NULL DEFAULT 0,
  criado_por_user_id uuid,
  criado_por_nome text,
  criado_por_funcionario_id uuid REFERENCES public.funcionarios(id),
  atualizado_por_nome text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, competencia)
);

CREATE TABLE IF NOT EXISTS public.apontamentos_contabilidade_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  apontamento_id uuid NOT NULL REFERENCES public.apontamentos_contabilidade(id) ON DELETE CASCADE,
  funcionario_id uuid REFERENCES public.funcionarios(id),
  nome text NOT NULL,
  cpf text,
  salario numeric NOT NULL DEFAULT 0,
  insalubridade numeric NOT NULL DEFAULT 0,
  comissao numeric NOT NULL DEFAULT 0,
  hora_extra_60 numeric NOT NULL DEFAULT 0,
  hora_extra_100 numeric NOT NULL DEFAULT 0,
  assistencia_medica numeric NOT NULL DEFAULT 0,
  falta_dsr numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  alterado_por_nome text,
  alterado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_apont_contab_comp ON public.apontamentos_contabilidade(company_id, competencia);
CREATE INDEX IF NOT EXISTS idx_apont_contab_itens_ap ON public.apontamentos_contabilidade_itens(apontamento_id);

ALTER TABLE public.apontamentos_contabilidade ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apontamentos_contabilidade_itens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_apont" ON public.apontamentos_contabilidade
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "auth_select_apont" ON public.apontamentos_contabilidade
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_insupd_apont" ON public.apontamentos_contabilidade
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "auth_upd_apont" ON public.apontamentos_contabilidade
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "admin_all_apont_itens" ON public.apontamentos_contabilidade_itens
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "auth_select_apont_itens" ON public.apontamentos_contabilidade_itens
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_ins_apont_itens" ON public.apontamentos_contabilidade_itens
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "auth_upd_apont_itens" ON public.apontamentos_contabilidade_itens
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "auth_del_apont_itens" ON public.apontamentos_contabilidade_itens
  FOR DELETE TO authenticated USING (true);

CREATE TRIGGER touch_apont_contab BEFORE UPDATE ON public.apontamentos_contabilidade
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_apont_contab_itens BEFORE UPDATE ON public.apontamentos_contabilidade_itens
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3) Permissão faturamento para Robson e Paula
INSERT INTO public.funcionario_modulos (funcionario_id, modulo, status, autorizado_em)
VALUES
  ('9c5c7116-f751-484f-8098-920af451fbab', 'faturamento', 'ativo', now()),
  ('71ce7472-7413-4191-ad75-642ba7f12398', 'faturamento', 'ativo', now())
ON CONFLICT (funcionario_id, modulo) DO UPDATE SET status='ativo';
