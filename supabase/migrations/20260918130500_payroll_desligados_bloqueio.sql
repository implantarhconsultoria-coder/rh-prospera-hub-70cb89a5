-- Regra global da assinatura digital:
-- funcionário desligado/inativo não autentica, não mantém sessão e sai das cobranças de assinatura.

create or replace function public.payroll_match_identity(
  p_cpf text,
  p_birth date,
  p_phone_last4 text
)
returns table(employee_id uuid, company_id uuid)
language sql
stable
security definer
set search_path to 'public'
as $$
  select f.id, coalesce(f.company_id, f.empresa_id)
  from public.funcionarios f
  where regexp_replace(coalesce(f.cpf,''), '\\D', '', 'g') = regexp_replace(coalesce(p_cpf,''), '\\D', '', 'g')
    and f.data_nascimento = p_birth
    and coalesce(f.status, 'ativo') = 'ativo'
    and coalesce(f.ativo, true) = true
    and f.data_demissao is null
    and length(regexp_replace(coalesce(p_phone_last4,''), '\\D', '', 'g')) = 4
    and (
      right(regexp_replace(coalesce(f.celular,''), '\\D', '', 'g'), 4) = regexp_replace(coalesce(p_phone_last4,''), '\\D', '', 'g')
      or right(regexp_replace(coalesce(f.telefone,''), '\\D', '', 'g'), 4) = regexp_replace(coalesce(p_phone_last4,''), '\\D', '', 'g')
    )
    and public.payroll_company_enabled(coalesce(f.company_id, f.empresa_id))
  limit 2;
$$;

create or replace function public.payroll_revoke_sessions_when_employee_inactive()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $$
begin
  if coalesce(new.status, 'ativo') <> 'ativo'
     or coalesce(new.ativo, true) = false
     or new.data_demissao is not null then
    update public.payroll_public_sessions
       set revoked_at = coalesce(revoked_at, now())
     where employee_id = new.id
       and revoked_at is null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_payroll_revoke_sessions_when_employee_inactive on public.funcionarios;
create trigger trg_payroll_revoke_sessions_when_employee_inactive
after insert or update of status, ativo, data_demissao on public.funcionarios
for each row
execute function public.payroll_revoke_sessions_when_employee_inactive();

update public.payroll_public_sessions s
set revoked_at = coalesce(s.revoked_at, now())
from public.funcionarios f
where f.id = s.employee_id
  and s.revoked_at is null
  and (
    coalesce(f.status, 'ativo') <> 'ativo'
    or coalesce(f.ativo, true) = false
    or f.data_demissao is not null
  );
