-- Permite abrir chamado diretamente a partir da alocacao cliente/canteiro/patrimonio.

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
