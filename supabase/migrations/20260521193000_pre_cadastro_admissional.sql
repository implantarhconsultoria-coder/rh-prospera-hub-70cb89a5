-- Pre-cadastro admissional: fluxo separado da base oficial de funcionarios.
create extension if not exists pgcrypto;

create table if not exists public.pre_cadastros_admissionais (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'aguardando_validacao',
  empresa_id uuid null references public.empresas(id) on delete set null,
  empresa_nome text default '',
  cnpj text default '',
  nome text default '',
  cpf text default '',
  rg text default '',
  data_nascimento date null,
  data_admissao date null,
  funcao text default '',
  setor_ghe text default '',
  obra_local text default '',
  salario numeric(12,2) null,
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
  email_exame_enviado_em timestamptz null,
  email_contabilidade_preparado_em timestamptz null,
  aprovado_por uuid null,
  aprovado_em timestamptz null,
  funcionario_id uuid null references public.funcionarios(id) on delete set null,
  criado_por uuid null,
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
  created_at timestamptz not null default now()
);

create index if not exists idx_pre_cadastros_status on public.pre_cadastros_admissionais(status);
create index if not exists idx_pre_cadastros_cpf on public.pre_cadastros_admissionais((regexp_replace(coalesce(cpf, ''), '\D', '', 'g')));
create index if not exists idx_pre_cadastros_empresa on public.pre_cadastros_admissionais(empresa_id);
create index if not exists idx_pre_cadastro_docs_pre on public.pre_cadastro_documentos(pre_cadastro_id);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_pre_cadastros_touch on public.pre_cadastros_admissionais;
create trigger trg_pre_cadastros_touch
before update on public.pre_cadastros_admissionais
for each row execute function public.touch_updated_at();

alter table public.pre_cadastros_admissionais enable row level security;
alter table public.pre_cadastro_documentos enable row level security;

drop policy if exists "admin pre cadastros all" on public.pre_cadastros_admissionais;
create policy "admin pre cadastros all" on public.pre_cadastros_admissionais
  for all using (auth.uid() is not null)
  with check (auth.uid() is not null);

drop policy if exists "admin pre cadastro docs all" on public.pre_cadastro_documentos;
create policy "admin pre cadastro docs all" on public.pre_cadastro_documentos
  for all using (auth.uid() is not null)
  with check (auth.uid() is not null);

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
  if not found then
    raise exception 'Pre-cadastro nao encontrado';
  end if;

  if nullif(trim(r.nome), '') is null then
    raise exception 'Nome obrigatorio para aprovar cadastro oficial';
  end if;

  if r.empresa_id is null then
    raise exception 'Empresa obrigatoria para aprovar cadastro oficial';
  end if;

  v_cpf_clean := regexp_replace(coalesce(r.cpf, ''), '\D', '', 'g');

  if v_cpf_clean <> '' then
    select id into v_funcionario_id
    from public.funcionarios
    where regexp_replace(coalesce(cpf, ''), '\D', '', 'g') = v_cpf_clean
    limit 1;
  end if;

  if v_funcionario_id is null then
    insert into public.funcionarios (
      nome, cpf, rg, company_id, cargo, salario_base, salario,
      data_admissao, data_nascimento, setor_ghe, endereco, status, categoria,
      cpf_pendente_acesso
    )
    values (
      r.nome, r.cpf, r.rg, r.empresa_id, r.funcao, coalesce(r.salario, 0), coalesce(r.salario, 0),
      r.data_admissao, r.data_nascimento, r.setor_ghe, r.endereco, 'ativo', 'operacional',
      case when v_cpf_clean = '' then true else false end
    )
    returning id into v_funcionario_id;
  else
    update public.funcionarios
    set nome = coalesce(nullif(r.nome, ''), nome),
        rg = coalesce(nullif(r.rg, ''), rg),
        company_id = r.empresa_id,
        cargo = coalesce(nullif(r.funcao, ''), cargo),
        salario_base = coalesce(r.salario, salario_base),
        salario = coalesce(r.salario, salario),
        data_admissao = coalesce(r.data_admissao, data_admissao),
        data_nascimento = coalesce(r.data_nascimento, data_nascimento),
        setor_ghe = coalesce(nullif(r.setor_ghe, ''), setor_ghe),
        endereco = coalesce(nullif(r.endereco, ''), endereco),
        status = 'ativo',
        cpf_pendente_acesso = false
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

grant execute on function public.admin_pre_cadastro_marcar_exame_enviado(uuid) to authenticated, anon;
grant execute on function public.admin_pre_cadastro_marcar_aso_recebido(uuid, text) to authenticated, anon;
grant execute on function public.admin_pre_cadastro_preparar_contabilidade(uuid) to authenticated, anon;
grant execute on function public.admin_pre_cadastro_aprovar_oficial(uuid) to authenticated, anon;

insert into storage.buckets (id, name, public)
values ('documentos-admissionais', 'documentos-admissionais', true)
on conflict (id) do nothing;

drop policy if exists "documentos admissionais upload" on storage.objects;
create policy "documentos admissionais upload" on storage.objects
  for all to authenticated
  using (bucket_id = 'documentos-admissionais')
  with check (bucket_id = 'documentos-admissionais');

notify pgrst, 'reload schema';
