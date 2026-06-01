CREATE TABLE IF NOT EXISTS public.documentos_funcionario (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  funcionario_id UUID NOT NULL,
  funcionario_nome TEXT NOT NULL DEFAULT '',
  company_id UUID NOT NULL,
  empresa_nome TEXT NOT NULL DEFAULT '',
  tipo_documento TEXT NOT NULL DEFAULT '',
  competencia TEXT DEFAULT '',
  descricao TEXT DEFAULT '',
  arquivo_url TEXT DEFAULT '',
  gerado_por_user_id UUID NOT NULL,
  gerado_por_nome TEXT NOT NULL DEFAULT '',
  enviado_por_user_id UUID,
  enviado_por_nome TEXT DEFAULT '',
  enviado_em TIMESTAMP WITH TIME ZONE,
  destinatarios TEXT DEFAULT '',
  status_envio TEXT NOT NULL DEFAULT 'gerado',
  unidade TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.documentos_funcionario
  ADD COLUMN IF NOT EXISTS categoria TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS origem TEXT DEFAULT 'gerado_sistema',
  ADD COLUMN IF NOT EXISTS observacao TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS nome_arquivo TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS data_documento TIMESTAMP WITH TIME ZONE DEFAULT now(),
  ADD COLUMN IF NOT EXISTS storage_bucket TEXT DEFAULT 'documentos-funcionarios',
  ADD COLUMN IF NOT EXISTS storage_path TEXT DEFAULT '';

UPDATE public.documentos_funcionario
SET
  categoria = COALESCE(NULLIF(categoria, ''), tipo_documento, 'OUTROS'),
  origem = COALESCE(NULLIF(origem, ''), 'gerado_sistema'),
  observacao = COALESCE(NULLIF(observacao, ''), descricao, ''),
  data_documento = COALESCE(data_documento, created_at),
  storage_bucket = COALESCE(NULLIF(storage_bucket, ''), 'documentos-funcionarios'),
  storage_path = COALESCE(NULLIF(storage_path, ''), arquivo_url, '')
WHERE TRUE;

CREATE INDEX IF NOT EXISTS idx_documentos_funcionario_categoria
  ON public.documentos_funcionario(categoria);

CREATE INDEX IF NOT EXISTS idx_documentos_funcionario_origem
  ON public.documentos_funcionario(origem);

CREATE INDEX IF NOT EXISTS idx_documentos_funcionario_data_documento
  ON public.documentos_funcionario(data_documento);

ALTER TABLE public.documentos_funcionario ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS documentos_funcionario_admin_all ON public.documentos_funcionario;
CREATE POLICY documentos_funcionario_admin_all
  ON public.documentos_funcionario FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS documentos_funcionario_authenticated_read ON public.documentos_funcionario;
CREATE POLICY documentos_funcionario_authenticated_read
  ON public.documentos_funcionario FOR SELECT
  TO authenticated
  USING (true);

INSERT INTO storage.buckets (id, name, public)
VALUES ('documentos-funcionarios', 'documentos-funcionarios', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS documentos_funcionarios_storage_authenticated ON storage.objects;
CREATE POLICY documentos_funcionarios_storage_authenticated
  ON storage.objects FOR ALL
  TO authenticated
  USING (bucket_id = 'documentos-funcionarios')
  WITH CHECK (bucket_id = 'documentos-funcionarios');
