-- Assinatura eletrônica de holerites — Plataforma TOPAC Web
-- Escopo aditivo. Não altera tabelas/fluxos existentes.

create extension if not exists pgcrypto;

create table if not exists public.payroll_module_company_config (
  company_id uuid primary key references public.empresas(id) on delete cascade,
  enabled boolean not null default false,
  reminder_window_start time not null default '08:00',
  reminder_window_end time not null default '21:00',
  first_reminder_time time not null default '12:00',
  reminder_interval_hours integer not null default 3 check (reminder_interval_hours between 1 and 24),
  link_ttl_hours integer not null default 168 check (link_ttl_hours between 1 and 720),
  otp_ttl_minutes integer not null default 5 check (otp_ttl_minutes between 1 and 30),
  otp_max_attempts integer not null default 5 check (otp_max_attempts between 1 and 20),
  otp_resend_seconds integer not null default 60 check (otp_resend_seconds between 30 and 3600),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.payroll_module_company_config (company_id, enabled)
select id, true
from public.empresas
where lower(coalesce(codigo,'')) in ('topac-matriz','alqui','lmt')
on conflict (company_id) do update set enabled = excluded.enabled, updated_at = now();

create or replace function public.payroll_company_enabled(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.payroll_module_company_config c
    join public.empresas e on e.id = c.company_id
    where c.company_id = p_company_id
      and c.enabled = true
      and lower(coalesce(e.codigo,'')) in ('topac-matriz','alqui','lmt')
      and regexp_replace(coalesce(e.cnpj,''), '\D', '', 'g') in ('07291648000103','14464586000150','21967711000100')
  );
$$;

create or replace function public.payroll_admin_authorized(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.payroll_company_enabled(p_company_id)
     and public.topac_has_any_role(array['admin'::text,'diretor_geral'::text], auth.uid());
$$;

create or replace function public.payroll_storage_company_id(p_name text)
returns uuid
language plpgsql
immutable
as $$
declare v text;
begin
  v := split_part(coalesce(p_name,''), '/', 1);
  if v ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return v::uuid;
  end if;
  return null;
exception when others then
  return null;
end;
$$;

create table if not exists public.payroll_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.empresas(id) on delete restrict,
  employee_id uuid references public.funcionarios(id) on delete restrict,
  competencia text not null check (competencia ~ '^\d{4}-\d{2}$'),
  document_type text not null default 'HOLERITE' check (document_type = 'HOLERITE'),
  storage_bucket text not null default 'payroll-private',
  storage_path text not null unique,
  original_filename text not null,
  mime_type text not null default 'application/pdf',
  file_size bigint not null default 0,
  document_sha256 text not null check (length(document_sha256) = 64),
  source_sha256 text,
  source_page_start integer,
  source_page_end integer,
  document_version integer not null default 1,
  is_current boolean not null default true,
  net_amount numeric(14,2),
  extracted_data jsonb not null default '{}'::jsonb,
  match_confidence numeric(5,2),
  status text not null default 'HOLERITE_PENDENTE' check (status in ('HOLERITE_PENDENTE','HOLERITE_CONFERIDO','AGUARDANDO_PAGAMENTO','SUBSTITUIDO')),
  confirmed boolean not null default false,
  confirmed_at timestamptz,
  confirmed_by uuid,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists payroll_documents_scope_idx on public.payroll_documents(company_id, competencia, employee_id);
create index if not exists payroll_documents_status_idx on public.payroll_documents(status, company_id, competencia);
create unique index if not exists payroll_documents_current_unique on public.payroll_documents(employee_id, competencia) where employee_id is not null and is_current = true;

create or replace function public.payroll_prepare_document_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.employee_id is not null then
    select coalesce(max(document_version),0) + 1 into new.document_version
    from public.payroll_documents
    where employee_id = new.employee_id and competencia = new.competencia;

    update public.payroll_documents
       set is_current = false, status = 'SUBSTITUIDO', updated_at = now()
     where employee_id = new.employee_id
       and competencia = new.competencia
       and is_current = true;
  end if;
  return new;
end;
$$;
drop trigger if exists payroll_prepare_document_version_trg on public.payroll_documents;
create trigger payroll_prepare_document_version_trg before insert on public.payroll_documents
for each row execute function public.payroll_prepare_document_version();

create table if not exists public.payroll_payment_receipts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.empresas(id) on delete restrict,
  employee_id uuid references public.funcionarios(id) on delete restrict,
  document_id uuid references public.payroll_documents(id) on delete restrict,
  competencia text not null check (competencia ~ '^\d{4}-\d{2}$'),
  storage_bucket text not null default 'payroll-private',
  storage_path text not null unique,
  original_filename text not null,
  mime_type text not null default 'application/pdf',
  file_size bigint not null default 0,
  receipt_sha256 text not null check (length(receipt_sha256) = 64),
  source_sha256 text,
  source_page_start integer,
  source_page_end integer,
  amount numeric(14,2),
  paid_at timestamptz,
  bank_name text,
  transaction_id text,
  bank_authentication text,
  payer_name text,
  payer_account text,
  extracted_data jsonb not null default '{}'::jsonb,
  match_confidence numeric(5,2),
  status text not null default 'PAGAMENTO_NAO_IDENTIFICADO' check (status in ('PAGAMENTO_NAO_IDENTIFICADO','PAGAMENTO_IDENTIFICADO','PAGAMENTO_CONFIRMADO','DESCARTADO')),
  confirmed boolean not null default false,
  confirmed_at timestamptz,
  confirmed_by uuid,
  idempotency_key text not null unique,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists payroll_receipts_scope_idx on public.payroll_payment_receipts(company_id, competencia, employee_id);
create index if not exists payroll_receipts_status_idx on public.payroll_payment_receipts(status, company_id, competencia);
create unique index if not exists payroll_receipts_document_confirmed_unique on public.payroll_payment_receipts(document_id) where document_id is not null and status = 'PAGAMENTO_CONFIRMADO';

create table if not exists public.payroll_signature_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.empresas(id) on delete restrict,
  employee_id uuid not null references public.funcionarios(id) on delete restrict,
  document_id uuid not null unique references public.payroll_documents(id) on delete restrict,
  receipt_id uuid not null references public.payroll_payment_receipts(id) on delete restrict,
  competencia text not null check (competencia ~ '^\d{4}-\d{2}$'),
  phone_snapshot text not null,
  public_token_hash text not null unique check (length(public_token_hash) = 64),
  public_token_ciphertext text not null,
  public_token_nonce text not null,
  token_key_version integer not null default 1,
  token_last4 text,
  expires_at timestamptz not null,
  status text not null default 'LINK_GERADO' check (status in ('LINK_GERADO','ENVIADO','VISUALIZADO','ASSINATURA_PENDENTE','ASSINADO','ERRO_DE_ENVIO','TELEFONE_INVALIDO','EXPIRADO','CANCELADO')),
  sent_at timestamptz,
  opened_at timestamptz,
  otp_validated_at timestamptz,
  viewed_at timestamptz,
  signed_at timestamptz,
  session_hash text,
  session_expires_at timestamptz,
  send_error text,
  send_attempts integer not null default 0,
  reminder_count integer not null default 0,
  next_reminder_at timestamptz,
  idempotency_key text not null unique,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists payroll_signature_requests_status_idx on public.payroll_signature_requests(status, next_reminder_at);
create index if not exists payroll_signature_requests_scope_idx on public.payroll_signature_requests(company_id, competencia, employee_id);

create table if not exists public.payroll_otp_challenges (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.payroll_signature_requests(id) on delete restrict,
  otp_hash text not null check (length(otp_hash) = 64),
  expires_at timestamptz not null,
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  status text not null default 'PENDENTE' check (status in ('PENDENTE','VALIDADO','EXPIRADO','BLOQUEADO','CANCELADO')),
  resend_after timestamptz not null,
  requested_ip inet,
  requested_user_agent text,
  sent_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists payroll_otp_request_idx on public.payroll_otp_challenges(request_id, created_at desc);

create table if not exists public.payroll_signatures (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.payroll_signature_requests(id) on delete restrict,
  company_id uuid not null references public.empresas(id) on delete restrict,
  employee_id uuid not null references public.funcionarios(id) on delete restrict,
  document_id uuid not null unique references public.payroll_documents(id) on delete restrict,
  receipt_id uuid not null references public.payroll_payment_receipts(id) on delete restrict,
  competencia text not null,
  employee_name text not null,
  employee_cpf text not null,
  phone_used text not null,
  company_name text not null,
  company_cnpj text not null,
  employee_role text,
  net_amount numeric(14,2),
  payment_at timestamptz,
  link_sent_at timestamptz,
  opened_at timestamptz,
  otp_validated_at timestamptz,
  viewed_at timestamptz,
  signed_at timestamptz not null default now(),
  ip inet,
  user_agent text,
  browser text,
  device text,
  authentication_method text not null default 'OTP',
  session_fingerprint text,
  document_sha256_before text not null,
  document_sha256_final text not null,
  document_version integer not null,
  certificate_bucket text,
  certificate_path text,
  certificate_sha256 text,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists payroll_signatures_scope_idx on public.payroll_signatures(company_id, competencia, employee_id);

create table if not exists public.payroll_signature_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references public.payroll_signature_requests(id) on delete restrict,
  company_id uuid not null references public.empresas(id) on delete restrict,
  employee_id uuid references public.funcionarios(id) on delete restrict,
  event_type text not null,
  actor_type text not null default 'SYSTEM',
  actor_user_id uuid,
  ip inet,
  user_agent text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists payroll_events_request_idx on public.payroll_signature_events(request_id, created_at);
create index if not exists payroll_events_scope_idx on public.payroll_signature_events(company_id, created_at desc);

create table if not exists public.payroll_message_logs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references public.payroll_signature_requests(id) on delete restrict,
  company_id uuid not null references public.empresas(id) on delete restrict,
  employee_id uuid references public.funcionarios(id) on delete restrict,
  message_kind text not null,
  channel text not null default 'WHATSAPP',
  destination_masked text,
  message_template text not null,
  status text not null check (status in ('PENDENTE','ENVIADO','ENTREGUE','FALHOU','CANCELADO')),
  provider_message_id text,
  attempt integer not null default 1,
  error text,
  next_scheduled_at timestamptz,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  delivered_at timestamptz
);
create index if not exists payroll_message_logs_request_idx on public.payroll_message_logs(request_id, created_at desc);

create table if not exists public.payroll_reminder_jobs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.payroll_signature_requests(id) on delete restrict,
  company_id uuid not null references public.empresas(id) on delete restrict,
  employee_id uuid not null references public.funcionarios(id) on delete restrict,
  job_kind text not null default 'REMINDER' check (job_kind in ('REMINDER','COLLECTION')),
  scheduled_at timestamptz not null,
  status text not null default 'PENDENTE' check (status in ('PENDENTE','PROCESSANDO','ENVIADO','FALHOU','CANCELADO')),
  attempt integer not null default 0,
  idempotency_key text not null unique,
  error text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists payroll_reminder_due_idx on public.payroll_reminder_jobs(status, scheduled_at);

create table if not exists public.payroll_terms_acceptances (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.empresas(id) on delete restrict,
  employee_id uuid not null references public.funcionarios(id) on delete restrict,
  term_version text not null,
  accepted boolean not null,
  authentication_method text,
  accepted_at timestamptz not null default now(),
  request_id uuid references public.payroll_signature_requests(id) on delete restrict,
  created_at timestamptz not null default now()
);

create or replace function public.payroll_block_event_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'payroll_signature_events is append-only';
end;
$$;
drop trigger if exists payroll_events_no_update_trg on public.payroll_signature_events;
create trigger payroll_events_no_update_trg before update or delete on public.payroll_signature_events
for each row execute function public.payroll_block_event_mutation();

create or replace function public.payroll_block_signed_document_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.payroll_signatures s where s.document_id = old.id) then
    if new.storage_path is distinct from old.storage_path
       or new.document_sha256 is distinct from old.document_sha256
       or new.employee_id is distinct from old.employee_id
       or new.company_id is distinct from old.company_id
       or new.competencia is distinct from old.competencia
       or new.net_amount is distinct from old.net_amount then
      raise exception 'Documento assinado está selado; crie uma nova versão.';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists payroll_signed_document_guard_trg on public.payroll_documents;
create trigger payroll_signed_document_guard_trg before update on public.payroll_documents
for each row execute function public.payroll_block_signed_document_mutation();

-- Updated-at
foreach_dummy: begin end;
