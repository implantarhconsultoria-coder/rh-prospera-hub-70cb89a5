-- TOPAC RH PRO — rastreabilidade da saída e ajustes de performance restritos ao Almoxarifado.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.almoxarifado_saidas'::regclass
      and conname='almoxarifado_saidas_funcionario_id_fkey'
  ) then
    alter table public.almoxarifado_saidas
      add constraint almoxarifado_saidas_funcionario_id_fkey
      foreign key (funcionario_id) references public.funcionarios(id);
  end if;
end $$;

create index if not exists almox_saidas_funcionario_id_idx on public.almoxarifado_saidas(funcionario_id);
create index if not exists almox_context_company_idx on public.almoxarifado_user_context(company_id);
create index if not exists almox_transferencias_origem_idx on public.almoxarifado_transferencias(company_origem_id);
create index if not exists almox_transferencias_destino_idx on public.almoxarifado_transferencias(company_destino_id);
create index if not exists almox_carga_itens_carga_idx on public.almoxarifado_carga_itens(carga_id);
create index if not exists almox_entradas_guard_idx on public.almoxarifado_entradas(item_id,user_id,created_at desc);
create index if not exists almox_saidas_guard_idx on public.almoxarifado_saidas(item_id,user_id,created_at desc);
create index if not exists almox_ajustes_guard_idx on public.almoxarifado_ajustes(item_id,user_id,created_at desc);

create or replace function public.almoxarifado_bind_funcionario_saida()
returns trigger
language plpgsql
set search_path=public
as $$
declare
  v_company uuid;
  v_id uuid;
  v_nome text;
  v_matches integer;
begin
  v_company := coalesce(new.company_id, public.almoxarifado_active_company(auth.uid()));

  if new.funcionario_id is not null then
    select f.id,f.nome into v_id,v_nome
      from public.funcionarios f
     where f.id=new.funcionario_id
       and (v_company is null or f.company_id=v_company)
     limit 1;
    if v_id is null then
      raise exception 'Funcionário não pertence à unidade ativa do Almoxarifado';
    end if;
    if new.funcionario_nome is null or btrim(new.funcionario_nome)='' then
      new.funcionario_nome:=v_nome;
    end if;
    if new.mecanico_nome is null or btrim(new.mecanico_nome)='' then
      new.mecanico_nome:=v_nome;
    end if;
    return new;
  end if;

  if v_company is not null and new.funcionario_nome is not null and btrim(new.funcionario_nome)<>'' then
    select count(*),min(f.id),min(f.nome)
      into v_matches,v_id,v_nome
      from public.funcionarios f
     where f.company_id=v_company
       and lower(btrim(f.nome))=lower(btrim(new.funcionario_nome))
       and coalesce(f.status,'ativo') not in ('desligado','excluido');

    if v_matches=1 then
      new.funcionario_id:=v_id;
      if new.mecanico_nome is null or btrim(new.mecanico_nome)='' then
        new.mecanico_nome:=v_nome;
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_almox_00_bind_funcionario_saida on public.almoxarifado_saidas;
create trigger trg_almox_00_bind_funcionario_saida
before insert or update of funcionario_id,funcionario_nome,company_id on public.almoxarifado_saidas
for each row execute function public.almoxarifado_bind_funcionario_saida();

alter policy almox_read on public.almoxarifado_itens
using (public.topac_has_any_role(array['admin','diretor_geral','almoxarifado','filial_matriz','filial_goiania','filial_praia'],(select auth.uid())) and public.almoxarifado_row_allowed(company_id,(select auth.uid())));
alter policy almox_write on public.almoxarifado_itens
using (public.almoxarifado_is_central((select auth.uid())) and public.almoxarifado_row_allowed(company_id,(select auth.uid())))
with check (public.almoxarifado_is_central((select auth.uid())) and public.almoxarifado_row_allowed(company_id,(select auth.uid())));

alter policy almox_read on public.almoxarifado_entradas
using (public.topac_has_any_role(array['admin','diretor_geral','almoxarifado','filial_matriz','filial_goiania','filial_praia'],(select auth.uid())) and public.almoxarifado_row_allowed(company_id,(select auth.uid())));
alter policy almox_write on public.almoxarifado_entradas
using (public.almoxarifado_is_central((select auth.uid())) and public.almoxarifado_row_allowed(company_id,(select auth.uid())))
with check (public.almoxarifado_is_central((select auth.uid())) and public.almoxarifado_row_allowed(company_id,(select auth.uid())));

