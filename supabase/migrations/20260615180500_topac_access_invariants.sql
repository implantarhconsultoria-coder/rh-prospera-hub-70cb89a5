-- Mantem os dois campos de bloqueio coerentes em qualquer tela que altere acessos.
create or replace function public.topac_normalizar_status_acesso_externo()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(new.status, 'ativo') <> 'ativo' or coalesce(new.acesso_liberado, true) = false then
      new.status := 'bloqueado';
      new.acesso_liberado := false;
    else
      new.status := 'ativo';
      new.acesso_liberado := true;
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    new.acesso_liberado := new.status = 'ativo';
  elsif new.acesso_liberado is distinct from old.acesso_liberado then
    new.status := case when new.acesso_liberado then 'ativo' else 'bloqueado' end;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_topac_normalizar_status_acesso_externo on public.acessos_externos;
create trigger trg_topac_normalizar_status_acesso_externo
before insert or update of status, acesso_liberado
on public.acessos_externos
for each row
execute function public.topac_normalizar_status_acesso_externo();

update public.acessos_externos
set acesso_liberado = (status = 'ativo')
where acesso_liberado is distinct from (status = 'ativo');

-- Funcionario desligado ou excluido nao pode continuar entrando em portais externos.
create or replace function public.topac_bloquear_acessos_funcionario_inativo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.ativo, true) = false or coalesce(new.status, 'ativo') in ('desligado', 'excluido') then
    update public.acessos_externos
       set status = 'bloqueado',
           acesso_liberado = false,
           updated_at = now()
     where funcionario_id = new.id
       and (status is distinct from 'bloqueado' or acesso_liberado is distinct from false);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_topac_bloquear_acessos_funcionario_inativo on public.funcionarios;
create trigger trg_topac_bloquear_acessos_funcionario_inativo
after insert or update of status, ativo
on public.funcionarios
for each row
execute function public.topac_bloquear_acessos_funcionario_inativo();

update public.acessos_externos a
set status = 'bloqueado',
    acesso_liberado = false,
    updated_at = now()
from public.funcionarios f
where a.funcionario_id = f.id
  and (coalesce(f.ativo, true) = false or coalesce(f.status, 'ativo') in ('desligado', 'excluido'))
  and (a.status is distinct from 'bloqueado' or a.acesso_liberado is distinct from false);
