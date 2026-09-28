-- Integridade e compatibilidade do fluxo operacional.
-- Aditivo: nao importa dados e mantem clientes/chamados existentes.

create unique index if not exists idx_chamados_numero_unique
  on public.chamados(numero) where numero is not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chamados_cliente_id_fkey') then
    alter table public.chamados add constraint chamados_cliente_id_fkey
      foreign key (cliente_id) references public.clientes_fat(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chamados_cliente_local_id_fkey') then
    alter table public.chamados add constraint chamados_cliente_local_id_fkey
      foreign key (cliente_local_id) references public.cliente_locais_operacionais(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chamados_contrato_id_fkey') then
    alter table public.chamados add constraint chamados_contrato_id_fkey
      foreign key (contrato_id) references public.contratos(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chamados_equipamento_id_fkey') then
    alter table public.chamados add constraint chamados_equipamento_id_fkey
      foreign key (equipamento_id) references public.contrato_equipamentos(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chamados_operador_abertura_id_fkey') then
    alter table public.chamados add constraint chamados_operador_abertura_id_fkey
      foreign key (operador_abertura_id) references public.operadores_operacao(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chamados_aceito_por_acesso_id_fkey') then
    alter table public.chamados add constraint chamados_aceito_por_acesso_id_fkey
      foreign key (aceito_por_acesso_id) references public.acessos_externos(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chamados_cancelado_por_operador_id_fkey') then
    alter table public.chamados add constraint chamados_cancelado_por_operador_id_fkey
      foreign key (cancelado_por_operador_id) references public.operadores_operacao(id) on delete set null;
  end if;
end $$;

create or replace function public.operador_operacao_invalidar_codigo(p_operador_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operador public.operadores_operacao;
begin
  select * into v_operador
  from public.operadores_operacao
  where id = p_operador_id;

  if v_operador.id is null then
    return jsonb_build_object('ok', false, 'error', 'operador_nao_encontrado');
  end if;

  if auth.uid() is null or not (
    public.operador_operacao_is_admin()
    or v_operador.user_id = auth.uid()
  ) then
    return jsonb_build_object('ok', false, 'error', 'sem_permissao');
  end if;

  update public.operadores_operacao
  set codigo_hash = null,
      codigo_hint = null,
      codigo_emitido_em = null,
      updated_at = now()
  where id = p_operador_id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.operador_operacao_invalidar_codigo(uuid) from public;
grant execute on function public.operador_operacao_invalidar_codigo(uuid) to authenticated;

create or replace function public.app_mecanico_chamado_acao_v2(
  p_acesso_id uuid,
  p_chamado_id uuid,
  p_acao text,
  p_observacao text default null,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_descricao_conclusao text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.acessos_externos;
  v_status text;
  v_count int;
begin
  begin
    v := public._app_mecanico_get_acesso(p_acesso_id);
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'acesso_nao_autorizado');
  end;

  if v.funcionario_id is null then
    return jsonb_build_object('ok', false, 'error', 'funcionario_nao_vinculado');
  end if;

  select status into v_status
  from public.chamados
  where id = p_chamado_id and colaborador_id = v.funcionario_id;

  if v_status is null then
    return jsonb_build_object('ok', false, 'error', 'chamado_nao_encontrado');
  end if;

  if p_acao in ('chegada','iniciar','finalizar') and (p_latitude is null or p_longitude is null) then
    return jsonb_build_object('ok', false, 'error', 'localizacao_obrigatoria');
  end if;

  if p_acao = 'aceitar' then
    update public.chamados
    set status = 'aceito',
        aceito_em = now(),
        aceito_por_acesso_id = v.id,
        aceito_por_nome = v.nome,
        notificacao_pendente = false,
        updated_at = now()
    where id = p_chamado_id and colaborador_id = v.funcionario_id and status = 'pendente';
    v_status := 'aceito';

  elsif p_acao = 'deslocamento' then
    update public.chamados
    set status = 'em_deslocamento',
        em_deslocamento_em = now(),
        updated_at = now()
    where id = p_chamado_id and colaborador_id = v.funcionario_id and status = 'aceito';
    v_status := 'em_deslocamento';

  elsif p_acao = 'chegada' then
    update public.chamados
    set status = 'no_local',
        chegada_em = now(),
        latitude = p_latitude,
        longitude = p_longitude,
        updated_at = now()
    where id = p_chamado_id and colaborador_id = v.funcionario_id and status = 'em_deslocamento';
    v_status := 'no_local';

  elsif p_acao = 'iniciar' then
    update public.chamados
    set status = 'em_execucao',
        inicio_atendimento_em = now(),
        inicio_latitude = p_latitude,
        inicio_longitude = p_longitude,
        observacoes = coalesce(nullif(trim(coalesce(p_observacao,'')), ''), observacoes),
        updated_at = now()
    where id = p_chamado_id and colaborador_id = v.funcionario_id and status = 'no_local';
    v_status := 'em_execucao';

  elsif p_acao = 'finalizar' then
    if nullif(trim(coalesce(p_descricao_conclusao,'')), '') is null then
      return jsonb_build_object('ok', false, 'error', 'descricao_conclusao_obrigatoria');
    end if;

    update public.chamados
    set status = 'concluido',
        concluido_em = now(),
        fim_latitude = p_latitude,
        fim_longitude = p_longitude,
        descricao_conclusao = trim(p_descricao_conclusao),
        observacoes = coalesce(nullif(trim(coalesce(p_observacao,'')), ''), observacoes),
        notificacao_pendente = false,
        updated_at = now()
    where id = p_chamado_id
      and colaborador_id = v.funcionario_id
      and status in ('em_execucao','em_atendimento');
    v_status := 'concluido';

  else
    return jsonb_build_object('ok', false, 'error', 'acao_invalida');
  end if;

  get diagnostics v_count = row_count;
  if v_count = 0 then
    return jsonb_build_object('ok', false, 'error', 'sequencia_status_invalida');
  end if;

  insert into public.chamado_eventos(
    chamado_id, tipo, status, mecanico_acesso_id, mecanico_funcionario_id,
    autor_nome, detalhes, latitude, longitude
  ) values (
    p_chamado_id,
    p_acao,
    v_status,
    v.id,
    v.funcionario_id,
    v.nome,
    jsonb_build_object('observacao', nullif(trim(coalesce(p_observacao,'')), '')),
    p_latitude,
    p_longitude
  );

  return jsonb_build_object('ok', true, 'status', v_status, 'mecanico', v.nome);
end;
$$;

revoke all on function public.app_mecanico_chamado_acao_v2(uuid, uuid, text, text, double precision, double precision, text) from public;
grant execute on function public.app_mecanico_chamado_acao_v2(uuid, uuid, text, text, double precision, double precision, text) to anon, authenticated;

-- Compatibilidade temporaria com a versao anterior do app mecanico que
-- ainda chama "iniciar/finalizar" sem GPS. Evita deixar notificacao presa.
create or replace function public.app_mecanico_atualizar_chamado(
  p_acesso_id uuid,
  p_chamado_id uuid,
  p_acao text,
  p_observacao text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.acessos_externos;
  v_count int;
  v_status text;
begin
  begin
    v := public._app_mecanico_get_acesso(p_acesso_id);
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'acesso_nao_autorizado');
  end;

  if p_acao = 'iniciar' then
    update public.chamados
    set status = 'em_atendimento',
        aceito_em = coalesce(aceito_em, now()),
        aceito_por_acesso_id = coalesce(aceito_por_acesso_id, v.id),
        aceito_por_nome = coalesce(aceito_por_nome, v.nome),
        notificacao_pendente = false,
        observacoes = coalesce(nullif(trim(coalesce(p_observacao,'')), ''), observacoes),
        updated_at = now()
    where id = p_chamado_id and colaborador_id = v.funcionario_id and status <> 'cancelado';
    v_status := 'em_atendimento';
  elsif p_acao = 'finalizar' then
    update public.chamados
    set status = 'concluido',
        concluido_em = now(),
        notificacao_pendente = false,
        observacoes = coalesce(nullif(trim(coalesce(p_observacao,'')), ''), observacoes),
        updated_at = now()
    where id = p_chamado_id and colaborador_id = v.funcionario_id and status <> 'cancelado';
    v_status := 'concluido';
  else
    return jsonb_build_object('ok', false, 'error', 'acao_invalida');
  end if;

  get diagnostics v_count = row_count;
  if v_count > 0 then
    insert into public.chamado_eventos(
      chamado_id, tipo, status, mecanico_acesso_id, mecanico_funcionario_id, autor_nome, detalhes
    ) values (
      p_chamado_id,
      case when p_acao = 'iniciar' then 'iniciar_legado' else 'finalizar_legado' end,
      v_status, v.id, v.funcionario_id, v.nome,
      jsonb_build_object('observacao', nullif(trim(coalesce(p_observacao,'')), ''))
    );
  end if;

  return jsonb_build_object('ok', v_count > 0, 'status', v_status);
end;
$$;

revoke all on function public.app_mecanico_atualizar_chamado(uuid, uuid, text, text) from public;
grant execute on function public.app_mecanico_atualizar_chamado(uuid, uuid, text, text) to anon, authenticated;
