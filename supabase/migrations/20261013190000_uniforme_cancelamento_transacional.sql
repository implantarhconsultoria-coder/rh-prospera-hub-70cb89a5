alter table public.uniforme_entregas
  add column if not exists cancelado_em timestamptz null,
  add column if not exists cancelado_por uuid null,
  add column if not exists cancelamento_motivo text null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.uniforme_entregas'::regclass
      and conname = 'uniforme_entregas_cancelado_por_fkey'
  ) then
    alter table public.uniforme_entregas
      add constraint uniforme_entregas_cancelado_por_fkey
      foreign key (cancelado_por) references auth.users(id);
  end if;
end $$;

create or replace function public.uniforme_cancelar_entrega(
  p_entrega_id uuid,
  p_motivo text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_entrega public.uniforme_entregas%rowtype;
  v_mov public.uniforme_movimentos%rowtype;
  v_mov_after public.uniforme_movimentos%rowtype;
  v_estoque public.uniforme_estoque%rowtype;
  v_responsavel_nome text;
  v_saldo_antes integer;
  v_saldo_depois integer;
  v_total integer := 0;
  v_itens jsonb := '[]'::jsonb;
  v_entrega_anterior jsonb;
  v_entrega_posterior jsonb;
begin
  if v_uid is null or not public.topac_has_any_role(array['admin','diretor_geral'], v_uid) then
    raise exception 'Sem permissao para cancelar entrega de uniformes' using errcode='42501';
  end if;

  if p_entrega_id is null then
    raise exception 'Entrega obrigatoria';
  end if;

  p_motivo := btrim(coalesce(p_motivo, ''));
  if length(p_motivo) < 5 then
    raise exception 'Informe o motivo do cancelamento com pelo menos 5 caracteres';
  end if;

  select * into v_entrega
  from public.uniforme_entregas
  where id = p_entrega_id
  for update;

  if not found then
    raise exception 'Entrega de uniforme nao encontrada';
  end if;

  if v_entrega.cancelado_em is not null then
    return jsonb_build_object(
      'entrega_id', v_entrega.id,
      'already_cancelled', true,
      'cancelado_em', v_entrega.cancelado_em,
      'cancelado_por', v_entrega.cancelado_por,
      'motivo', v_entrega.cancelamento_motivo,
      'total_pecas', 0,
      'itens_estornados', '[]'::jsonb
    );
  end if;

  if not exists (
    select 1 from public.uniforme_movimentos
    where entrega_id = p_entrega_id and tipo = 'saida'
  ) then
    raise exception 'Entrega sem movimentos de saida vinculados; cancelamento interrompido';
  end if;

  if exists (
    select 1 from public.uniforme_movimentos
    where entrega_id = p_entrega_id and tipo = 'saida' and cancelado_em is not null
  ) then
    raise exception 'Entrega com movimento ja cancelado e entrega ativa; revise a integridade antes do estorno';
  end if;

  select coalesce(nullif(btrim(p.nome_completo), ''), nullif(btrim(p.email), ''))
    into v_responsavel_nome
  from public.profiles p
  where p.user_id = v_uid
  limit 1;

  if v_responsavel_nome is null then
    select u.email into v_responsavel_nome from auth.users u where u.id = v_uid;
  end if;
  v_responsavel_nome := coalesce(v_responsavel_nome, 'Usuario administrativo');

  v_entrega_anterior := to_jsonb(v_entrega);
  v_entrega_posterior := v_entrega_anterior || jsonb_build_object(
    'cancelado_em', v_now,
    'cancelado_por', v_uid,
    'cancelamento_motivo', p_motivo
  );

  for v_mov in
    select *
    from public.uniforme_movimentos
    where entrega_id = p_entrega_id and tipo = 'saida'
    order by estoque_id, id
  loop
    select * into v_estoque
    from public.uniforme_estoque
    where id = v_mov.estoque_id
    for update;

    if not found then
      raise exception 'Estoque vinculado ao movimento % nao encontrado', v_mov.id;
    end if;

    v_saldo_antes := v_estoque.saldo;

    update public.uniforme_estoque
       set saldo = saldo + v_mov.quantidade,
           atualizado_em = v_now
     where id = v_mov.estoque_id
     returning saldo into v_saldo_depois;

    update public.uniforme_movimentos
       set cancelado_em = v_now,
           cancelado_por = v_uid
     where id = v_mov.id
     returning * into v_mov_after;

    insert into public.uniforme_auditoria(
      movimento_id, estoque_id, operacao, motivo,
      responsavel_id, responsavel_nome, anterior, posterior
    ) values (
      v_mov.id,
      v_mov.estoque_id,
      'cancelar_entrega',
      p_motivo,
      v_uid,
      v_responsavel_nome,
      jsonb_build_object(
        'movimento', to_jsonb(v_mov),
        'saldo_antes_estorno', v_saldo_antes,
        'entrega', v_entrega_anterior
      ),
      jsonb_build_object(
        'movimento', to_jsonb(v_mov_after),
        'saldo_depois_estorno', v_saldo_depois,
        'entrega', v_entrega_posterior
      )
    );

    v_total := v_total + v_mov.quantidade;
    v_itens := v_itens || jsonb_build_array(jsonb_build_object(
      'movimento_id', v_mov.id,
      'estoque_id', v_mov.estoque_id,
      'quantidade', v_mov.quantidade,
      'saldo_antes', v_saldo_antes,
      'saldo_depois', v_saldo_depois,
      'tipo', v_estoque.tipo,
      'modelo', v_estoque.modelo,
      'tamanho', v_estoque.tamanho
    ));
  end loop;

  update public.uniforme_entregas
     set cancelado_em = v_now,
         cancelado_por = v_uid,
         cancelamento_motivo = p_motivo
   where id = p_entrega_id;

  update public.documentos_funcionario
     set status_envio = 'cancelado',
         descricao = case
           when descricao ilike '[CANCELADA]%' then descricao
           else '[CANCELADA] ' || coalesce(descricao, '')
         end,
         updated_at = v_now
   where observacao = 'UNIFORME_ENTREGA_ID:' || p_entrega_id::text
     and coalesce(origem, 'gerado_sistema') = 'gerado_sistema';

  return jsonb_build_object(
    'entrega_id', p_entrega_id,
    'already_cancelled', false,
    'cancelado_em', v_now,
    'cancelado_por', v_uid,
    'responsavel_nome', v_responsavel_nome,
    'motivo', p_motivo,
    'total_pecas', v_total,
    'itens_estornados', v_itens
  );
end;
$$;

revoke all on function public.uniforme_cancelar_entrega(uuid,text) from public;
revoke all on function public.uniforme_cancelar_entrega(uuid,text) from anon;
grant execute on function public.uniforme_cancelar_entrega(uuid,text) to authenticated;
