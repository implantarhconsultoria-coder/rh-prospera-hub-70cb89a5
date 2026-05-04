ALTER TABLE public.abastecimentos
  ADD COLUMN IF NOT EXISTS foto_painel_url text NOT NULL DEFAULT '';