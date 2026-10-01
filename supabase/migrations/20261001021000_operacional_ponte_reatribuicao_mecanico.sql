-- TOPAC RH PRO
-- Corrige reatribuicao entre Operacional e App Mecanico:
-- novo mecanico sempre recebe a OS/chamado novamente em "aguardando aceite".

create or replace function public.operacional_editar_chamado_auditado(
  p_codigo_operador text,
  p_chamado_id uuid,
  p_colaborador_id uuid,
  p_cliente text,
  p_local_servico text,
  p_tipo_servico text,
  p_itens_previstos text,
  p_observacoes text,
  p_motivo text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operador public.operadores_operacao;
  v_before jsonb;
  v_after jsonb;
  v_motivo text := trim(coalesce(p_motivo,''));
  v_colaborador_anterior uuid;
  v_status_anterior text;
  v_reatribuido boolean := false;
  v_mecanico_nome text;
begin
  begin
    v_operador := public._operador_operacao_por_codigo(p_codigo_operador, 'operacional');
  exception when others then
    return jsonb_build_object('ok', false, 'error', sqlerrm);
  end;

  if length(v_motivo) < 3 then
    return jsonb_build_object('ok', false, 'error', 'motivo_obrigatorio');
  end if;

  select to_jsonb(c), c.colaborador_id, c.status
    into v_before, v_colaborador_anterior, v_status_anterior
  from public.chamados c
  where id=p_chamado_id;

  if v_before is null then
    return jsonb_build_object('ok', false, 'error', 'chamado_nao_encontrado');
  end if;

  if v_status_anterior in ('concluido','cancelado') then
    return jsonb_build_object('ok', false, 'error', 'chamado_encerrado');
  end if;

  v_reatribuido := p_colaborador_id is distinct from v_colaborador_anterior;

  if v_reatribuido then
    select coalesce(
      (
        select ae.nome
        from public.acessos_externos ae
        where ae.funcionario_id=p_colaborador_id
          and ae.modulo='mecanico'
          and ae.status='ativo'
          and coalesce(ae.acesso_liberado,false)=true
        order by ae.updated_at desc nulls last, ae.created_at desc
        limit 1
      ),
      (select f.nome from public.funcionarios f where f.id=p_colaborador_id limit 1)
    ) into v_mecanico_nome;
  end if;

  update public.chamados
  set colaborador_id=p_colaborador_id,
      cliente=trim(p_cliente),
      local_servico=trim(p_local_servico),
      tipo_servico=trim(p_tipo_servico),
      itens_previstos=nullif(trim(coalesce(p_itens_previstos,'')),''),
      observacoes=nullif(trim(coalesce(p_observacoes,'')),''),
      status=case when v_reatribuido then 'pendente' else status end,
      notificacao_pendente=case when v_reatribuido then true else notificacao_pendente end,
      atribuido_em=case when v_reatribuido then now() else atribuido_em end,
      aceito_em=case when v_reatribuido then null else aceito_em end,
      aceito_por_acesso_id=case when v_reatribuido then null else aceito_por_acesso_id end,
      aceito_por_nome=case when v_reatribuido then null else aceito_por_nome end,
      em_deslocamento_em=case when v_reatribuido then null else em_deslocamento_em end,
      chegada_em=case when v_reatribuido then null else chegada_em end,
      inicio_atendimento_em=case when v_reatribuido then null else inicio_atendimento_em end,
      inicio_latitude=case when v_reatribuido then null else inicio_latitude end,
      inicio_longitude=case when v_reatribuido then null else inicio_longitude end,
      fim_latitude=case when v_reatribuido then null else fim_latitude end,
      fim_longitude=case when v_reatribuido then null else fim_longitude end,
      descricao_conclusao=case when v_reatribuido then null else descricao_conclusao end,
      updated_at=now()
  where id=p_chamado_id;

  select to_jsonb(c) into v_after
  from public.chamados c
  where id=p_chamado_id;

  insert into public.chamado_eventos(chamado_id,tipo,status,operador_id,autor_nome,detalhes)
  values (
    p_chamado_id,'editado',(v_after->>'status'),v_operador.id,v_operador.nome,
    jsonb_build_object('motivo',v_motivo,'antes',v_before,'depois',v_after,'reatribuido',v_reatribuido)
  );

  if v_reatribuido then
    insert into public.chamado_eventos(chamado_id,tipo,status,operador_id,autor_nome,detalhes)
    values (
      p_chamado_id,'atribuido','pendente',v_operador.id,v_operador.nome,
      jsonb_build_object(
        'mecanico_id',p_colaborador_id,
        'mecanico_nome',coalesce(v_mecanico_nome,''),
        'mecanico_anterior_id',v_colaborador_anterior,
        'motivo',v_motivo
      )
    );
  end if;

  insert into public.operacional_registros_auditoria(
    entidade,entidade_id,acao,motivo,antes,depois,operador_id,operador_nome,user_id
  ) values (
    'chamados',p_chamado_id,case when v_reatribuido then 'reatribuiu' else 'editou' end,
    v_motivo,v_before,v_after,v_operador.id,v_operador.nome,auth.uid()
  );

  return jsonb_build_object(
    'ok',true,
    'operador',v_operador.nome,
    'reatribuido',v_reatribuido,
    'mecanico',v_mecanico_nome,
    'status',v_after->>'status'
  );
end;
$$;

revoke all on function public.operacional_editar_chamado_auditado(text, uuid, uuid, text, text, text, text, text, text) from public, anon;
grant execute on function public.operacional_editar_chamado_auditado(text, uuid, uuid, text, text, text, text, text, text) to authenticated;

notify pgrst, 'reload schema';
