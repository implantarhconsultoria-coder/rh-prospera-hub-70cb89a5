-- TOPAC RH PRO — governanca final do modulo EPI
-- Operacao e alteracao: Admin central.
-- Diretoria: aprovacao formal por relatorio impresso/PDF, sem escrita operacional no modulo.

drop policy if exists epi_solicitacoes_select_diretoria on public.epi_solicitacoes;
drop policy if exists epi_solicitacoes_select_admin on public.epi_solicitacoes;
create policy epi_solicitacoes_select_admin on public.epi_solicitacoes
for select to authenticated
using (public.has_role(auth.uid(), 'admin'));

drop policy if exists epi_solicitacoes_update_diretoria on public.epi_solicitacoes;
drop policy if exists epi_solicitacoes_update_admin on public.epi_solicitacoes;
create policy epi_solicitacoes_update_admin on public.epi_solicitacoes
for update to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists epi_solicitacao_funcionarios_select_diretoria on public.epi_solicitacao_funcionarios;
drop policy if exists epi_solicitacao_funcionarios_select_admin on public.epi_solicitacao_funcionarios;
create policy epi_solicitacao_funcionarios_select_admin on public.epi_solicitacao_funcionarios
for select to authenticated
using (public.has_role(auth.uid(), 'admin'));

create or replace function public.epi_mecanicos_externos()
returns table(funcionario_id uuid)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_role(auth.uid(), 'admin') then
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
