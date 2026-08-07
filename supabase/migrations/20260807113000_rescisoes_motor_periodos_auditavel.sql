-- Motor de rescisões v2: persistência auditável e integração com férias existentes.
-- Não cria uma segunda base de férias; apenas complementa ferias_avisos com abono/origem.

create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

alter table if exists public.ferias_avisos
  add column if not exists dias_abono integer not null default 0,
  add column if not exists periodo_aquisitivo_origem text not null default 'nao_informado';

alter table if exists public.ferias_avisos
  drop constraint if exists ferias_avisos_dias_abono_check;
alter table if exists public.ferias_avisos
  add constraint ferias_avisos_dias_abono_check check (dias_abono between 0 and 30);

create table if not exists public.rescisoes (
  id uuid primary key default gen_random_uuid(),
  funcionario_id uuid,
  funcionario_nome text not null default '',
  company_id uuid,
  empresa_nome text not null default '',
  empresa_cnpj text,
  empresa_municipio text,
  empresa_uf text,
  cargo text not null default '',
  cpf text,
  endereco text,
  data_admissao date,
  data_desligamento date not null,
  data_projecao_aviso date,
  tipo_rescisao text not null default 'sem_justa_causa',
  motivo text not null default '',
  aviso_previo text not null default 'indenizado',
  dias_aviso numeric not null default 0,
  salario_base numeric not null default 0,
  remuneracao_base numeric not null default 0,
  dependentes integer not null default 0,
  saldo_fgts_depositado numeric not null default 0,
  fgts_saldo_editado_manual boolean not null default false,
  fgts_saldo_motivo text not null default '',
  saldo_salario numeric not null default 0,
  dias_saldo_salario integer not null default 0,
  divisor_saldo_salario integer not null default 30,
  aviso_previo_valor numeric not null default 0,
  aviso_previo_desconto numeric not null default 0,
  ferias_vencidas numeric not null default 0,
  ferias_em_aberto numeric not null default 0,
  ferias_proporcionais numeric not null default 0,
  ferias_em_dobro_adicional numeric not null default 0,
  terco_ferias numeric not null default 0,
  terco_ferias_vencidas numeric not null default 0,
  terco_ferias_proporcionais numeric not null default 0,
  decimo_terceiro numeric not null default 0,
  decimo_terceiro_bruto numeric not null default 0,
  decimo_terceiro_adiantado numeric not null default 0,
  decimo_terceiro_avos integer not null default 0,
  inss numeric not null default 0,
  irrf numeric not null default 0,
  fgts_mes numeric not null default 0,
  multa_fgts numeric not null default 0,
  outros_descontos numeric not null default 0,
  total_proventos numeric not null default 0,
  total_descontos numeric not null default 0,
  liquido numeric not null default 0,
  descontos_json jsonb not null default '[]'::jsonb,
  periodos_ferias_json jsonb not null default '[]'::jsonb,
  alteracoes_manuais_json jsonb not null default '[]'::jsonb,
  revisao_ferias_necessaria boolean not null default false,
  calculo_versao text not null default 'rescisao-v2-2026',
  calculado_em timestamptz not null default now(),
  observacoes text not null default '',
  snapshot_json jsonb not null default '{}'::jsonb,
  status text not null default 'finalizada',
  user_id uuid,
  usuario_nome text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.rescisoes add column if not exists empresa_cnpj text;
alter table public.rescisoes add column if not exists empresa_municipio text;
alter table public.rescisoes add column if not exists empresa_uf text;
alter table public.rescisoes add column if not exists cpf text;
alter table public.rescisoes add column if not exists endereco text;
alter table public.rescisoes add column if not exists data_projecao_aviso date;
alter table public.rescisoes add column if not exists remuneracao_base numeric not null default 0;
alter table public.rescisoes add column if not exists fgts_saldo_editado_manual boolean not null default false;
alter table public.rescisoes add column if not exists fgts_saldo_motivo text not null default '';
alter table public.rescisoes add column if not exists dias_saldo_salario integer not null default 0;
alter table public.rescisoes add column if not exists divisor_saldo_salario integer not null default 30;
alter table public.rescisoes add column if not exists aviso_previo_desconto numeric not null default 0;
alter table public.rescisoes add column if not exists ferias_em_aberto numeric not null default 0;
alter table public.rescisoes add column if not exists ferias_em_dobro_adicional numeric not null default 0;
alter table public.rescisoes add column if not exists terco_ferias_vencidas numeric not null default 0;
alter table public.rescisoes add column if not exists terco_ferias_proporcionais numeric not null default 0;
alter table public.rescisoes add column if not exists decimo_terceiro_bruto numeric not null default 0;
alter table public.rescisoes add column if not exists decimo_terceiro_adiantado numeric not null default 0;
alter table public.rescisoes add column if not exists decimo_terceiro_avos integer not null default 0;
alter table public.rescisoes add column if not exists descontos_json jsonb not null default '[]'::jsonb;
alter table public.rescisoes add column if not exists periodos_ferias_json jsonb not null default '[]'::jsonb;
alter table public.rescisoes add column if not exists alteracoes_manuais_json jsonb not null default '[]'::jsonb;
alter table public.rescisoes add column if not exists revisao_ferias_necessaria boolean not null default false;
alter table public.rescisoes add column if not exists calculo_versao text not null default 'rescisao-v2-2026';
alter table public.rescisoes add column if not exists calculado_em timestamptz not null default now();
alter table public.rescisoes add column if not exists snapshot_json jsonb not null default '{}'::jsonb;
alter table public.rescisoes add column if not exists usuario_nome text not null default '';
alter table public.rescisoes add column if not exists updated_at timestamptz not null default now();

alter table public.rescisoes enable row level security;

drop policy if exists "Admin manage rescisoes" on public.rescisoes;
drop policy if exists "Filial view own empresa rescisoes" on public.rescisoes;
drop policy if exists "Filial insert own empresa rescisoes" on public.rescisoes;
drop policy if exists "Filial update own empresa rescisoes" on public.rescisoes;
drop policy if exists "rescisoes_scoped_select" on public.rescisoes;
drop policy if exists "rescisoes_scoped_insert" on public.rescisoes;
drop policy if exists "rescisoes_scoped_update" on public.rescisoes;
drop policy if exists "rescisoes_scoped_delete" on public.rescisoes;

create policy "rescisoes_scoped_select" on public.rescisoes
  for select to authenticated
  using ((not public.topac_is_filial_user(auth.uid())) or public.topac_filial_company_allowed(company_id, auth.uid()));

create policy "rescisoes_scoped_insert" on public.rescisoes
  for insert to authenticated
  with check (public.topac_filial_company_allowed(company_id, auth.uid()));

create policy "rescisoes_scoped_update" on public.rescisoes
  for update to authenticated
  using (public.topac_filial_company_allowed(company_id, auth.uid()))
  with check (public.topac_filial_company_allowed(company_id, auth.uid()));

create policy "rescisoes_scoped_delete" on public.rescisoes
  for delete to authenticated
  using (public.topac_filial_company_allowed(company_id, auth.uid()));

grant select, insert, update, delete on public.rescisoes to authenticated;

create index if not exists idx_rescisoes_funcionario on public.rescisoes(funcionario_id);
create index if not exists idx_rescisoes_company on public.rescisoes(company_id);
create index if not exists idx_rescisoes_desligamento on public.rescisoes(data_desligamento desc);

create table if not exists public.rescisao_historico (
  id uuid primary key default gen_random_uuid(),
  rescisao_id uuid not null references public.rescisoes(id) on delete cascade,
  acao text not null default 'calculo_salvo',
  detalhe text not null default '',
  snapshot_json jsonb not null default '{}'::jsonb,
  alteracoes_manuais_json jsonb not null default '[]'::jsonb,
  user_id uuid,
  usuario_nome text not null default '',
  created_at timestamptz not null default now()
);

alter table public.rescisao_historico add column if not exists detalhe text not null default '';
alter table public.rescisao_historico add column if not exists snapshot_json jsonb not null default '{}'::jsonb;
alter table public.rescisao_historico add column if not exists alteracoes_manuais_json jsonb not null default '[]'::jsonb;
alter table public.rescisao_historico add column if not exists user_id uuid;
alter table public.rescisao_historico add column if not exists usuario_nome text not null default '';

alter table public.rescisao_historico enable row level security;

drop policy if exists "rescisao_historico_scoped_select" on public.rescisao_historico;
drop policy if exists "rescisao_historico_scoped_insert" on public.rescisao_historico;

create policy "rescisao_historico_scoped_select" on public.rescisao_historico
  for select to authenticated
  using (exists (
    select 1 from public.rescisoes r
    where r.id = rescisao_id
      and ((not public.topac_is_filial_user(auth.uid())) or public.topac_filial_company_allowed(r.company_id, auth.uid()))
  ));

create policy "rescisao_historico_scoped_insert" on public.rescisao_historico
  for insert to authenticated
  with check (exists (
    select 1 from public.rescisoes r
    where r.id = rescisao_id
      and public.topac_filial_company_allowed(r.company_id, auth.uid())
  ));

grant select, insert on public.rescisao_historico to authenticated;
create index if not exists idx_rescisao_historico_rescisao on public.rescisao_historico(rescisao_id, created_at desc);

drop trigger if exists trg_rescisoes_updated_at on public.rescisoes;
create trigger trg_rescisoes_updated_at
  before update on public.rescisoes
  for each row execute function public.update_updated_at_column();

notify pgrst, 'reload schema';