alter policy almox_read on public.almoxarifado_saidas
using (public.topac_has_any_role(array['admin','diretor_geral','almoxarifado','filial_matriz','filial_goiania','filial_praia'],(select auth.uid())) and public.almoxarifado_row_allowed(company_id,(select auth.uid())));
alter policy almox_write on public.almoxarifado_saidas
using (public.almoxarifado_is_central((select auth.uid())) and public.almoxarifado_row_allowed(company_id,(select auth.uid())))
with check (public.almoxarifado_is_central((select auth.uid())) and public.almoxarifado_row_allowed(company_id,(select auth.uid())));

alter policy almox_read on public.almoxarifado_ajustes
using (public.topac_has_any_role(array['admin','diretor_geral','almoxarifado','filial_matriz','filial_goiania','filial_praia'],(select auth.uid())) and public.almoxarifado_row_allowed(company_id,(select auth.uid())));
alter policy almox_write on public.almoxarifado_ajustes
using (public.almoxarifado_is_central((select auth.uid())) and public.almoxarifado_row_allowed(company_id,(select auth.uid())))
with check (public.almoxarifado_is_central((select auth.uid())) and public.almoxarifado_row_allowed(company_id,(select auth.uid())));

alter policy almox_read on public.almoxarifado_cargas
using (public.topac_has_any_role(array['admin','diretor_geral','almoxarifado','filial_matriz','filial_goiania','filial_praia'],(select auth.uid())) and public.almoxarifado_row_allowed(company_id,(select auth.uid())));
alter policy almox_write on public.almoxarifado_cargas
using (public.almoxarifado_is_central((select auth.uid())) and public.almoxarifado_row_allowed(company_id,(select auth.uid())))
with check (public.almoxarifado_is_central((select auth.uid())) and public.almoxarifado_row_allowed(company_id,(select auth.uid())));

alter policy almox_read on public.almoxarifado_fechamentos
using (public.topac_has_any_role(array['admin','diretor_geral','almoxarifado','filial_matriz','filial_goiania','filial_praia'],(select auth.uid())) and public.almoxarifado_row_allowed(company_id,(select auth.uid())));
alter policy almox_write on public.almoxarifado_fechamentos
using (public.almoxarifado_is_central((select auth.uid())) and public.almoxarifado_row_allowed(company_id,(select auth.uid())))
with check (public.almoxarifado_is_central((select auth.uid())) and public.almoxarifado_row_allowed(company_id,(select auth.uid())));

alter policy almox_read on public.almoxarifado_ferramentas
using (public.topac_has_any_role(array['admin','diretor_geral','almoxarifado','filial_matriz','filial_goiania','filial_praia'],(select auth.uid())) and public.almoxarifado_row_allowed(company_id,(select auth.uid())));
alter policy almox_write on public.almoxarifado_ferramentas
using (public.almoxarifado_is_central((select auth.uid())) and public.almoxarifado_row_allowed(company_id,(select auth.uid())))
with check (public.almoxarifado_is_central((select auth.uid())) and public.almoxarifado_row_allowed(company_id,(select auth.uid())));

alter policy almox_read on public.almoxarifado_auditoria
using (public.almoxarifado_is_central((select auth.uid())) and public.almoxarifado_row_allowed(company_id,(select auth.uid())));
alter policy almox_write on public.almoxarifado_auditoria
using (public.almoxarifado_is_central((select auth.uid())) and public.almoxarifado_row_allowed(company_id,(select auth.uid())))
with check (public.almoxarifado_is_central((select auth.uid())) and public.almoxarifado_row_allowed(company_id,(select auth.uid())));

alter policy almox_read on public.almoxarifado_importacoes using (public.almoxarifado_is_central((select auth.uid())));
alter policy almox_write on public.almoxarifado_importacoes using (public.almoxarifado_is_central((select auth.uid()))) with check (public.almoxarifado_is_central((select auth.uid())));
alter policy almox_read on public.almoxarifado_importacao_erros using (public.almoxarifado_is_central((select auth.uid())));
alter policy almox_write on public.almoxarifado_importacao_erros using (public.almoxarifado_is_central((select auth.uid()))) with check (public.almoxarifado_is_central((select auth.uid())));
alter policy almox_read on public.almoxarifado_transferencias using (public.almoxarifado_is_central((select auth.uid())));
alter policy almox_write on public.almoxarifado_transferencias using (public.almoxarifado_is_central((select auth.uid()))) with check (public.almoxarifado_is_central((select auth.uid())));
