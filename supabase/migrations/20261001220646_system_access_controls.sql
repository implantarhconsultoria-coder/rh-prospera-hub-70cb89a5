create table if not exists public.system_access_controls (
  module_key text primary key,
  label text not null,
  restricted boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid null references auth.users(id)
);

alter table public.system_access_controls enable row level security;

grant select on table public.system_access_controls to anon, authenticated;
grant insert, update on table public.system_access_controls to authenticated;

drop policy if exists "system_access_controls_read" on public.system_access_controls;
create policy "system_access_controls_read"
on public.system_access_controls
for select
to anon, authenticated
using (true);

drop policy if exists "system_access_controls_owner_insert" on public.system_access_controls;
create policy "system_access_controls_owner_insert"
on public.system_access_controls
for insert
to authenticated
with check ((select auth.uid()) = 'd8a9f8a0-153b-4882-8f98-3c6cfbf51652'::uuid);

drop policy if exists "system_access_controls_owner_update" on public.system_access_controls;
create policy "system_access_controls_owner_update"
on public.system_access_controls
for update
to authenticated
using ((select auth.uid()) = 'd8a9f8a0-153b-4882-8f98-3c6cfbf51652'::uuid)
with check ((select auth.uid()) = 'd8a9f8a0-153b-4882-8f98-3c6cfbf51652'::uuid);

insert into public.system_access_controls (module_key, label, restricted)
values
  ('global', 'Todos os acessos', false),
  ('admin_desktop', 'Administracao no computador', false),
  ('filial', 'RH / Filiais', false),
  ('almoxarifado', 'Almoxarifado', false),
  ('operacional', 'Operacional', false),
  ('campo', 'Campo', false),
  ('mecanico', 'Aplicativo dos mecanicos', false),
  ('estoque_interno', 'Estoque interno / equipe', false)
on conflict (module_key) do nothing;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'system_access_controls'
  ) then
    alter publication supabase_realtime add table public.system_access_controls;
  end if;
end $$;
