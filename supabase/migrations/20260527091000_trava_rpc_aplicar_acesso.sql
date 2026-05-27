-- Restringe RPC que aplica permissao real para sessao autenticada/service role.

REVOKE ALL ON FUNCTION public.topac_aplicar_acesso_por_cpf(uuid, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.topac_aplicar_acesso_usuario(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.topac_aplicar_acesso_por_cpf(uuid, text, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.topac_aplicar_acesso_usuario(uuid) FROM anon;

GRANT EXECUTE ON FUNCTION public.topac_aplicar_acesso_por_cpf(uuid, text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.topac_aplicar_acesso_usuario(uuid) TO authenticated, service_role;
