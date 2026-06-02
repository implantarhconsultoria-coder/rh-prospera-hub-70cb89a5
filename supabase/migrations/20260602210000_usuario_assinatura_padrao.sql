ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS assinatura_padrao text DEFAULT '';
