-- TOPAC RH PRO — Almoxarifado: escopo multiempresa + atomicidade.
-- Migration aditiva. Não remove tabelas nem dados existentes.

-- 1) Chave oficial de empresa nas estruturas operacionais.
alter table public.almoxarifado_itens add column if not exists company_id uuid references public.empresas(id);
alter table public.almoxarifado_entradas add column if not exists company_id uuid references public.empresas(id);
alter table public.almoxarifado_saidas add column if not exists company_id uuid references public.empresas(id);
alter table public.almoxarifado_ajustes add column if not exists company_id uuid references public.empresas(id);
alter table public.almoxarifado_cargas add column if not exists company_id uuid references public.empresas(id);
alter table public.almoxarifado_fechamentos add column if not exists company_id uuid references public.empresas(id);
alter table public.almoxarifado_ferramentas add column if not exists company_id uuid references public.empresas(id);
alter table public.almoxarifado_auditoria add column if not exists company_id uuid references public.empresas(id);
alter table public.almoxarifado_transferencias add column if not exists company_origem_id uuid references public.empresas(id);
alter table public.almoxarifado_transferencias add column if not exists company_destino_id uuid references public.empresas(id);

create index if not exists almox_itens_company_idx on public.almoxarifado_itens(company_id);
create index if not exists almox_entradas_company_idx on public.almoxarifado_entradas(company_id, created_at desc);
create index if not exists almox_saidas_company_idx on public.almoxarifado_saidas(company_id, created_at desc);
create index if not exists almox_ajustes_company_idx on public.almoxarifado_ajustes(company_id, created_at desc);
create index if not exists almox_cargas_company_idx on public.almoxarifado_cargas(company_id, created_at desc);
create index if not exists almox_fechamentos_company_idx on public.almoxarifado_fechamentos(company_id, data_fechamento desc);
create index if not exists almox_ferramentas_company_idx on public.almoxarifado_ferramentas(company_id, status);
create index if not exists almox_auditoria_company_id_idx on public.almoxarifado_auditoria(company_id, created_at desc);

-- 2) Contexto persistente por usuário. Não depende da conexão do pool do PostgREST.
create table if not exists public.almoxarifado_user_context (
  user_id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid not null references public.empresas(id),
  updated_at timestamptz not null default now()
);
alter table public.almoxarifado_user_context enable row level security;
revoke all on table public.almoxarifado_user_context from anon, authenticated;

