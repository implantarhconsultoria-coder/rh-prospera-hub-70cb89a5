-- Aplicação transacional e desfazer da Leitura Inteligente de Funcionários.
-- Cada aplicação preserva o estado anterior no banco antes de alterar o cadastro.

create table if not exists public.funcionario_leitura_inteligente_backups (
  id uuid primary key default gen_random_uuid(),
  funcionario_id uuid not null references public.funcionarios(id) on delete cascade,
  dados_antes jsonb not null,
  dados_aplicados jsonb not null default '{}'::jsonb,
  texto_origem text,
  criado_por uuid default auth.uid(),
  created_at timestamptz not null default now(),
  desfeito_em timestamptz,
  desfeito_por uuid
);

create index if not exists idx_funcionario_leitura_backups_pendente
  on public.funcionario_leitura_inteligente_backups (funcionario_id, created_at desc)
  where desfeito_em is null;

alter table public.funcionario_leitura_inteligente_backups enable row level security;

drop policy if exists funcionario_leitura_backup_select on public.funcionario_leitura_inteligente_backups;
create policy funcionario_leitura_backup_select
on public.funcionario_leitura_inteligente_backups
for select
to authenticated
using (
  public.topac_has_any_role(array['admin','diretor','rh']::text[], (select auth.uid()))
  or public.topac_filial_employee_allowed(funcionario_id, (select auth.uid()))
);

drop policy if exists funcionario_leitura_backup_insert on public.funcionario_leitura_inteligente_backups;
create policy funcionario_leitura_backup_insert
on public.funcionario_leitura_inteligente_backups
for insert
to authenticated
with check (
  criado_por = (select auth.uid())
  and (
    public.topac_has_any_role(array['admin','diretor','rh']::text[], (select auth.uid()))
    or public.topac_filial_employee_allowed(funcionario_id, (select auth.uid()))
  )
);

drop policy if exists funcionario_leitura_backup_update on public.funcionario_leitura_inteligente_backups;
create policy funcionario_leitura_backup_update
on public.funcionario_leitura_inteligente_backups
for update
to authenticated
using (
  public.topac_has_any_role(array['admin','diretor','rh']::text[], (select auth.uid()))
  or public.topac_filial_employee_allowed(funcionario_id, (select auth.uid()))
)
with check (
  public.topac_has_any_role(array['admin','diretor','rh']::text[], (select auth.uid()))
  or public.topac_filial_employee_allowed(funcionario_id, (select auth.uid()))
);

grant select, insert, update on public.funcionario_leitura_inteligente_backups to authenticated;

