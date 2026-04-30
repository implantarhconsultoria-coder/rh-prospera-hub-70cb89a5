REVOKE EXECUTE ON FUNCTION public.validar_acesso_cpf_slug(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validar_acesso_cpf_slug(text, text) TO service_role;