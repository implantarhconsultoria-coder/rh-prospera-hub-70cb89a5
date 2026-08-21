-- Portal público único de holerite: autenticação por CPF + nascimento + últimos 4 do celular.
-- Aditivo: não altera fluxos fora do módulo payroll.

create table if not exists public.payroll_public_sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.empresas(id) on delete restrict,
  employee_id uuid not null references public.funcionarios(id) on delete restrict,
  session_hash text not null unique check (length(session_hash) = 64),
  auth_method text not null default 'CPF_NASCIMENTO_CELULAR4',
  expires_at timestamptz not null,
  ip text,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index if not exists payroll_public_sessions_lookup_idx on public.payroll_public_sessions(session_hash, expires_at) where revoked_at is null;
create index if not exists payroll_public_sessions_employee_idx on public.payroll_public_sessions(employee_id, created_at desc);

create table if not exists public.payroll_public_access_attempts (
  id uuid primary key default gen_random_uuid(),
  identifier_hash text not null check (length(identifier_hash) = 64),
  ip text,
  success boolean not null default false,
  failure_reason text,
  company_id uuid references public.empresas(id) on delete restrict,
  employee_id uuid references public.funcionarios(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index if not exists payroll_public_attempt_identifier_idx on public.payroll_public_access_attempts(identifier_hash, created_at desc);
create index if not exists payroll_public_attempt_ip_idx on public.payroll_public_access_attempts(ip, created_at desc);

alter table public.payroll_signature_requests add column if not exists identity_validated_at timestamptz;
alter table public.payroll_signature_requests add column if not exists identity_method text;

alter table public.payroll_public_sessions enable row level security;
alter table public.payroll_public_access_attempts enable row level security;

-- Não há policy para anon/authenticated: estas tabelas são acessadas apenas pelo backend service role.
revoke all on public.payroll_public_sessions from anon, authenticated;
revoke all on public.payroll_public_access_attempts from anon, authenticated;

create or replace function public.payroll_match_identity(
  p_cpf text,
  p_birth date,
  p_phone_last4 text
)
returns table(employee_id uuid, company_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select f.id as employee_id,
         coalesce(f.company_id, f.empresa_id) as company_id
  from public.funcionarios f
  where regexp_replace(coalesce(f.cpf,''), '\D', '', 'g') = regexp_replace(coalesce(p_cpf,''), '\D', '', 'g')
    and f.data_nascimento = p_birth
    and length(regexp_replace(coalesce(p_phone_last4,''), '\D', '', 'g')) = 4
    and (
      right(regexp_replace(coalesce(f.celular,''), '\D', '', 'g'), 4) = regexp_replace(coalesce(p_phone_last4,''), '\D', '', 'g')
      or right(regexp_replace(coalesce(f.telefone,''), '\D', '', 'g'), 4) = regexp_replace(coalesce(p_phone_last4,''), '\D', '', 'g')
    )
    and public.payroll_company_enabled(coalesce(f.company_id, f.empresa_id))
    and exists (
      select 1
      from public.payroll_documents d
      join public.payroll_payment_receipts r on r.document_id = d.id
      where d.employee_id = f.id
        and d.company_id = coalesce(f.company_id, f.empresa_id)
        and d.is_current = true
        and d.confirmed = true
        and d.status = 'AGUARDANDO_PAGAMENTO'
        and r.employee_id = f.id
        and r.company_id = d.company_id
        and r.confirmed = true
        and r.status = 'PAGAMENTO_CONFIRMADO'
    )
  limit 2;
$$;
revoke all on function public.payroll_match_identity(text,date,text) from public, anon, authenticated;
grant execute on function public.payroll_match_identity(text,date,text) to service_role;
