-- Estrutura normalizada para integração GR Tracker / controle de uso fora do expediente.
-- Não contém credenciais nem endpoints inventados. A ingestão real será ligada quando o acesso/API for validado.

create table if not exists public.rastreamento_configuracao (
  provider text primary key,
  status text not null default 'aguardando_acesso',
  timezone text not null default 'America/Sao_Paulo',
  tolerancia_minutos integer not null default 0 check (tolerancia_minutos between 0 and 180),
  ultima_sincronizacao_em timestamptz null,
  observacoes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.rastreamento_configuracao
  add column if not exists regras_ativas boolean not null default false;

insert into public.rastreamento_configuracao (provider, status, timezone, tolerancia_minutos, regras_ativas)
values ('grtracker', 'aguardando_acesso', 'America/Sao_Paulo', 0, false)
on conflict (provider) do nothing;

create table if not exists public.rastreamento_janelas_servico (
  dia_semana smallint primary key check (dia_semana between 0 and 6),
  ativo boolean not null default false,
  hora_inicio time without time zone null,
  hora_fim time without time zone null,
  updated_at timestamptz not null default now(),
  constraint rastreamento_janelas_horarios_validos check (
    (ativo = false) or (hora_inicio is not null and hora_fim is not null)
  )
);

insert into public.rastreamento_janelas_servico (dia_semana, ativo)
select n, false from generate_series(0, 6) as n
on conflict (dia_semana) do nothing;

create table if not exists public.rastreamento_veiculos (
  id uuid primary key default gen_random_uuid(),
  ativo_id uuid null references public.ativos(id) on delete set null,
  provider text not null default 'grtracker',
  external_id text null,
  placa text not null,
  nome_externo text null,
  monitorar boolean not null default true,
  ultima_posicao_em timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rastreamento_veiculos_provider_ativo_unique unique(provider, ativo_id)
);

create unique index if not exists rastreamento_veiculos_provider_external_uidx
  on public.rastreamento_veiculos(provider, external_id)
  where external_id is not null;
create index if not exists rastreamento_veiculos_placa_idx on public.rastreamento_veiculos(upper(placa));

create table if not exists public.rastreamento_eventos (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'grtracker',
  external_event_id text null,
  ativo_id uuid null references public.ativos(id) on delete set null,
  placa text not null,
  tipo text not null,
  ignicao boolean null,
  evento_em timestamptz not null,
  latitude numeric null,
  longitude numeric null,
  endereco text null,
  velocidade_kmh numeric null,
  payload jsonb null,
  recebido_em timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists rastreamento_eventos_provider_external_uidx
  on public.rastreamento_eventos(provider, external_event_id)
  where external_event_id is not null;
create index if not exists rastreamento_eventos_evento_em_idx on public.rastreamento_eventos(evento_em desc);
create index if not exists rastreamento_eventos_placa_idx on public.rastreamento_eventos(upper(placa), evento_em desc);

drop view if exists public.rastreamento_eventos_classificados;
create view public.rastreamento_eventos_classificados
with (security_invoker = true)
as
select
  e.*,
  c.timezone,
  c.tolerancia_minutos,
  j.dia_semana,
  j.ativo as janela_ativa,
  j.hora_inicio,
  j.hora_fim,
  case
    when c.regras_ativas = false then null
    when j.dia_semana is null then null
    when j.ativo = false then true
    when j.hora_inicio is null or j.hora_fim is null then null
    when j.hora_inicio <= j.hora_fim then not (
      (e.evento_em at time zone c.timezone)::time
        between (j.hora_inicio - make_interval(mins => c.tolerancia_minutos))
            and (j.hora_fim + make_interval(mins => c.tolerancia_minutos))
    )
    else not (
      (e.evento_em at time zone c.timezone)::time >= (j.hora_inicio - make_interval(mins => c.tolerancia_minutos))
      or (e.evento_em at time zone c.timezone)::time <= (j.hora_fim + make_interval(mins => c.tolerancia_minutos))
    )
  end as fora_horario,
  (e.evento_em at time zone c.timezone) as evento_em_local,
  c.regras_ativas
from public.rastreamento_eventos e
join public.rastreamento_configuracao c on c.provider = e.provider
left join public.rastreamento_janelas_servico j
  on j.dia_semana = extract(dow from (e.evento_em at time zone c.timezone))::smallint;

alter table public.rastreamento_configuracao enable row level security;
alter table public.rastreamento_janelas_servico enable row level security;
alter table public.rastreamento_veiculos enable row level security;
alter table public.rastreamento_eventos enable row level security;

drop policy if exists rastreamento_config_admin on public.rastreamento_configuracao;
create policy rastreamento_config_admin on public.rastreamento_configuracao
for all to authenticated
using (public._topac_admin_usuario_autorizado())
with check (public._topac_admin_usuario_autorizado());

drop policy if exists rastreamento_janelas_admin on public.rastreamento_janelas_servico;
create policy rastreamento_janelas_admin on public.rastreamento_janelas_servico
for all to authenticated
using (public._topac_admin_usuario_autorizado())
with check (public._topac_admin_usuario_autorizado());

drop policy if exists rastreamento_veiculos_admin on public.rastreamento_veiculos;
create policy rastreamento_veiculos_admin on public.rastreamento_veiculos
for all to authenticated
using (public._topac_admin_usuario_autorizado())
with check (public._topac_admin_usuario_autorizado());

drop policy if exists rastreamento_eventos_admin on public.rastreamento_eventos;
create policy rastreamento_eventos_admin on public.rastreamento_eventos
for select to authenticated
using (public._topac_admin_usuario_autorizado());

grant select, insert, update, delete on public.rastreamento_configuracao to authenticated;
grant select, insert, update, delete on public.rastreamento_janelas_servico to authenticated;
grant select, insert, update, delete on public.rastreamento_veiculos to authenticated;
grant select on public.rastreamento_eventos to authenticated;
grant select on public.rastreamento_eventos_classificados to authenticated;
