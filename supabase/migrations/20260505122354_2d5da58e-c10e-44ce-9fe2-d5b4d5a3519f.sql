ALTER TABLE public.permissoes_acesso DROP CONSTRAINT IF EXISTS permissoes_acesso_modulo_check;
ALTER TABLE public.permissoes_acesso ADD CONSTRAINT permissoes_acesso_modulo_check
  CHECK (modulo = ANY (ARRAY['rh_filial'::text, 'financeiro'::text, 'faturamento'::text, 'mecanicos'::text]));