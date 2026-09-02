insert into public.payroll_module_company_config (company_id, enabled)
select e.id, true
from public.empresas e
where lower(coalesce(e.codigo, '')) in ('topac-pg', 'topac-gyn')
on conflict (company_id) do update
set enabled = excluded.enabled,
    updated_at = now();

create or replace function public.payroll_company_enabled(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1
    from public.payroll_module_company_config c
    join public.empresas e on e.id = c.company_id
    where c.company_id = p_company_id
      and c.enabled = true
      and lower(coalesce(e.codigo,'')) in ('topac-matriz','topac-pg','topac-gyn','alqui','lmt')
      and regexp_replace(coalesce(e.cnpj,''), '\D', '', 'g') in ('07291648000103','07291648000294','07291648000375','14464586000150','21967711000100')
  );
$function$;