create or replace function public.almoxarifado_is_central(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_user_id is not null
     and public.topac_has_any_role(array['admin','diretor_geral','almoxarifado'], p_user_id);
$$;

create or replace function public.almoxarifado_active_company(p_user_id uuid default auth.uid())
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_company uuid;
begin
  if p_user_id is null then
    return null;
  end if;

  if public.almoxarifado_is_central(p_user_id) then
    select c.company_id into v_company
      from public.almoxarifado_user_context c
     where c.user_id = p_user_id;
    return v_company;
  end if;

  if public.topac_is_filial_user(p_user_id) then
    select e.id into v_company
      from public.empresas e
     where e.codigo in ('topac-matriz','topac-pg','topac-gyn')
       and public.topac_filial_company_allowed(e.id, p_user_id)
     order by e.codigo
     limit 1;
    return v_company;
  end if;

  return null;
end;
$$;

create or replace function public.almoxarifado_row_allowed(p_company_id uuid, p_user_id uuid default auth.uid())
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_active uuid;
begin
  if p_user_id is null then
    return false;
  end if;

  if public.almoxarifado_is_central(p_user_id) then
    v_active := public.almoxarifado_active_company(p_user_id);
    -- Compatibilidade temporária com a tela de produção anterior ao deploy:
    -- sem unidade ativa, perfis centrais mantêm o acesso já existente.
    return v_active is null or p_company_id = v_active;
  end if;

  if public.topac_is_filial_user(p_user_id) then
    return p_company_id is not null
       and public.topac_filial_company_allowed(p_company_id, p_user_id);
  end if;

  return false;
end;
$$;

create or replace function public.almoxarifado_set_company_context(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_nome text;
  v_codigo text;
begin
  if v_uid is null then
    raise exception 'Sessão inválida';
  end if;

  select e.nome, e.codigo into v_nome, v_codigo
    from public.empresas e
   where e.id = p_company_id
     and e.codigo in ('topac-matriz','topac-pg','topac-gyn');

  if v_codigo is null then
    raise exception 'Unidade TOPAC inválida';
  end if;

  if not (
    public.almoxarifado_is_central(v_uid)
    or (public.topac_is_filial_user(v_uid) and public.topac_filial_company_allowed(p_company_id, v_uid))
  ) then
    raise exception 'Usuário sem acesso à unidade informada';
  end if;

  insert into public.almoxarifado_user_context(user_id, company_id, updated_at)
  values (v_uid, p_company_id, now())
  on conflict (user_id) do update
    set company_id = excluded.company_id,
        updated_at = excluded.updated_at;

  return jsonb_build_object('ok', true, 'company_id', p_company_id, 'empresa', v_nome, 'codigo', v_codigo);
end;
$$;

revoke all on function public.almoxarifado_set_company_context(uuid) from public, anon;
grant execute on function public.almoxarifado_set_company_context(uuid) to authenticated;

-- 3) Preenche escopo automaticamente nas tabelas que já possuem a coluna legada empresa.
create or replace function public.almoxarifado_assign_company_scope()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_active uuid;
  v_nome text;
begin
  v_active := public.almoxarifado_active_company(auth.uid());

  if new.company_id is null then
    new.company_id := v_active;
  end if;

  if new.company_id is not null and not public.almoxarifado_row_allowed(new.company_id, auth.uid()) then
    raise exception 'Acesso negado à empresa do Almoxarifado';
  end if;

  if new.company_id is not null and (new.empresa is null or btrim(new.empresa) = '') then
    select e.nome into v_nome from public.empresas e where e.id = new.company_id;
    new.empresa := v_nome;
  end if;

  return new;
end;
$$;

-- Recriação apenas dos triggers nomeados desta migration é idempotente e não remove dados.
drop trigger if exists trg_almox_scope_itens on public.almoxarifado_itens;
create trigger trg_almox_scope_itens before insert or update of company_id on public.almoxarifado_itens
for each row execute function public.almoxarifado_assign_company_scope();

drop trigger if exists trg_almox_scope_entradas on public.almoxarifado_entradas;
create trigger trg_almox_scope_entradas before insert or update of company_id on public.almoxarifado_entradas
for each row execute function public.almoxarifado_assign_company_scope();

drop trigger if exists trg_almox_scope_saidas on public.almoxarifado_saidas;
create trigger trg_almox_scope_saidas before insert or update of company_id on public.almoxarifado_saidas
for each row execute function public.almoxarifado_assign_company_scope();

drop trigger if exists trg_almox_scope_ajustes on public.almoxarifado_ajustes;
create trigger trg_almox_scope_ajustes before insert or update of company_id on public.almoxarifado_ajustes
for each row execute function public.almoxarifado_assign_company_scope();

drop trigger if exists trg_almox_scope_cargas on public.almoxarifado_cargas;
create trigger trg_almox_scope_cargas before insert or update of company_id on public.almoxarifado_cargas
for each row execute function public.almoxarifado_assign_company_scope();

drop trigger if exists trg_almox_scope_fechamentos on public.almoxarifado_fechamentos;
create trigger trg_almox_scope_fechamentos before insert or update of company_id on public.almoxarifado_fechamentos
for each row execute function public.almoxarifado_assign_company_scope();

drop trigger if exists trg_almox_scope_ferramentas on public.almoxarifado_ferramentas;
create trigger trg_almox_scope_ferramentas before insert or update of company_id on public.almoxarifado_ferramentas
for each row execute function public.almoxarifado_assign_company_scope();

drop trigger if exists trg_almox_scope_auditoria on public.almoxarifado_auditoria;
create trigger trg_almox_scope_auditoria before insert or update of company_id on public.almoxarifado_auditoria
for each row execute function public.almoxarifado_assign_company_scope();

-- 4) Movimentação de estoque dentro da mesma transação do INSERT.
create or replace function public.almoxarifado_after_entrada()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_anterior numeric;
  v_company uuid;
  v_novo numeric;
