alter table public.payroll_documents
  drop constraint if exists payroll_documents_document_type_check;

alter table public.payroll_documents
  add constraint payroll_documents_document_type_check
  check (document_type = any (array[
    'HOLERITE'::text,
    'BENEFICIO_VR_VT'::text,
    'BENEFICIO_VR'::text,
    'BENEFICIO_VT'::text,
    'ADIANTAMENTO'::text,
    'RECIBO_GARAGEM'::text,
    'AVISO_FERIAS'::text
  ]));

create or replace view public.payroll_signature_status_v as
select
  d.id as document_id,
  d.company_id,
  d.employee_id,
  f.nome as employee_name,
  d.competencia,
  d.document_type,
  d.confirmed as holerite_confirmed,
  r.confirmed as payment_confirmed,
  sr.status as signature_status,
  sr.signed_at
from public.payroll_documents d
left join public.funcionarios f on f.id = d.employee_id
left join lateral (
  select rr.confirmed, rr.status, rr.created_at
  from public.payroll_payment_receipts rr
  where rr.document_id = d.id
    and rr.status <> 'DESCARTADO'
  order by (rr.status = 'PAGAMENTO_CONFIRMADO') desc, rr.created_at desc
  limit 1
) r on true
left join public.payroll_signature_requests sr on sr.document_id = d.id
where d.is_current = true;

revoke all on public.payroll_signature_status_v from anon;
grant select on public.payroll_signature_status_v to authenticated;
grant select on public.payroll_signature_status_v to service_role;
