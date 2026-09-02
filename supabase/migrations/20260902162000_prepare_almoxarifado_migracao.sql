-- FASE 1: preparar Almoxarifado para migração da planilha oficial.
-- IMPORTANTE: migration aditiva. Não importa dados e não remove registros existentes.

-- Cadastro mestre
alter table if exists public.almoxarifado_itens
  add column if not exists codigo_topac text,
  add column if not exists codigo_alternativo text,
  add column if not exists codigo_barras text,
  add column if not exists aplicacao text,
  add column if not exists empresa text,
  add column if not exists estoque_minimo numeric not null default 0,
  add column if not exists observacoes text,
  add column if not exists inativo_em timestamptz,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists almox_itens_empresa_codigo_topac_uidx
  on public.almoxarifado_itens (coalesce(empresa,''), codigo_topac)
  where codigo_topac is not null and btrim(codigo_topac) <> '' and inativo_em is null;
create index if not exists almox_itens_codigo_alt_idx on public.almoxarifado_itens (codigo_alternativo);
create index if not exists almox_itens_barras_idx on public.almoxarifado_itens (codigo_barras);
create index if not exists almox_itens_empresa_idx on public.almoxarifado_itens (empresa);

-- Entradas: ampliar rastreabilidade sem mudar o fluxo atual
alter table if exists public.almoxarifado_entradas
  add column if not exists empresa text,
  add column if not exists data_entrada date,
  add column if not exists nota_fiscal text,
  add column if not exists responsavel_nome text,
  add column if not exists origem_importacao text,
  add column if not exists importacao_lote_id uuid;

-- Saídas: entregue / utilizado / devolvido + vínculos operacionais
alter table if exists public.almoxarifado_saidas
  add column if not exists empresa text,
  add column if not exists data_saida date,
  add column if not exists funcionario_id uuid,
  add column if not exists mecanico_nome text,
  add column if not exists equipe text,
  add column if not exists veiculo text,
  add column if not exists equipamento text,
  add column if not exists patrimonio text,
  add column if not exists ficha text,
  add column if not exists ordem_servico text,
  add column if not exists quantidade_entregue numeric,
  add column if not exists quantidade_utilizada numeric,
  add column if not exists quantidade_devolvida numeric not null default 0,
  add column if not exists numero_serie text,
  add column if not exists responsavel_liberacao text,
  add column if not exists origem_importacao text,
  add column if not exists importacao_lote_id uuid;

create index if not exists almox_saidas_data_idx on public.almoxarifado_saidas (created_at desc);
create index if not exists almox_saidas_empresa_idx on public.almoxarifado_saidas (empresa);
create index if not exists almox_entradas_data_idx on public.almoxarifado_entradas (created_at desc);
create index if not exists almox_entradas_empresa_idx on public.almoxarifado_entradas (empresa);

-- Fechamento persistente e auditável
create table if not exists public.almoxarifado_fechamentos (
  id uuid primary key default gen_random_uuid(),
  empresa text not null,
  data_fechamento date not null,
  fechado_por uuid references auth.users(id),
  fechado_por_nome text,
  fechado_em timestamptz not null default now(),
  quantidade_movimentacoes integer not null default 0,
  reaberto boolean not null default false,
  reaberto_por uuid references auth.users(id),
  reaberto_por_nome text,
  reaberto_em timestamptz,
  motivo_reabertura text,
  created_at timestamptz not null default now(),
  unique (empresa, data_fechamento)
);
alter table public.almoxarifado_fechamentos enable row level security;

-- Auditoria única do Almoxarifado
create table if not exists public.almoxarifado_auditoria (
  id uuid primary key default gen_random_uuid(),
  empresa text,
  entidade text not null,
  entidade_id text,
  acao text not null,
  user_id uuid references auth.users(id),
  usuario_nome text,
  valor_anterior jsonb,
  valor_posterior jsonb,
  motivo text,
  created_at timestamptz not null default now()
);
create index if not exists almox_auditoria_entidade_idx on public.almoxarifado_auditoria (entidade, entidade_id, created_at desc);
create index if not exists almox_auditoria_empresa_idx on public.almoxarifado_auditoria (empresa, created_at desc);
alter table public.almoxarifado_auditoria enable row level security;

-- Transferências entre unidades
create table if not exists public.almoxarifado_transferencias (
  id uuid primary key default gen_random_uuid(),
  empresa_origem text not null,
  empresa_destino text not null,
  item_id uuid not null references public.almoxarifado_itens(id),
  quantidade numeric not null check (quantidade > 0),
  status text not null default 'pendente' check (status in ('pendente','em_transito','recebida','cancelada')),
  solicitado_por uuid references auth.users(id),
  recebido_por uuid references auth.users(id),
  observacoes text,
  created_at timestamptz not null default now(),
  recebido_em timestamptz
);
create index if not exists almox_transferencias_status_idx on public.almoxarifado_transferencias (status, created_at desc);
alter table public.almoxarifado_transferencias enable row level security;

-- Ferramentas: custódia separada de consumíveis
create table if not exists public.almoxarifado_ferramentas (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references public.almoxarifado_itens(id),
  codigo text,
  descricao text not null,
  patrimonio text,
  numero_serie text,
  empresa text,
  status text not null default 'em_estoque' check (status in ('em_estoque','em_posse','em_manutencao','baixada')),
  responsavel_id uuid,
  responsavel_nome text,
  entregue_em timestamptz,
  devolvida_em timestamptz,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists almox_ferramentas_responsavel_idx on public.almoxarifado_ferramentas (responsavel_nome, status);
alter table public.almoxarifado_ferramentas enable row level security;

-- Lotes de pré-importação: análise sem gravar o estoque
create table if not exists public.almoxarifado_importacoes (
  id uuid primary key default gen_random_uuid(),
  arquivo_nome text not null,
  arquivo_hash text,
  status text not null default 'analisado' check (status in ('analisado','revisar','aprovado','importado','cancelado')),
  usuario_id uuid references auth.users(id),
  resumo jsonb not null default '{}'::jsonb,
  confirmado_em timestamptz,
  created_at timestamptz not null default now()
);
alter table public.almoxarifado_importacoes enable row level security;

create table if not exists public.almoxarifado_importacao_erros (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references public.almoxarifado_importacoes(id) on delete cascade,
  aba text,
  linha integer,
  codigo text,
  tipo text not null,
  mensagem text not null,
  dados jsonb,
  created_at timestamptz not null default now()
);
create index if not exists almox_import_erros_lote_idx on public.almoxarifado_importacao_erros (lote_id, tipo);
alter table public.almoxarifado_importacao_erros enable row level security;

-- Visão de inteligência. Usa movimentos existentes e não altera saldos.
create or replace view public.almoxarifado_inteligencia as
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

comment on view public.almoxarifado_inteligencia is 'Consumo 90d, média mensal, reposição sugerida e status; não grava dados.';
