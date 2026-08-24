-- Recibos de benefícios (VR/VT) no mesmo portal de assinatura eletrônica.
-- Aditivo: holerite continua exigindo comprovante de pagamento confirmado.

alter table public.payroll_documents
  drop constraint if exists payroll_documents_document_type_check;
alter table public.payroll_documents
  add constraint payroll_documents_document_type_check
  check (document_type in ('HOLERITE','BENEFICIO_VR_VT'));

alter table public.payroll_documents
  drop constraint if exists payroll_documents_status_check;
alter table public.payroll_documents
  add constraint payroll_documents_status_check
  check (status in ('HOLERITE_PENDENTE','HOLERITE_CONFERIDO','AGUARDANDO_PAGAMENTO','AGUARDANDO_ASSINATURA','SUBSTITUIDO'));

-- Um funcionário pode ter, na mesma competência, um holerite e um recibo VR/VT atuais.
drop index if exists public.payroll_documents_current_unique;
create unique index if not exists payroll_documents_current_unique
  on public.payroll_documents(employee_id, competencia, document_type)
  where employee_id is not null and is_current = true;

-- Versionamento passa a substituir apenas documentos do mesmo tipo.
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
     where employee_id = new.employee_id
       and competencia = new.competencia
       and document_type = new.document_type;

    update public.payroll_documents
       set is_current = false, status = 'SUBSTITUIDO', updated_at = now()
     where employee_id = new.employee_id
       and competencia = new.competencia
       and document_type = new.document_type
       and is_current = true;
  end if;
  return new;
end;
$$;

-- Recibo bancário é obrigatório para HOLERITE, mas não para recibo de benefício.
alter table public.payroll_signature_requests alter column receipt_id drop not null;
alter table public.payroll_signatures alter column receipt_id drop not null;

-- Mantém exatamente a ordem das colunas já existentes e acrescenta document_type ao final.
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
  s.certificate_sha256,
  d.document_type
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

grant select on public.payroll_admin_status_v to authenticated;
