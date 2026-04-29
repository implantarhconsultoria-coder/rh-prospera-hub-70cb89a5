-- Tabela de feriados para cálculo de VR/VT por filial
CREATE TABLE IF NOT EXISTS public.feriados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data date NOT NULL,
  nome text NOT NULL,
  tipo text NOT NULL DEFAULT 'nacional', -- nacional | estadual | municipal | empresa
  cidade text,
  uf text,
  empresa_id text,
  filial_id text,
  ativo boolean NOT NULL DEFAULT true,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.feriados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "feriados_select_all" ON public.feriados;
CREATE POLICY "feriados_select_all" ON public.feriados FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "feriados_admin_all" ON public.feriados;
CREATE POLICY "feriados_admin_all" ON public.feriados FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_feriados_data ON public.feriados(data);
CREATE INDEX IF NOT EXISTS idx_feriados_uf_cidade ON public.feriados(uf, cidade);

-- Seed feriados nacionais 2026 (idempotente: deduplica por (data,nome,tipo,COALESCE(uf,''),COALESCE(cidade,'')))
INSERT INTO public.feriados (data, nome, tipo)
SELECT v.data::date, v.nome, 'nacional' FROM (VALUES
  ('2026-01-01','Confraternização Universal'),
  ('2026-04-03','Sexta-feira Santa'),
  ('2026-04-21','Tiradentes'),
  ('2026-05-01','Dia do Trabalhador'),
  ('2026-09-07','Independência'),
  ('2026-10-12','Nossa Senhora Aparecida'),
  ('2026-11-02','Finados'),
  ('2026-11-15','Proclamação da República'),
  ('2026-12-25','Natal')
) AS v(data, nome)
WHERE NOT EXISTS (
  SELECT 1 FROM public.feriados f
  WHERE f.data = v.data::date AND f.nome = v.nome AND f.tipo = 'nacional'
);

-- Adicionar campos de comissão estruturada nos itens do apontamento (manter coluna comissao para compat)
ALTER TABLE public.apontamentos_contabilidade_itens
  ADD COLUMN IF NOT EXISTS tem_comissao boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS comissao_base numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS comissao_percentual numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS comissao_valor numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS adiantamento_manual boolean NOT NULL DEFAULT false;