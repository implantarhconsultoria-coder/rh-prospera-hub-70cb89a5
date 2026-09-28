create table if not exists public.contabilidade_email_threads (
  thread_key text primary key,
  empresa_id uuid references public.empresas(id) on delete cascade,
  competencia text,
  assunto text not null,
  root_message_id text,
  last_message_id text,
  last_provider_email_id text,
  status text not null default 'aberto' check (status in ('aberto','encerrado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  encerrado_em timestamptz
);

create index if not exists idx_contabilidade_email_threads_empresa_comp
  on public.contabilidade_email_threads(empresa_id, competencia);

alter table public.contabilidade_email_threads enable row level security;
revoke all on table public.contabilidade_email_threads from anon, authenticated;
grant all on table public.contabilidade_email_threads to service_role;
