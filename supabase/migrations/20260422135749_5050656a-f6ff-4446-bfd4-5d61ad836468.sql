
-- ============================================================
-- VALES DE COMBUSTÍVEL (emitidos pelo admin, lidos por QR Code)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.vales_combustivel (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo TEXT NOT NULL UNIQUE,
  veiculo_id UUID,
  tecnico_id UUID,
  valor_limite NUMERIC NOT NULL DEFAULT 0,
  litros_limite NUMERIC NOT NULL DEFAULT 0,
  validade DATE,
  status TEXT NOT NULL DEFAULT 'ativo',
  emitido_por UUID,
  emitido_por_nome TEXT NOT NULL DEFAULT '',
  utilizado_em TIMESTAMPTZ,
  utilizado_por UUID,
  observacao TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.vales_combustivel ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manage vales"
  ON public.vales_combustivel FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Operacional manage vales"
  ON public.vales_combustivel FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'operacional'::app_role))
  WITH CHECK (has_role(auth.uid(), 'operacional'::app_role));

CREATE INDEX IF NOT EXISTS idx_vales_codigo ON public.vales_combustivel(codigo);
CREATE INDEX IF NOT EXISTS idx_vales_veiculo ON public.vales_combustivel(veiculo_id);
CREATE INDEX IF NOT EXISTS idx_vales_status ON public.vales_combustivel(status);

CREATE TRIGGER trg_vales_updated
  BEFORE UPDATE ON public.vales_combustivel
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- ABASTECIMENTOS (registros feitos pelo mecânico no posto)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.abastecimentos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vale_id UUID,
  vale_codigo TEXT NOT NULL DEFAULT '',
  tecnico_id UUID,
  user_id UUID,
  mecanico_nome TEXT NOT NULL DEFAULT '',
  veiculo_id UUID,
  placa TEXT NOT NULL DEFAULT '',
  modelo TEXT NOT NULL DEFAULT '',
  -- Captura no posto
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  hora TIME NOT NULL DEFAULT CURRENT_TIME,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  foto_bomba_url TEXT NOT NULL DEFAULT '',
  -- Valores extraídos (OCR ou manual)
  valor NUMERIC NOT NULL DEFAULT 0,
  litros NUMERIC NOT NULL DEFAULT 0,
  combustivel TEXT NOT NULL DEFAULT '',
  km_atual NUMERIC,
  preenchimento TEXT NOT NULL DEFAULT 'manual', -- 'ocr' | 'manual'
  -- Nota Fiscal (campos preparados)
  posto_cnpj TEXT NOT NULL DEFAULT '',
  posto_nome TEXT NOT NULL DEFAULT '',
  posto_endereco TEXT NOT NULL DEFAULT '',
  nfce_numero TEXT NOT NULL DEFAULT '',
  nfce_serie TEXT NOT NULL DEFAULT '',
  nfce_chave TEXT NOT NULL DEFAULT '',
  nfce_protocolo TEXT NOT NULL DEFAULT '',
  forma_pagamento TEXT NOT NULL DEFAULT '',
  -- Conferência
  status TEXT NOT NULL DEFAULT 'registrado', -- 'registrado'|'pendente'|'conferido'|'divergente'
  conferido_por UUID,
  conferido_por_nome TEXT NOT NULL DEFAULT '',
  conferido_em TIMESTAMPTZ,
  observacao_conferencia TEXT NOT NULL DEFAULT '',
  -- Arquivamento
  competencia TEXT NOT NULL DEFAULT to_char(CURRENT_DATE, 'YYYY-MM'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.abastecimentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manage abastecimentos"
  ON public.abastecimentos FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Operacional manage abastecimentos"
  ON public.abastecimentos FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'operacional'::app_role))
  WITH CHECK (has_role(auth.uid(), 'operacional'::app_role));

CREATE POLICY "Tecnico can view own abastecimentos"
  ON public.abastecimentos FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_abast_veic ON public.abastecimentos(veiculo_id);
CREATE INDEX IF NOT EXISTS idx_abast_tec ON public.abastecimentos(tecnico_id);
CREATE INDEX IF NOT EXISTS idx_abast_comp ON public.abastecimentos(competencia);
CREATE INDEX IF NOT EXISTS idx_abast_status ON public.abastecimentos(status);

CREATE TRIGGER trg_abast_updated
  BEFORE UPDATE ON public.abastecimentos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- STORAGE BUCKET: fotos das bombas (público para leitura)
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('abastecimento-fotos', 'abastecimento-fotos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Abastecimento fotos publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'abastecimento-fotos');

CREATE POLICY "Authenticated upload abastecimento fotos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'abastecimento-fotos');
