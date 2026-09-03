create or replace function public.admin_excluir_funcionario_seguro(
  p_funcionario_id uuid,
  p_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_nome text;
  v_total bigint := 0;
  v_count bigint := 0;
  v_vinculos jsonb := '{}'::jsonb;
  v_fk record;
  v_key text;
  v_seen text[] := array[]::text[];
  v_extra record;
begin
  if auth.role() <> 'service_role' and not public.has_role(auth.uid(), 'admin') then
    raise exception 'Apenas administradores podem excluir funcionários.' using errcode = '42501';
  end if;

  select nome into v_nome
  from public.funcionarios
  where id = p_funcionario_id
  for update;

  if v_nome is null then
    raise exception 'Funcionário não encontrado.' using errcode = 'P0002';
  end if;

  for v_fk in
    select tc.table_schema, tc.table_name, kcu.column_name, rc.delete_rule
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on tc.constraint_name = kcu.constraint_name
     and tc.constraint_schema = kcu.constraint_schema
    join information_schema.referential_constraints rc
      on tc.constraint_name = rc.constraint_name
     and tc.constraint_schema = rc.constraint_schema
    join information_schema.constraint_column_usage ccu
      on rc.unique_constraint_name = ccu.constraint_name
     and rc.unique_constraint_schema = ccu.constraint_schema
    where tc.constraint_type = 'FOREIGN KEY'
      and ccu.table_schema = 'public'
      and ccu.table_name = 'funcionarios'
      and ccu.column_name = 'id'
  loop
    execute format('select count(*) from %I.%I where %I = $1', v_fk.table_schema, v_fk.table_name, v_fk.column_name)
      into v_count using p_funcionario_id;

    v_key := v_fk.table_name || '.' || v_fk.column_name;
    v_seen := array_append(v_seen, v_key);
    if v_count > 0 then
      v_vinculos := v_vinculos || jsonb_build_object(v_key, jsonb_build_object('quantidade', v_count, 'delete_rule', v_fk.delete_rule));
      v_total := v_total + v_count;
    end if;
  end loop;

  for v_extra in
    select * from (values
      ('aso_documentos','funcionario_id'),
      ('contracheque_envio_status','funcionario_id'),
      ('funcionario_login_tokens','funcionario_id'),
      ('funcionario_novos_vinculos','funcionario_id'),
      ('grupo_documentos_funcionarios','funcionario_id'),
      ('holerite_funcionario_documentos','funcionario_id'),
      ('holerite_funcionario_itens','funcionario_id'),
      ('pendencias_ponto','funcionario_id'),
      ('ponto_funcionario_dia','funcionario_id'),
      ('ponto_marcacoes','funcionario_id'),
      ('ponto_tokens','funcionario_id'),
      ('recibos_pagamento_digitais','funcionario_id'),
      ('uniforme_entregas','funcionario_id')
    ) as x(table_name, column_name)
  loop
    v_key := v_extra.table_name || '.' || v_extra.column_name;
    if not (v_key = any(v_seen)) and to_regclass('public.' || quote_ident(v_extra.table_name)) is not null then
      execute format('select count(*) from public.%I where %I = $1', v_extra.table_name, v_extra.column_name)
        into v_count using p_funcionario_id;
      if v_count > 0 then
        v_vinculos := v_vinculos || jsonb_build_object(v_key, jsonb_build_object('quantidade', v_count, 'delete_rule', 'SEM_FK'));
        v_total := v_total + v_count;
      end if;
    end if;
  end loop;

  if v_total = 0 then
    delete from public.funcionarios where id = p_funcionario_id;
    return jsonb_build_object(
      'ok', true,
      'modo', 'definitiva',
      'funcionario', v_nome,
      'vinculos_total', 0,
      'vinculos', v_vinculos
    );
  end if;

  update public.funcionarios
  set ativo = false,
      status = 'excluido',
      excluido_em = now(),
      excluido_por = auth.uid(),
      exclusao_motivo = nullif(trim(coalesce(p_motivo, '')), ''),
      exclusao_origem = 'painel_admin'
  where id = p_funcionario_id;

  return jsonb_build_object(
    'ok', true,
    'modo', 'historico_preservado',
    'funcionario', v_nome,
    'vinculos_total', v_total,
    'vinculos', v_vinculos
  );
end;
$$;

revoke all on function public.admin_excluir_funcionario_seguro(uuid, text) from public;
grant execute on function public.admin_excluir_funcionario_seguro(uuid, text) to authenticated;
