-- Correcao emergencial: o pgcrypto esta instalado em extensions no Supabase TOPAC.
-- Os SECURITY DEFINER existentes utilizavam search_path=public, causando
-- "function crypt(text, text) does not exist" ao gerar ou validar PIN.
-- Sem alteracao de dados, regras de permissao, operadores ou historicos.
ALTER FUNCTION public.operador_operacao_emitir_codigo(uuid)
  SET search_path = public, extensions;
ALTER FUNCTION public.operador_operacao_configurar_pin(text)
  SET search_path = public, extensions;
ALTER FUNCTION public._operador_operacao_por_codigo(text, text)
  SET search_path = public, extensions;
