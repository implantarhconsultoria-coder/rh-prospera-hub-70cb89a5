
-- Add access_token column for link-based access
ALTER TABLE public.tecnicos_campo
  ADD COLUMN IF NOT EXISTS access_token text UNIQUE,
  ADD COLUMN IF NOT EXISTS ultima_atividade_em timestamptz;

-- Helper to generate a 32-char url-safe token
CREATE OR REPLACE FUNCTION public.gen_tecnico_access_token()
RETURNS text
LANGUAGE sql
VOLATILE
AS $$
  SELECT replace(replace(replace(encode(gen_random_bytes(24), 'base64'), '+','-'), '/','_'), '=','');
$$;

-- Backfill tokens for existing técnicos
UPDATE public.tecnicos_campo
SET access_token = public.gen_tecnico_access_token()
WHERE access_token IS NULL;

-- Default for new rows
ALTER TABLE public.tecnicos_campo
  ALTER COLUMN access_token SET DEFAULT public.gen_tecnico_access_token();
