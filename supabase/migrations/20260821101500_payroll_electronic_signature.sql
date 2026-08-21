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

create or replace function public.payroll_employee_belongs(p_company_id uuid, p_employee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_employee_id is null or exists (
    select 1 from public.funcionarios f
    where f.id = p_employee_id
      and coalesce(f.company_id, f.empresa_id) = p_company_id
  );
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
  if not public.payroll_company_enabled(new.company_id) then
    raise exception 'Empresa não habilitada para assinatura eletrônica.';
  end if;
  if not public.payroll_employee_belongs(new.company_id, new.employee_id) then
    raise exception 'Funcionário não pertence à empresa informada.';
  end if;
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

create or replace function public.payroll_validate_receipt_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.payroll_company_enabled(new.company_id) then
    raise exception 'Empresa não habilitada para assinatura eletrônica.';
  end if;
  if not public.payroll_employee_belongs(new.company_id, new.employee_id) then
    raise exception 'Funcionário não pertence à empresa informada.';
  end if;
  if new.document_id is not null and not exists (
    select 1 from public.payroll_documents d
    where d.id = new.document_id and d.company_id = new.company_id and d.competencia = new.competencia
  ) then
    raise exception 'Holerite incompatível com empresa/competência do comprovante.';
  end if;
  return new;
end;
$$;
drop trigger if exists payroll_validate_receipt_scope_trg on public.payroll_payment_receipts;
create trigger payroll_validate_receipt_scope_trg before insert or update on public.payroll_payment_receipts
for each row execute function public.payroll_validate_receipt_scope();

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

create or replace function public.payroll_block_signature_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Assinatura eletrônica é imutável.';
end;
$$;
drop trigger if exists payroll_signatures_no_mutation_trg on public.payroll_signatures;
create trigger payroll_signatures_no_mutation_trg before update or delete on public.payroll_signatures
for each row execute function public.payroll_block_signature_mutation();

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

-- updated_at reutiliza a função existente da TOPAC

drop trigger if exists payroll_config_touch_trg on public.payroll_module_company_config;
create trigger payroll_config_touch_trg before update on public.payroll_module_company_config for each row execute function public.topac_touch_updated_at();
drop trigger if exists payroll_documents_touch_trg on public.payroll_documents;
create trigger payroll_documents_touch_trg before update on public.payroll_documents for each row execute function public.topac_touch_updated_at();
drop trigger if exists payroll_receipts_touch_trg on public.payroll_payment_receipts;
create trigger payroll_receipts_touch_trg before update on public.payroll_payment_receipts for each row execute function public.topac_touch_updated_at();
drop trigger if exists payroll_requests_touch_trg on public.payroll_signature_requests;
create trigger payroll_requests_touch_trg before update on public.payroll_signature_requests for each row execute function public.topac_touch_updated_at();
drop trigger if exists payroll_jobs_touch_trg on public.payroll_reminder_jobs;
create trigger payroll_jobs_touch_trg before update on public.payroll_reminder_jobs for each row execute function public.topac_touch_updated_at();

-- Bucket privado: nenhum documento deste módulo possui URL pública permanente.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payroll-private', 'payroll-private', false, 26214400, array['application/pdf'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- RLS
alter table public.payroll_module_company_config enable row level security;
alter table public.payroll_documents enable row level security;
alter table public.payroll_payment_receipts enable row level security;
alter table public.payroll_signature_requests enable row level security;
alter table public.payroll_otp_challenges enable row level security;
alter table public.payroll_signatures enable row level security;
alter table public.payroll_signature_events enable row level security;
alter table public.payroll_message_logs enable row level security;
alter table public.payroll_reminder_jobs enable row level security;
alter table public.payroll_terms_acceptances enable row level security;

-- Configuração: somente administração central/diretoria e somente CNPJs habilitados.
drop policy if exists payroll_config_select on public.payroll_module_company_config;
create policy payroll_config_select on public.payroll_module_company_config for select to authenticated
using (public.payroll_admin_authorized(company_id));
drop policy if exists payroll_config_update on public.payroll_module_company_config;
create policy payroll_config_update on public.payroll_module_company_config for update to authenticated
using (public.payroll_admin_authorized(company_id)) with check (public.payroll_admin_authorized(company_id));

-- Holerites: upload/conferência administrativa. Exclusão física não é liberada por RLS.
drop policy if exists payroll_documents_select on public.payroll_documents;
create policy payroll_documents_select on public.payroll_documents for select to authenticated
using (public.payroll_admin_authorized(company_id));
drop policy if exists payroll_documents_insert on public.payroll_documents;
create policy payroll_documents_insert on public.payroll_documents for insert to authenticated
with check (public.payroll_admin_authorized(company_id) and public.payroll_employee_belongs(company_id, employee_id));
drop policy if exists payroll_documents_update on public.payroll_documents;
create policy payroll_documents_update on public.payroll_documents for update to authenticated
using (public.payroll_admin_authorized(company_id))
with check (public.payroll_admin_authorized(company_id) and public.payroll_employee_belongs(company_id, employee_id));

-- Comprovantes: upload/conferência administrativa. Exclusão física não é liberada por RLS.
drop policy if exists payroll_receipts_select on public.payroll_payment_receipts;
create policy payroll_receipts_select on public.payroll_payment_receipts for select to authenticated
using (public.payroll_admin_authorized(company_id));
drop policy if exists payroll_receipts_insert on public.payroll_payment_receipts;
create policy payroll_receipts_insert on public.payroll_payment_receipts for insert to authenticated
with check (public.payroll_admin_authorized(company_id) and public.payroll_employee_belongs(company_id, employee_id));
drop policy if exists payroll_receipts_update on public.payroll_payment_receipts;
create policy payroll_receipts_update on public.payroll_payment_receipts for update to authenticated
using (public.payroll_admin_authorized(company_id))
with check (public.payroll_admin_authorized(company_id) and public.payroll_employee_belongs(company_id, employee_id));

-- Demais evidências: frontend autenticado somente lê; escrita ocorre no backend com service role.
drop policy if exists payroll_requests_select on public.payroll_signature_requests;
create policy payroll_requests_select on public.payroll_signature_requests for select to authenticated using (public.payroll_admin_authorized(company_id));
drop policy if exists payroll_signatures_select on public.payroll_signatures;
create policy payroll_signatures_select on public.payroll_signatures for select to authenticated using (public.payroll_admin_authorized(company_id));
drop policy if exists payroll_events_select on public.payroll_signature_events;
create policy payroll_events_select on public.payroll_signature_events for select to authenticated using (public.payroll_admin_authorized(company_id));
drop policy if exists payroll_messages_select on public.payroll_message_logs;
create policy payroll_messages_select on public.payroll_message_logs for select to authenticated using (public.payroll_admin_authorized(company_id));
drop policy if exists payroll_jobs_select on public.payroll_reminder_jobs;
create policy payroll_jobs_select on public.payroll_reminder_jobs for select to authenticated using (public.payroll_admin_authorized(company_id));
drop policy if exists payroll_terms_select on public.payroll_terms_acceptances;
create policy payroll_terms_select on public.payroll_terms_acceptances for select to authenticated using (public.payroll_admin_authorized(company_id));

-- OTP não é consultável pelo frontend. Nem admin recebe o hash.
revoke all on public.payroll_otp_challenges from anon, authenticated;

-- Storage privado. Caminho obrigatório: company_id/competencia/tipo/arquivo.pdf

drop policy if exists payroll_private_select on storage.objects;
create policy payroll_private_select on storage.objects for select to authenticated
using (
  bucket_id = 'payroll-private'
  and public.payroll_admin_authorized(public.payroll_storage_company_id(name))
);
drop policy if exists payroll_private_insert on storage.objects;
create policy payroll_private_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'payroll-private'
  and public.payroll_admin_authorized(public.payroll_storage_company_id(name))
);
drop policy if exists payroll_private_update on storage.objects;
create policy payroll_private_update on storage.objects for update to authenticated
using (
  bucket_id = 'payroll-private'
  and public.payroll_admin_authorized(public.payroll_storage_company_id(name))
)
with check (
  bucket_id = 'payroll-private'
  and public.payroll_admin_authorized(public.payroll_storage_company_id(name))
);
-- Sem política DELETE: evidências não são apagadas silenciosamente pelo frontend.

