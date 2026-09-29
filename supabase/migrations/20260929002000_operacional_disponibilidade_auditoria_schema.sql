-- Auditoria e disponibilidade operacional. Idempotente e aditiva.
create table if not exists public.operacional_placas_disponibilidade (
  id uuid primary key default gen_random_uuid(),
  ativo_id uuid references public.ativos(id) on delete set null,
  placa text not null,
  status text not null default 'pendente' check (status in ('sim','nao','pendente')),
  motivo text,
  origem text not null default 'sistema',
  atualizado_por_operador_id uuid references public.operadores_operacao(id) on delete set null,
  atualizado_por_nome text,
  atualizado_em timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create unique index if not exists idx_operacional_disp_placa_unique on public.operacional_placas_disponibilidade(upper(placa));
create index if not exists idx_operacional_disp_status on public.operacional_placas_disponibilidade(status, atualizado_em desc);
alter table public.operacional_placas_disponibilidade enable row level security;
drop policy if exists operacional_disp_select on public.operacional_placas_disponibilidade;
create policy operacional_disp_select on public.operacional_placas_disponibilidade for select to authenticated
using (public.usuario_tem_modulo_operacional('operacional') or public.topac_tem_acesso_privado('frota_ipva'));
grant select on public.operacional_placas_disponibilidade to authenticated;

create table if not exists public.operacional_registros_auditoria (
  id uuid primary key default gen_random_uuid(),
  entidade text not null,
  entidade_id uuid,
  acao text not null,
  motivo text not null,
  antes jsonb,
  depois jsonb,
  operador_id uuid references public.operadores_operacao(id) on delete set null,
  operador_nome text,
  user_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_operacional_auditoria_entidade on public.operacional_registros_auditoria(entidade, entidade_id, created_at desc);
alter table public.operacional_registros_auditoria enable row level security;
drop policy if exists operacional_auditoria_select on public.operacional_registros_auditoria;
create policy operacional_auditoria_select on public.operacional_registros_auditoria for select to authenticated
using (public.usuario_tem_modulo_operacional('operacional') or public.topac_tem_acesso_privado('frota_ipva'));
grant select on public.operacional_registros_auditoria to authenticated;

alter table public.protocolos_documentos
  add column if not exists registro_ativo boolean not null default true,
  add column if not exists excluido_em timestamptz,
  add column if not exists excluido_por_operador_id uuid references public.operadores_operacao(id) on delete set null,
  add column if not exists exclusao_motivo text,
  add column if not exists ultima_alteracao_motivo text,
  add column if not exists email_formalizacao_status text,
  add column if not exists email_formalizacao_em timestamptz,
  add column if not exists operador_id uuid references public.operadores_operacao(id) on delete set null,
  add column if not exists operador_nome text;

alter table public.operacional_movimentacoes
  add column if not exists email_formalizacao_status text,
  add column if not exists email_formalizacao_em timestamptz;

alter table public.chamados
  add column if not exists email_formalizacao_status text,
  add column if not exists email_formalizacao_em timestamptz;

insert into public.operacional_placas_disponibilidade(ativo_id,placa,status,motivo,origem)
select distinct on (upper(oa.placa)) oa.ativo_id,upper(trim(oa.placa)),'nao','Consta como alocada/locada na base operacional.','alocacao_existente'
from public.operacional_alocacoes oa
where oa.ativo=true and nullif(trim(coalesce(oa.placa,'')),'') is not null
order by upper(oa.placa),oa.updated_at desc
on conflict do nothing;

insert into public.operacional_placas_disponibilidade(ativo_id,placa,status,motivo,origem)
select a.id,upper(trim(a.placa)),'pendente','Disponibilidade ainda nao confirmada no novo fluxo operacional.','cadastro_frota'
from public.ativos a
where a.tipo='veiculo' and nullif(trim(coalesce(a.placa,'')),'') is not null
and not exists(select 1 from public.operacional_placas_disponibilidade d where upper(d.placa)=upper(trim(a.placa)))
on conflict do nothing;
