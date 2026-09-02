-- O painel bancário/folha continua exclusivo de HOLERITE.
-- Recibos VR/VT são documentos independentes no portal de assinatura.
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
where d.is_current = true
  and d.document_type = 'HOLERITE';

grant select on public.payroll_admin_status_v to authenticated;
