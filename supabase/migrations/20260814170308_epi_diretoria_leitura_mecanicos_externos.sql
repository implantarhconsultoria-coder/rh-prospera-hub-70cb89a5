-- TOPAC RH PRO — Diretoria pode consultar a identificacao de mecanicos externos para montar a solicitacao de EPI.

create or replace function public.epi_mecanicos_externos()
returns table(funcionario_id uuid)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.topac_has_any_role(array['admin','diretor_geral'], auth.uid()) then
    raise exception 'Acesso negado ao cadastro de mecânicos externos';
  end if;

  return query
  select distinct ae.funcionario_id
  from public.acessos_externos ae
  where ae.funcionario_id is not null
    and coalesce(ae.ativo, false) = true
    and coalesce(ae.acesso_liberado, false) = true
    and lower(coalesce(ae.modulo, '')) = 'mecanico'
    and lower(coalesce(ae.perfil_acesso, '')) = 'mecanico_externo';
end;
$$;

revoke all on function public.epi_mecanicos_externos() from public;
grant execute on function public.epi_mecanicos_externos() to authenticated;