begin
  if new.quantidade is null or new.quantidade <= 0 then
    raise exception 'Quantidade de entrada deve ser maior que zero';
  end if;

  select i.quantidade, i.company_id into v_anterior, v_company
    from public.almoxarifado_itens i
   where i.id = new.item_id
   for update;

  if not found then
    raise exception 'Item do Almoxarifado não encontrado';
  end if;

  if new.company_id is not null and v_company is not null and new.company_id <> v_company then
    raise exception 'Item pertence a outra empresa';
  end if;

  v_novo := coalesce(v_anterior, 0) + new.quantidade;
  perform set_config('topac.almox_internal_stock', '1', true);

  update public.almoxarifado_itens
     set quantidade = v_novo,
         valor_unitario = case when coalesce(new.valor_unitario,0) > 0 then new.valor_unitario else valor_unitario end,
         company_id = coalesce(company_id, new.company_id),
         updated_at = now()
   where id = new.item_id;

  insert into public.almoxarifado_auditoria(company_id, empresa, entidade, entidade_id, acao, user_id, usuario_nome, valor_anterior, valor_posterior, motivo)
  values (coalesce(new.company_id, v_company), new.empresa, 'almoxarifado_itens', new.item_id::text, 'entrada', coalesce(new.user_id,auth.uid()), new.responsavel_nome,
          jsonb_build_object('quantidade',v_anterior), jsonb_build_object('quantidade',v_novo,'entrada_id',new.id), new.observacao);

  return new;
end;
$$;

drop trigger if exists trg_almox_after_entrada on public.almoxarifado_entradas;
create trigger trg_almox_after_entrada after insert on public.almoxarifado_entradas
for each row execute function public.almoxarifado_after_entrada();

create or replace function public.almoxarifado_after_saida()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_anterior numeric;
  v_company uuid;
  v_novo numeric;
begin
  if new.quantidade is null or new.quantidade <= 0 then
    raise exception 'Quantidade de saída deve ser maior que zero';
  end if;

  select i.quantidade, i.company_id into v_anterior, v_company
    from public.almoxarifado_itens i
   where i.id = new.item_id
   for update;

  if not found then
    raise exception 'Item do Almoxarifado não encontrado';
  end if;

  if new.company_id is not null and v_company is not null and new.company_id <> v_company then
    raise exception 'Item pertence a outra empresa';
  end if;

  if new.quantidade > coalesce(v_anterior,0) then
    raise exception 'Estoque insuficiente';
  end if;

  v_novo := coalesce(v_anterior,0) - new.quantidade;
  perform set_config('topac.almox_internal_stock', '1', true);

  update public.almoxarifado_itens
     set quantidade = v_novo,
         company_id = coalesce(company_id, new.company_id),
         updated_at = now()
   where id = new.item_id;

  insert into public.almoxarifado_auditoria(company_id, empresa, entidade, entidade_id, acao, user_id, usuario_nome, valor_anterior, valor_posterior, motivo)
  values (coalesce(new.company_id, v_company), new.empresa, 'almoxarifado_itens', new.item_id::text, 'saida', coalesce(new.user_id,auth.uid()), new.responsavel_liberacao,
          jsonb_build_object('quantidade',v_anterior), jsonb_build_object('quantidade',v_novo,'saida_id',new.id,'funcionario',new.funcionario_nome), new.motivo);

  return new;
end;
$$;

drop trigger if exists trg_almox_after_saida on public.almoxarifado_saidas;
create trigger trg_almox_after_saida after insert on public.almoxarifado_saidas
for each row execute function public.almoxarifado_after_saida();

create or replace function public.almoxarifado_after_ajuste()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_atual numeric;
  v_company uuid;
