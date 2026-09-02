-- TOPAC RH PRO
-- Localização operacional dos mecânicos: somente o último sinal por acesso.
-- A tabela não mantém trilha histórica para reduzir volume e exposição de dados.

create table if not exists public.app_mecanico_localizacao_atual (
  acesso_id uuid primary key references public.acessos_externos(id) on delete cascade,
  funcionario_id uuid null,
  nome text not null,
  empresa text null,
  filial text null,
  latitude numeric(10, 7) not null check (latitude between -90 and 90),
  longitude numeric(10, 7) not null check (longitude between -180 and 180),
  precisao_metros numeric(10, 2) null check (precisao_metros is null or precisao_metros >= 0),
  velocidade_mps numeric(10, 2) null check (velocidade_mps is null or velocidade_mps >= 0),
  direcao_graus numeric(7, 2) null check (direcao_graus is null or direcao_graus between 0 and 360),
  em_movimento boolean not null default false,
  origem text not null default 'web_foreground'
    check (origem in ('web_foreground', 'native_foreground', 'native_background')),
  consentimento_versao text not null,
  consentimento_em timestamptz not null default now(),
  ultimo_sinal_timestamp timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on table public.app_mecanico_localizacao_atual is
  'Último sinal operacional de cada mecânico. Sem histórico de deslocamentos.';
comment on column public.app_mecanico_localizacao_atual.consentimento_em is
  'Primeiro envio realizado após autorização explícita no TOPAC Field.';

create index if not exists idx_app_mecanico_localizacao_ultimo_sinal
  on public.app_mecanico_localizacao_atual (ultimo_sinal_timestamp desc);

alter table public.app_mecanico_localizacao_atual enable row level security;
revoke all on public.app_mecanico_localizacao_atual from public, anon, authenticated;
grant select on public.app_mecanico_localizacao_atual to authenticated;

drop policy if exists app_mecanico_localizacao_central_select
  on public.app_mecanico_localizacao_atual;
create policy app_mecanico_localizacao_central_select
  on public.app_mecanico_localizacao_atual
  for select
  to authenticated
  using (
    public.topac_has_any_role(
      array['admin', 'diretor_geral', 'operacional'],
      (select auth.uid())
    )
  );

create or replace function public.app_mecanico_registrar_localizacao(
  p_acesso_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_precisao_metros double precision default null,
  p_velocidade_mps double precision default null,
  p_direcao_graus double precision default null,
  p_origem text default 'web_foreground',
  p_consentimento_versao text default 'topac-localizacao-operacional-2026-08-v1'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_acesso public.acessos_externos;
  v_existing public.app_mecanico_localizacao_atual;
  v_distance_meters double precision := 0;
  v_elapsed_seconds double precision := 999999;
  v_origin text;
begin
  if p_latitude is null or p_latitude < -90 or p_latitude > 90
     or p_longitude is null or p_longitude < -180 or p_longitude > 180 then
    return jsonb_build_object('ok', false, 'error', 'coordenadas_invalidas');
  end if;

  if coalesce(btrim(p_consentimento_versao), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'consentimento_ausente');
  end if;

  begin
    v_acesso := public._app_mecanico_get_acesso(p_acesso_id);
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'acesso_nao_autorizado');
  end;

  v_origin := case
    when p_origem in ('web_foreground', 'native_foreground', 'native_background') then p_origem
    else 'web_foreground'
  end;

  select * into v_existing
  from public.app_mecanico_localizacao_atual
  where acesso_id = p_acesso_id;

  if found then
    v_elapsed_seconds := extract(epoch from (now() - v_existing.ultimo_sinal_timestamp));
    v_distance_meters := 6371000 * 2 * asin(
      sqrt(
        power(sin(radians(p_latitude - v_existing.latitude::double precision) / 2), 2)
        + cos(radians(v_existing.latitude::double precision))
        * cos(radians(p_latitude))
        * power(sin(radians(p_longitude - v_existing.longitude::double precision) / 2), 2)
      )
    );

    -- Proteção complementar contra chamadas excessivas ou repetidas.
    if v_elapsed_seconds < 30 and v_distance_meters < 50 then
      return jsonb_build_object(
        'ok', true,
        'accepted', false,
        'reason', 'throttled',
        'ultimo_sinal_timestamp', v_existing.ultimo_sinal_timestamp
      );
    end if;
  end if;

  insert into public.app_mecanico_localizacao_atual (
    acesso_id,
    funcionario_id,
    nome,
    empresa,
    filial,
    latitude,
    longitude,
    precisao_metros,
    velocidade_mps,
    direcao_graus,
    em_movimento,
    origem,
    consentimento_versao,
    consentimento_em,
    ultimo_sinal_timestamp,
    atualizado_em
  ) values (
    v_acesso.id,
    v_acesso.funcionario_id,
    coalesce(nullif(btrim(v_acesso.nome), ''), 'Mecânico'),
    nullif(btrim(coalesce(v_acesso.empresa, '')), ''),
    nullif(btrim(coalesce(v_acesso.filial, '')), ''),
    p_latitude,
    p_longitude,
    case when p_precisao_metros is null then null else greatest(p_precisao_metros, 0) end,
    case when p_velocidade_mps is null then null else greatest(p_velocidade_mps, 0) end,
    case when p_direcao_graus between 0 and 360 then p_direcao_graus else null end,
    coalesce(p_velocidade_mps, 0) >= 0.8,
    v_origin,
    btrim(p_consentimento_versao),
    now(),
    now(),
    now()
  )
  on conflict (acesso_id) do update set
    funcionario_id = excluded.funcionario_id,
    nome = excluded.nome,
    empresa = excluded.empresa,
    filial = excluded.filial,
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    precisao_metros = excluded.precisao_metros,
    velocidade_mps = excluded.velocidade_mps,
    direcao_graus = excluded.direcao_graus,
    em_movimento = excluded.em_movimento,
    origem = excluded.origem,
    consentimento_versao = excluded.consentimento_versao,
    consentimento_em = public.app_mecanico_localizacao_atual.consentimento_em,
    ultimo_sinal_timestamp = excluded.ultimo_sinal_timestamp,
    atualizado_em = excluded.atualizado_em;

  return jsonb_build_object(
    'ok', true,
    'accepted', true,
    'distance_meters', round(v_distance_meters::numeric, 1),
    'ultimo_sinal_timestamp', now()
  );
end;
$function$;

revoke all on function public.app_mecanico_registrar_localizacao(
  uuid, double precision, double precision, double precision,
  double precision, double precision, text, text
) from public;
grant execute on function public.app_mecanico_registrar_localizacao(
  uuid, double precision, double precision, double precision,
  double precision, double precision, text, text
) to anon, authenticated;

-- Realtime para o painel da Central, respeitando RLS.
do $block$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'app_mecanico_localizacao_atual'
  ) then
    alter publication supabase_realtime add table public.app_mecanico_localizacao_atual;
  end if;
end;
$block$;
