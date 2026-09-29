alter table public.funcionarios
  add column if not exists experiencia_inicio date,
  add column if not exists experiencia_fim date,
  add column if not exists experiencia_fonte text,
  add column if not exists experiencia_atualizado_em timestamptz;

create table if not exists public.rh_ocorrencias_disciplinares (
  id uuid primary key default gen_random_uuid(),
  funcionario_id uuid not null references public.funcionarios(id) on delete cascade,
  data_ocorrencia date not null default current_date,
  tipo text not null check (tipo in ('falta','atraso','indisciplina','insubordinacao','abandono_posto','equipamento','procedimento','conduta','outro')),
  descricao text not null,
  medida text not null default 'nenhuma' check (medida in ('nenhuma','orientacao','advertencia','suspensao','outro')),
  motivo_decisao text,
  testemunhas text,
  evidencias text,
  relacionado_atestado_id uuid references public.atestados(id) on delete set null,
  status text not null default 'ativo' check (status in ('ativo','retificado','cancelado')),
  created_by uuid,
  created_by_nome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_rh_ocorrencias_func_data on public.rh_ocorrencias_disciplinares(funcionario_id,data_ocorrencia desc,created_at desc);

create table if not exists public.rh_ocorrencias_disciplinares_eventos (
  id uuid primary key default gen_random_uuid(),
  ocorrencia_id uuid not null references public.rh_ocorrencias_disciplinares(id) on delete cascade,
  acao text not null,
  motivo text,
  antes jsonb,
  depois jsonb,
  user_id uuid,
  user_nome text,
  created_at timestamptz not null default now()
);
create index if not exists idx_rh_ocorrencias_eventos on public.rh_ocorrencias_disciplinares_eventos(ocorrencia_id,created_at desc);

alter table public.rh_ocorrencias_disciplinares enable row level security;
alter table public.rh_ocorrencias_disciplinares_eventos enable row level security;

drop policy if exists rh_ocorrencias_select on public.rh_ocorrencias_disciplinares;
create policy rh_ocorrencias_select on public.rh_ocorrencias_disciplinares for select to authenticated
using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'diretor_geral') or public.has_role(auth.uid(),'rh') or public.has_role(auth.uid(),'filial'));
drop policy if exists rh_ocorrencias_insert on public.rh_ocorrencias_disciplinares;
create policy rh_ocorrencias_insert on public.rh_ocorrencias_disciplinares for insert to authenticated
with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'diretor_geral') or public.has_role(auth.uid(),'rh') or public.has_role(auth.uid(),'filial'));
drop policy if exists rh_ocorrencias_update on public.rh_ocorrencias_disciplinares;
create policy rh_ocorrencias_update on public.rh_ocorrencias_disciplinares for update to authenticated
using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'diretor_geral') or public.has_role(auth.uid(),'rh') or public.has_role(auth.uid(),'filial'))
with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'diretor_geral') or public.has_role(auth.uid(),'rh') or public.has_role(auth.uid(),'filial'));

drop policy if exists rh_ocorrencias_eventos_select on public.rh_ocorrencias_disciplinares_eventos;
create policy rh_ocorrencias_eventos_select on public.rh_ocorrencias_disciplinares_eventos for select to authenticated
using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'diretor_geral') or public.has_role(auth.uid(),'rh') or public.has_role(auth.uid(),'filial'));
drop policy if exists rh_ocorrencias_eventos_insert on public.rh_ocorrencias_disciplinares_eventos;
create policy rh_ocorrencias_eventos_insert on public.rh_ocorrencias_disciplinares_eventos for insert to authenticated
with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'diretor_geral') or public.has_role(auth.uid(),'rh') or public.has_role(auth.uid(),'filial'));

grant select,insert,update on public.rh_ocorrencias_disciplinares to authenticated;
grant select,insert on public.rh_ocorrencias_disciplinares_eventos to authenticated;

