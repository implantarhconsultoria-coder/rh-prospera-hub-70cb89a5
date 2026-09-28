create table if not exists public.alteracoes_salariais (
  id uuid primary key default gen_random_uuid(),
  funcionario_id uuid not null references public.funcionarios(id) on delete cascade,
  empresa_id uuid not null references public.empresas(id) on delete restrict,
  competencia text not null,
  salario_atual numeric(12,2) not null,
  percentual numeric(7,4) not null,
  salario_solicitado numeric(12,2) not null,
  observacao text,
  email_assunto text not null,
  email_corpo text not null,
  status text not null default 'aguardando_folha' check (status in ('aguardando_folha','aplicado','cancelado')),
  solicitado_por uuid references auth.users(id),
  solicitado_em timestamptz not null default now(),
  aplicado_por uuid references auth.users(id),
  aplicado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_alteracoes_salariais_funcionario_status
  on public.alteracoes_salariais(funcionario_id, status, solicitado_em desc);

alter table public.alteracoes_salariais enable row level security;

create policy "alteracoes_salariais_admin_select"
on public.alteracoes_salariais for select to authenticated
using (exists (
  select 1 from public.user_roles ur
  where ur.user_id = auth.uid() and ur.role in ('admin','diretor_geral')
));

create policy "alteracoes_salariais_admin_insert"
on public.alteracoes_salariais for insert to authenticated
with check (exists (
  select 1 from public.user_roles ur
  where ur.user_id = auth.uid() and ur.role in ('admin','diretor_geral')
));

create policy "alteracoes_salariais_admin_update"
on public.alteracoes_salariais for update to authenticated
using (exists (
  select 1 from public.user_roles ur
  where ur.user_id = auth.uid() and ur.role in ('admin','diretor_geral')
))
with check (exists (
  select 1 from public.user_roles ur
  where ur.user_id = auth.uid() and ur.role in ('admin','diretor_geral')
));
