
-- 1) FECHAMENTOS POR FILIAL/COMPETÊNCIA (criada primeiro pq movimento_diario referencia)
CREATE TABLE public.fechamentos_filial (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  empresa_nome TEXT NOT NULL DEFAULT '',
  competencia TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto','fechado','reaberto')),
  fechado_por_user_id UUID,
  fechado_por_nome TEXT NOT NULL DEFAULT '',
  fechado_em TIMESTAMPTZ,
  reaberto_por_user_id UUID,
  reaberto_por_nome TEXT NOT NULL DEFAULT '',
  reaberto_em TIMESTAMPTZ,
  motivo_reabertura TEXT NOT NULL DEFAULT '',
  total_funcionarios INTEGER NOT NULL DEFAULT 0,
  total_proventos NUMERIC NOT NULL DEFAULT 0,
  total_descontos NUMERIC NOT NULL DEFAULT 0,
  total_liquido NUMERIC NOT NULL DEFAULT 0,
  observacoes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, competencia)
);

CREATE INDEX idx_fech_filial_comp ON public.fechamentos_filial(competencia);
CREATE INDEX idx_fech_filial_status ON public.fechamentos_filial(status);

ALTER TABLE public.fechamentos_filial ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin pode tudo em fechamentos"
ON public.fechamentos_filial FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Filial ve fechamento da propria empresa"
ON public.fechamentos_filial FOR SELECT TO authenticated
USING (empresa_nome = ANY (get_user_empresas()));

CREATE POLICY "Filial cria fechamento da propria empresa"
ON public.fechamentos_filial FOR INSERT TO authenticated
WITH CHECK (empresa_nome = ANY (get_user_empresas()));

CREATE POLICY "Filial atualiza fechamento se nao fechado"
ON public.fechamentos_filial FOR UPDATE TO authenticated
USING (empresa_nome = ANY (get_user_empresas()) AND status <> 'fechado')
WITH CHECK (empresa_nome = ANY (get_user_empresas()));

-- 2) MOVIMENTO DIÁRIO
CREATE TABLE public.movimento_diario (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  funcionario_id UUID NOT NULL REFERENCES public.funcionarios(id) ON DELETE CASCADE,
  competencia TEXT NOT NULL,
  data DATE NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('falta','atraso','he50','he100','adicional','desconto','adiantamento','observacao')),
  quantidade NUMERIC NOT NULL DEFAULT 0,
  valor NUMERIC NOT NULL DEFAULT 0,
  observacao TEXT NOT NULL DEFAULT '',
  registrado_por_user_id UUID NOT NULL,
  registrado_por_nome TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_mov_diario_comp ON public.movimento_diario(company_id, competencia);
CREATE INDEX idx_mov_diario_func ON public.movimento_diario(funcionario_id, competencia);
CREATE INDEX idx_mov_diario_data ON public.movimento_diario(data);

ALTER TABLE public.movimento_diario ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin pode tudo em movimento_diario"
ON public.movimento_diario FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Filial ve movimento da propria empresa"
ON public.movimento_diario FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM empresas e WHERE e.id = movimento_diario.company_id AND e.nome = ANY (get_user_empresas())));

CREATE POLICY "Filial insere movimento se nao fechado"
ON public.movimento_diario FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM empresas e WHERE e.id = movimento_diario.company_id AND e.nome = ANY (get_user_empresas()))
  AND NOT EXISTS (
    SELECT 1 FROM public.fechamentos_filial f
    WHERE f.company_id = movimento_diario.company_id
      AND f.competencia = movimento_diario.competencia
      AND f.status = 'fechado'
  )
);

CREATE POLICY "Filial atualiza movimento se nao fechado"
ON public.movimento_diario FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM empresas e WHERE e.id = movimento_diario.company_id AND e.nome = ANY (get_user_empresas()))
  AND NOT EXISTS (
    SELECT 1 FROM public.fechamentos_filial f
    WHERE f.company_id = movimento_diario.company_id
      AND f.competencia = movimento_diario.competencia
      AND f.status = 'fechado'
  )
);

CREATE POLICY "Filial deleta movimento se nao fechado"
ON public.movimento_diario FOR DELETE TO authenticated
USING (
  EXISTS (SELECT 1 FROM empresas e WHERE e.id = movimento_diario.company_id AND e.nome = ANY (get_user_empresas()))
  AND NOT EXISTS (
    SELECT 1 FROM public.fechamentos_filial f
    WHERE f.company_id = movimento_diario.company_id
      AND f.competencia = movimento_diario.competencia
      AND f.status = 'fechado'
  )
);

-- 3) HISTÓRICO DE FECHAMENTOS
CREATE TABLE public.fechamentos_historico (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fechamento_id UUID NOT NULL REFERENCES public.fechamentos_filial(id) ON DELETE CASCADE,
  acao TEXT NOT NULL CHECK (acao IN ('criado','fechado','reaberto','ajustado')),
  user_id UUID NOT NULL,
  usuario_nome TEXT NOT NULL DEFAULT '',
  detalhes JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_fech_hist_fech ON public.fechamentos_historico(fechamento_id);

ALTER TABLE public.fechamentos_historico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin ve historico"
ON public.fechamentos_historico FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Filial ve historico da propria empresa"
ON public.fechamentos_historico FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.fechamentos_filial f
  WHERE f.id = fechamentos_historico.fechamento_id AND f.empresa_nome = ANY (get_user_empresas())
));

CREATE POLICY "Autenticado registra historico"
ON public.fechamentos_historico FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

-- 4) AJUSTES EM lancamentos_mensais
ALTER TABLE public.lancamentos_mensais
  ADD COLUMN IF NOT EXISTS fechamento_id UUID REFERENCES public.fechamentos_filial(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS origem TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS bloqueado BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_lanc_fechamento ON public.lancamentos_mensais(fechamento_id);

DROP POLICY IF EXISTS "Filial users can update own empresa lancamentos" ON public.lancamentos_mensais;
CREATE POLICY "Filial users can update own empresa lancamentos"
ON public.lancamentos_mensais FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM empresas e WHERE e.id = lancamentos_mensais.company_id AND e.nome = ANY (get_user_empresas()))
  AND bloqueado = false
);

-- 5) Triggers updated_at
CREATE TRIGGER trg_mov_diario_updated
BEFORE UPDATE ON public.movimento_diario
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_fech_filial_updated
BEFORE UPDATE ON public.fechamentos_filial
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
