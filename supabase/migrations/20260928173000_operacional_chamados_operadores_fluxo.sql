-- TOPAC RH PRO
-- Evolucao aditiva do Operacional: operador por codigo, rastreabilidade,
-- historico de locacoes/movimentacoes, chamados, adicionais e fluxo do app mecanico.
-- Nao importa dados e nao substitui estruturas existentes.

create table if not exists public.operadores_operacao (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique,
  funcionario_id uuid references public.funcionarios(id) on delete set null,
  nome text not null,
  email text,
  cargo text,
  filial text,
  modulos text[] not null default array['operacional']::text[],
  permissoes jsonb not null default '{}'::jsonb,
  codigo_hash text,
  codigo_hint text,
  codigo_emitido_em timestamptz,
  ativo boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_operadores_operacao_ativo on public.operadores_operacao(ativo);
create index if not exists idx_operadores_operacao_funcionario on public.operadores_operacao(funcionario_id);
create unique index if not exists idx_operadores_operacao_email_unique
  on public.operadores_operacao(lower(email)) where email is not null;

create table if not exists public.cliente_locais_operacionais (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes_fat(id) on delete cascade,
  nome text not null,
  endereco text,
  cidade text,
  uf text,
  cep text,
  contato_nome text,
  contato_telefone text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_cliente_locais_operacionais_cliente
  on public.cliente_locais_operacionais(cliente_id, ativo);

alter table public.chamados
  add column if not exists numero bigint,
  add column if not exists origem text,
  add column if not exists cliente_id uuid,
  add column if not exists cliente_local_id uuid,
  add column if not exists contrato_id uuid,
  add column if not exists equipamento_id uuid,
  add column if not exists solicitante_nome text,
  add column if not exists solicitante_contato text,
  add column if not exists operador_abertura_id uuid,
  add column if not exists operador_abertura_nome text,
  add column if not exists atribuido_em timestamptz,
  add column if not exists aceito_por_acesso_id uuid,
  add column if not exists aceito_por_nome text,
  add column if not exists em_deslocamento_em timestamptz,
  add column if not exists chegada_em timestamptz,
  add column if not exists inicio_atendimento_em timestamptz,
  add column if not exists inicio_latitude double precision,
  add column if not exists inicio_longitude double precision,
  add column if not exists fim_latitude double precision,
  add column if not exists fim_longitude double precision,
  add column if not exists descricao_conclusao text,
  add column if not exists notificacao_pendente boolean not null default false,
  add column if not exists cancelado_em timestamptz,
  add column if not exists cancelado_por_operador_id uuid,
  add column if not exists cancelamento_motivo text;

create sequence if not exists public.chamados_numero_seq start with 1001 increment by 1;

create or replace function public.chamados_definir_numero()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.numero is null then
    new.numero := nextval('public.chamados_numero_seq');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_chamados_definir_numero on public.chamados;
create trigger trg_chamados_definir_numero
before insert on public.chamados
for each row execute function public.chamados_definir_numero();

create index if not exists idx_chamados_numero on public.chamados(numero);
create index if not exists idx_chamados_cliente_id on public.chamados(cliente_id);
create index if not exists idx_chamados_equipamento_id on public.chamados(equipamento_id);
create index if not exists idx_chamados_status_colaborador on public.chamados(status, colaborador_id);
create index if not exists idx_chamados_notificacao on public.chamados(colaborador_id, notificacao_pendente) where notificacao_pendente = true;

create table if not exists public.chamado_eventos (
  id uuid primary key default gen_random_uuid(),
  chamado_id uuid not null references public.chamados(id) on delete cascade,
  tipo text not null,
  status text,
  operador_id uuid references public.operadores_operacao(id) on delete set null,
  mecanico_acesso_id uuid references public.acessos_externos(id) on delete set null,
  mecanico_funcionario_id uuid references public.funcionarios(id) on delete set null,
  autor_nome text,
  detalhes jsonb not null default '{}'::jsonb,
  latitude double precision,
  longitude double precision,
  created_at timestamptz not null default now()
);

create index if not exists idx_chamado_eventos_chamado_created
  on public.chamado_eventos(chamado_id, created_at);

create table if not exists public.chamado_adicionais (
  id uuid primary key default gen_random_uuid(),
  chamado_id uuid not null references public.chamados(id) on delete cascade,
  mecanico_acesso_id uuid references public.acessos_externos(id) on delete set null,
  mecanico_funcionario_id uuid references public.funcionarios(id) on delete set null,
  mecanico_nome text,
  descricao_identificada text not null,
  servico_executado text not null,
  observacao text,
  latitude double precision,
  longitude double precision,
  status text not null default 'informado',
  visualizado_em timestamptz,
  visualizado_por_operador_id uuid references public.operadores_operacao(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_chamado_adicionais_chamado
  on public.chamado_adicionais(chamado_id, created_at);
create index if not exists idx_chamado_adicionais_alerta
  on public.chamado_adicionais(status, visualizado_em);

create table if not exists public.chamado_materiais (
  id uuid primary key default gen_random_uuid(),
  chamado_id uuid not null references public.chamados(id) on delete cascade,
  adicional_id uuid references public.chamado_adicionais(id) on delete set null,
  almoxarifado_item_id uuid references public.almoxarifado_itens(id) on delete set null,
  descricao text not null,
  quantidade numeric(14,3) not null default 1 check (quantidade > 0),
  unidade text,
  mecanico_acesso_id uuid references public.acessos_externos(id) on delete set null,
  mecanico_funcionario_id uuid references public.funcionarios(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_chamado_materiais_chamado
  on public.chamado_materiais(chamado_id, created_at);

create table if not exists public.operacional_movimentacoes (
  id uuid primary key default gen_random_uuid(),
  equipamento_id uuid references public.contrato_equipamentos(id) on delete set null,
  ativo_id uuid references public.ativos(id) on delete set null,
  contrato_id uuid references public.contratos(id) on delete set null,
  cliente_origem_id uuid references public.clientes_fat(id) on delete set null,
  cliente_destino_id uuid references public.clientes_fat(id) on delete set null,
  local_origem_id uuid references public.cliente_locais_operacionais(id) on delete set null,
  local_destino_id uuid references public.cliente_locais_operacionais(id) on delete set null,
  tipo text not null,
  patrimonio text,
  placa text,
  cliente_origem_nome text,
  cliente_destino_nome text,
  local_origem_nome text,
  local_destino_nome text,
  observacao text,
  operador_id uuid not null references public.operadores_operacao(id),
  operador_nome text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_operacional_mov_equipamento
  on public.operacional_movimentacoes(equipamento_id, created_at desc);
create index if not exists idx_operacional_mov_cliente_destino
  on public.operacional_movimentacoes(cliente_destino_id, created_at desc);

create or replace function public.usuario_tem_modulo_operacional(p_modulo text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and (
        ur.role in ('admin','diretor_geral')
        or (p_modulo = 'operacional' and ur.role = 'operacional')
        or (p_modulo = 'almoxarifado' and ur.role = 'almoxarifado')
      )
  );
$$;

revoke all on function public.usuario_tem_modulo_operacional(text) from public;
grant execute on function public.usuario_tem_modulo_operacional(text) to authenticated;

create or replace function public.operador_operacao_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid()
      and role in ('admin','diretor_geral')
  );
$$;

revoke all on function public.operador_operacao_is_admin() from public;
grant execute on function public.operador_operacao_is_admin() to authenticated;

alter table public.operadores_operacao enable row level security;
alter table public.cliente_locais_operacionais enable row level security;
alter table public.chamado_eventos enable row level security;
alter table public.chamado_adicionais enable row level security;
alter table public.chamado_materiais enable row level security;
alter table public.operacional_movimentacoes enable row level security;

drop policy if exists operadores_operacao_select on public.operadores_operacao;
create policy operadores_operacao_select on public.operadores_operacao
for select to authenticated
using (user_id = auth.uid() or public.operador_operacao_is_admin());

drop policy if exists operadores_operacao_admin_update on public.operadores_operacao;
create policy operadores_operacao_admin_update on public.operadores_operacao
for update to authenticated
using (public.operador_operacao_is_admin())
with check (public.operador_operacao_is_admin());

drop policy if exists cliente_locais_operacionais_select on public.cliente_locais_operacionais;
create policy cliente_locais_operacionais_select on public.cliente_locais_operacionais
for select to authenticated
using (public.usuario_tem_modulo_operacional('operacional'));

drop policy if exists cliente_locais_operacionais_write on public.cliente_locais_operacionais;
create policy cliente_locais_operacionais_write on public.cliente_locais_operacionais
for all to authenticated
using (public.usuario_tem_modulo_operacional('operacional'))
with check (public.usuario_tem_modulo_operacional('operacional'));

drop policy if exists chamado_eventos_select on public.chamado_eventos;
create policy chamado_eventos_select on public.chamado_eventos
for select to authenticated
using (public.usuario_tem_modulo_operacional('operacional'));

drop policy if exists chamado_adicionais_select on public.chamado_adicionais;
create policy chamado_adicionais_select on public.chamado_adicionais
for select to authenticated
using (public.usuario_tem_modulo_operacional('operacional'));

drop policy if exists chamado_materiais_select on public.chamado_materiais;
create policy chamado_materiais_select on public.chamado_materiais
for select to authenticated
using (public.usuario_tem_modulo_operacional('operacional'));

drop policy if exists operacional_movimentacoes_select on public.operacional_movimentacoes;
create policy operacional_movimentacoes_select on public.operacional_movimentacoes
for select to authenticated
using (public.usuario_tem_modulo_operacional('operacional'));

grant select on public.operadores_operacao to authenticated;
grant select, insert, update on public.cliente_locais_operacionais to authenticated;
grant select on public.chamado_eventos to authenticated;
grant select on public.chamado_adicionais to authenticated;
grant select on public.chamado_materiais to authenticated;
grant select on public.operacional_movimentacoes to authenticated;

create or replace function public.operador_operacao_garantir_self(p_modulo text default 'operacional')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_operador public.operadores_operacao;
  v_email text;
  v_nome text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'nao_autenticado');
  end if;

  if not public.usuario_tem_modulo_operacional(p_modulo) then
    return jsonb_build_object('ok', false, 'error', 'sem_permissao');
  end if;

  select * into v_profile
  from public.profiles
  where user_id = v_uid
  limit 1;

  v_email := coalesce(nullif(trim(v_profile.email_corporativo), ''), nullif(trim(v_profile.email), ''), auth.jwt()->>'email');
  v_nome := coalesce(nullif(trim(v_profile.nome_completo), ''), split_part(coalesce(v_email,'Operador'), '@', 1), 'Operador');

  insert into public.operadores_operacao(user_id, nome, email, cargo, filial, modulos, created_by)
  values (v_uid, v_nome, v_email, v_profile.cargo, v_profile.filial, array[p_modulo]::text[], v_uid)
  on conflict (user_id) do update
    set nome = excluded.nome,
        email = coalesce(excluded.email, public.operadores_operacao.email),
        cargo = coalesce(excluded.cargo, public.operadores_operacao.cargo),
        filial = coalesce(excluded.filial, public.operadores_operacao.filial),
        modulos = case
          when p_modulo = any(public.operadores_operacao.modulos) then public.operadores_operacao.modulos
          else public.operadores_operacao.modulos || p_modulo
        end,
        updated_at = now()
  returning * into v_operador;

  return jsonb_build_object(
    'ok', true,
    'operador', jsonb_build_object(
      'id', v_operador.id,
      'nome', v_operador.nome,
      'email', v_operador.email,
      'cargo', v_operador.cargo,
      'filial', v_operador.filial,
      'modulos', v_operador.modulos,
      'ativo', v_operador.ativo,
      'codigo_emitido', v_operador.codigo_hash is not null,
      'codigo_hint', v_operador.codigo_hint
    )
  );
end;
$$;

revoke all on function public.operador_operacao_garantir_self(text) from public;
grant execute on function public.operador_operacao_garantir_self(text) to authenticated;

create or replace function public.operador_operacao_emitir_codigo(p_operador_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operador public.operadores_operacao;
  v_codigo text;
  v_tentativas int := 0;
  v_colisao boolean;
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

  loop
    v_tentativas := v_tentativas + 1;
    v_codigo := (floor(random() * 900000) + 100000)::int::text;
    select exists (
      select 1 from public.operadores_operacao o
      where o.id <> p_operador_id
        and o.codigo_hash is not null
        and crypt(v_codigo, o.codigo_hash) = o.codigo_hash
    ) into v_colisao;
    exit when not v_colisao or v_tentativas >= 20;
  end loop;

  update public.operadores_operacao
  set codigo_hash = crypt(v_codigo, gen_salt('bf', 8)),
      codigo_hint = right(v_codigo, 2),
      codigo_emitido_em = now(),
      ativo = true,
      updated_at = now()
  where id = p_operador_id
  returning * into v_operador;

  return jsonb_build_object(
    'ok', true,
    'codigo', v_codigo,
    'operador_id', v_operador.id,
    'nome', v_operador.nome,
    'email', v_operador.email,
    'codigo_hint', v_operador.codigo_hint
  );
end;
$$;

revoke all on function public.operador_operacao_emitir_codigo(uuid) from public;
grant execute on function public.operador_operacao_emitir_codigo(uuid) to authenticated;

create or replace function public.operador_operacao_listar()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.operador_operacao_is_admin() then
    return jsonb_build_object('ok', false, 'error', 'sem_permissao');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', o.id,
    'user_id', o.user_id,
    'funcionario_id', o.funcionario_id,
    'nome', o.nome,
    'email', o.email,
    'cargo', o.cargo,
    'filial', o.filial,
    'modulos', o.modulos,
    'ativo', o.ativo,
    'codigo_emitido', o.codigo_hash is not null,
    'codigo_hint', o.codigo_hint,
    'codigo_emitido_em', o.codigo_emitido_em,
    'created_at', o.created_at
  ) order by o.nome), '[]'::jsonb)
  into v_result
  from public.operadores_operacao o;

  return jsonb_build_object('ok', true, 'operadores', v_result);
end;
$$;

revoke all on function public.operador_operacao_listar() from public;
grant execute on function public.operador_operacao_listar() to authenticated;

create or replace function public.operador_operacao_definir_ativo(p_operador_id uuid, p_ativo boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.operador_operacao_is_admin() then
    return jsonb_build_object('ok', false, 'error', 'sem_permissao');
  end if;

  update public.operadores_operacao
  set ativo = p_ativo, updated_at = now()
  where id = p_operador_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'operador_nao_encontrado');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.operador_operacao_definir_ativo(uuid, boolean) from public;
grant execute on function public.operador_operacao_definir_ativo(uuid, boolean) to authenticated;

create or replace function public._operador_operacao_por_codigo(p_codigo text, p_modulo text)
returns public.operadores_operacao
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operador public.operadores_operacao;
begin
  if auth.uid() is null then
    raise exception 'nao_autenticado';
  end if;

  if nullif(trim(coalesce(p_codigo,'')), '') is null then
    raise exception 'codigo_operador_obrigatorio';
  end if;

  select * into v_operador
  from public.operadores_operacao o
  where o.ativo = true
    and p_modulo = any(o.modulos)
    and o.codigo_hash is not null
    and crypt(trim(p_codigo), o.codigo_hash) = o.codigo_hash
  limit 1;

  if v_operador.id is null then
    raise exception 'codigo_operador_invalido';
  end if;

  return v_operador;
end;
$$;

revoke all on function public._operador_operacao_por_codigo(text, text) from public, anon, authenticated;

create or replace function public.operador_operacao_validar_codigo(p_codigo text, p_modulo text default 'operacional')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operador public.operadores_operacao;
begin
  begin
    v_operador := public._operador_operacao_por_codigo(p_codigo, p_modulo);
  exception when others then
    return jsonb_build_object('ok', false, 'error', sqlerrm);
  end;

  return jsonb_build_object(
    'ok', true,
    'operador', jsonb_build_object(
      'id', v_operador.id,
      'nome', v_operador.nome,
      'cargo', v_operador.cargo,
      'filial', v_operador.filial
    )
  );
end;
$$;

revoke all on function public.operador_operacao_validar_codigo(text, text) from public;
grant execute on function public.operador_operacao_validar_codigo(text, text) to authenticated;

create or replace function public.operacional_criar_chamado(
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
  v_chamado_id uuid;
  v_numero bigint;
  v_mecanico_nome text;
begin
  begin
    v_operador := public._operador_operacao_por_codigo(p_codigo_operador, 'operacional');
  exception when others then
    return jsonb_build_object('ok', false, 'error', sqlerrm);
  end;

  if p_colaborador_id is null then
    return jsonb_build_object('ok', false, 'error', 'mecanico_obrigatorio');
  end if;
  if nullif(trim(coalesce(p_cliente,'')), '') is null then
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
    origem,
    cliente_id,
    cliente_local_id,
    contrato_id,
    equipamento_id,
    cliente,
    local_servico,
    tipo_servico,
    itens_previstos,
    observacoes,
    status,
    colaborador_id,
    solicitante_nome,
    solicitante_contato,
    operador_abertura_id,
    operador_abertura_nome,
    atribuido_em,
    notificacao_pendente,
    criado_por,
    created_at,
    updated_at
  ) values (
    'operacional',
    p_cliente_id,
    p_cliente_local_id,
    p_contrato_id,
    p_equipamento_id,
    trim(p_cliente),
    trim(coalesce(p_local_servico,'')),
    trim(p_tipo_servico),
    nullif(trim(coalesce(p_itens_previstos,'')), ''),
    nullif(trim(coalesce(p_observacoes,'')), ''),
    'pendente',
    p_colaborador_id,
    trim(p_solicitante_nome),
    nullif(trim(coalesce(p_solicitante_contato,'')), ''),
    v_operador.id,
    v_operador.nome,
    now(),
    true,
    auth.uid(),
    now(),
    now()
  )
  returning id, numero into v_chamado_id, v_numero;

  insert into public.chamado_eventos(chamado_id, tipo, status, operador_id, autor_nome, detalhes)
  values
    (v_chamado_id, 'criado', 'pendente', v_operador.id, v_operador.nome,
      jsonb_build_object('solicitante', trim(p_solicitante_nome), 'cliente', trim(p_cliente))),
    (v_chamado_id, 'atribuido', 'pendente', v_operador.id, v_operador.nome,
      jsonb_build_object('mecanico_id', p_colaborador_id, 'mecanico_nome', coalesce(v_mecanico_nome,'')));

  return jsonb_build_object(
    'ok', true,
    'id', v_chamado_id,
    'numero', v_numero,
    'operador', v_operador.nome,
    'status', 'pendente'
  );
end;
$$;

revoke all on function public.operacional_criar_chamado(text, uuid, text, text, text, text, text, uuid, uuid, uuid, uuid, text, text) from public;
grant execute on function public.operacional_criar_chamado(text, uuid, text, text, text, text, text, uuid, uuid, uuid, uuid, text, text) to authenticated;

create or replace function public.operacional_editar_chamado(
  p_codigo_operador text,
  p_chamado_id uuid,
  p_colaborador_id uuid,
  p_cliente text,
  p_local_servico text,
  p_tipo_servico text,
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
begin
  begin
    v_operador := public._operador_operacao_por_codigo(p_codigo_operador, 'operacional');
  exception when others then
    return jsonb_build_object('ok', false, 'error', sqlerrm);
  end;

  update public.chamados
  set colaborador_id = p_colaborador_id,
      cliente = trim(p_cliente),
      local_servico = trim(coalesce(p_local_servico,'')),
      tipo_servico = trim(p_tipo_servico),
      itens_previstos = nullif(trim(coalesce(p_itens_previstos,'')), ''),
      observacoes = nullif(trim(coalesce(p_observacoes,'')), ''),
      atribuido_em = case when colaborador_id is distinct from p_colaborador_id then now() else atribuido_em end,
      notificacao_pendente = case when colaborador_id is distinct from p_colaborador_id then true else notificacao_pendente end,
      status = case when colaborador_id is distinct from p_colaborador_id and status not in ('concluido','cancelado') then 'pendente' else status end,
      updated_at = now()
  where id = p_chamado_id
    and status <> 'cancelado';

  if not found then
    return jsonb_build_object('ok', false, 'error', 'chamado_nao_encontrado');
  end if;

  insert into public.chamado_eventos(chamado_id, tipo, operador_id, autor_nome, detalhes)
  values (p_chamado_id, 'editado', v_operador.id, v_operador.nome,
    jsonb_build_object('cliente', p_cliente, 'servico', p_tipo_servico, 'mecanico_id', p_colaborador_id));

  return jsonb_build_object('ok', true, 'operador', v_operador.nome);
end;
$$;

revoke all on function public.operacional_editar_chamado(text, uuid, uuid, text, text, text, text, text) from public;
grant execute on function public.operacional_editar_chamado(text, uuid, uuid, text, text, text, text, text) to authenticated;

create or replace function public.operacional_cancelar_chamado(
  p_codigo_operador text,
  p_chamado_id uuid,
  p_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operador public.operadores_operacao;
begin
  begin
    v_operador := public._operador_operacao_por_codigo(p_codigo_operador, 'operacional');
  exception when others then
    return jsonb_build_object('ok', false, 'error', sqlerrm);
  end;

  update public.chamados
  set status = 'cancelado',
      notificacao_pendente = false,
      cancelado_em = now(),
      cancelado_por_operador_id = v_operador.id,
      cancelamento_motivo = nullif(trim(coalesce(p_motivo,'')), ''),
      updated_at = now()
  where id = p_chamado_id
    and status <> 'concluido';

  if not found then
    return jsonb_build_object('ok', false, 'error', 'chamado_nao_encontrado_ou_concluido');
  end if;

  insert into public.chamado_eventos(chamado_id, tipo, status, operador_id, autor_nome, detalhes)
  values (p_chamado_id, 'cancelado', 'cancelado', v_operador.id, v_operador.nome,
    jsonb_build_object('motivo', nullif(trim(coalesce(p_motivo,'')), '')));

  return jsonb_build_object('ok', true, 'operador', v_operador.nome);
end;
$$;

revoke all on function public.operacional_cancelar_chamado(text, uuid, text) from public;
grant execute on function public.operacional_cancelar_chamado(text, uuid, text) to authenticated;

create or replace function public.operacional_registrar_movimentacao(
  p_codigo_operador text,
  p_equipamento_id uuid,
  p_tipo text,
  p_cliente_destino_id uuid default null,
  p_local_destino_id uuid default null,
  p_local_destino_nome text default null,
  p_observacao text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operador public.operadores_operacao;
  v_eq public.contrato_equipamentos;
  v_contrato public.contratos;
  v_ativo public.ativos;
  v_cliente_origem public.clientes_fat;
  v_cliente_destino public.clientes_fat;
  v_local_destino public.cliente_locais_operacionais;
  v_id uuid;
begin
  begin
    v_operador := public._operador_operacao_por_codigo(p_codigo_operador, 'operacional');
  exception when others then
    return jsonb_build_object('ok', false, 'error', sqlerrm);
  end;

  select * into v_eq from public.contrato_equipamentos where id = p_equipamento_id;
  if v_eq.id is null then
    return jsonb_build_object('ok', false, 'error', 'equipamento_nao_encontrado');
  end if;

  select * into v_contrato from public.contratos where id = v_eq.contrato_id;
  if v_eq.ativo_id is not null then select * into v_ativo from public.ativos where id = v_eq.ativo_id; end if;
  if v_contrato.cliente_id is not null then select * into v_cliente_origem from public.clientes_fat where id = v_contrato.cliente_id; end if;
  if p_cliente_destino_id is not null then select * into v_cliente_destino from public.clientes_fat where id = p_cliente_destino_id; end if;
  if p_local_destino_id is not null then select * into v_local_destino from public.cliente_locais_operacionais where id = p_local_destino_id; end if;

  insert into public.operacional_movimentacoes(
    equipamento_id, ativo_id, contrato_id,
    cliente_origem_id, cliente_destino_id, local_destino_id,
    tipo, patrimonio, placa,
    cliente_origem_nome, cliente_destino_nome, local_destino_nome,
    observacao, operador_id, operador_nome
  ) values (
    v_eq.id, v_eq.ativo_id, v_eq.contrato_id,
    v_contrato.cliente_id, p_cliente_destino_id, p_local_destino_id,
    trim(p_tipo),
    coalesce(v_eq.patrimonio, v_ativo.patrimonio),
    coalesce(v_eq.placa, v_ativo.placa),
    coalesce(v_cliente_origem.razao_social, v_cliente_origem.nome_fantasia),
    coalesce(v_cliente_destino.razao_social, v_cliente_destino.nome_fantasia),
    coalesce(v_local_destino.nome, nullif(trim(coalesce(p_local_destino_nome,'')), '')),
    nullif(trim(coalesce(p_observacao,'')), ''),
    v_operador.id, v_operador.nome
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'operador', v_operador.nome);
end;
$$;

revoke all on function public.operacional_registrar_movimentacao(text, uuid, text, uuid, uuid, text, text) from public;
grant execute on function public.operacional_registrar_movimentacao(text, uuid, text, uuid, uuid, text, text) to authenticated;

create or replace function public.operacional_marcar_adicional_visualizado(
  p_codigo_operador text,
  p_adicional_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operador public.operadores_operacao;
  v_chamado uuid;
begin
  begin
    v_operador := public._operador_operacao_por_codigo(p_codigo_operador, 'operacional');
  exception when others then
    return jsonb_build_object('ok', false, 'error', sqlerrm);
  end;

  update public.chamado_adicionais
  set visualizado_em = coalesce(visualizado_em, now()),
      visualizado_por_operador_id = v_operador.id,
      status = case when status = 'informado' then 'visualizado' else status end
  where id = p_adicional_id
  returning chamado_id into v_chamado;

  if v_chamado is null then
    return jsonb_build_object('ok', false, 'error', 'adicional_nao_encontrado');
  end if;

  insert into public.chamado_eventos(chamado_id, tipo, operador_id, autor_nome, detalhes)
  values (v_chamado, 'adicional_visualizado', v_operador.id, v_operador.nome,
    jsonb_build_object('adicional_id', p_adicional_id));

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.operacional_marcar_adicional_visualizado(text, uuid) from public;
grant execute on function public.operacional_marcar_adicional_visualizado(text, uuid) to authenticated;

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
    update public.chamados
    set status = 'concluido',
        concluido_em = now(),
        fim_latitude = p_latitude,
        fim_longitude = p_longitude,
        descricao_conclusao = nullif(trim(coalesce(p_descricao_conclusao,'')), ''),
        observacoes = coalesce(nullif(trim(coalesce(p_observacao,'')), ''), observacoes),
        notificacao_pendente = false,
        updated_at = now()
    where id = p_chamado_id and colaborador_id = v.funcionario_id and status = 'em_execucao';
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

create or replace function public.app_mecanico_registrar_adicional(
  p_acesso_id uuid,
  p_chamado_id uuid,
  p_descricao_identificada text,
  p_servico_executado text,
  p_observacao text default null,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_materiais jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.acessos_externos;
  v_adicional_id uuid;
  v_item jsonb;
  v_chamado_status text;
begin
  begin
    v := public._app_mecanico_get_acesso(p_acesso_id);
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'acesso_nao_autorizado');
  end;

  select status into v_chamado_status
  from public.chamados
  where id = p_chamado_id and colaborador_id = v.funcionario_id;

  if v_chamado_status is null then
    return jsonb_build_object('ok', false, 'error', 'chamado_nao_encontrado');
  end if;
  if v_chamado_status in ('concluido','cancelado') then
    return jsonb_build_object('ok', false, 'error', 'chamado_encerrado');
  end if;
  if nullif(trim(coalesce(p_descricao_identificada,'')), '') is null
     or nullif(trim(coalesce(p_servico_executado,'')), '') is null then
    return jsonb_build_object('ok', false, 'error', 'descricao_e_servico_obrigatorios');
  end if;

  insert into public.chamado_adicionais(
    chamado_id, mecanico_acesso_id, mecanico_funcionario_id, mecanico_nome,
    descricao_identificada, servico_executado, observacao, latitude, longitude
  ) values (
    p_chamado_id, v.id, v.funcionario_id, v.nome,
    trim(p_descricao_identificada), trim(p_servico_executado),
    nullif(trim(coalesce(p_observacao,'')), ''), p_latitude, p_longitude
  )
  returning id into v_adicional_id;

  for v_item in select value from jsonb_array_elements(coalesce(p_materiais, '[]'::jsonb))
  loop
    if nullif(trim(coalesce(v_item->>'descricao','')), '') is not null then
      insert into public.chamado_materiais(
        chamado_id, adicional_id, almoxarifado_item_id,
        descricao, quantidade, unidade,
        mecanico_acesso_id, mecanico_funcionario_id
      ) values (
        p_chamado_id,
        v_adicional_id,
        case when coalesce(v_item->>'almoxarifado_item_id','') ~* '^[0-9a-f-]{36}$'
          then (v_item->>'almoxarifado_item_id')::uuid else null end,
        trim(v_item->>'descricao'),
        greatest(coalesce(nullif(v_item->>'quantidade','')::numeric, 1), 0.001),
        nullif(trim(coalesce(v_item->>'unidade','')), ''),
        v.id,
        v.funcionario_id
      );
    end if;
  end loop;

  insert into public.chamado_eventos(
    chamado_id, tipo, status, mecanico_acesso_id, mecanico_funcionario_id,
    autor_nome, detalhes, latitude, longitude
  ) values (
    p_chamado_id, 'adicional_registrado', v_chamado_status,
    v.id, v.funcionario_id, v.nome,
    jsonb_build_object(
      'adicional_id', v_adicional_id,
      'descricao', trim(p_descricao_identificada),
      'servico_executado', trim(p_servico_executado)
    ),
    p_latitude, p_longitude
  );

  return jsonb_build_object('ok', true, 'id', v_adicional_id);
end;
$$;

revoke all on function public.app_mecanico_registrar_adicional(uuid, uuid, text, text, text, double precision, double precision, jsonb) from public;
grant execute on function public.app_mecanico_registrar_adicional(uuid, uuid, text, text, text, double precision, double precision, jsonb) to anon, authenticated;

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

  return jsonb_build_object(
    'ok', true,
    'eventos', v_eventos,
    'adicionais', v_adicionais,
    'materiais', v_materiais
  );
end;
$$;

revoke all on function public.operacional_chamado_detalhe(uuid) from public;
grant execute on function public.operacional_chamado_detalhe(uuid) to authenticated;