create or replace function public.topac_aplicar_leitura_inteligente_funcionario(
  p_funcionario_id uuid,
  p_payload jsonb,
  p_texto_origem text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_antes jsonb;
  v_depois jsonb;
begin
  if auth.uid() is null then
    raise exception 'Autenticação obrigatória.' using errcode = '42501';
  end if;

  if not (
    public.topac_has_any_role(array['admin','diretor','rh']::text[], auth.uid())
    or public.topac_filial_employee_allowed(p_funcionario_id, auth.uid())
  ) then
    raise exception 'Usuário sem permissão para editar este funcionário.' using errcode = '42501';
  end if;

  if p_payload is null or p_payload = '{}'::jsonb then
    raise exception 'Nenhum campo confiável foi informado.' using errcode = '22023';
  end if;

  select to_jsonb(f) into v_antes
  from public.funcionarios f
  where f.id = p_funcionario_id
  for update;

  if v_antes is null then
    raise exception 'Funcionário não encontrado.' using errcode = 'P0002';
  end if;

  insert into public.funcionario_leitura_inteligente_backups (
    funcionario_id, dados_antes, dados_aplicados, texto_origem, criado_por
  ) values (
    p_funcionario_id, v_antes, p_payload, nullif(btrim(coalesce(p_texto_origem, '')), ''), auth.uid()
  );

  update public.funcionarios f
  set nome = case when p_payload ? 'nome' then nullif(btrim(p_payload->>'nome'), '') else f.nome end,
      cpf = case when p_payload ? 'cpf' then nullif(btrim(p_payload->>'cpf'), '') else f.cpf end,
      rg = case when p_payload ? 'rg' then nullif(btrim(p_payload->>'rg'), '') else f.rg end,
      cargo = case when p_payload ? 'cargo' then nullif(btrim(p_payload->>'cargo'), '') else f.cargo end,
      salario_base = case when p_payload ? 'salario_base' then nullif(p_payload->>'salario_base', '')::numeric else f.salario_base end,
      data_admissao = case when p_payload ? 'data_admissao' then nullif(p_payload->>'data_admissao', '')::date else f.data_admissao end,
      telefone = case when p_payload ? 'telefone' then nullif(btrim(p_payload->>'telefone'), '') else f.telefone end,
      celular = case when p_payload ? 'celular' then nullif(btrim(p_payload->>'celular'), '') else f.celular end,
      email = case when p_payload ? 'email' then nullif(btrim(p_payload->>'email'), '') else f.email end,
      endereco = case when p_payload ? 'endereco' then nullif(btrim(p_payload->>'endereco'), '') else f.endereco end,
      banco = case when p_payload ? 'banco' then nullif(btrim(p_payload->>'banco'), '') else f.banco end,
      banco_codigo = case when p_payload ? 'banco_codigo' then nullif(btrim(p_payload->>'banco_codigo'), '') else f.banco_codigo end,
      agencia = case when p_payload ? 'agencia' then nullif(btrim(p_payload->>'agencia'), '') else f.agencia end,
      conta = case when p_payload ? 'conta' then nullif(btrim(p_payload->>'conta'), '') else f.conta end,
      conta_digito = case when p_payload ? 'conta_digito' then nullif(btrim(p_payload->>'conta_digito'), '') else f.conta_digito end,
      tipo_conta = case when p_payload ? 'tipo_conta' then nullif(btrim(p_payload->>'tipo_conta'), '') else f.tipo_conta end,
      titular_conta = case when p_payload ? 'titular_conta' then nullif(btrim(p_payload->>'titular_conta'), '') else f.titular_conta end,
      cpf_titular = case when p_payload ? 'cpf_titular' then nullif(btrim(p_payload->>'cpf_titular'), '') else f.cpf_titular end,
      pix = case when p_payload ? 'pix' then nullif(btrim(p_payload->>'pix'), '') else f.pix end,
      tipo_chave_pix = case when p_payload ? 'tipo_chave_pix' then nullif(btrim(p_payload->>'tipo_chave_pix'), '') else f.tipo_chave_pix end,
      dados_bancarios_origem = case when p_payload ? 'dados_bancarios_origem' then nullif(p_payload->>'dados_bancarios_origem', '') else f.dados_bancarios_origem end,
      dados_bancarios_atualizado_em = case when p_payload ? 'dados_bancarios_atualizado_em' then nullif(p_payload->>'dados_bancarios_atualizado_em', '')::timestamptz else f.dados_bancarios_atualizado_em end,
      updated_at = now()
  where f.id = p_funcionario_id
  returning to_jsonb(f) into v_depois;

  return v_depois;
end;
$$;

create or replace function public.topac_desfazer_ultima_leitura_funcionario(
  p_funcionario_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_backup public.funcionario_leitura_inteligente_backups%rowtype;
  v_antes jsonb;
  v_depois jsonb;
begin
  if auth.uid() is null then
    raise exception 'Autenticação obrigatória.' using errcode = '42501';
  end if;

  if not (
    public.topac_has_any_role(array['admin','diretor','rh']::text[], auth.uid())
    or public.topac_filial_employee_allowed(p_funcionario_id, auth.uid())
  ) then
    raise exception 'Usuário sem permissão para editar este funcionário.' using errcode = '42501';
  end if;

  select * into v_backup
  from public.funcionario_leitura_inteligente_backups
  where funcionario_id = p_funcionario_id
    and desfeito_em is null
  order by created_at desc
  limit 1
  for update;

  if v_backup.id is null then
    raise exception 'Não existe leitura inteligente pendente para desfazer.' using errcode = 'P0002';
  end if;

  v_antes := v_backup.dados_antes;

  update public.funcionarios f
  set nome = coalesce(v_antes->>'nome', f.nome),
      cpf = v_antes->>'cpf',
      rg = v_antes->>'rg',
      cargo = v_antes->>'cargo',
      salario_base = nullif(v_antes->>'salario_base', '')::numeric,
      data_admissao = nullif(v_antes->>'data_admissao', '')::date,
      telefone = v_antes->>'telefone',
      celular = v_antes->>'celular',
      email = v_antes->>'email',
      endereco = v_antes->>'endereco',
      banco = v_antes->>'banco',
      banco_codigo = v_antes->>'banco_codigo',
      agencia = v_antes->>'agencia',
      conta = v_antes->>'conta',
      conta_digito = v_antes->>'conta_digito',
      tipo_conta = v_antes->>'tipo_conta',
      titular_conta = v_antes->>'titular_conta',
      cpf_titular = v_antes->>'cpf_titular',
      pix = v_antes->>'pix',
      tipo_chave_pix = v_antes->>'tipo_chave_pix',
      dados_bancarios_origem = v_antes->>'dados_bancarios_origem',
      dados_bancarios_atualizado_em = nullif(v_antes->>'dados_bancarios_atualizado_em', '')::timestamptz,
      updated_at = now()
  where f.id = p_funcionario_id
  returning to_jsonb(f) into v_depois;

  update public.funcionario_leitura_inteligente_backups
  set desfeito_em = now(),
      desfeito_por = auth.uid()
  where id = v_backup.id;

  return v_depois;
end;
$$;

revoke all on function public.topac_aplicar_leitura_inteligente_funcionario(uuid, jsonb, text) from public, anon;
revoke all on function public.topac_desfazer_ultima_leitura_funcionario(uuid) from public, anon;
grant execute on function public.topac_aplicar_leitura_inteligente_funcionario(uuid, jsonb, text) to authenticated;
grant execute on function public.topac_desfazer_ultima_leitura_funcionario(uuid) to authenticated;
