-- TOPAC RH PRO
-- O helper retorna a linha completa de acessos_externos e deve ser chamado
-- somente internamente pelas RPCs públicas que filtram a resposta.

revoke all on function public._app_mecanico_get_acesso(uuid)
from public, anon, authenticated;