begin
  if new.quantidade_nova is null or new.quantidade_nova < 0 then
    raise exception 'Quantidade ajustada inválida';
  end if;

  select i.quantidade, i.company_id into v_atual, v_company
    from public.almoxarifado_itens i
   where i.id = new.item_id
   for update;

  if not found then
    raise exception 'Item do Almoxarifado não encontrado';
  end if;

  if new.company_id is not null and v_company is not null and new.company_id <> v_company then
    raise exception 'Item pertence a outra empresa';
  end if;

  if new.quantidade_anterior is distinct from v_atual then
    raise exception 'Saldo foi alterado por outra movimentação. Atualize a tela e tente novamente';
  end if;

  perform set_config('topac.almox_internal_stock', '1', true);
  update public.almoxarifado_itens
     set quantidade = new.quantidade_nova,
         company_id = coalesce(company_id, new.company_id),
         updated_at = now()
   where id = new.item_id;

  insert into public.almoxarifado_auditoria(company_id, empresa, entidade, entidade_id, acao, user_id, usuario_nome, valor_anterior, valor_posterior, motivo)
  values (coalesce(new.company_id, v_company), new.empresa, 'almoxarifado_itens', new.item_id::text, 'ajuste', coalesce(new.user_id,auth.uid()), new.usuario_nome,
          jsonb_build_object('quantidade',v_atual), jsonb_build_object('quantidade',new.quantidade_nova,'ajuste_id',new.id), new.motivo);

  return new;
end;
$$;

drop trigger if exists trg_almox_after_ajuste on public.almoxarifado_ajustes;
create trigger trg_almox_after_ajuste after insert on public.almoxarifado_ajustes
for each row execute function public.almoxarifado_after_ajuste();

-- Impede que o UPDATE legado imediatamente posterior sobrescreva um saldo já atualizado pelo trigger.
create or replace function public.almoxarifado_guard_stale_stock_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.quantidade is not distinct from old.quantidade then
    return new;
  end if;

  if current_setting('topac.almox_internal_stock', true) = '1' then
    return new;
  end if;

  if auth.uid() is not null and (
    exists(select 1 from public.almoxarifado_entradas e where e.item_id=old.id and e.user_id=auth.uid() and e.created_at >= now()-interval '30 seconds')
    or exists(select 1 from public.almoxarifado_saidas s where s.item_id=old.id and s.user_id=auth.uid() and s.created_at >= now()-interval '30 seconds')
    or exists(select 1 from public.almoxarifado_ajustes a where a.item_id=old.id and a.user_id=auth.uid() and a.created_at >= now()-interval '30 seconds')
  ) then
    new.quantidade := old.quantidade;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_almox_guard_stock_update on public.almoxarifado_itens;
create trigger trg_almox_guard_stock_update before update of quantidade on public.almoxarifado_itens
for each row execute function public.almoxarifado_guard_stale_stock_update();

-- 5) RLS multiempresa nas estruturas operacionais usadas pela tela.
alter policy almox_read on public.almoxarifado_itens
  using (public.topac_has_any_role(array['admin','diretor_geral','almoxarifado','filial_matriz','filial_goiania','filial_praia'],auth.uid())
         and public.almoxarifado_row_allowed(company_id,auth.uid()));
alter policy almox_write on public.almoxarifado_itens
  using (public.almoxarifado_is_central(auth.uid()) and public.almoxarifado_row_allowed(company_id,auth.uid()))
  with check (public.almoxarifado_is_central(auth.uid()) and public.almoxarifado_row_allowed(company_id,auth.uid()));

alter policy almox_read on public.almoxarifado_entradas
  using (public.topac_has_any_role(array['admin','diretor_geral','almoxarifado','filial_matriz','filial_goiania','filial_praia'],auth.uid())
         and public.almoxarifado_row_allowed(company_id,auth.uid()));
alter policy almox_write on public.almoxarifado_entradas
  using (public.almoxarifado_is_central(auth.uid()) and public.almoxarifado_row_allowed(company_id,auth.uid()))
  with check (public.almoxarifado_is_central(auth.uid()) and public.almoxarifado_row_allowed(company_id,auth.uid()));

alter policy almox_read on public.almoxarifado_saidas
  using (public.topac_has_any_role(array['admin','diretor_geral','almoxarifado','filial_matriz','filial_goiania','filial_praia'],auth.uid())
         and public.almoxarifado_row_allowed(company_id,auth.uid()));
