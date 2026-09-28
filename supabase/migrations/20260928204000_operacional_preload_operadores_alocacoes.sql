-- Evolucao do Operacional para pre-cadastro de operadores e alocacoes de clientes.
-- Mantem a base atual e apenas complementa relacionamentos.

alter table public.operadores_operacao
  add column if not exists empresa_id uuid references public.empresas(id) on delete set null,
  add column if not exists origem_cadastro text;

create unique index if not exists idx_operadores_operacao_funcionario_unique
  on public.operadores_operacao(funcionario_id)
  where funcionario_id is not null;

create table if not exists public.operacional_alocacoes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes_fat(id) on delete cascade,
  cliente_local_id uuid references public.cliente_locais_operacionais(id) on delete set null,
  ativo_id uuid references public.ativos(id) on delete set null,
  placa text not null,
  patrimonio text,
  fonte text,
  fonte_arquivo text,
  fonte_pagina integer,
  data_base date,
  origem text not null default 'operacional',
  observacao text,
  alerta_conferencia boolean not null default false,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_operacional_alocacoes_placa_ativa
  on public.operacional_alocacoes(upper(placa))
  where ativo = true;

create index if not exists idx_operacional_alocacoes_cliente
  on public.operacional_alocacoes(cliente_id, ativo);

create index if not exists idx_operacional_alocacoes_local
  on public.operacional_alocacoes(cliente_local_id, ativo);

create index if not exists idx_operacional_alocacoes_ativo
  on public.operacional_alocacoes(ativo_id);

alter table public.operacional_alocacoes enable row level security;

drop policy if exists operacional_alocacoes_select on public.operacional_alocacoes;
create policy operacional_alocacoes_select on public.operacional_alocacoes
for select to authenticated
using (public.usuario_tem_modulo_operacional('operacional'));

grant select on public.operacional_alocacoes to authenticated;

alter table public.chamados
  add column if not exists alocacao_id uuid references public.operacional_alocacoes(id) on delete set null,
  add column if not exists placa_snapshot text,
  add column if not exists patrimonio_snapshot text;

create index if not exists idx_chamados_alocacao_id on public.chamados(alocacao_id);

create or replace function public.operador_operacao_definir_email(
  p_operador_id uuid,
  p_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  if not public.operador_operacao_is_admin() then
    return jsonb_build_object('ok', false, 'error', 'sem_permissao');
  end if;

  v_email := lower(trim(coalesce(p_email,'')));
  if v_email = '' or position('@' in v_email) < 2 then
    return jsonb_build_object('ok', false, 'error', 'email_invalido');
  end if;

  if exists (
    select 1
    from public.operadores_operacao
    where lower(coalesce(email,'')) = v_email
      and id <> p_operador_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'email_ja_vinculado');
  end if;

  update public.operadores_operacao
  set email = v_email,
      updated_at = now()
  where id = p_operador_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'operador_nao_encontrado');
  end if;

  return jsonb_build_object('ok', true, 'email', v_email);
end;
$$;

revoke all on function public.operador_operacao_definir_email(uuid, text) from public, anon;
grant execute on function public.operador_operacao_definir_email(uuid, text) to authenticated;

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

  v_email := lower(coalesce(
    nullif(trim(v_profile.email_corporativo), ''),
    nullif(trim(v_profile.email), ''),
    nullif(trim(auth.jwt()->>'email'), '')
  ));
  v_nome := coalesce(
    nullif(trim(v_profile.nome_completo), ''),
    split_part(coalesce(v_email,'Operador'), '@', 1),
    'Operador'
  );

  select * into v_operador
  from public.operadores_operacao o
  where o.user_id = v_uid
     or (v_email is not null and lower(coalesce(o.email,'')) = v_email)
  order by case when o.user_id = v_uid then 0 else 1 end
  limit 1;

  if v_operador.id is not null then
    update public.operadores_operacao
    set user_id = v_uid,
        nome = coalesce(nullif(v_operador.nome,''), v_nome),
        email = coalesce(v_email, v_operador.email),
        cargo = coalesce(v_operador.cargo, v_profile.cargo),
        filial = coalesce(v_operador.filial, v_profile.filial),
        modulos = case
          when p_modulo = any(v_operador.modulos) then v_operador.modulos
          else v_operador.modulos || p_modulo
        end,
        updated_at = now()
    where id = v_operador.id
    returning * into v_operador;
  else
    insert into public.operadores_operacao(user_id, nome, email, cargo, filial, modulos, created_by, origem_cadastro)
    values (v_uid, v_nome, v_email, v_profile.cargo, v_profile.filial, array[p_modulo]::text[], v_uid, 'primeiro_acesso')
    returning * into v_operador;
  end if;

  return jsonb_build_object(
    'ok', true,
    'operador', jsonb_build_object(
      'id', v_operador.id,
      'nome', v_operador.nome,
      'email', v_operador.email,
      'cargo', v_operador.cargo,
      'filial', v_operador.filial,
      'empresa_id', v_operador.empresa_id,
      'modulos', v_operador.modulos,
      'ativo', v_operador.ativo,
      'codigo_emitido', v_operador.codigo_hash is not null,
      'codigo_hint', v_operador.codigo_hint
    )
  );
end;
$$;

revoke all on function public.operador_operacao_garantir_self(text) from public, anon;
grant execute on function public.operador_operacao_garantir_self(text) to authenticated;

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
    'cargo', coalesce(o.cargo, f.cargo),
    'filial', o.filial,
    'empresa_id', o.empresa_id,
    'empresa_nome', e.nome,
    'cpf_cadastrado', nullif(regexp_replace(coalesce(f.cpf,''),'[^0-9]','','g'),'') is not null,
    'cpf_final', right(regexp_replace(coalesce(f.cpf,''),'[^0-9]','','g'), 4),
    'modulos', o.modulos,
    'ativo', o.ativo,
    'codigo_emitido', o.codigo_hash is not null,
    'codigo_hint', o.codigo_hint,
    'codigo_emitido_em', o.codigo_emitido_em,
    'origem_cadastro', o.origem_cadastro,
    'created_at', o.created_at
  ) order by o.nome), '[]'::jsonb)
  into v_result
  from public.operadores_operacao o
  left join public.funcionarios f on f.id = o.funcionario_id
  left join public.empresas e on e.id = coalesce(o.empresa_id, f.company_id, f.empresa_id);

  return jsonb_build_object('ok', true, 'operadores', v_result);
end;
$$;

revoke all on function public.operador_operacao_listar() from public, anon;
grant execute on function public.operador_operacao_listar() to authenticated;
