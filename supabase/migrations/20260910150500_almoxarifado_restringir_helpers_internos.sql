-- Hardening restrito aos helpers internos criados para o Almoxarifado.
-- Mantém EXECUTE para authenticated porque as policies RLS os invocam.
revoke all on function public.almoxarifado_is_central(uuid) from public, anon;
revoke all on function public.almoxarifado_active_company(uuid) from public, anon;
revoke all on function public.almoxarifado_row_allowed(uuid,uuid) from public, anon;

grant execute on function public.almoxarifado_is_central(uuid) to authenticated;
grant execute on function public.almoxarifado_active_company(uuid) to authenticated;
grant execute on function public.almoxarifado_row_allowed(uuid,uuid) to authenticated;