alter policy almox_write on public.almoxarifado_saidas
  using (public.almoxarifado_is_central(auth.uid()) and public.almoxarifado_row_allowed(company_id,auth.uid()))
  with check (public.almoxarifado_is_central(auth.uid()) and public.almoxarifado_row_allowed(company_id,auth.uid()));

alter policy almox_read on public.almoxarifado_ajustes
  using (public.topac_has_any_role(array['admin','diretor_geral','almoxarifado','filial_matriz','filial_goiania','filial_praia'],auth.uid())
         and public.almoxarifado_row_allowed(company_id,auth.uid()));
alter policy almox_write on public.almoxarifado_ajustes
  using (public.almoxarifado_is_central(auth.uid()) and public.almoxarifado_row_allowed(company_id,auth.uid()))
  with check (public.almoxarifado_is_central(auth.uid()) and public.almoxarifado_row_allowed(company_id,auth.uid()));

-- Tabelas auxiliares: leitura por filial somente quando o vínculo de empresa existe;
-- escrita continua restrita aos perfis centrais já responsáveis pelo Almoxarifado.
alter policy almox_read on public.almoxarifado_cargas
  using (public.topac_has_any_role(array['admin','diretor_geral','almoxarifado','filial_matriz','filial_goiania','filial_praia'],auth.uid())
         and public.almoxarifado_row_allowed(company_id,auth.uid()));
alter policy almox_write on public.almoxarifado_cargas
  using (public.almoxarifado_is_central(auth.uid()) and public.almoxarifado_row_allowed(company_id,auth.uid()))
  with check (public.almoxarifado_is_central(auth.uid()) and public.almoxarifado_row_allowed(company_id,auth.uid()));

alter policy almox_read on public.almoxarifado_fechamentos
  using (public.topac_has_any_role(array['admin','diretor_geral','almoxarifado','filial_matriz','filial_goiania','filial_praia'],auth.uid())
         and public.almoxarifado_row_allowed(company_id,auth.uid()));
alter policy almox_write on public.almoxarifado_fechamentos
  using (public.almoxarifado_is_central(auth.uid()) and public.almoxarifado_row_allowed(company_id,auth.uid()))
  with check (public.almoxarifado_is_central(auth.uid()) and public.almoxarifado_row_allowed(company_id,auth.uid()));

alter policy almox_read on public.almoxarifado_ferramentas
  using (public.topac_has_any_role(array['admin','diretor_geral','almoxarifado','filial_matriz','filial_goiania','filial_praia'],auth.uid())
         and public.almoxarifado_row_allowed(company_id,auth.uid()));
alter policy almox_write on public.almoxarifado_ferramentas
  using (public.almoxarifado_is_central(auth.uid()) and public.almoxarifado_row_allowed(company_id,auth.uid()))
  with check (public.almoxarifado_is_central(auth.uid()) and public.almoxarifado_row_allowed(company_id,auth.uid()));

alter policy almox_read on public.almoxarifado_auditoria
  using (public.almoxarifado_is_central(auth.uid()) and public.almoxarifado_row_allowed(company_id,auth.uid()));
alter policy almox_write on public.almoxarifado_auditoria
  using (public.almoxarifado_is_central(auth.uid()) and public.almoxarifado_row_allowed(company_id,auth.uid()))
  with check (public.almoxarifado_is_central(auth.uid()) and public.almoxarifado_row_allowed(company_id,auth.uid()));

-- Carga-itens herda o escopo da carga pai.
alter policy almox_read on public.almoxarifado_carga_itens
  using (exists (
    select 1 from public.almoxarifado_cargas c
     where c.id = almoxarifado_carga_itens.carga_id
       and public.almoxarifado_row_allowed(c.company_id,auth.uid())
  ));
alter policy almox_write on public.almoxarifado_carga_itens
  using (public.almoxarifado_is_central(auth.uid()) and exists (
    select 1 from public.almoxarifado_cargas c
     where c.id = almoxarifado_carga_itens.carga_id
       and public.almoxarifado_row_allowed(c.company_id,auth.uid())
  ))
  with check (public.almoxarifado_is_central(auth.uid()) and exists (
    select 1 from public.almoxarifado_cargas c
     where c.id = almoxarifado_carga_itens.carga_id
       and public.almoxarifado_row_allowed(c.company_id,auth.uid())
  ));

