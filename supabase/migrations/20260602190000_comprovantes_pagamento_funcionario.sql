ALTER TABLE public.documentos_funcionario
  ADD COLUMN IF NOT EXISTS pasta_competencia TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS subcategoria TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS tipo_pagamento TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS valor_documento NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS data_pagamento DATE,
  ADD COLUMN IF NOT EXISTS identificador_documento TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS origem_importacao_id UUID,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_documentos_funcionario_pagamento
  ON public.documentos_funcionario(funcionario_id, competencia, tipo_pagamento);

CREATE INDEX IF NOT EXISTS idx_documentos_funcionario_identificador
  ON public.documentos_funcionario(identificador_documento)
  WHERE COALESCE(identificador_documento, '') <> '';

DROP POLICY IF EXISTS documentos_funcionario_pagamentos_write ON public.documentos_funcionario;
CREATE POLICY documentos_funcionario_pagamentos_write
  ON public.documentos_funcionario FOR ALL
  TO authenticated
  USING (
    (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'financeiro')
      OR public.has_role(auth.uid(), 'faturamento')
      OR public.has_role(auth.uid(), 'filial_matriz')
      OR public.has_role(auth.uid(), 'filial_praia')
      OR public.has_role(auth.uid(), 'filial_goiania')
    )
    AND (
      categoria = 'COMPROVANTE DE PAGAMENTO'
      OR tipo_documento = 'COMPROVANTE DE PAGAMENTO'
    )
  )
  WITH CHECK (
    (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'financeiro')
      OR public.has_role(auth.uid(), 'faturamento')
      OR public.has_role(auth.uid(), 'filial_matriz')
      OR public.has_role(auth.uid(), 'filial_praia')
      OR public.has_role(auth.uid(), 'filial_goiania')
    )
    AND (
      categoria = 'COMPROVANTE DE PAGAMENTO'
      OR tipo_documento = 'COMPROVANTE DE PAGAMENTO'
    )
  );

CREATE TABLE IF NOT EXISTS public.comprovantes_pagamento_lotes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  usuario_id UUID,
  usuario_nome TEXT DEFAULT '',
  total_arquivos INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'em_conferencia',
  observacao TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.comprovantes_pagamento_staging (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lote_id UUID REFERENCES public.comprovantes_pagamento_lotes(id) ON DELETE CASCADE,
  nome_arquivo TEXT NOT NULL DEFAULT '',
  storage_bucket TEXT NOT NULL DEFAULT 'documentos-funcionarios',
  storage_path TEXT NOT NULL DEFAULT '',
  texto_extraido TEXT DEFAULT '',
  pagina INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'em_conferencia',
  status_leitura TEXT NOT NULL DEFAULT 'pendente',
  confianca NUMERIC NOT NULL DEFAULT 0,
  funcionario_id UUID,
  funcionario_nome TEXT DEFAULT '',
  company_id UUID,
  empresa_nome TEXT DEFAULT '',
  tipo_pagamento TEXT NOT NULL DEFAULT 'outros',
  competencia TEXT DEFAULT '',
  valor NUMERIC DEFAULT 0,
  data_pagamento DATE,
  cpf_detectado TEXT DEFAULT '',
  cnpj_detectado TEXT DEFAULT '',
  identificador TEXT DEFAULT '',
  banco_origem TEXT DEFAULT '',
  motivo_status TEXT DEFAULT '',
  candidatos JSONB NOT NULL DEFAULT '[]'::jsonb,
  arquivado_documento_id UUID,
  ignorado BOOLEAN NOT NULL DEFAULT false,
  conferido_por UUID,
  conferido_por_nome TEXT DEFAULT '',
  conferido_em TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comprovantes_pagamento_staging_lote
  ON public.comprovantes_pagamento_staging(lote_id);

CREATE INDEX IF NOT EXISTS idx_comprovantes_pagamento_staging_status
  ON public.comprovantes_pagamento_staging(status);

CREATE INDEX IF NOT EXISTS idx_comprovantes_pagamento_staging_funcionario
  ON public.comprovantes_pagamento_staging(funcionario_id);

CREATE INDEX IF NOT EXISTS idx_comprovantes_pagamento_staging_competencia
  ON public.comprovantes_pagamento_staging(competencia);

ALTER TABLE public.comprovantes_pagamento_lotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comprovantes_pagamento_staging ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS comprovantes_pagamento_lotes_select ON public.comprovantes_pagamento_lotes;
CREATE POLICY comprovantes_pagamento_lotes_select
  ON public.comprovantes_pagamento_lotes FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'financeiro')
    OR public.has_role(auth.uid(), 'faturamento')
    OR public.has_role(auth.uid(), 'filial_matriz')
    OR public.has_role(auth.uid(), 'filial_praia')
    OR public.has_role(auth.uid(), 'filial_goiania')
    OR public.has_role(auth.uid(), 'diretor_geral')
  );

DROP POLICY IF EXISTS comprovantes_pagamento_lotes_write ON public.comprovantes_pagamento_lotes;
CREATE POLICY comprovantes_pagamento_lotes_write
  ON public.comprovantes_pagamento_lotes FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'financeiro')
    OR public.has_role(auth.uid(), 'faturamento')
    OR public.has_role(auth.uid(), 'filial_matriz')
    OR public.has_role(auth.uid(), 'filial_praia')
    OR public.has_role(auth.uid(), 'filial_goiania')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'financeiro')
    OR public.has_role(auth.uid(), 'faturamento')
    OR public.has_role(auth.uid(), 'filial_matriz')
    OR public.has_role(auth.uid(), 'filial_praia')
    OR public.has_role(auth.uid(), 'filial_goiania')
  );

DROP POLICY IF EXISTS comprovantes_pagamento_staging_select ON public.comprovantes_pagamento_staging;
CREATE POLICY comprovantes_pagamento_staging_select
  ON public.comprovantes_pagamento_staging FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'financeiro')
    OR public.has_role(auth.uid(), 'faturamento')
    OR public.has_role(auth.uid(), 'filial_matriz')
    OR public.has_role(auth.uid(), 'filial_praia')
    OR public.has_role(auth.uid(), 'filial_goiania')
    OR public.has_role(auth.uid(), 'diretor_geral')
  );

DROP POLICY IF EXISTS comprovantes_pagamento_staging_write ON public.comprovantes_pagamento_staging;
CREATE POLICY comprovantes_pagamento_staging_write
  ON public.comprovantes_pagamento_staging FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'financeiro')
    OR public.has_role(auth.uid(), 'faturamento')
    OR public.has_role(auth.uid(), 'filial_matriz')
    OR public.has_role(auth.uid(), 'filial_praia')
    OR public.has_role(auth.uid(), 'filial_goiania')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'financeiro')
    OR public.has_role(auth.uid(), 'faturamento')
    OR public.has_role(auth.uid(), 'filial_matriz')
    OR public.has_role(auth.uid(), 'filial_praia')
    OR public.has_role(auth.uid(), 'filial_goiania')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.comprovantes_pagamento_lotes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comprovantes_pagamento_staging TO authenticated;

NOTIFY pgrst, 'reload schema';
