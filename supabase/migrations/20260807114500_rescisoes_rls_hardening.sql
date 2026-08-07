-- Endurecimento de RLS do módulo de rescisões.
-- Somente admin/diretoria ou usuário da filial correspondente pode consultar.

drop policy if exists "rescisoes_scoped_select" on public.rescisoes;
create policy "rescisoes_scoped_select" on public.rescisoes
  for select to authenticated
  using (
    public.topac_has_any_role(array['admin','diretor_geral'], auth.uid())
    or public.topac_filial_company_allowed(company_id, auth.uid())
  );

drop policy if exists "rescisao_historico_scoped_select" on public.rescisao_historico;
create policy "rescisao_historico_scoped_select" on public.rescisao_historico
  for select to authenticated
  using (exists (
    select 1
    from public.rescisoes r
    where r.id = rescisao_id
      and (
        public.topac_has_any_role(array['admin','diretor_geral'], auth.uid())
        or public.topac_filial_company_allowed(r.company_id, auth.uid())
      )
  ));

notify pgrst, 'reload schema';
