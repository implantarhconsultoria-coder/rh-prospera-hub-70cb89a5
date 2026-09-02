create table if not exists public.abastecimento_autorizacoes (
  id uuid primary key default gen_random_uuid(),
  app_request_id text not null unique,
  funcionario_id uuid references public.funcionarios(id) on delete set null,
  employee_code text,
  funcionario_nome text not null,
  company_id uuid references public.empresas(id) on delete set null,
  empresa_nome text,
  filial text,
  placa text,
  combustivel text,
  posto_nome text,
  solicitado_em timestamptz not null default now(),
  status text not null default 'pendente' check (status in ('pendente','autorizado','negado','concluido')),
  autorizado boolean not null default false,
  autorizado_em timestamptz,
  autorizado_por uuid,
  autorizado_por_nome text,
  categoria text not null default 'Abastecimento Normal' check (categoria in ('Abastecimento Normal','Abastecimento Viagem')),
  fora_expediente boolean not null default false,
  fim_semana boolean not null default false,
  tipo_hora_extra text check (tipo_hora_extra in ('he50','he100')),
  hora_extra_inicio timestamptz,
  hora_extra_fim timestamptz,
  hora_extra_minutos integer not null default 0,
  app_fuel_id text,
  concluido_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.abastecimento_acompanhantes (
  id uuid primary key default gen_random_uuid(),
  autorizacao_id uuid not null references public.abastecimento_autorizacoes(id) on delete cascade,
  app_request_id text not null,
  funcionario_id uuid references public.funcionarios(id) on delete set null,
  acompanhante_id uuid not null references public.funcionarios(id) on delete restrict,
  acompanhante_nome text not null,
  company_id uuid references public.empresas(id) on delete set null,
  empresa_nome text,
  created_at timestamptz not null default now(),
  unique (app_request_id, acompanhante_id)
);

create table if not exists public.horas_extras_operacionais (
  id uuid primary key default gen_random_uuid(),
  autorizacao_id uuid not null references public.abastecimento_autorizacoes(id) on delete cascade,
  app_request_id text not null,
  funcionario_id uuid references public.funcionarios(id) on delete set null,
  company_id uuid references public.empresas(id) on delete set null,
  inicio_em timestamptz not null,
  fim_em timestamptz not null,
  minutos integer not null default 0,
  horas numeric(10,2) not null default 0,
  tipo_folha text not null check (tipo_folha in ('he50','he100')),
  origem text not null default 'abastecimento_viagem',
  automatico boolean not null default true,
  movimento_diario_id uuid references public.movimento_diario(id) on delete set null,
  status text not null default 'calculada' check (status in ('calculada','enviada_folha','cancelada')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (app_request_id, funcionario_id)
);

alter table public.abastecimentos add column if not exists app_request_id text;
alter table public.abastecimentos add column if not exists autorizacao_id uuid references public.abastecimento_autorizacoes(id) on delete set null;
alter table public.abastecimentos add column if not exists categoria_operacional text default 'Abastecimento Normal';
alter table public.abastecimentos add column if not exists fim_semana boolean not null default false;
alter table public.abastecimentos add column if not exists fora_expediente boolean not null default false;
alter table public.abastecimentos add column if not exists hora_extra_minutos integer not null default 0;
alter table public.abastecimentos add column if not exists acompanhantes jsonb not null default '[]'::jsonb;
create unique index if not exists abastecimentos_app_request_id_uidx on public.abastecimentos(app_request_id) where app_request_id is not null;

alter table public.movimento_diario add column if not exists origem text;
alter table public.movimento_diario add column if not exists origem_ref text;
create unique index if not exists movimento_diario_origem_ref_funcionario_uidx on public.movimento_diario(origem, origem_ref, funcionario_id) where origem is not null and origem_ref is not null;

create index if not exists abastecimento_autorizacoes_status_idx on public.abastecimento_autorizacoes(status, solicitado_em desc);
create index if not exists abastecimento_autorizacoes_company_idx on public.abastecimento_autorizacoes(company_id, solicitado_em desc);
create index if not exists abastecimento_acompanhantes_request_idx on public.abastecimento_acompanhantes(app_request_id);

alter table public.abastecimento_autorizacoes enable row level security;
alter table public.abastecimento_acompanhantes enable row level security;
alter table public.horas_extras_operacionais enable row level security;

drop policy if exists abastecimento_autorizacoes_admin_all on public.abastecimento_autorizacoes;
create policy abastecimento_autorizacoes_admin_all on public.abastecimento_autorizacoes for all to authenticated using (has_role(auth.uid(), 'admin'::text)) with check (has_role(auth.uid(), 'admin'::text));
drop policy if exists abastecimento_acompanhantes_admin_all on public.abastecimento_acompanhantes;
create policy abastecimento_acompanhantes_admin_all on public.abastecimento_acompanhantes for all to authenticated using (has_role(auth.uid(), 'admin'::text)) with check (has_role(auth.uid(), 'admin'::text));
drop policy if exists horas_extras_operacionais_admin_all on public.horas_extras_operacionais;
create policy horas_extras_operacionais_admin_all on public.horas_extras_operacionais for all to authenticated using (has_role(auth.uid(), 'admin'::text)) with check (has_role(auth.uid(), 'admin'::text));

create or replace function public.topac_classificar_autorizacao_abastecimento()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_local timestamp; v_dow integer; v_time time;
begin
  new.updated_at := now();
  if new.status = 'autorizado' and (old.status is distinct from 'autorizado' or new.autorizado_em is distinct from old.autorizado_em) then
    new.autorizado := true;
    new.autorizado_em := coalesce(new.autorizado_em, now());
    v_local := new.autorizado_em at time zone 'America/Sao_Paulo';
    v_dow := extract(isodow from v_local);
    v_time := v_local::time;
    new.fim_semana := v_dow in (6,7);
    new.fora_expediente := new.fim_semana or v_time < time '08:00'
      or (v_dow between 1 and 4 and v_time >= time '17:30')
      or (v_dow = 5 and v_time >= time '16:30');
    if new.fora_expediente then
      new.categoria := 'Abastecimento Viagem';
      new.hora_extra_inicio := new.autorizado_em;
      new.tipo_hora_extra := case when new.fim_semana then 'he100' else 'he50' end;
    else
      new.categoria := 'Abastecimento Normal';
      new.hora_extra_inicio := null;
      new.tipo_hora_extra := null;
    end if;
  elsif new.status = 'negado' then
    new.autorizado := false;
    new.hora_extra_inicio := null;
    new.tipo_hora_extra := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_topac_classificar_autorizacao_abastecimento on public.abastecimento_autorizacoes;
create trigger trg_topac_classificar_autorizacao_abastecimento before update on public.abastecimento_autorizacoes for each row execute function public.topac_classificar_autorizacao_abastecimento();

create or replace function public.topac_decidir_abastecimento(p_id uuid, p_decisao text)
returns public.abastecimento_autorizacoes language plpgsql security definer set search_path = public as $$
declare v_row public.abastecimento_autorizacoes; v_name text;
begin
  if not has_role(auth.uid(), 'admin'::text) then raise exception 'Acesso administrativo obrigatório'; end if;
  if lower(p_decisao) not in ('autorizar','negar') then raise exception 'Decisão inválida'; end if;
  select coalesce(raw_user_meta_data->>'nome_completo', raw_user_meta_data->>'full_name', email, 'Administrador') into v_name from auth.users where id = auth.uid();
  update public.abastecimento_autorizacoes set
    status = case when lower(p_decisao)='autorizar' then 'autorizado' else 'negado' end,
    autorizado_em = case when lower(p_decisao)='autorizar' then now() else autorizado_em end,
    autorizado_por = auth.uid(), autorizado_por_nome = coalesce(v_name,'Administrador'), updated_at = now()
  where id = p_id and status = 'pendente' returning * into v_row;
  if v_row.id is null then select * into v_row from public.abastecimento_autorizacoes where id = p_id; end if;
  return v_row;
end;
$$;

create or replace function public.topac_concluir_abastecimento_operacional(p_app_request_id text, p_app_fuel_id text, p_payload jsonb)
returns public.abastecimento_autorizacoes language plpgsql security definer set search_path = public as $$
declare
  v_auth public.abastecimento_autorizacoes;
  v_end timestamptz := coalesce(nullif(p_payload->>'iso','')::timestamptz, now());
  v_minutes integer := 0; v_hours numeric(10,2) := 0; v_move_id uuid; v_he_id uuid;
  v_companions jsonb := '[]'::jsonb; v_date date; v_time time; v_competencia text;
begin
  if coalesce(auth.role(),'') <> 'service_role' and not has_role(auth.uid(), 'admin'::text) then raise exception 'Integração não autorizada'; end if;
  select * into v_auth from public.abastecimento_autorizacoes where app_request_id = p_app_request_id for update;
  if v_auth.id is null then raise exception 'Autorização operacional não encontrada'; end if;
  if v_auth.status not in ('autorizado','concluido') then raise exception 'Abastecimento sem autorização ativa'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',acompanhante_id,'nome',acompanhante_nome) order by acompanhante_nome),'[]'::jsonb) into v_companions from public.abastecimento_acompanhantes where app_request_id = p_app_request_id;
  if v_auth.hora_extra_inicio is not null then v_minutes := greatest(0, floor(extract(epoch from (v_end - v_auth.hora_extra_inicio))/60)::integer); v_hours := round((v_minutes::numeric / 60),2); end if;
  v_date := (v_end at time zone 'America/Sao_Paulo')::date; v_time := (v_end at time zone 'America/Sao_Paulo')::time; v_competencia := to_char(v_date,'YYYY-MM');
  insert into public.abastecimentos (app_request_id,autorizacao_id,funcionario_id,mecanico_nome,empresa,filial,placa,data,hora,competencia,combustivel,valor,litros,valor_por_litro,km_atual,posto_nome,posto_cnpj,posto_endereco,latitude,longitude,endereco,observacao,status,preenchimento,validado_por,categoria_operacional,fim_semana,fora_expediente,hora_extra_minutos,acompanhantes)
  values (p_app_request_id,v_auth.id,v_auth.funcionario_id,v_auth.funcionario_nome,v_auth.empresa_nome,v_auth.filial,coalesce(p_payload->>'placa',v_auth.placa),v_date,v_time,v_competencia,coalesce(p_payload->>'combustivel',v_auth.combustivel),coalesce((p_payload->>'total')::numeric,0),coalesce((p_payload->>'litros')::numeric,0),nullif(p_payload->>'preco','')::numeric,nullif(p_payload->>'km','')::numeric,coalesce(p_payload->>'posto_nome',v_auth.posto_nome),p_payload->>'posto_cnpj',p_payload->>'posto_endereco',nullif(p_payload->>'latitude','')::double precision,nullif(p_payload->>'longitude','')::double precision,p_payload->>'endereco','Fechamento automático pelo App dos Mecânicos','concluido','app_mecanicos',coalesce(v_auth.autorizado_por_nome,'TOPAC ADM'),v_auth.categoria,v_auth.fim_semana,v_auth.fora_expediente,v_minutes,v_companions)
  on conflict (app_request_id) where app_request_id is not null do update set autorizacao_id=excluded.autorizacao_id,funcionario_id=excluded.funcionario_id,mecanico_nome=excluded.mecanico_nome,empresa=excluded.empresa,filial=excluded.filial,placa=excluded.placa,data=excluded.data,hora=excluded.hora,competencia=excluded.competencia,combustivel=excluded.combustivel,valor=excluded.valor,litros=excluded.litros,valor_por_litro=excluded.valor_por_litro,km_atual=excluded.km_atual,posto_nome=excluded.posto_nome,posto_cnpj=excluded.posto_cnpj,posto_endereco=excluded.posto_endereco,latitude=excluded.latitude,longitude=excluded.longitude,endereco=excluded.endereco,status='concluido',categoria_operacional=excluded.categoria_operacional,fim_semana=excluded.fim_semana,fora_expediente=excluded.fora_expediente,hora_extra_minutos=excluded.hora_extra_minutos,acompanhantes=excluded.acompanhantes,updated_at=now();
  if v_minutes > 0 and v_auth.funcionario_id is not null and v_auth.company_id is not null and v_auth.tipo_hora_extra is not null then
    insert into public.movimento_diario(company_id,funcionario_id,competencia,data,tipo,quantidade,valor,observacao,registrado_por_nome,origem,origem_ref)
    values(v_auth.company_id,v_auth.funcionario_id,v_competencia,(v_auth.hora_extra_inicio at time zone 'America/Sao_Paulo')::date,v_auth.tipo_hora_extra,v_hours,0,'Hora extra automática — '||v_auth.categoria||' — autorização '||p_app_request_id,'Sistema TOPAC / App Mecânicos','abastecimento_viagem',p_app_request_id)
    on conflict (origem,origem_ref,funcionario_id) where origem is not null and origem_ref is not null do update set quantidade=excluded.quantidade,observacao=excluded.observacao,updated_at=now() returning id into v_move_id;
    insert into public.horas_extras_operacionais(autorizacao_id,app_request_id,funcionario_id,company_id,inicio_em,fim_em,minutos,horas,tipo_folha,movimento_diario_id,status)
    values(v_auth.id,p_app_request_id,v_auth.funcionario_id,v_auth.company_id,v_auth.hora_extra_inicio,v_end,v_minutes,v_hours,v_auth.tipo_hora_extra,v_move_id,'enviada_folha')
    on conflict (app_request_id,funcionario_id) do update set fim_em=excluded.fim_em,minutos=excluded.minutos,horas=excluded.horas,tipo_folha=excluded.tipo_folha,movimento_diario_id=excluded.movimento_diario_id,status='enviada_folha',updated_at=now() returning id into v_he_id;
  end if;
  update public.abastecimento_autorizacoes set status='concluido',app_fuel_id=p_app_fuel_id,concluido_em=v_end,hora_extra_fim=case when hora_extra_inicio is not null then v_end else null end,hora_extra_minutos=v_minutes,updated_at=now() where id=v_auth.id returning * into v_auth;
  return v_auth;
end;
$$;

grant execute on function public.topac_decidir_abastecimento(uuid,text) to authenticated;
grant execute on function public.topac_concluir_abastecimento_operacional(text,text,jsonb) to service_role;
revoke execute on function public.topac_concluir_abastecimento_operacional(text,text,jsonb) from anon, authenticated;
