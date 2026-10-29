-- Controle de garagem: beneficiarios referenciam exclusivamente funcionarios existentes.
-- Historico por competencia continua em payroll_documents (RECIBO_GARAGEM).
create table if not exists public.garagem_beneficiarios (
  employee_id uuid primary key references public.funcionarios(id) on delete cascade,
  company_id uuid not null references public.empresas(id),
  ativo boolean not null default false,
  valor_mensal numeric(10,2) not null default 200.00 check (valor_mensal > 0),
  veiculo text not null default '',
  placa text not null default '',
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid
);

create or replace function public.garagem_validar_beneficiario()
returns trigger language plpgsql security invoker
set search_path = public, pg_temp
as $function$
begin
  if not exists (
    select 1 from public.funcionarios f
    where f.id = new.employee_id and f.company_id = new.company_id
  ) then
    raise exception 'Funcionário não cadastrado nesta empresa';
  end if;
  if new.ativo and not exists (
    select 1 from public.funcionarios f
    where f.id = new.employee_id and f.company_id = new.company_id and f.status = 'ativo'
  ) then
    raise exception 'Somente funcionários ativos podem receber garagem';
  end if;
  new.placa := upper(trim(coalesce(new.placa,'')));
  new.veiculo := trim(coalesce(new.veiculo,''));
  new.atualizado_em := now();
  if auth.uid() is not null then new.atualizado_por := auth.uid(); end if;
  return new;
end;
$function$;

drop trigger if exists garagem_validar_beneficiario_trigger on public.garagem_beneficiarios;
create trigger garagem_validar_beneficiario_trigger
before insert or update on public.garagem_beneficiarios
for each row execute function public.garagem_validar_beneficiario();

alter table public.garagem_beneficiarios enable row level security;
grant select, insert, update on public.garagem_beneficiarios to authenticated;
revoke all on public.garagem_beneficiarios from anon;
drop policy if exists garagem_beneficiarios_select on public.garagem_beneficiarios;
create policy garagem_beneficiarios_select on public.garagem_beneficiarios
for select to authenticated
using (public.payroll_admin_authorized(company_id));

drop policy if exists garagem_beneficiarios_insert on public.garagem_beneficiarios;
create policy garagem_beneficiarios_insert on public.garagem_beneficiarios
for insert to authenticated
with check (
  public.payroll_admin_authorized(company_id)
  and public.payroll_employee_belongs(company_id, employee_id)
);
drop policy if exists garagem_beneficiarios_update on public.garagem_beneficiarios;
create policy garagem_beneficiarios_update on public.garagem_beneficiarios
for update to authenticated
using (public.payroll_admin_authorized(company_id))
with check (
  public.payroll_admin_authorized(company_id)
  and public.payroll_employee_belongs(company_id, employee_id)
);

-- Base outubro/2026 confirmada nos recibos individuais. Idempotente: nao sobrescreve edicoes posteriores.
insert into public.garagem_beneficiarios
(employee_id,company_id,ativo,valor_mensal,veiculo,placa)
values
('aefe80e9-d8c5-4627-8bd9-57966988780c','67275dcd-150b-44bc-a445-bd31efc31ca9',true,200,'CHEVROLET MONTANA LS2','FCM1081'),
('e5b4a11e-82dc-46c0-a04a-8bd767c8d5af','67275dcd-150b-44bc-a445-bd31efc31ca9',true,200,'FIAT STRADA','TLK4H52'),
('13ae318b-5a3a-4468-aa1b-5c2f71a2309f','67275dcd-150b-44bc-a445-bd31efc31ca9',true,200,'FIAT STRADA','TMC7G68'),
('6bd1c952-3195-479b-b69a-1e244d69a098','fc7b015f-e53a-49cf-a714-19b647220933',true,200,'FIAT STRADA ENDURANCE','STT6J03'),
('fe443a34-ac37-430f-bdca-6e7c575ad9d0','fc7b015f-e53a-49cf-a714-19b647220933',true,200,'FIAT STRADA ENDURANCE','SUI1F53'),
('f93bd3f5-dfef-4a62-820d-bf553e7c63a0','fc7b015f-e53a-49cf-a714-19b647220933',true,200,'FIAT STRADA ENDURANCE','PTZ6I45')
on conflict (employee_id) do nothing;
