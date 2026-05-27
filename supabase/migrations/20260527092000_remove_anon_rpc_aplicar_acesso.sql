-- Remove permissao anonima da RPC que grava roles reais do usuario.

REVOKE ALL ON FUNCTION public.topac_aplicar_acesso_por_cpf(uuid, text, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.topac_aplicar_acesso_usuario(uuid) FROM anon;

GRANT EXECUTE ON FUNCTION public.topac_aplicar_acesso_por_cpf(uuid, text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.topac_aplicar_acesso_usuario(uuid) TO authenticated, service_role;
