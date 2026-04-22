
-- Criar tabela de atestados médicos importados
CREATE TABLE IF NOT EXISTS public.atestados (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  funcionario_id UUID,
  funcionario_nome TEXT NOT NULL DEFAULT '',
  company_id UUID,
  empresa_nome TEXT NOT NULL DEFAULT '',
  competencia TEXT NOT NULL DEFAULT to_char(CURRENT_DATE, 'YYYY-MM'),
  data_inicio DATE,
  data_fim DATE,
  dias_cobertos INTEGER NOT NULL DEFAULT 1,
  cid TEXT NOT NULL DEFAULT '',
  medico TEXT NOT NULL DEFAULT '',
  crm TEXT NOT NULL DEFAULT '',
  arquivo_url TEXT NOT NULL DEFAULT '',
  arquivo_nome TEXT NOT NULL DEFAULT '',
  ocr_texto_bruto TEXT NOT NULL DEFAULT '',
  ocr_confianca NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pendente',
  aplicado_vr BOOLEAN NOT NULL DEFAULT false,
  aplicado_vt BOOLEAN NOT NULL DEFAULT false,
  importado_por_user_id UUID NOT NULL,
  importado_por_nome TEXT NOT NULL DEFAULT '',
  observacao TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.atestados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manage atestados"
ON public.atestados FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Filial view own empresa atestados"
ON public.atestados FOR SELECT TO authenticated
USING (empresa_nome = ANY (get_user_empresas()));

CREATE POLICY "Filial insert own empresa atestados"
ON public.atestados FOR INSERT TO authenticated
WITH CHECK (empresa_nome = ANY (get_user_empresas()));

CREATE POLICY "Filial update own empresa atestados"
ON public.atestados FOR UPDATE TO authenticated
USING (empresa_nome = ANY (get_user_empresas()));

CREATE TRIGGER trg_atestados_updated_at
BEFORE UPDATE ON public.atestados
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_atestados_funcionario ON public.atestados(funcionario_id);
CREATE INDEX idx_atestados_competencia ON public.atestados(competencia);

-- Bucket para arquivos de atestados
INSERT INTO storage.buckets (id, name, public)
VALUES ('atestados', 'atestados', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Atestados publicly readable"
ON storage.objects FOR SELECT
USING (bucket_id = 'atestados');

CREATE POLICY "Authenticated upload atestados"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'atestados');

CREATE POLICY "Authenticated update atestados"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'atestados');
