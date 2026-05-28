CREATE TABLE IF NOT EXISTS public.protocolos_documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_origem text NOT NULL DEFAULT 'TOPAC MATRIZ',
  empresa_destinataria text NOT NULL DEFAULT '',
  local_canteiro text NOT NULL DEFAULT '',
  responsavel_recebimento text NOT NULL DEFAULT '',
  data_emissao date,
  descricao_ativo text NOT NULL DEFAULT '',
  placa text NOT NULL DEFAULT '',
  renavam text NOT NULL DEFAULT '',
  chassi text NOT NULL DEFAULT '',
  ano_fabricacao text NOT NULL DEFAULT '',
  ano_modelo text NOT NULL DEFAULT '',
  patrimonio text NOT NULL DEFAULT '',
  exercicio text NOT NULL DEFAULT '',
  observacoes text NOT NULL DEFAULT '',
  texto_original text NOT NULL DEFAULT '',
  pdf_url text NOT NULL DEFAULT '',
  ativo_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_protocolos_documentos_created_at
  ON public.protocolos_documentos (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_protocolos_documentos_patrimonio
  ON public.protocolos_documentos (patrimonio);

CREATE INDEX IF NOT EXISTS idx_protocolos_documentos_placa
  ON public.protocolos_documentos (placa);

ALTER TABLE public.protocolos_documentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Protocolos leitura operacional" ON public.protocolos_documentos;
CREATE POLICY "Protocolos leitura operacional"
ON public.protocolos_documentos FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Protocolos insercao operacional" ON public.protocolos_documentos;
CREATE POLICY "Protocolos insercao operacional"
ON public.protocolos_documentos FOR INSERT
TO anon, authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Protocolos atualizacao operacional" ON public.protocolos_documentos;
CREATE POLICY "Protocolos atualizacao operacional"
ON public.protocolos_documentos FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

GRANT SELECT, INSERT ON public.protocolos_documentos TO anon;
GRANT SELECT, INSERT, UPDATE ON public.protocolos_documentos TO authenticated;
