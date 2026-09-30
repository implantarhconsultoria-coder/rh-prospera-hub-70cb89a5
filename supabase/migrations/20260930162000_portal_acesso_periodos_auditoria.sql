-- Portal externo: credenciais, sessões por período e auditoria.
-- O app mecânico permanece fora deste fluxo.

create table if not exists public.portal_credenciais (
  id uuid primary key default gen_random_uuid(),
  funcionario_id uuid null references public.funcionarios(id) on delete set null,
  email text not null unique,
  cpf_clean text not null unique,
  nome text not null,
  funcao text null,
  senha_hash text not null,
  status text not null default 'ativo' check (status in ('ativo','bloqueado','inativo')),
  falhas_consecutivas integer not null default 0,
  bloqueado_ate timestamptz null,
  ultimo_login_em timestamptz null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.portal_sessoes (
  id uuid primary key default gen_random_uuid(),
  credencial_id uuid null references public.portal_credenciais(id) on delete cascade,
  email text null,
  cpf_clean text null,
  nome text null,
  token_hash text not null unique,
  lembrar_dispositivo boolean not null default false,
  inicio_em timestamptz not null default now(),
  expira_em timestamptz not null,
  encerrado_em timestamptz null,
  encerramento_motivo text null,
  extensoes integer not null default 0,
  ultimo_motivo_extensao text null,
  atualizado_em timestamptz not null default now()
);

create table if not exists public.portal_acesso_auditoria (
  id bigint generated always as identity primary key,
  credencial_id uuid null references public.portal_credenciais(id) on delete set null,
  sessao_id uuid null references public.portal_sessoes(id) on delete set null,
  email text null,
  evento text not null,
  modulo text null,
  acesso_id uuid null,
  motivo text null,
  ip_hash text null,
  user_agent text null,
  metadata jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now()
);

create index if not exists idx_portal_credenciais_funcionario on public.portal_credenciais(funcionario_id);
create index if not exists idx_portal_sessoes_credencial on public.portal_sessoes(credencial_id, expira_em desc);
create index if not exists idx_portal_sessoes_email on public.portal_sessoes(email, expira_em desc);
create index if not exists idx_portal_auditoria_credencial on public.portal_acesso_auditoria(credencial_id, criado_em desc);
create index if not exists idx_portal_auditoria_evento on public.portal_acesso_auditoria(evento, criado_em desc);

alter table public.portal_credenciais enable row level security;
alter table public.portal_sessoes enable row level security;
alter table public.portal_acesso_auditoria enable row level security;

revoke all on public.portal_credenciais from anon, authenticated;
revoke all on public.portal_sessoes from anon, authenticated;
revoke all on public.portal_acesso_auditoria from anon, authenticated;
