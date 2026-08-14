-- TOPAC RH PRO — restringe a consulta de mecanicos externos a sessoes autenticadas autorizadas.

revoke execute on function public.epi_mecanicos_externos() from anon;
revoke all on function public.epi_mecanicos_externos() from public;
grant execute on function public.epi_mecanicos_externos() to authenticated;
grant execute on function public.epi_mecanicos_externos() to service_role;