create or replace function public.rh_registrar_ocorrencia_disciplinar(
  p_funcionario_id uuid,p_data date,p_tipo text,p_descricao text,p_medida text default 'nenhuma',
  p_motivo_decisao text default null,p_testemunhas text default null,p_evidencias text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_id uuid;v_nome text;
begin
  if auth.uid() is null then return jsonb_build_object('ok',false,'error','nao_autenticado'); end if;
  if not (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'diretor_geral') or public.has_role(auth.uid(),'rh') or public.has_role(auth.uid(),'filial'))
    then return jsonb_build_object('ok',false,'error','sem_permissao'); end if;
  if trim(coalesce(p_descricao,''))='' then return jsonb_build_object('ok',false,'error','descricao_obrigatoria'); end if;
  if p_tipo not in ('falta','atraso','indisciplina','insubordinacao','abandono_posto','equipamento','procedimento','conduta','outro')
    then return jsonb_build_object('ok',false,'error','tipo_invalido'); end if;
  if p_medida not in ('nenhuma','orientacao','advertencia','suspensao','outro')
    then return jsonb_build_object('ok',false,'error','medida_invalida'); end if;
  select coalesce(nome_completo,email) into v_nome from public.profiles where user_id=auth.uid();
  insert into public.rh_ocorrencias_disciplinares(funcionario_id,data_ocorrencia,tipo,descricao,medida,motivo_decisao,testemunhas,evidencias,created_by,created_by_nome)
  values(p_funcionario_id,coalesce(p_data,current_date),p_tipo,left(trim(p_descricao),4000),p_medida,
    nullif(trim(coalesce(p_motivo_decisao,'')),''),nullif(trim(coalesce(p_testemunhas,'')),''),nullif(trim(coalesce(p_evidencias,'')),''),
    auth.uid(),coalesce(v_nome,'Usuário')) returning id into v_id;
  insert into public.rh_ocorrencias_disciplinares_eventos(ocorrencia_id,acao,depois,user_id,user_nome)
  select v_id,'criado',to_jsonb(o),auth.uid(),coalesce(v_nome,'Usuário') from public.rh_ocorrencias_disciplinares o where o.id=v_id;
  return jsonb_build_object('ok',true,'id',v_id);
end $$;
revoke all on function public.rh_registrar_ocorrencia_disciplinar(uuid,date,text,text,text,text,text,text) from public,anon;
grant execute on function public.rh_registrar_ocorrencia_disciplinar(uuid,date,text,text,text,text,text,text) to authenticated;

create or replace function public.rh_retificar_ocorrencia_disciplinar(
  p_ocorrencia_id uuid,p_motivo text,p_descricao text default null,p_medida text default null,p_motivo_decisao text default null,p_status text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_before jsonb;v_after jsonb;v_nome text;
begin
  if auth.uid() is null then return jsonb_build_object('ok',false,'error','nao_autenticado'); end if;
  if not (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'diretor_geral') or public.has_role(auth.uid(),'rh') or public.has_role(auth.uid(),'filial'))
    then return jsonb_build_object('ok',false,'error','sem_permissao'); end if;
  if length(trim(coalesce(p_motivo,'')))<3 then return jsonb_build_object('ok',false,'error','motivo_obrigatorio'); end if;
  select to_jsonb(o) into v_before from public.rh_ocorrencias_disciplinares o where id=p_ocorrencia_id;
  if v_before is null then return jsonb_build_object('ok',false,'error','nao_encontrado'); end if;
  update public.rh_ocorrencias_disciplinares set
    descricao=coalesce(nullif(trim(coalesce(p_descricao,'')),''),descricao),
    medida=coalesce(nullif(trim(coalesce(p_medida,'')),''),medida),
    motivo_decisao=coalesce(nullif(trim(coalesce(p_motivo_decisao,'')),''),motivo_decisao),
    status=coalesce(nullif(trim(coalesce(p_status,'')),''),status),updated_at=now()
  where id=p_ocorrencia_id;
  select to_jsonb(o) into v_after from public.rh_ocorrencias_disciplinares o where id=p_ocorrencia_id;
  select coalesce(nome_completo,email) into v_nome from public.profiles where user_id=auth.uid();
  insert into public.rh_ocorrencias_disciplinares_eventos(ocorrencia_id,acao,motivo,antes,depois,user_id,user_nome)
  values(p_ocorrencia_id,'retificado',trim(p_motivo),v_before,v_after,auth.uid(),coalesce(v_nome,'Usuário'));
  return jsonb_build_object('ok',true);
end $$;
revoke all on function public.rh_retificar_ocorrencia_disciplinar(uuid,text,text,text,text,text) from public,anon;
grant execute on function public.rh_retificar_ocorrencia_disciplinar(uuid,text,text,text,text,text) to authenticated;
