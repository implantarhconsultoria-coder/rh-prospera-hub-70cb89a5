-- Integra o pre-cadastro dos operadores ao primeiro acesso e permite
-- abrir chamado diretamente a partir da alocacao cliente/canteiro/patrimonio.

create or replace function public.topac_resolver_acesso_cpf(
  p_cpf text default '',
  p_email text default '',
  p_nome text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cpf text := public.topac_clean_cpf(p_cpf);
  v_email text := lower(trim(coalesce(p_email, '')));
  v_nome_norm text := public.topac_norm_text(p_nome);
  v_fixo public.topac_acessos_fixos%rowtype;
  v_acesso public.acessos_externos%rowtype;
  v_operador public.operadores_operacao%rowtype;
  v_operador_func public.funcionarios%rowtype;
  v_operador_empresa text;
  v_roles_acesso text[] := array[]::text[];
  v_roles text[] := array[]::text[];
  v_nome text := coalesce(p_nome, '');
  v_empresa text := 'TOPAC MULTIEMPRESAS';
  v_filial text := 'GERAL';
  v_cargo text := 'usuario';
  v_perfil text := 'usuario';
begin
  if v_cpf = '' and v_email = '' and v_nome_norm = '' then
    return jsonb_build_object('ok', true, 'authorized', false, 'roles', '[]'::jsonb, 'reason', 'cpf_nao_informado');
  end if;

  select *
    into v_fixo
    from public.topac_acessos_fixos f
   where f.ativo = true
     and (
       (v_cpf <> '' and f.cpf_clean = v_cpf)
       or (v_email <> '' and lower(coalesce(f.email, '')) = v_email)
     )
   order by case when v_cpf <> '' and f.cpf_clean = v_cpf then 0 else 1 end
   limit 1;

  select a.*
    into v_acesso
    from public.acessos_externos a
   where coalesce(a.acesso_liberado, true) = true
     and coalesce(a.status, 'ativo') <> 'bloqueado'
     and (
       (v_cpf <> '' and public.topac_clean_cpf(coalesce(a.cpf_clean, a.cpf, '')) = v_cpf)
       or (v_email <> '' and lower(coalesce(a.email, a.email_corporativo, '')) = v_email)
       or (length(v_nome_norm) >= 8 and public.topac_norm_text(a.nome) = v_nome_norm)
     )
   order by
     case
       when v_cpf <> '' and public.topac_clean_cpf(coalesce(a.cpf_clean, a.cpf, '')) = v_cpf then 0
       when v_email <> '' and lower(coalesce(a.email, a.email_corporativo, '')) = v_email then 1
       else 2
     end,
     a.updated_at desc nulls last,
     a.created_at desc
   limit 1;

  if v_acesso.id is not null then
    select public.topac_roles_validas(array_agg(role_name))
      into v_roles_acesso
      from (
        select distinct public.topac_role_from_acesso(a.modulo, a.perfil_acesso, a.filial) as role_name
          from public.acessos_externos a
         where coalesce(a.acesso_liberado, true) = true
           and coalesce(a.status, 'ativo') <> 'bloqueado'
           and public.topac_role_from_acesso(a.modulo, a.perfil_acesso, a.filial) is not null
           and (
             (v_cpf <> '' and public.topac_clean_cpf(coalesce(a.cpf_clean, a.cpf, '')) = v_cpf)
             or (v_email <> '' and lower(coalesce(a.email, a.email_corporativo, '')) = v_email)
             or (length(v_nome_norm) >= 8 and public.topac_norm_text(a.nome) = v_nome_norm)
           )
      ) mapped;
  end if;

  select o.*
    into v_operador
    from public.operadores_operacao o
    left join public.funcionarios f on f.id = o.funcionario_id
   where o.ativo = true
     and 'operacional' = any(o.modulos)
     and (
       (v_cpf <> '' and f.id is not null and public.topac_clean_cpf(coalesce(f.cpf,'')) = v_cpf)
       or (v_email <> '' and lower(coalesce(o.email,'')) = v_email)
     )
   order by
     case when v_cpf <> '' and f.id is not null and public.topac_clean_cpf(coalesce(f.cpf,'')) = v_cpf then 0 else 1 end,
     o.updated_at desc
   limit 1;

  if v_operador.id is not null and v_operador.funcionario_id is not null then
    select * into v_operador_func
    from public.funcionarios
    where id = v_operador.funcionario_id;

    select e.nome into v_operador_empresa
    from public.empresas e
    where e.id = coalesce(v_operador.empresa_id, v_operador_func.company_id, v_operador_func.empresa_id)
    limit 1;
  end if;

  v_roles := public.topac_roles_validas(
    coalesce(v_fixo.roles, array[]::text[])
    || coalesce(v_roles_acesso, array[]::text[])
    || case when v_operador.id is not null then array['operacional']::text[] else array[]::text[] end
  );

  if coalesce(array_length(v_roles, 1), 0) = 0 then
    return jsonb_build_object(
      'ok', true,
      'authorized', false,
      'cpf', v_cpf,
      'email', v_email,
      'roles', '[]'::jsonb,
      'reason', 'aguardando_liberacao'
    );
  end if;

  v_nome := coalesce(
    nullif(v_operador.nome, ''),
    nullif(v_fixo.nome, ''),
    nullif(v_acesso.nome, ''),
    nullif(p_nome, ''),
    'Usuario TOPAC'
  );
  v_empresa := coalesce(
    nullif(v_operador_empresa, ''),
    nullif(v_fixo.empresa, ''),
    nullif(v_acesso.empresa, ''),
    'TOPAC MULTIEMPRESAS'
  );
  v_filial := coalesce(
    nullif(v_operador.filial, ''),
    nullif(v_fixo.filial, ''),
    nullif(v_acesso.filial, ''),
    'GERAL'
  );
  v_cargo := coalesce(
    nullif(v_operador.cargo, ''),
    nullif(v_operador_func.cargo, ''),
    nullif(v_fixo.perfil, ''),
    nullif(v_acesso.funcao, ''),
    case when v_operador.id is not null then 'operacional' else 'usuario' end
  );
  v_perfil := coalesce(
    case when v_operador.id is not null then 'operacional' end,
    nullif(v_fixo.perfil, ''),
    nullif(v_acesso.perfil_acesso, ''),
    'usuario'
  );
  v_cpf := coalesce(
    nullif(v_cpf, ''),
    public.topac_clean_cpf(coalesce(v_operador_func.cpf,'')),
    nullif(v_fixo.cpf_clean, ''),
    public.topac_clean_cpf(coalesce(v_acesso.cpf_clean, v_acesso.cpf, ''))
  );
  v_email := coalesce(
    nullif(v_email, ''),
    lower(nullif(v_operador.email, '')),
    lower(nullif(v_fixo.email, '')),
    lower(nullif(v_acesso.email, '')),
    lower(nullif(v_acesso.email_corporativo, '')),
    ''
  );

  return jsonb_build_object(
    'ok', true,
    'authorized', true,
    'cpf', v_cpf,
    'email', v_email,
    'nome', v_nome,
    'empresa', v_empresa,
    'filial', v_filial,
    'cargo', v_cargo,
    'perfil', v_perfil,
    'roles', to_jsonb(v_roles)
  );
end;
$$;

create or replace function public.operacional_criar_chamado_v2(
  p_codigo_operador text,
  p_colaborador_id uuid,
  p_cliente text,
  p_local_servico text,
  p_tipo_servico text,
  p_solicitante_nome text,
  p_solicitante_contato text default null,
  p_cliente_id uuid default null,
  p_cliente_local_id uuid default null,
  p_contrato_id uuid default null,
  p_equipamento_id uuid default null,
  p_alocacao_id uuid default null,
  p_itens_previstos text default null,
  p_observacoes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operador public.operadores_operacao;
  v_alocacao public.operacional_alocacoes;
  v_cliente public.clientes_fat;
  v_local public.cliente_locais_operacionais;
  v_chamado_id uuid;
  v_numero bigint;
  v_mecanico_nome text;
  v_cliente_id uuid := p_cliente_id;
  v_local_id uuid := p_cliente_local_id;
  v_cliente_nome text := trim(coalesce(p_cliente,''));
  v_local_nome text := trim(coalesce(p_local_servico,''));
  v_placa text;
  v_patrimonio text;
begin
  begin
    v_operador := public._operador_operacao_por_codigo(p_codigo_operador, 'operacional');
  exception when others then
    return jsonb_build_object('ok', false, 'error', sqlerrm);
  end;

  if p_colaborador_id is null then
    return jsonb_build_object('ok', false, 'error', 'mecanico_obrigatorio');
  end if;

  if p_alocacao_id is not null then
    select * into v_alocacao
    from public.operacional_alocacoes
    where id = p_alocacao_id and ativo = true;

    if v_alocacao.id is null then
      return jsonb_build_object('ok', false, 'error', 'alocacao_nao_encontrada');
    end if;

    v_cliente_id := v_alocacao.cliente_id;
    v_local_id := v_alocacao.cliente_local_id;
    v_placa := v_alocacao.placa;
    v_patrimonio := v_alocacao.patrimonio;

    select * into v_cliente from public.clientes_fat where id = v_cliente_id;
    if v_local_id is not null then
      select * into v_local from public.cliente_locais_operacionais where id = v_local_id;
    end if;

    v_cliente_nome := coalesce(nullif(trim(v_cliente.razao_social), ''), v_cliente_nome);
    v_local_nome := coalesce(nullif(trim(v_local.nome), ''), v_local_nome);
  end if;

  if nullif(v_cliente_nome, '') is null then
    return jsonb_build_object('ok', false, 'error', 'cliente_obrigatorio');
  end if;
  if nullif(trim(coalesce(p_tipo_servico,'')), '') is null then
    return jsonb_build_object('ok', false, 'error', 'servico_obrigatorio');
  end if;
  if nullif(trim(coalesce(p_solicitante_nome,'')), '') is null then
    return jsonb_build_object('ok', false, 'error', 'solicitante_obrigatorio');
  end if;

  select ae.nome into v_mecanico_nome
  from public.acessos_externos ae
  where ae.funcionario_id = p_colaborador_id
    and ae.modulo = 'mecanico'
    and ae.status = 'ativo'
    and coalesce(ae.acesso_liberado, false) = true
  order by ae.updated_at desc nulls last, ae.created_at desc
  limit 1;

  insert into public.chamados(
    origem, cliente_id, cliente_local_id, contrato_id, equipamento_id, alocacao_id,
    placa_snapshot, patrimonio_snapshot,
    cliente, local_servico, tipo_servico, itens_previstos, observacoes,
    status, colaborador_id, solicitante_nome, solicitante_contato,
    operador_abertura_id, operador_abertura_nome, atribuido_em,
    notificacao_pendente, criado_por, created_at, updated_at
  ) values (
    'operacional',
    v_cliente_id, v_local_id, p_contrato_id, p_equipamento_id, p_alocacao_id,
    v_placa, v_patrimonio,
    v_cliente_nome, v_local_nome, trim(p_tipo_servico),
    nullif(trim(coalesce(p_itens_previstos,'')), ''),
    nullif(trim(coalesce(p_observacoes,'')), ''),
    'pendente', p_colaborador_id, trim(p_solicitante_nome),
    nullif(trim(coalesce(p_solicitante_contato,'')), ''),
    v_operador.id, v_operador.nome, now(), true, auth.uid(), now(), now()
  )
  returning id, numero into v_chamado_id, v_numero;

  insert into public.chamado_eventos(chamado_id, tipo, status, operador_id, autor_nome, detalhes)
  values
    (
      v_chamado_id, 'criado', 'pendente', v_operador.id, v_operador.nome,
      jsonb_build_object(
        'solicitante', trim(p_solicitante_nome),
        'cliente', v_cliente_nome,
        'local', v_local_nome,
        'placa', v_placa,
        'patrimonio', v_patrimonio,
        'alocacao_id', p_alocacao_id
      )
    ),
    (
      v_chamado_id, 'atribuido', 'pendente', v_operador.id, v_operador.nome,
      jsonb_build_object('mecanico_id', p_colaborador_id, 'mecanico_nome', coalesce(v_mecanico_nome,''))
    );

  return jsonb_build_object(
    'ok', true,
    'id', v_chamado_id,
    'numero', v_numero,
    'operador', v_operador.nome,
    'status', 'pendente'
  );
end;
$$;

revoke all on function public.operacional_criar_chamado_v2(text, uuid, text, text, text, text, text, uuid, uuid, uuid, uuid, uuid, text, text) from public, anon;
grant execute on function public.operacional_criar_chamado_v2(text, uuid, text, text, text, text, text, uuid, uuid, uuid, uuid, uuid, text, text) to authenticated;
