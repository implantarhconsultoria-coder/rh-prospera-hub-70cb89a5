-- VR/VT: geracao administrativa independente da ativacao de assinatura digital.
-- RLS continua ativo; usuarios comuns e visitantes nao podem gerar historicos.
alter table public.benefit_generations enable row level security;
revoke all privileges on table public.benefit_generations from anon;
revoke truncate, references, trigger on table public.benefit_generations from authenticated;
grant select, insert, update, delete on table public.benefit_generations to authenticated;

alter policy benefit_generations_admin_select on public.benefit_generations
  to authenticated using (public.topac_has_any_role(array['admin'::text,'diretor_geral'::text], (select auth.uid()))
    and exists (
      select 1 from public.empresas e
      where e.id = company_id
        and e.codigo in ('topac-matriz','topac-pg','topac-gyn','alqui','lmt')
        and e.status = 'ativa'
    ));
alter policy benefit_generations_admin_insert on public.benefit_generations
  to authenticated with check (public.topac_has_any_role(array['admin'::text,'diretor_geral'::text], (select auth.uid()))
    and exists (
      select 1 from public.empresas e
      where e.id = company_id
        and e.codigo in ('topac-matriz','topac-pg','topac-gyn','alqui','lmt')
        and e.status = 'ativa'
    ));
alter policy benefit_generations_admin_update on public.benefit_generations
  to authenticated using (public.topac_has_any_role(array['admin'::text,'diretor_geral'::text], (select auth.uid()))
    and exists (
      select 1 from public.empresas e
      where e.id = company_id
        and e.codigo in ('topac-matriz','topac-pg','topac-gyn','alqui','lmt')
        and e.status = 'ativa'
    )) with check (public.topac_has_any_role(array['admin'::text,'diretor_geral'::text], (select auth.uid()))
    and exists (
      select 1 from public.empresas e
      where e.id = company_id
        and e.codigo in ('topac-matriz','topac-pg','topac-gyn','alqui','lmt')
        and e.status = 'ativa'
    ));
alter policy benefit_generations_admin_delete on public.benefit_generations
  to authenticated using (public.topac_has_any_role(array['admin'::text,'diretor_geral'::text], (select auth.uid()))
    and exists (
      select 1 from public.empresas e
      where e.id = company_id
        and e.codigo in ('topac-matriz','topac-pg','topac-gyn','alqui','lmt')
        and e.status = 'ativa'
    ));
