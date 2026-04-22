-- Adiciona campos de posto vinculado e tipo ao vale
ALTER TABLE public.vales_combustivel
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'autorizacao_abastecimento',
  ADD COLUMN IF NOT EXISTS posto_nome text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS posto_cnpj text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS posto_endereco text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_vales_tipo ON public.vales_combustivel(tipo);