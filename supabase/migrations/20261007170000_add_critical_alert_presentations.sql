create table if not exists public.alertas_filial_apresentacoes (
  alerta_id uuid not null references public.alertas_filial(id) on delete cascade,
  user_id uuid not null,
  ciclo text not null,
  apresentado_em timestamptz not null default now(),
  primary key (alerta_id, user_id, ciclo)
);

create index if not exists idx_alertas_filial_apresentacoes_user_ciclo
  on public.alertas_filial_apresentacoes(user_id, ciclo, apresentado_em desc);

alter table public.alertas_filial_apresentacoes enable row level security;

create policy alertas_filial_apresentacoes_select_own
  on public.alertas_filial_apresentacoes for select
  using (
    user_id = auth.uid()
    and exists (select 1 from public.alertas_filial alerta where alerta.id = alerta_id)
  );

create policy alertas_filial_apresentacoes_insert_own
  on public.alertas_filial_apresentacoes for insert
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.alertas_filial alerta where alerta.id = alerta_id)
  );
