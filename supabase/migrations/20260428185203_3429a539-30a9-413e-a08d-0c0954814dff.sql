
-- 1) Tabela de avisos de férias
CREATE TABLE IF NOT EXISTS public.ferias_avisos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  funcionario_id UUID,
  funcionario_nome TEXT NOT NULL DEFAULT '',
  funcionario_cpf TEXT NOT NULL DEFAULT '',
  funcionario_cargo TEXT NOT NULL DEFAULT '',
  company_id UUID,
  empresa_nome TEXT NOT NULL DEFAULT '',
  periodo_aquisitivo_inicio DATE,
  periodo_aquisitivo_fim DATE,
  periodo_gozo_inicio DATE NOT NULL,
  periodo_gozo_fim DATE NOT NULL,
  data_retorno DATE NOT NULL,
  dias_ferias INTEGER NOT NULL DEFAULT 30,
  status TEXT NOT NULL DEFAULT 'cadastrado', -- cadastrado, entregue, assinado, em_ferias, retornado, cancelado
  aviso_pdf_url TEXT NOT NULL DEFAULT '',
  assinado_pdf_url TEXT NOT NULL DEFAULT '',
  data_entrega DATE,
  observacao TEXT NOT NULL DEFAULT '',
  user_id UUID NOT NULL,
  user_nome TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ferias_avisos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manage ferias_avisos" ON public.ferias_avisos
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Filial view own ferias_avisos" ON public.ferias_avisos
  FOR SELECT TO authenticated
  USING (empresa_nome = ANY (get_user_empresas()));

CREATE POLICY "Filial insert own ferias_avisos" ON public.ferias_avisos
  FOR INSERT TO authenticated
  WITH CHECK (empresa_nome = ANY (get_user_empresas()));

CREATE POLICY "Filial update own ferias_avisos" ON public.ferias_avisos
  FOR UPDATE TO authenticated
  USING (empresa_nome = ANY (get_user_empresas()));

CREATE INDEX IF NOT EXISTS idx_ferias_avisos_func ON public.ferias_avisos(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_ferias_avisos_gozo ON public.ferias_avisos(periodo_gozo_inicio);

-- 2) Estender ativos com campos de IPVA/Licenciamento (valor, status, comprovantes)
ALTER TABLE public.ativos
  ADD COLUMN IF NOT EXISTS marca TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS ipva_valor NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ipva_status TEXT DEFAULT 'pendente', -- pendente, pago, vencido, regularizado
  ADD COLUMN IF NOT EXISTS ipva_arquivo_url TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS ipva_comprovante_url TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS ipva_data_pagamento DATE,
  ADD COLUMN IF NOT EXISTS ipva_observacao TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS lic_valor NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lic_status TEXT DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS lic_arquivo_url TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS lic_comprovante_url TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS lic_data_pagamento DATE,
  ADD COLUMN IF NOT EXISTS lic_observacao TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS seguro_vencimento DATE,
  ADD COLUMN IF NOT EXISTS seguro_valor NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS seguro_arquivo_url TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS seguro_comprovante_url TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS responsavel_atual TEXT DEFAULT '';

-- 3) Bucket para PDFs assinados de férias (se não existir reaproveita documentos-funcionarios)
INSERT INTO storage.buckets (id, name, public)
VALUES ('ferias-avisos', 'ferias-avisos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read ferias-avisos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'ferias-avisos');

CREATE POLICY "Auth upload ferias-avisos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'ferias-avisos');

CREATE POLICY "Auth update ferias-avisos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'ferias-avisos');

CREATE POLICY "Auth delete ferias-avisos"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'ferias-avisos');

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_ferias_avisos_updated ON public.ferias_avisos;
CREATE TRIGGER trg_ferias_avisos_updated
  BEFORE UPDATE ON public.ferias_avisos
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
