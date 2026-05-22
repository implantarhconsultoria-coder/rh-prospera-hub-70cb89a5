-- TOPAC RH PRO - SQL CONSOLIDADO DE RESGATE DO BANCO
-- Data: 2026-05-22
-- Banco oficial alvo: https://djfjnxmbvjgweqzjvqtr.supabase.co
--
-- Cole este arquivo inteiro no Supabase SQL Editor do projeto djfjnxmbvjgweqzjvqtr.
-- Objetivo: aplicar migrations pendentes sem criar telas novas.
-- Este script e idempotente na maior parte: usa IF NOT EXISTS, DROP POLICY IF EXISTS
-- e ON CONFLICT para evitar duplicidades.

begin;

create extension if not exists pgcrypto;

-- Base minima de autenticacao/perfis usada por RLS e telas administrativas.
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  nome_completo text default '',
  email text default '',
  telefone text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role text not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

create index if not exists idx_profiles_user_id on public.profiles(user_id);
create index if not exists idx_user_roles_user_id on public.user_roles(user_id);
create index if not exists idx_user_roles_role on public.user_roles(role);

create or replace function public.topac_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.topac_has_any_role(_roles text[], _user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = _user_id
      and ur.role::text = any(_roles)
  );
$$;

-- =========================================================
-- 1. COMPATIBILIDADE FUNCIONARIOS / EMPRESAS / FECHAMENTO
-- =========================================================

create table if not exists public.empresas (
  id uuid primary key default gen_random_uuid(),
  nome text not null default '',
  razao_social text default '',
  cnpj text default '',
  codigo text,
  status text default 'ativa',
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz default now()
);

create table if not exists public.funcionarios (
  id uuid primary key default gen_random_uuid(),
  nome text not null default '',
  empresa_id uuid references public.empresas(id) on delete set null,
  company_id uuid references public.empresas(id) on delete set null,
  registro text default '',
  matricula_esocial text default '',
  cpf text default '',
  rg text default '',
  cargo text default '',
  categoria text default 'operacional',
  salario numeric default 0,
  salario_base numeric default 0,
  data_admissao date,
  data_nascimento date,
  data_exame_medico date,
  setor_ghe text default '',
  telefone text default '',
  celular text default '',
  email text default '',
  endereco text default '',
  observacoes text default '',
  ativo boolean default true,
  status text default 'ativo',
  cpf_pendente_acesso boolean default false,
  vr_ativo boolean default false,
  vr_diario numeric default 0,
  va_ativo boolean default false,
  va_mensal numeric default 0,
  vt_ativo boolean default false,
  vt_diario numeric default 0,
  insalubridade_ativa boolean default false,
  insalubridade_valor numeric default 0,
  tem_insalubridade boolean default false,
  valor_insalubridade numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz default now()
);

create table if not exists public.acessos_externos (
  id uuid primary key default gen_random_uuid(),
  funcionario_id uuid references public.funcionarios(id) on delete set null,
  user_id uuid,
  cpf text default '',
  nome text default '',
  email text default '',
  tipo_acesso text default 'operacional',
  modulos_liberados jsonb not null default '[]'::jsonb,
  ativo boolean not null default true,
  ultimo_acesso_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz default now()
);

alter table public.empresas
  add column if not exists codigo text,
  add column if not exists status text default 'ativa',
  add column if not exists observacoes text,
  add column if not exists updated_at timestamptz default now();

