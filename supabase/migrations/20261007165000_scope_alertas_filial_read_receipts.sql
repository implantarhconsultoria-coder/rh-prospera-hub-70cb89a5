drop policy if exists alertas_filial_leituras_select_own on public.alertas_filial_leituras;
drop policy if exists alertas_filial_leituras_insert_own on public.alertas_filial_leituras;
drop policy if exists alertas_filial_leituras_update_own on public.alertas_filial_leituras;

create policy alertas_filial_leituras_select_own
  on public.alertas_filial_leituras for select
  using (
    user_id = auth.uid()
    and exists (select 1 from public.alertas_filial alerta where alerta.id = alerta_id)
  );

create policy alertas_filial_leituras_insert_own
  on public.alertas_filial_leituras for insert
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.alertas_filial alerta where alerta.id = alerta_id)
  );

create policy alertas_filial_leituras_update_own
  on public.alertas_filial_leituras for update
  using (
    user_id = auth.uid()
    and exists (select 1 from public.alertas_filial alerta where alerta.id = alerta_id)
  )
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.alertas_filial alerta where alerta.id = alerta_id)
  );
