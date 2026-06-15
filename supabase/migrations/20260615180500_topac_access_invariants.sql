-- Mantem status e acesso_liberado coerentes em qualquer tela que altere acessos.
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

  -- A tela que alterou explicitamente um dos campos define a decisao.
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

-- Corrige acessos antigos que aparecem ativos em uma tela e bloqueados em outra.
update public.acessos_externos
set acesso_liberado = (status = 'ativo')
where acesso_liberado is distinct from (status = 'ativo');

notify pgrst, 'reload schema';