alter table public.funcionarios
  add column if not exists empresa_id uuid,
  add column if not exists company_id uuid,
  add column if not exists registro text default '',
  add column if not exists matricula_esocial text default '',
  add column if not exists cpf text default '',
  add column if not exists rg text default '',
  add column if not exists cargo text default '',
  add column if not exists categoria text default 'operacional',
  add column if not exists salario numeric default 0,
  add column if not exists salario_base numeric default 0,
  add column if not exists data_admissao date,
  add column if not exists data_nascimento date,
  add column if not exists data_exame_medico date,
  add column if not exists setor_ghe text default '',
  add column if not exists telefone text default '',
  add column if not exists celular text default '',
  add column if not exists email text default '',
  add column if not exists endereco text default '',
  add column if not exists observacoes text default '',
  add column if not exists ativo boolean default true,
  add column if not exists status text default 'ativo',
  add column if not exists cpf_pendente_acesso boolean default false,
  add column if not exists vr_ativo boolean default false,
  add column if not exists vr_diario numeric default 0,
  add column if not exists va_ativo boolean default false,
  add column if not exists va_mensal numeric default 0,
  add column if not exists vt_ativo boolean default false,
  add column if not exists vt_diario numeric default 0,
  add column if not exists insalubridade_ativa boolean default false,
  add column if not exists insalubridade_valor numeric default 0,
  add column if not exists tem_insalubridade boolean default false,
  add column if not exists valor_insalubridade numeric,
  add column if not exists updated_at timestamptz default now();

update public.funcionarios
set
  company_id = coalesce(company_id, empresa_id),
  empresa_id = coalesce(empresa_id, company_id),
  salario_base = coalesce(nullif(salario_base, 0), salario, 0),
  salario = coalesce(nullif(salario, 0), salario_base, 0),
  status = coalesce(nullif(status, ''), case when coalesce(ativo, true) then 'ativo' else 'desligado' end),
  ativo = case when coalesce(status, 'ativo') = 'desligado' then false else coalesce(ativo, true) end,
  cpf_pendente_acesso = case
    when coalesce(regexp_replace(cpf, '\D', '', 'g'), '') = '' then true
    else coalesce(cpf_pendente_acesso, false)
  end;

create index if not exists idx_funcionarios_empresa_id on public.funcionarios(empresa_id);
create index if not exists idx_funcionarios_company_id on public.funcionarios(company_id);
create index if not exists idx_funcionarios_cpf_clean on public.funcionarios((regexp_replace(coalesce(cpf, ''), '\D', '', 'g')));
create index if not exists idx_funcionarios_status on public.funcionarios(status);

drop trigger if exists trg_funcionarios_touch_updated_at on public.funcionarios;
create trigger trg_funcionarios_touch_updated_at
before update on public.funcionarios
for each row execute function public.topac_touch_updated_at();

create table if not exists public.lancamentos_mensais (
  id uuid primary key default gen_random_uuid(),
  funcionario_id uuid not null references public.funcionarios(id) on delete cascade,
  company_id uuid references public.empresas(id) on delete set null,
  competencia text not null,
  faltas_dias numeric not null default 0,
  faltas_datas jsonb not null default '[]'::jsonb,
  atrasos numeric not null default 0,
  he50 numeric not null default 0,
  he100 numeric not null default 0,
  adicionais numeric not null default 0,
  descontos_diversos numeric not null default 0,
  adiantamento numeric not null default 0,
  vr_aplicado boolean not null default false,
  vr_dias numeric not null default 0,
  va_aplicado boolean not null default false,
  vt_aplicado boolean not null default false,
  vt_desconto numeric not null default 0,
  comissao_base numeric not null default 0,
  insalubridade_aplicada boolean not null default false,
  status_conferencia text not null default 'pendente',
  origem text not null default 'manual',
  observacoes text default '',
  bloqueado boolean not null default false,
  fechamento_id uuid,
  user_id uuid,
  apagado_em timestamptz,
  apagado_por_user_id uuid,
  apagado_por_nome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (funcionario_id, competencia)
);

create table if not exists public.fechamentos_filial (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.empresas(id) on delete set null,
  competencia text not null,
  status text not null default 'aberto',
  observacoes text default '',
  fechado_por uuid,
  fechado_por_nome text,
  fechado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, competencia)
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'lancamentos_mensais_fechamento_id_fkey'
  ) then
    alter table public.lancamentos_mensais
      add constraint lancamentos_mensais_fechamento_id_fkey
      foreign key (fechamento_id) references public.fechamentos_filial(id) on delete set null;
  end if;