-- Visão operacional do painel RH, respeitando RLS das tabelas-base.
create or replace view public.payroll_admin_status_v
with (security_invoker = true)
as
select
  d.id as document_id,
  d.company_id,
  c.nome as company_name,
  c.cnpj as company_cnpj,
  d.employee_id,
  f.nome as employee_name,
  f.cpf as employee_cpf,
  f.cargo as employee_role,
  coalesce(nullif(f.celular,''), nullif(f.telefone,'')) as employee_phone,
  d.competencia,
  d.document_version,
  d.original_filename as holerite_filename,
  d.storage_path as holerite_storage_path,
  d.document_sha256,
  d.net_amount,
  d.status as holerite_status,
  d.confirmed as holerite_confirmed,
  d.confirmed_at as holerite_confirmed_at,
  r.id as receipt_id,
  r.original_filename as receipt_filename,
  r.storage_path as receipt_storage_path,
  r.amount as payment_amount,
  r.paid_at,
  r.bank_name,
  r.transaction_id,
  r.status as payment_status,
  r.confirmed as payment_confirmed,
  r.confirmed_at as payment_confirmed_at,
  sr.id as request_id,
  sr.status as signature_status,
  sr.sent_at,
  sr.opened_at,
  sr.otp_validated_at,
  sr.viewed_at,
  sr.signed_at,
  sr.reminder_count,
  sr.send_error,
  s.id as signature_id,
  s.certificate_path,
  s.certificate_sha256
