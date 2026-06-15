create table if not exists public.config_emails_contabilidade (
  id uuid primary key default gen_random_uuid(),
  email_robson text not null default 'robson@topac.com.br',
  email_marisa text not null default 'marisa@aatconsultoria.com.br',
  emails_copia text not null default 'lucilene@aatconsultoria.com.br, dp@aatconsultoria.com.br, adm.matriz@topac.com.br',
  updated_by uuid,
  updated_by_nome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.config_emails_contabilidade enable row level security;

grant select, insert, update on public.config_emails_contabilidade to authenticated;
revoke all on public.config_emails_contabilidade from anon;

drop policy if exists config_emails_contabilidade_authenticated_select
  on public.config_emails_contabilidade;
create policy config_emails_contabilidade_authenticated_select
  on public.config_emails_contabilidade
  for select
  to authenticated
  using (true);

drop policy if exists config_emails_contabilidade_admin_insert
  on public.config_emails_contabilidade;
create policy config_emails_contabilidade_admin_insert
  on public.config_emails_contabilidade
  for insert
  to authenticated
  with check (public._topac_admin_usuario_autorizado());

drop policy if exists config_emails_contabilidade_admin_update
  on public.config_emails_contabilidade;
create policy config_emails_contabilidade_admin_update
  on public.config_emails_contabilidade
  for update
  to authenticated
  using (public._topac_admin_usuario_autorizado())
  with check (public._topac_admin_usuario_autorizado());

insert into public.config_emails_contabilidade (
  email_robson,
  email_marisa,
  emails_copia
)
select
  'robson@topac.com.br',
  'marisa@aatconsultoria.com.br',
  'lucilene@aatconsultoria.com.br, dp@aatconsultoria.com.br, adm.matriz@topac.com.br'
where not exists (
  select 1 from public.config_emails_contabilidade
);

notify pgrst, 'reload schema';
