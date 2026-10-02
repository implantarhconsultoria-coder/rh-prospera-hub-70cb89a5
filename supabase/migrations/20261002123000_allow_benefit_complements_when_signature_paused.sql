-- Complementos de VR/VT precisam continuar funcionando mesmo quando a assinatura digital da empresa estiver pausada.
-- Benefícios com payment_event_id usam versionamento por evento; documentos sem evento continuam únicos por competência/tipo.

drop index if exists public.payroll_documents_current_unique;

create unique index if not exists payroll_documents_current_unique
  on public.payroll_documents(employee_id, competencia, document_type)
  where employee_id is not null
    and is_current = true
    and payment_event_id is null;

create or replace function public.payroll_prepare_document_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.payroll_company_enabled(new.company_id)
     and not (
       new.document_type in ('BENEFICIO_VR','BENEFICIO_VT','BENEFICIO_VR_VT')
       and coalesce(new.payment_kind, '') = 'COMPLEMENTAR'
     ) then
    raise exception 'Empresa não habilitada para assinatura eletrônica.';
  end if;

  if not public.payroll_employee_belongs(new.company_id, new.employee_id) then
    raise exception 'Funcionário não pertence à empresa informada.';
  end if;

  if new.employee_id is not null then
    if new.payment_event_id is not null
       and new.document_type in ('BENEFICIO_VR','BENEFICIO_VT','BENEFICIO_VR_VT') then
      select coalesce(max(document_version),0) + 1
        into new.document_version
      from public.payroll_documents
      where payment_event_id = new.payment_event_id;

      update public.payroll_documents
         set is_current = false,
             status = 'SUBSTITUIDO',
             updated_at = now()
       where payment_event_id = new.payment_event_id
         and is_current = true;
    else
      select coalesce(max(document_version),0) + 1
        into new.document_version
      from public.payroll_documents
      where employee_id = new.employee_id
        and competencia = new.competencia
        and document_type = new.document_type;

      update public.payroll_documents
         set is_current = false,
             status = 'SUBSTITUIDO',
             updated_at = now()
       where employee_id = new.employee_id
         and competencia = new.competencia
         and document_type = new.document_type
         and is_current = true;
    end if;
  end if;

  return new;
end;
$$;