end $$;

create table if not exists public.fechamentos_historico (
  id uuid primary key default gen_random_uuid(),
  fechamento_id uuid references public.fechamentos_filial(id) on delete cascade,
  user_id uuid,
  usuario_nome text default '',
  acao text not null,
  detalhes jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.historico_documental (
  id uuid primary key default gen_random_uuid(),
  tipo text not null,
  titulo text not null default '',
  descricao text default '',
  funcionario_id uuid references public.funcionarios(id) on delete set null,
  company_id uuid references public.empresas(id) on delete set null,
  competencia text,
  arquivo_url text,
  metadata jsonb not null default '{}'::jsonb,
  criado_por uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists idx_lancamentos_competencia on public.lancamentos_mensais(competencia);
create index if not exists idx_lancamentos_funcionario on public.lancamentos_mensais(funcionario_id);
create index if not exists idx_lancamentos_company on public.lancamentos_mensais(company_id);
create index if not exists idx_fechamentos_filial_comp on public.fechamentos_filial(competencia);
create index if not exists idx_historico_documental_tipo on public.historico_documental(tipo);

drop trigger if exists trg_lancamentos_touch_updated_at on public.lancamentos_mensais;
create trigger trg_lancamentos_touch_updated_at
before update on public.lancamentos_mensais
for each row execute function public.topac_touch_updated_at();

drop trigger if exists trg_fechamentos_filial_touch_updated_at on public.fechamentos_filial;
create trigger trg_fechamentos_filial_touch_updated_at
before update on public.fechamentos_filial
for each row execute function public.topac_touch_updated_at();

-- =========================================================
-- 2. PRE-CADASTRO ADMISSIONAL + DOCUMENTOS + RPCS
-- =========================================================

create table if not exists public.pre_cadastros_admissionais (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'aguardando_validacao',
  empresa_id uuid references public.empresas(id) on delete set null,
  empresa_nome text default '',
  cnpj text default '',
  nome text default '',
  cpf text default '',
  rg text default '',
  data_nascimento date,
  data_admissao date,
  funcao text default '',
  setor_ghe text default '',
  obra_local text default '',
  salario numeric(12,2),
  tipo_admissao text default '',
  jornada text default '',
  beneficios text default '',
  insalubridade text default '',
  filiacao text default '',
  endereco text default '',
  escolaridade text default '',
  experiencia text default '',
  epi text default '',
  responsavel_contato text default '',
  arquivo_ficha_url text default '',
  arquivo_aso_url text default '',
  dados_extraidos jsonb not null default '{}'::jsonb,
  conferencia jsonb not null default '{}'::jsonb,
  email_exame_enviado_em timestamptz,
  email_contabilidade_preparado_em timestamptz,
  aprovado_por uuid,
  aprovado_em timestamptz,
  funcionario_id uuid references public.funcionarios(id) on delete set null,
  criado_por uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pre_cadastro_documentos (
  id uuid primary key default gen_random_uuid(),
  pre_cadastro_id uuid not null references public.pre_cadastros_admissionais(id) on delete cascade,
  tipo_documento text not null default 'documento_admissional',
  nome_arquivo text not null default '',
  arquivo_url text not null default '',
  status text not null default 'recebido',
  criado_por uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists idx_pre_cadastros_status on public.pre_cadastros_admissionais(status);
create index if not exists idx_pre_cadastros_empresa on public.pre_cadastros_admissionais(empresa_id);
create index if not exists idx_pre_cadastros_cpf on public.pre_cadastros_admissionais((regexp_replace(coalesce(cpf, ''), '\D', '', 'g')));
create index if not exists idx_pre_cadastro_docs_pre on public.pre_cadastro_documentos(pre_cadastro_id);

drop trigger if exists trg_pre_cadastros_touch on public.pre_cadastros_admissionais;
create trigger trg_pre_cadastros_touch
before update on public.pre_cadastros_admissionais
for each row execute function public.topac_touch_updated_at();

create or replace function public.admin_pre_cadastro_marcar_exame_enviado(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.pre_cadastros_admissionais
  set status = 'aguardando_aso',
      email_exame_enviado_em = now()
  where id = p_id;
end;
$$;

create or replace function public.admin_pre_cadastro_marcar_aso_recebido(p_id uuid, p_arquivo_url text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.pre_cadastros_admissionais
  set status = 'documentacao_completa',
      arquivo_aso_url = coalesce(p_arquivo_url, arquivo_aso_url)
  where id = p_id;
end;
$$;

create or replace function public.admin_pre_cadastro_preparar_contabilidade(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.pre_cadastros_admissionais
  set status = 'pronto_para_registro',
      email_contabilidade_preparado_em = now()
  where id = p_id;
end;
$$;

create or replace function public.admin_pre_cadastro_aprovar_oficial(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.pre_cadastros_admissionais%rowtype;
  v_funcionario_id uuid;
  v_cpf_clean text;
begin
  select * into r from public.pre_cadastros_admissionais where id = p_id for update;
  if not found then raise exception 'Pre-cadastro nao encontrado'; end if;
  if nullif(trim(r.nome), '') is null then raise exception 'Nome obrigatorio'; end if;
  if r.empresa_id is null then raise exception 'Empresa obrigatoria'; end if;

  v_cpf_clean := regexp_replace(coalesce(r.cpf, ''), '\D', '', 'g');
  if v_cpf_clean <> '' then
    select id into v_funcionario_id
    from public.funcionarios
    where regexp_replace(coalesce(cpf, ''), '\D', '', 'g') = v_cpf_clean
    limit 1;
  end if;

  if v_funcionario_id is null then
    insert into public.funcionarios (
      nome, cpf, rg, empresa_id, company_id, cargo, salario_base, salario,
      data_admissao, data_nascimento, setor_ghe, endereco, status, ativo, categoria,
      cpf_pendente_acesso
    ) values (
      r.nome, r.cpf, r.rg, r.empresa_id, r.empresa_id, r.funcao, coalesce(r.salario, 0), coalesce(r.salario, 0),
      r.data_admissao, r.data_nascimento, r.setor_ghe, r.endereco, 'ativo', true, 'operacional',
      case when v_cpf_clean = '' then true else false end
    )
    returning id into v_funcionario_id;
  else
    update public.funcionarios
    set nome = coalesce(nullif(r.nome, ''), nome),
        cpf = coalesce(nullif(r.cpf, ''), cpf),
        rg = coalesce(nullif(r.rg, ''), rg),
        empresa_id = r.empresa_id,
        company_id = r.empresa_id,
        cargo = coalesce(nullif(r.funcao, ''), cargo),
        salario_base = coalesce(r.salario, salario_base),
        salario = coalesce(r.salario, salario),
        data_admissao = coalesce(r.data_admissao, data_admissao),
        data_nascimento = coalesce(r.data_nascimento, data_nascimento),
        setor_ghe = coalesce(nullif(r.setor_ghe, ''), setor_ghe),
        endereco = coalesce(nullif(r.endereco, ''), endereco),
        status = 'ativo',
        ativo = true,
        cpf_pendente_acesso = (v_cpf_clean = '')
    where id = v_funcionario_id;
  end if;

  update public.pre_cadastros_admissionais
  set status = 'cadastro_oficial',
      aprovado_por = auth.uid(),
      aprovado_em = now(),
      funcionario_id = v_funcionario_id
  where id = p_id;

  return v_funcionario_id;
end;
$$;

grant execute on function public.admin_pre_cadastro_marcar_exame_enviado(uuid) to authenticated;
grant execute on function public.admin_pre_cadastro_marcar_aso_recebido(uuid, text) to authenticated;
grant execute on function public.admin_pre_cadastro_preparar_contabilidade(uuid) to authenticated;
grant execute on function public.admin_pre_cadastro_aprovar_oficial(uuid) to authenticated;

-- =========================================================
-- 3. ABASTECIMENTO / QR / MOBILE ADMIN / UPLOADS RH
-- =========================================================

create table if not exists public.abastecimento_unidades (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nome text not null,
  status text not null default 'ativo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.abastecimento_postos (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid references public.abastecimento_unidades(id) on delete set null,
  codigo text not null unique,
  nome text not null,
  unidade text default '',
  cnpj text,
  endereco text,
  telefone text,
  status text not null default 'ativo',
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.abastecimento_qr_tokens (
  id uuid primary key default gen_random_uuid(),
  posto_id uuid references public.abastecimento_postos(id) on delete cascade,
  codigo text not null unique,
  token_hash text,
  status text not null default 'ativo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.abastecimento_registros (
  id uuid primary key default gen_random_uuid(),
  acesso_externo_id uuid references public.acessos_externos(id) on delete set null,
  funcionario_id uuid references public.funcionarios(id) on delete set null,
  posto_id uuid references public.abastecimento_postos(id) on delete set null,
  posto_codigo text,
  mecanico_nome text,
  empresa text,
  filial text,
  placa text,
  combustivel text,
  valor numeric default 0,
  litros numeric default 0,
  valor_por_litro numeric default 0,
  km_atual numeric,
  km_rodado numeric,
  foto_bomba_url text,
  foto_painel_url text,
  latitude double precision,
  longitude double precision,
  endereco text,
  observacao text,
  status text default 'concluido',
  recibo_texto text,
  created_at timestamptz not null default now()
);

create table if not exists public.mobile_admin_modulos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nome text not null,
  descricao text default '',
  rota text default '',
  ativo boolean not null default true,
  ordem integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.mobile_admin_user_modulos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  modulo_codigo text not null references public.mobile_admin_modulos(codigo) on delete cascade,
  liberado boolean not null default true,
  created_at timestamptz not null default now(),
  unique(user_id, modulo_codigo)
);

create table if not exists public.rh_documentos_uploads (
  id uuid primary key default gen_random_uuid(),
  funcionario_id uuid references public.funcionarios(id) on delete set null,
  empresa_id uuid references public.empresas(id) on delete set null,
  tipo_documento text not null default 'documento',
  nome_arquivo text not null default '',
  arquivo_url text not null default '',
  status text not null default 'recebido',
  criado_por uuid default auth.uid(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.abastecimento_unidades
  add column if not exists codigo text,
  add column if not exists nome text,
  add column if not exists status text not null default 'ativo',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.abastecimento_postos
  add column if not exists unidade_id uuid references public.abastecimento_unidades(id) on delete set null,
  add column if not exists codigo text,
  add column if not exists nome text,
  add column if not exists unidade text default '',
  add column if not exists cnpj text,
  add column if not exists endereco text,
  add column if not exists telefone text,
  add column if not exists status text not null default 'ativo',
  add column if not exists observacao text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.abastecimento_qr_tokens
  add column if not exists posto_id uuid references public.abastecimento_postos(id) on delete cascade,
  add column if not exists codigo text,
  add column if not exists token_hash text,
  add column if not exists status text not null default 'ativo',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.abastecimento_registros
  add column if not exists acesso_externo_id uuid references public.acessos_externos(id) on delete set null,
  add column if not exists funcionario_id uuid references public.funcionarios(id) on delete set null,
  add column if not exists posto_id uuid references public.abastecimento_postos(id) on delete set null,
  add column if not exists posto_codigo text,
  add column if not exists mecanico_nome text,
  add column if not exists empresa text,
  add column if not exists filial text,
  add column if not exists placa text,
  add column if not exists combustivel text,
  add column if not exists valor numeric default 0,
  add column if not exists litros numeric default 0,
  add column if not exists valor_por_litro numeric default 0,
  add column if not exists km_atual numeric,
  add column if not exists km_rodado numeric,
  add column if not exists foto_bomba_url text,
  add column if not exists foto_painel_url text,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists endereco text,
  add column if not exists observacao text,
  add column if not exists status text default 'concluido',
  add column if not exists recibo_texto text,
  add column if not exists created_at timestamptz not null default now();

alter table public.mobile_admin_modulos
  add column if not exists codigo text,
  add column if not exists nome text,
  add column if not exists descricao text default '',
  add column if not exists rota text default '',
  add column if not exists ativo boolean not null default true,
  add column if not exists ordem integer not null default 0,
  add column if not exists created_at timestamptz not null default now();

alter table public.mobile_admin_user_modulos
  add column if not exists user_id uuid,
  add column if not exists modulo_codigo text,
  add column if not exists liberado boolean not null default true,
  add column if not exists created_at timestamptz not null default now();

alter table public.rh_documentos_uploads
  add column if not exists funcionario_id uuid references public.funcionarios(id) on delete set null,
  add column if not exists empresa_id uuid references public.empresas(id) on delete set null,
  add column if not exists tipo_documento text not null default 'documento',
  add column if not exists nome_arquivo text not null default '',
  add column if not exists arquivo_url text not null default '',
  add column if not exists status text not null default 'recebido',
  add column if not exists criado_por uuid default auth.uid(),
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now();

create unique index if not exists idx_abastecimento_unidades_codigo_unique
  on public.abastecimento_unidades(codigo);

create unique index if not exists idx_abastecimento_postos_codigo_unique
  on public.abastecimento_postos(codigo);

create unique index if not exists idx_abastecimento_qr_tokens_codigo_unique
  on public.abastecimento_qr_tokens(codigo);

create unique index if not exists idx_mobile_admin_modulos_codigo_unique
  on public.mobile_admin_modulos(codigo);

insert into public.abastecimento_unidades(codigo, nome)
values
  ('sp-matriz', 'Sao Paulo / Matriz'),
  ('praia-grande', 'Praia Grande'),
  ('goiania', 'Goiania')
on conflict (codigo) do update set nome = excluded.nome, status = 'ativo', updated_at = now();

insert into public.abastecimento_postos(codigo, nome, unidade, status, observacao)
values
  ('COMB-SP-001', 'Posto Sao Paulo - TOPAC', 'TOPAC MATRIZ', 'ativo', 'QR individual Sao Paulo/Matriz'),
  ('COMB-PG-001', 'Posto Praia Grande - TOPAC', 'TOPAC PRAIA GRANDE', 'ativo', 'QR individual Praia Grande'),
  ('COMB-GO-001', 'Posto Goiania - TOPAC', 'TOPAC GOIANIA', 'ativo', 'QR individual Goiania')
on conflict (codigo) do update
set nome = excluded.nome,
    unidade = excluded.unidade,
    status = 'ativo',
    observacao = excluded.observacao,
    updated_at = now();

insert into public.abastecimento_qr_tokens(posto_id, codigo, status)
select p.id, p.codigo, 'ativo'
from public.abastecimento_postos p
where p.codigo in ('COMB-SP-001', 'COMB-PG-001', 'COMB-GO-001')
on conflict (codigo) do update set posto_id = excluded.posto_id, status = 'ativo', updated_at = now();

insert into public.mobile_admin_modulos(codigo, nome, rota, ordem)
values
  ('dashboard', 'Dashboard', '/mobile/admin', 1),
  ('financeiro', 'Financeiro', '/admin/financeiro', 2),
  ('faturamento', 'Faturamento', '/admin/faturamento', 3),
  ('relatorios', 'Relatorios', '/admin/relatorio', 4),
  ('implantacao', 'Implantacao', '/admin/monitoramento', 5)
on conflict (codigo) do update set nome = excluded.nome, rota = excluded.rota, ativo = true, ordem = excluded.ordem;

create or replace function public.validar_abastecimento_qr_token_publico(p_codigo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  select p.id, p.codigo, p.nome, p.unidade, p.cnpj, p.endereco, p.telefone
  into r
  from public.abastecimento_qr_tokens q
  join public.abastecimento_postos p on p.id = q.posto_id
  where upper(trim(q.codigo)) = upper(trim(coalesce(p_codigo, '')))
    and q.status = 'ativo'
    and p.status = 'ativo'
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'qr_nao_encontrado');
  end if;

  return jsonb_build_object('ok', true, 'posto', to_jsonb(r));
end;
$$;

grant execute on function public.validar_abastecimento_qr_token_publico(text) to anon, authenticated;

-- =========================================================
-- 4. STORAGE BUCKETS
-- =========================================================

insert into storage.buckets (id, name, public)
values
  ('documentos-admissionais', 'documentos-admissionais', true),
  ('documentos-funcionarios', 'documentos-funcionarios', true),
  ('documentos-ativos', 'documentos-ativos', true),
  ('atestados', 'atestados', true),
  ('dn4-imports', 'dn4-imports', false),
  ('abastecimento-fotos', 'abastecimento-fotos', true)
on conflict (id) do nothing;

drop policy if exists "topac documentos admissionais upload" on storage.objects;
create policy "topac documentos admissionais upload" on storage.objects
  for all to authenticated
  using (bucket_id in ('documentos-admissionais','documentos-funcionarios','documentos-ativos','atestados','dn4-imports','abastecimento-fotos'))
  with check (bucket_id in ('documentos-admissionais','documentos-funcionarios','documentos-ativos','atestados','dn4-imports','abastecimento-fotos'));

-- =========================================================
-- 5. RLS / POLICIES
-- =========================================================

alter table public.lancamentos_mensais enable row level security;
alter table public.fechamentos_filial enable row level security;
alter table public.fechamentos_historico enable row level security;
alter table public.historico_documental enable row level security;
alter table public.pre_cadastros_admissionais enable row level security;
alter table public.pre_cadastro_documentos enable row level security;
alter table public.abastecimento_unidades enable row level security;
alter table public.abastecimento_postos enable row level security;
alter table public.abastecimento_qr_tokens enable row level security;
alter table public.abastecimento_registros enable row level security;
alter table public.mobile_admin_modulos enable row level security;
alter table public.mobile_admin_user_modulos enable row level security;
alter table public.rh_documentos_uploads enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'lancamentos_mensais','fechamentos_filial','fechamentos_historico','historico_documental',
    'pre_cadastros_admissionais','pre_cadastro_documentos',
    'abastecimento_unidades','abastecimento_postos','abastecimento_registros',
    'mobile_admin_modulos','mobile_admin_user_modulos','rh_documentos_uploads'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_admin_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.topac_has_any_role(array[''admin'',''diretor_geral''], auth.uid())) with check (public.topac_has_any_role(array[''admin'',''diretor_geral''], auth.uid()))',
      t || '_admin_all', t
    );

    execute format('drop policy if exists %I on public.%I', t || '_authenticated_select', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (true)',
      t || '_authenticated_select', t
    );
  end loop;
end $$;

drop policy if exists pre_cadastros_own_insert on public.pre_cadastros_admissionais;
create policy pre_cadastros_own_insert on public.pre_cadastros_admissionais
  for insert to authenticated
  with check (criado_por is null or criado_por = auth.uid() or public.topac_has_any_role(array['admin','diretor_geral'], auth.uid()));

drop policy if exists pre_cadastros_own_update on public.pre_cadastros_admissionais;
create policy pre_cadastros_own_update on public.pre_cadastros_admissionais
  for update to authenticated
  using (criado_por = auth.uid() or public.topac_has_any_role(array['admin','diretor_geral'], auth.uid()))
  with check (criado_por = auth.uid() or public.topac_has_any_role(array['admin','diretor_geral'], auth.uid()));

drop policy if exists pre_docs_insert on public.pre_cadastro_documentos;
create policy pre_docs_insert on public.pre_cadastro_documentos
  for insert to authenticated
  with check (
    public.topac_has_any_role(array['admin','diretor_geral'], auth.uid())
    or exists (
      select 1 from public.pre_cadastros_admissionais pc
      where pc.id = pre_cadastro_id and pc.criado_por = auth.uid()
    )
  );

drop policy if exists lancamentos_authenticated_write on public.lancamentos_mensais;
create policy lancamentos_authenticated_write on public.lancamentos_mensais
  for all to authenticated
  using (public.topac_has_any_role(array['admin','diretor_geral','filial_matriz','filial_praia','filial_goiania'], auth.uid()))
  with check (public.topac_has_any_role(array['admin','diretor_geral','filial_matriz','filial_praia','filial_goiania'], auth.uid()));

drop policy if exists historico_authenticated_insert on public.historico_documental;
create policy historico_authenticated_insert on public.historico_documental
  for insert to authenticated
  with check (criado_por is null or criado_por = auth.uid() or public.topac_has_any_role(array['admin','diretor_geral'], auth.uid()));

drop policy if exists rh_uploads_insert on public.rh_documentos_uploads;
create policy rh_uploads_insert on public.rh_documentos_uploads
  for insert to authenticated
  with check (criado_por is null or criado_por = auth.uid() or public.topac_has_any_role(array['admin','diretor_geral'], auth.uid()));

drop policy if exists mobile_admin_user_own_select on public.mobile_admin_user_modulos;
create policy mobile_admin_user_own_select on public.mobile_admin_user_modulos
  for select to authenticated
  using (user_id = auth.uid() or public.topac_has_any_role(array['admin','diretor_geral'], auth.uid()));

revoke all on table public.abastecimento_qr_tokens from anon;
revoke all on table public.abastecimento_qr_tokens from authenticated;
grant select, insert, update, delete on table public.abastecimento_qr_tokens to service_role;

drop view if exists public.abastecimento_qr_tokens_public;
create view public.abastecimento_qr_tokens_public as
select id, posto_id, codigo, status, created_at, updated_at
from public.abastecimento_qr_tokens;
grant select on public.abastecimento_qr_tokens_public to authenticated;
revoke all on public.abastecimento_qr_tokens_public from anon;

grant select, insert, update, delete on public.lancamentos_mensais to authenticated;
grant select, insert, update, delete on public.fechamentos_filial to authenticated;
grant select, insert, update, delete on public.fechamentos_historico to authenticated;
grant select, insert, update, delete on public.historico_documental to authenticated;
grant select, insert, update, delete on public.pre_cadastros_admissionais to authenticated;
grant select, insert, update, delete on public.pre_cadastro_documentos to authenticated;
grant select on public.abastecimento_unidades to authenticated;
grant select on public.abastecimento_postos to authenticated;
grant select, insert, update, delete on public.abastecimento_registros to authenticated;
grant select on public.mobile_admin_modulos to authenticated;
grant select on public.mobile_admin_user_modulos to authenticated;
grant select, insert, update, delete on public.rh_documentos_uploads to authenticated;

notify pgrst, 'reload schema';

commit;

-- VALIDACAO RAPIDA POS-EXECUCAO:
-- 1) Rodar no SQL Editor:
--    select to_regclass('public.lancamentos_mensais'), to_regclass('public.pre_cadastros_admissionais'), to_regclass('public.abastecimento_qr_tokens');
-- 2) No app, recarregar e testar:
--    Funcionarios, Fechamento, Historico, Pre-cadastro, Upload PDF, QR Code, Acessos externos.
