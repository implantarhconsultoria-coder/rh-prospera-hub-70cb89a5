-- Corrige o upsert da RPC central de acessos para usar o indice unico parcial existente.
create or replace function public.admin_configurar_acessos_funcionario(
  p_funcionario_id uuid,
  p_modulos text[] default array[]::text[],
  p_ativo boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_funcionario public.funcionarios%rowtype;
  v_empresa public.empresas%rowtype;
  v_cpf_clean text;
  v_modulos text[];
  v_modulo text;
  v_perfil text;
  v_filial text;
begin
  if not public._topac_admin_usuario_autorizado() then
    return jsonb_build_object('ok', false, 'error', 'nao_autorizado');
  end if;

  select * into v_funcionario from public.funcionarios where id = p_funcionario_id;
  if v_funcionario.id is null then
    return jsonb_build_object('ok', false, 'error', 'funcionario_nao_encontrado');
  end if;

  v_cpf_clean := regexp_replace(coalesce(v_funcionario.cpf, ''), '\D', '', 'g');
  if length(v_cpf_clean) <> 11 then
    return jsonb_build_object('ok', false, 'error', 'cpf_invalido');
  end if;

  select * into v_empresa
  from public.empresas
  where id = coalesce(v_funcionario.company_id, v_funcionario.empresa_id);

  v_filial := coalesce(v_empresa.cidade, '');

  select coalesce(array_agg(distinct modulo), array[]::text[])
    into v_modulos
    from unnest(coalesce(p_modulos, array[]::text[])) as modulo
   where modulo = any(array['filial','financeiro','faturamento','almoxarifado','operacional','campo','mecanico']);

  update public.acessos_externos
     set status = 'bloqueado', acesso_liberado = false, updated_at = now()
   where funcionario_id = p_funcionario_id
     and (
       p_ativo is not true
       or (
         modulo = any(array['filial','financeiro','faturamento','almoxarifado','operacional','campo','mecanico'])
         and not (modulo = any(v_modulos))
       )
     );

  if p_ativo is true then
    foreach v_modulo in array v_modulos loop
      v_perfil := case v_modulo
        when 'mecanico' then 'mecanico_externo'
        when 'campo' then 'tecnico_campo'
        else v_modulo
      end;

      insert into public.acessos_externos (
        nome, cpf, cpf_clean, pin, email, email_corporativo, telefone,
        empresa, filial, funcao, funcionario_id, perfil_acesso, modulo,
        status, acesso_liberado, ativo, updated_at
      ) values (
        coalesce(v_funcionario.nome, ''), coalesce(v_funcionario.cpf, ''),
        v_cpf_clean, right(v_cpf_clean, 4),
        nullif(lower(trim(coalesce(v_funcionario.email, ''))), ''),
        nullif(lower(trim(coalesce(v_funcionario.email, ''))), ''),
        coalesce(nullif(v_funcionario.telefone, ''), nullif(v_funcionario.celular, '')),
        nullif(v_empresa.nome, ''), nullif(v_filial, ''), nullif(v_funcionario.cargo, ''),
        v_funcionario.id, v_perfil, v_modulo, 'ativo', true, true, now()
      )
      on conflict (cpf_clean, modulo)
      where cpf_clean is not null and modulo is not null
      do update set
        nome = excluded.nome,
        cpf = excluded.cpf,
        pin = excluded.pin,
        email = coalesce(excluded.email, acessos_externos.email),
        email_corporativo = coalesce(excluded.email_corporativo, acessos_externos.email_corporativo),
        telefone = coalesce(excluded.telefone, acessos_externos.telefone),
        empresa = coalesce(excluded.empresa, acessos_externos.empresa),
        filial = coalesce(excluded.filial, acessos_externos.filial),
        funcao = coalesce(excluded.funcao, acessos_externos.funcao),
        funcionario_id = excluded.funcionario_id,
        perfil_acesso = excluded.perfil_acesso,
        status = 'ativo',
        acesso_liberado = true,
        ativo = true,
        updated_at = now();
    end loop;
  end if;

  return jsonb_build_object(
    'ok', true,
    'funcionario_id', p_funcionario_id,
    'ativo', p_ativo,
    'modulos', to_jsonb(v_modulos)
  );
end;
$$;

revoke all on function public.admin_configurar_acessos_funcionario(uuid, text[], boolean) from public, anon;
grant execute on function public.admin_configurar_acessos_funcionario(uuid, text[], boolean) to authenticated, service_role;

notify pgrst, 'reload schema';
