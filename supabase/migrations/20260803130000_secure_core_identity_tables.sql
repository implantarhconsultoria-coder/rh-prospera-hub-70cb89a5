-- Issue #59: habilita RLS sem interromper os fluxos legítimos.
-- A função public.topac_backend_authorized() é SECURITY DEFINER e já valida
-- os perfis administrativos usados pela Central TOPAC.

begin;

-- PERFIS: cada usuário acessa o próprio registro; administradores acessam todos.
alter table public.profiles enable row level security;
revoke all on table public.profiles from anon;
grant select, insert, update, delete on table public.profiles to authenticated;

drop policy if exists profiles_select_own_or_admin on public.profiles;
create policy profiles_select_own_or_admin
on public.profiles for select to authenticated
using (auth.uid() = user_id or public.topac_backend_authorized());

drop policy if exists profiles_insert_own_or_admin on public.profiles;
create policy profiles_insert_own_or_admin
on public.profiles for insert to authenticated
with check (auth.uid() = user_id or public.topac_backend_authorized());

drop policy if exists profiles_update_own_or_admin on public.profiles;
create policy profiles_update_own_or_admin
on public.profiles for update to authenticated
using (auth.uid() = user_id or public.topac_backend_authorized())
with check (auth.uid() = user_id or public.topac_backend_authorized());

drop policy if exists profiles_delete_admin on public.profiles;
create policy profiles_delete_admin
on public.profiles for delete to authenticated
using (public.topac_backend_authorized());

-- PAPÉIS: o usuário enxerga seus papéis; somente administração os altera.
alter table public.user_roles enable row level security;
revoke all on table public.user_roles from anon;
grant select, insert, update, delete on table public.user_roles to authenticated;

drop policy if exists user_roles_select_own_or_admin on public.user_roles;
create policy user_roles_select_own_or_admin
on public.user_roles for select to authenticated
using (auth.uid() = user_id or public.topac_backend_authorized());

drop policy if exists user_roles_insert_admin on public.user_roles;
create policy user_roles_insert_admin
on public.user_roles for insert to authenticated
with check (public.topac_backend_authorized());

drop policy if exists user_roles_update_admin on public.user_roles;
create policy user_roles_update_admin
on public.user_roles for update to authenticated
using (public.topac_backend_authorized())
with check (public.topac_backend_authorized());

drop policy if exists user_roles_delete_admin on public.user_roles;
create policy user_roles_delete_admin
on public.user_roles for delete to authenticated
using (public.topac_backend_authorized());

-- ACESSOS FIXOS: resolução de login continua pelos RPCs SECURITY DEFINER;
-- acesso direto à tabela fica restrito à administração.
alter table public.topac_acessos_fixos enable row level security;
revoke all on table public.topac_acessos_fixos from anon;
grant select, insert, update, delete on table public.topac_acessos_fixos to authenticated;

drop policy if exists topac_acessos_fixos_admin_all on public.topac_acessos_fixos;
create policy topac_acessos_fixos_admin_all
on public.topac_acessos_fixos for all to authenticated
using (public.topac_backend_authorized())
with check (public.topac_backend_authorized());

-- ACORDO JOAQUIM: preserva leitura pública do aplicativo dedicado,
-- bloqueia escrita anônima e limita mutações à administração TOPAC.
alter table public.acordo_joaquim_dados enable row level security;
revoke all on table public.acordo_joaquim_dados from anon, authenticated;
grant select on table public.acordo_joaquim_dados to anon, authenticated;
grant insert, update, delete on table public.acordo_joaquim_dados to authenticated;

drop policy if exists acordo_joaquim_public_read on public.acordo_joaquim_dados;
create policy acordo_joaquim_public_read
on public.acordo_joaquim_dados for select to anon, authenticated
using (true);

drop policy if exists acordo_joaquim_admin_insert on public.acordo_joaquim_dados;
create policy acordo_joaquim_admin_insert
on public.acordo_joaquim_dados for insert to authenticated
with check (public.topac_backend_authorized());

drop policy if exists acordo_joaquim_admin_update on public.acordo_joaquim_dados;
create policy acordo_joaquim_admin_update
on public.acordo_joaquim_dados for update to authenticated
using (public.topac_backend_authorized())
with check (public.topac_backend_authorized());

drop policy if exists acordo_joaquim_admin_delete on public.acordo_joaquim_dados;
create policy acordo_joaquim_admin_delete
on public.acordo_joaquim_dados for delete to authenticated
using (public.topac_backend_authorized());

commit;
