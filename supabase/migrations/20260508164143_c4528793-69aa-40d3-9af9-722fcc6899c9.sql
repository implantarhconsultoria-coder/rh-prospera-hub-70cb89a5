ALTER TABLE public.importacoes_dn4
  ADD COLUMN IF NOT EXISTS mensagem text,
  ADD COLUMN IF NOT EXISTS texto_extraido text;