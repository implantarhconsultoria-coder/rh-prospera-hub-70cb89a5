-- Etapa preparatória: sessões pessoais para mecanicos (nao altera o login atual ate enforcement=true).
-- Nao ligar enforcement antes do novo frontend estar publicado e testado.
create table if not exists public.app_mecanico_sessao_config (
  id integer primary key default 1 check(id=1),
  enforcement boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.app_mecanico_sessao_config(id,enforcement) values (1,false)
  on conflict (id) do nothing;
alter table public.app_mecanico_sessao_config enable row level security;
revoke all on public.app_mecanico_sessao_config from public,anon,authenticated;

create table if not exists public.app_mecanico_sessoes (
  id uuid primary key default gen_random_uuid(),
  acesso_id uuid not null references public.acessos_externos(id) on delete cascade,
  token_hash text not null unique,
  criada_em timestamptz not null default now(),
  expira_em timestamptz not null,
  revogada_em timestamptz null
);
create index if not exists app_mecanico_sessoes_acesso_idx on public.app_mecanico_sessoes(acesso_id,expira_em);
alter table public.app_mecanico_sessoes enable row level security;
revoke all on public.app_mecanico_sessoes from public,anon,authenticated;

create table if not exists public.app_mecanico_login_limites (
  cpf_hash text primary key,
  falhas integer not null default 0,
  atualizado_em timestamptz not null default now(),
  bloqueado_ate timestamptz
);
alter table public.app_mecanico_login_limites enable row level security;
revoke all on public.app_mecanico_login_limites from public,anon,authenticated;

create or replace function public.app_mecanico_abrir_sessao(p_cpf text,p_nascimento date,p_pin text)
returns jsonb language plpgsql security definer set search_path to 'public'
as $fn$
declare
  v_cpf text := regexp_replace(coalesce(p_cpf,''),'[^0-9]','','g');
  v_pin text := regexp_replace(coalesce(p_pin,''),'[^0-9]','','g');
  v_cpf_hash text;
  v_limit public.app_mecanico_login_limites;
  v_acesso uuid;
  v_token text;
begin
  if length(v_cpf)<>11 or length(v_pin)<>4 or p_nascimento is null
     or p_nascimento>current_date or p_nascimento<date '1900-01-01' then
    return jsonb_build_object('ok',false,'error','credenciais_invalidas');
  end if;

  v_cpf_hash:=encode(extensions.digest(v_cpf,'sha256'),'hex');
  insert into public.app_mecanico_login_limites(cpf_hash)
    values(v_cpf_hash) on conflict(cpf_hash) do nothing;
  select * into v_limit from public.app_mecanico_login_limites
    where cpf_hash=v_cpf_hash for update;
  if v_limit.bloqueado_ate>now() then
    return jsonb_build_object('ok',false,'error','tentativas_excedidas');
  end if;

  select a.id into v_acesso
  from public.acessos_externos a
  join public.funcionarios f on f.id=a.funcionario_id
  where a.cpf_clean=v_cpf
    and a.pin=v_pin
    and f.data_nascimento=p_nascimento
    and a.modulo='mecanico'
    and a.status='ativo'
    and a.acesso_liberado=true
    and coalesce(a.ativo,true)=true
  order by a.created_at desc
  limit 1;

  if v_acesso is null then
    update public.app_mecanico_login_limites
    set falhas=case when atualizado_em<now()-interval '15 minutes' then 1 else falhas+1 end,
        atualizado_em=now(),
        bloqueado_ate=case
          when (case when atualizado_em<now()-interval '15 minutes' then 1 else falhas+1 end)>=6
          then now()+interval '15 minutes'
          else null end
    where cpf_hash=v_cpf_hash;
    return jsonb_build_object('ok',false,'error','credenciais_invalidas');
  end if;

  update public.app_mecanico_login_limites
    set falhas=0,atualizado_em=now(),bloqueado_ate=null where cpf_hash=v_cpf_hash;

  v_token:=encode(extensions.gen_random_bytes(32),'hex');
  insert into public.app_mecanico_sessoes(acesso_id,token_hash,expira_em)
  values(v_acesso,encode(extensions.digest(v_token,'sha256'),'hex'),now()+interval '12 hours');
  return jsonb_build_object('ok',true,'acesso_id',v_acesso,'token',v_token,'expires_in_seconds',43200);
end;
$fn$;

create or replace function public.app_mecanico_encerrar_sessao(p_token text)
returns jsonb language plpgsql security definer set search_path to 'public'
as $fn$
begin
 if length(coalesce(p_token,''))=64 and p_token ~ '^[0-9a-f]{64}$' then
   update public.app_mecanico_sessoes
      set revogada_em=now()
    where token_hash=encode(extensions.digest(p_token,'sha256'),'hex')
      and revogada_em is null;
 end if;
 return jsonb_build_object('ok',true);
end;
$fn$;

create or replace function public._app_mecanico_get_acesso(p_acesso_id uuid)
returns public.acessos_externos language plpgsql security definer set search_path to 'public'
as $fn$
declare
 v public.acessos_externos;
 v_enforce boolean;
 v_header text;
 v_token text;
begin
 select enforcement into v_enforce from public.app_mecanico_sessao_config where id=1;
 -- x-client-info e um header ja autorizado pela API, e o token nunca aparece em URL.
 v_header:=coalesce((coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb)->>'x-client-info','');
 v_token:=substring(v_header from 'mec-session=([0-9a-f]{64})');
 if coalesce(v_enforce,false) or v_token is not null then
   if v_token is null or not exists (
     select 1 from public.app_mecanico_sessoes s
     where s.acesso_id=p_acesso_id
       and s.token_hash=encode(extensions.digest(v_token,'sha256'),'hex')
       and s.expira_em>now()
       and s.revogada_em is null
   ) then raise exception 'acesso_nao_autorizado'; end if;
 end if;
 select * into v from public.acessos_externos
  where id=p_acesso_id
    and modulo='mecanico'
    and status='ativo'
    and acesso_liberado=true
    and coalesce(ativo,true)=true
  limit 1;
 if not found then raise exception 'acesso_nao_autorizado'; end if;
 return v;
end;
$fn$;

-- Impede que o login legado por 4 digitos revele nomes/IDs quando a chave estiver ativada.
CREATE OR REPLACE FUNCTION public.acesso_externo_validar_pin(p_pin text, p_modulo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pin text;
  v_count int;
  v_blocked_count int;
  v_result jsonb;
BEGIN
  IF p_modulo='mecanico' AND EXISTS (
    SELECT 1 FROM public.app_mecanico_sessao_config WHERE id=1 AND enforcement=true
  ) THEN
    RETURN jsonb_build_object('ok',false,'error','usar_login_individual');
  END IF;
  v_pin := regexp_replace(COALESCE(p_pin, ''), '[^0-9]', '', 'g');
  IF length(v_pin) <> 4 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'pin_invalido');
  END IF;

  SELECT count(*) INTO v_blocked_count
    FROM public.acessos_externos
   WHERE pin = v_pin
     AND modulo = p_modulo
     AND (status = 'bloqueado' OR acesso_liberado = false OR ativo = false);

  SELECT count(*) INTO v_count
    FROM public.acessos_externos
   WHERE pin = v_pin
     AND modulo = p_modulo
     AND status = 'ativo'
     AND acesso_liberado = true
     AND COALESCE(ativo, true) = true;

  IF v_count = 0 THEN
    IF v_blocked_count > 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'bloqueado');
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'pin_nao_encontrado');
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'id', id,
    'nome', nome,
    'empresa', COALESCE(empresa, ''),
    'filial', COALESCE(filial, ''),
    'funcao', COALESCE(funcao, ''),
    'perfil_acesso', perfil_acesso,
    'funcionario_id', funcionario_id
  ) ORDER BY nome)
    INTO v_result
    FROM public.acessos_externos
   WHERE pin = v_pin
     AND modulo = p_modulo
     AND status = 'ativo'
     AND acesso_liberado = true
     AND COALESCE(ativo, true) = true;

  RETURN jsonb_build_object('ok', true, 'count', v_count, 'usuarios', COALESCE(v_result, '[]'::jsonb));
END;
$function$
;