from public.payroll_documents d
join public.empresas c on c.id = d.company_id
left join public.funcionarios f on f.id = d.employee_id
left join lateral (
  select rr.*
  from public.payroll_payment_receipts rr
  where rr.document_id = d.id and rr.status <> 'DESCARTADO'
  order by (rr.status = 'PAGAMENTO_CONFIRMADO') desc, rr.created_at desc
  limit 1
) r on true
left join public.payroll_signature_requests sr on sr.document_id = d.id
left join public.payroll_signatures s on s.request_id = sr.id
where d.is_current = true;

revoke all on public.payroll_module_company_config from anon;
revoke all on public.payroll_documents from anon;
revoke all on public.payroll_payment_receipts from anon;
revoke all on public.payroll_signature_requests from anon;
revoke all on public.payroll_signatures from anon;
revoke all on public.payroll_signature_events from anon;
revoke all on public.payroll_message_logs from anon;
revoke all on public.payroll_reminder_jobs from anon;
revoke all on public.payroll_terms_acceptances from anon;
revoke all on public.payroll_admin_status_v from anon;

grant select, insert, update on public.payroll_documents to authenticated;
grant select, insert, update on public.payroll_payment_receipts to authenticated;
grant select, update on public.payroll_module_company_config to authenticated;
grant select on public.payroll_signature_requests to authenticated;
grant select on public.payroll_signatures to authenticated;
grant select on public.payroll_signature_events to authenticated;
grant select on public.payroll_message_logs to authenticated;
grant select on public.payroll_reminder_jobs to authenticated;
grant select on public.payroll_terms_acceptances to authenticated;
grant select on public.payroll_admin_status_v to authenticated;
grant execute on function public.payroll_company_enabled(uuid) to authenticated;
grant execute on function public.payroll_admin_authorized(uuid) to authenticated;
grant execute on function public.payroll_employee_belongs(uuid,uuid) to authenticated;
