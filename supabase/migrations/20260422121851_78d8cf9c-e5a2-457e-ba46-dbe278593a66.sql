
CREATE OR REPLACE FUNCTION public.gen_tecnico_access_token()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = public, extensions
AS $$
  SELECT replace(replace(replace(encode(extensions.gen_random_bytes(24), 'base64'), '+','-'), '/','_'), '=','');
$$;
