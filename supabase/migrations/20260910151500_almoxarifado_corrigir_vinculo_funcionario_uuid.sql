-- Corrige o vínculo automático de funcionário: PostgreSQL não possui min(uuid) neste ambiente.
create or replace function public.almoxarifado_bind_funcionario_saida()
returns trigger
language plpgsql
set search_path=public
as $$
declare
  v_company uuid;
  v_id uuid;
  v_nome text;
  v_matches integer;
begin
  v_company := coalesce(new.company_id, public.almoxarifado_active_company(auth.uid()));

  if new.funcionario_id is not null then
    select f.id,f.nome into v_id,v_nome
      from public.funcionarios f
     where f.id=new.funcionario_id
       and (v_company is null or f.company_id=v_company)
     limit 1;
    if v_id is null then
      raise exception 'Funcionário não pertence à unidade ativa do Almoxarifado';
    end if;
    if new.funcionario_nome is null or btrim(new.funcionario_nome)='' then
      new.funcionario_nome:=v_nome;
    end if;
    if new.mecanico_nome is null or btrim(new.mecanico_nome)='' then
      new.mecanico_nome:=v_nome;
    end if;
    return new;
  end if;

  if v_company is not null and new.funcionario_nome is not null and btrim(new.funcionario_nome)<>'' then
    select count(*) into v_matches
      from public.funcionarios f
     where f.company_id=v_company
       and lower(btrim(f.nome))=lower(btrim(new.funcionario_nome))
       and coalesce(f.status,'ativo') not in ('desligado','excluido');

    if v_matches=1 then
      select f.id,f.nome into v_id,v_nome
        from public.funcionarios f
       where f.company_id=v_company
         and lower(btrim(f.nome))=lower(btrim(new.funcionario_nome))
         and coalesce(f.status,'ativo') not in ('desligado','excluido')
       limit 1;
      new.funcionario_id:=v_id;
      if new.mecanico_nome is null or btrim(new.mecanico_nome)='' then
        new.mecanico_nome:=v_nome;
      end if;
    end if;
  end if;

  return new;
end;
$$;
