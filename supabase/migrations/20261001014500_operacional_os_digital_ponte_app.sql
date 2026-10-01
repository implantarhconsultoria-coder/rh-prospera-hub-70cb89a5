-- TOPAC RH PRO
-- OS Digital vinculada 1:1 ao chamado operacional e sincronizada com o App Mecânico.

create table if not exists public.ordens_servico_digitais (
  id uuid primary key default gen_random_uuid(),
  chamado_id uuid not null unique references public.chamados(id) on delete cascade,
  numero_os bigint not null unique,
  status text not null default 'pendente',
  cliente_id uuid,
  cliente text,
  local_servico text,
  placa text,
  patrimonio text,
  servico_solicitado text,
  itens_previstos text,
  observacoes_abertura text,
  solicitante_nome text,
  solicitante_contato text,
  mecanico_funcionario_id uuid references public.funcionarios(id) on delete set null,
  mecanico_nome text,
  operador_abertura_id uuid references public.operadores_operacao(id) on delete set null,
  operador_abertura_nome text,
  aberta_em timestamptz not null default now(),
  aceita_em timestamptz,
  deslocamento_em timestamptz,
  chegada_em timestamptz,
  inicio_execucao_em timestamptz,
  concluida_em timestamptz,
  cancelada_em timestamptz,
  inicio_latitude double precision,
  inicio_longitude double precision,
  fim_latitude double precision,
  fim_longitude double precision,
  relatorio_conclusao text,
  cancelamento_motivo text,
  versao integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_os_digitais_status on public.ordens_servico_digitais(status, updated_at desc);
create index if not exists idx_os_digitais_mecanico on public.ordens_servico_digitais(mecanico_funcionario_id, updated_at desc);
create index if not exists idx_os_digitais_cliente on public.ordens_servico_digitais(cliente_id, updated_at desc);

alter table public.ordens_servico_digitais enable row level security;

drop policy if exists ordens_servico_digitais_operacional_select on public.ordens_servico_digitais;
create policy ordens_servico_digitais_operacional_select
on public.ordens_servico_digitais
for select to authenticated
using (public.usuario_tem_modulo_operacional('operacional'));

grant select on public.ordens_servico_digitais to authenticated;

create or replace function public.sincronizar_os_digital_chamado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mecanico_nome text;
begin
  if new.numero is null then
    return new;
  end if;

  select f.nome into v_mecanico_nome
  from public.funcionarios f
  where f.id = new.colaborador_id
  limit 1;

  insert into public.ordens_servico_digitais (
    chamado_id, numero_os, status,
    cliente_id, cliente, local_servico, placa, patrimonio,
    servico_solicitado, itens_previstos, observacoes_abertura,
    solicitante_nome, solicitante_contato,
    mecanico_funcionario_id, mecanico_nome,
    operador_abertura_id, operador_abertura_nome,
    aberta_em, aceita_em, deslocamento_em, chegada_em, inicio_execucao_em,
    concluida_em, cancelada_em,
    inicio_latitude, inicio_longitude, fim_latitude, fim_longitude,
    relatorio_conclusao, cancelamento_motivo,
    created_at, updated_at
  ) values (
    new.id, new.numero, coalesce(new.status, 'pendente'),
    new.cliente_id, new.cliente, new.local_servico, new.placa_snapshot, new.patrimonio_snapshot,
    new.tipo_servico, new.itens_previstos, new.observacoes,
    new.solicitante_nome, new.solicitante_contato,
    new.colaborador_id, coalesce(nullif(new.aceito_por_nome,''), v_mecanico_nome),
    new.operador_abertura_id, new.operador_abertura_nome,
    coalesce(new.created_at, now()), new.aceito_em, new.em_deslocamento_em, new.chegada_em, new.inicio_atendimento_em,
    new.concluido_em, new.cancelado_em,
    new.inicio_latitude, new.inicio_longitude, new.fim_latitude, new.fim_longitude,
    new.descricao_conclusao, new.cancelamento_motivo,
    coalesce(new.created_at, now()), now()
  )
  on conflict (chamado_id) do update set
    numero_os = excluded.numero_os,
    status = excluded.status,
    cliente_id = excluded.cliente_id,
    cliente = excluded.cliente,
    local_servico = excluded.local_servico,
    placa = excluded.placa,
    patrimonio = excluded.patrimonio,
    servico_solicitado = excluded.servico_solicitado,
    itens_previstos = excluded.itens_previstos,
    observacoes_abertura = excluded.observacoes_abertura,
    solicitante_nome = excluded.solicitante_nome,
    solicitante_contato = excluded.solicitante_contato,
    mecanico_funcionario_id = excluded.mecanico_funcionario_id,
    mecanico_nome = excluded.mecanico_nome,
    operador_abertura_id = excluded.operador_abertura_id,
    operador_abertura_nome = excluded.operador_abertura_nome,
    aberta_em = excluded.aberta_em,
    aceita_em = excluded.aceita_em,
    deslocamento_em = excluded.deslocamento_em,
    chegada_em = excluded.chegada_em,
    inicio_execucao_em = excluded.inicio_execucao_em,
    concluida_em = excluded.concluida_em,
    cancelada_em = excluded.cancelada_em,
    inicio_latitude = excluded.inicio_latitude,
    inicio_longitude = excluded.inicio_longitude,
    fim_latitude = excluded.fim_latitude,
    fim_longitude = excluded.fim_longitude,
    relatorio_conclusao = excluded.relatorio_conclusao,
    cancelamento_motivo = excluded.cancelamento_motivo,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists trg_sincronizar_os_digital_chamado on public.chamados;
create trigger trg_sincronizar_os_digital_chamado
after insert or update on public.chamados
for each row execute function public.sincronizar_os_digital_chamado();

insert into public.ordens_servico_digitais (
  chamado_id, numero_os, status,
  cliente_id, cliente, local_servico, placa, patrimonio,
  servico_solicitado, itens_previstos, observacoes_abertura,
  solicitante_nome, solicitante_contato,
  mecanico_funcionario_id, mecanico_nome,
  operador_abertura_id, operador_abertura_nome,
  aberta_em, aceita_em, deslocamento_em, chegada_em, inicio_execucao_em,
  concluida_em, cancelada_em,
  inicio_latitude, inicio_longitude, fim_latitude, fim_longitude,
  relatorio_conclusao, cancelamento_motivo,
  created_at, updated_at
)
select
  c.id, c.numero, coalesce(c.status,'pendente'),
  c.cliente_id, c.cliente, c.local_servico, c.placa_snapshot, c.patrimonio_snapshot,
  c.tipo_servico, c.itens_previstos, c.observacoes,
  c.solicitante_nome, c.solicitante_contato,
  c.colaborador_id, coalesce(nullif(c.aceito_por_nome,''), f.nome),
  c.operador_abertura_id, c.operador_abertura_nome,
  coalesce(c.created_at, now()), c.aceito_em, c.em_deslocamento_em, c.chegada_em, c.inicio_atendimento_em,
  c.concluido_em, c.cancelado_em,
  c.inicio_latitude, c.inicio_longitude, c.fim_latitude, c.fim_longitude,
  c.descricao_conclusao, c.cancelamento_motivo,
  coalesce(c.created_at, now()), now()
from public.chamados c
left join public.funcionarios f on f.id=c.colaborador_id
where c.numero is not null
on conflict (chamado_id) do update set
  status=excluded.status,
  cliente=excluded.cliente,
  local_servico=excluded.local_servico,
  placa=excluded.placa,
  patrimonio=excluded.patrimonio,
  servico_solicitado=excluded.servico_solicitado,
  itens_previstos=excluded.itens_previstos,
  observacoes_abertura=excluded.observacoes_abertura,
  solicitante_nome=excluded.solicitante_nome,
  solicitante_contato=excluded.solicitante_contato,
  mecanico_funcionario_id=excluded.mecanico_funcionario_id,
  mecanico_nome=excluded.mecanico_nome,
  aceita_em=excluded.aceita_em,
  deslocamento_em=excluded.deslocamento_em,
  chegada_em=excluded.chegada_em,
  inicio_execucao_em=excluded.inicio_execucao_em,
  concluida_em=excluded.concluida_em,
  cancelada_em=excluded.cancelada_em,
  inicio_latitude=excluded.inicio_latitude,
  inicio_longitude=excluded.inicio_longitude,
  fim_latitude=excluded.fim_latitude,
  fim_longitude=excluded.fim_longitude,
  relatorio_conclusao=excluded.relatorio_conclusao,
  cancelamento_motivo=excluded.cancelamento_motivo,
  updated_at=now();

create or replace function public.app_mecanico_listar_chamados(p_acesso_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.acessos_externos;
  v_arr jsonb;
begin
  begin
    v := public._app_mecanico_get_acesso(p_acesso_id);
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'acesso_nao_autorizado');
  end;

  select coalesce(
    jsonb_agg(
      to_jsonb(c) ||
      jsonb_build_object(
        'os_digital',
        case when os.id is null then null else jsonb_build_object(
          'id', os.id,
          'numero', os.numero_os,
          'status', os.status,
          'aberta_em', os.aberta_em,
          'aceita_em', os.aceita_em,
          'deslocamento_em', os.deslocamento_em,
          'chegada_em', os.chegada_em,
          'inicio_execucao_em', os.inicio_execucao_em,
          'concluida_em', os.concluida_em,
          'relatorio_conclusao', os.relatorio_conclusao
        ) end
      )
      order by c.created_at desc
    ),
    '[]'::jsonb
  )
  into v_arr
  from public.chamados c
  left join public.ordens_servico_digitais os on os.chamado_id=c.id
  where c.colaborador_id = v.funcionario_id
    and c.status <> 'cancelado';

  return jsonb_build_object('ok', true, 'chamados', v_arr);
end;
$$;

revoke all on function public.app_mecanico_listar_chamados(uuid) from public;
grant execute on function public.app_mecanico_listar_chamados(uuid) to anon, authenticated;

create or replace function public.operacional_chamado_detalhe(p_chamado_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_eventos jsonb;
  v_adicionais jsonb;
  v_materiais jsonb;
  v_os jsonb;
begin
  if not public.usuario_tem_modulo_operacional('operacional') then
    return jsonb_build_object('ok', false, 'error', 'sem_permissao');
  end if;

  select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at), '[]'::jsonb)
    into v_eventos
  from public.chamado_eventos e where e.chamado_id = p_chamado_id;

  select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at), '[]'::jsonb)
    into v_adicionais
  from public.chamado_adicionais a where a.chamado_id = p_chamado_id;

  select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at), '[]'::jsonb)
    into v_materiais
  from public.chamado_materiais m where m.chamado_id = p_chamado_id;

  select to_jsonb(os) into v_os
  from public.ordens_servico_digitais os
  where os.chamado_id = p_chamado_id;

  return jsonb_build_object(
    'ok', true,
    'ordem_servico', v_os,
    'eventos', v_eventos,
    'adicionais', v_adicionais,
    'materiais', v_materiais
  );
end;
$$;

revoke all on function public.operacional_chamado_detalhe(uuid) from public;
grant execute on function public.operacional_chamado_detalhe(uuid) to authenticated;

notify pgrst, 'reload schema';