-- Importação e transferências ficam administrativas até terem unidade explicitamente confirmada.
alter policy almox_read on public.almoxarifado_importacoes
  using (public.almoxarifado_is_central(auth.uid()));
alter policy almox_write on public.almoxarifado_importacoes
  using (public.almoxarifado_is_central(auth.uid()))
  with check (public.almoxarifado_is_central(auth.uid()));
alter policy almox_read on public.almoxarifado_importacao_erros
  using (public.almoxarifado_is_central(auth.uid()));
alter policy almox_write on public.almoxarifado_importacao_erros
  using (public.almoxarifado_is_central(auth.uid()))
  with check (public.almoxarifado_is_central(auth.uid()));
alter policy almox_read on public.almoxarifado_import_payload_staging
  using (public.almoxarifado_is_central(auth.uid()));
alter policy almox_write on public.almoxarifado_import_payload_staging
  using (public.almoxarifado_is_central(auth.uid()))
  with check (public.almoxarifado_is_central(auth.uid()));
alter policy almox_read on public.almoxarifado_transferencias
  using (public.almoxarifado_is_central(auth.uid()));
alter policy almox_write on public.almoxarifado_transferencias
  using (public.almoxarifado_is_central(auth.uid()))
  with check (public.almoxarifado_is_central(auth.uid()));

-- 6) View de inteligência passa a respeitar RLS das tabelas base e deixa de ser pública para anon.
create or replace view public.almoxarifado_inteligencia
with (security_invoker = true)
as
with consumo as (
  select s.item_id,
         coalesce(sum(case when s.created_at >= now() - interval '90 days' then
           coalesce(s.quantidade_utilizada, s.quantidade, 0) - coalesce(s.quantidade_devolvida,0)
         else 0 end),0) as consumo_90d,
         max(s.created_at) as ultima_saida
  from public.almoxarifado_saidas s
  group by s.item_id
), entrada as (
  select e.item_id, max(e.created_at) as ultima_entrada,
         (array_agg(e.fornecedor order by e.created_at desc))[1] as ultimo_fornecedor,
         (array_agg(e.valor_unitario order by e.created_at desc))[1] as ultimo_valor
  from public.almoxarifado_entradas e
  group by e.item_id
)
select i.id as item_id,
       i.codigo_topac,
       i.codigo_alternativo,
       i.codigo_barras,
       i.nome,
       i.empresa,
       coalesce(i.quantidade,0) as saldo,
       coalesce(i.estoque_minimo,0) as estoque_minimo,
       coalesce(c.consumo_90d,0) as consumo_90d,
       ceil(coalesce(c.consumo_90d,0)/3.0) as media_mensal,
       ceil((coalesce(c.consumo_90d,0)/3.0)*1.5) as compra_sugerida,
       c.ultima_saida,
       e.ultima_entrada,
       e.ultimo_fornecedor,
       e.ultimo_valor,
       case
         when coalesce(i.quantidade,0) <= 0 then 'SEM ESTOQUE'
         when coalesce(i.quantidade,0) <= coalesce(i.estoque_minimo,0) then 'COMPRAR'
         when coalesce(i.estoque_minimo,0) > 0 and coalesce(i.quantidade,0) <= coalesce(i.estoque_minimo,0)*1.25 then 'ATENÇÃO'
         else 'IDEAL'
       end as status
from public.almoxarifado_itens i
left join consumo c on c.item_id = i.id
left join entrada e on e.item_id = i.id;

revoke all on public.almoxarifado_inteligencia from anon;
grant select on public.almoxarifado_inteligencia to authenticated;

comment on function public.almoxarifado_set_company_context(uuid) is 'Define de forma persistente a unidade ativa do Almoxarifado para o usuário autenticado.';
comment on function public.almoxarifado_row_allowed(uuid,uuid) is 'Aplica isolamento multiempresa do Almoxarifado usando unidade ativa ou regra oficial de filial.';
