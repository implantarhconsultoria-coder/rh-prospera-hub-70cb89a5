-- TOPAC RH PRO — Gestao semestral de EPI
-- Migration aditiva: catalogo, solicitacoes, fichas/entregas e historico.

create table if not exists public.epi_catalogo (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nome text not null,
  ca text,
  grupo text not null default 'Adicional',
  regra_elegibilidade text not null default 'GERAL',
  quantidade_padrao integer not null default 1 check (quantidade_padrao > 0),
  ativo boolean not null default true,
  ordem integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.epi_solicitacoes (
  id uuid primary key default gen_random_uuid(),
  data_referencia date not null default current_date,
  status text not null default 'para_aprovacao' check (status in ('rascunho','para_aprovacao','aprovada','comprada','cancelada')),
  observacoes text not null default '',
  criado_por uuid,
  criado_por_nome text not null default '',
  aprovado_por uuid,
  aprovado_por_nome text,
  aprovado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.epi_solicitacao_funcionarios (
  id uuid primary key default gen_random_uuid(),
  solicitacao_id uuid not null references public.epi_solicitacoes(id) on delete cascade,
  funcionario_id uuid not null references public.funcionarios(id) on delete restrict,
  company_id uuid not null references public.empresas(id) on delete restrict,
  funcionario_nome text not null,
  cargo text not null default '',
  empresa_nome text not null,
  mecanico_externo boolean not null default false,
  itens jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (solicitacao_id, funcionario_id)
);

create table if not exists public.epi_entregas (
  id uuid primary key default gen_random_uuid(),
  solicitacao_id uuid references public.epi_solicitacoes(id) on delete set null,
  funcionario_id uuid not null references public.funcionarios(id) on delete restrict,
  company_id uuid not null references public.empresas(id) on delete restrict,
  funcionario_nome text not null,
  cargo text not null default '',
  empresa_nome text not null,
  data_prevista date not null default current_date,
  data_entrega date,
  proxima_reposicao date,
  status text not null default 'emitida' check (status in ('emitida','entregue','cancelada')),
  itens jsonb not null default '[]'::jsonb,
  termo_responsabilidade text not null default 'Declaro ter recebido, nesta data, o KIT DE EPIs NOVOS referente à entrega semestral programada. Comprometo-me a utilizá-los exclusivamente para fins profissionais durante a jornada de trabalho, bem como zelar pela sua guarda e conservação. Estou ciente de que, em caso de dano ou extravio por uso indevido, deverei comunicar imediatamente o empregador. Declaro ainda estar ciente das Normas Internas da Empresa e das Normas Regulamentadoras (NRs) pertinentes, em especial a NR-6, quanto ao uso adequado e obrigatório dos equipamentos.',
  documento_funcionario_id uuid references public.documentos_funcionario(id) on delete set null,
  criado_por uuid,
  criado_por_nome text not null default '',
  efetivado_por uuid,
  efetivado_por_nome text,
  efetivado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.epi_historico (
  id uuid primary key default gen_random_uuid(),
  entrega_id uuid references public.epi_entregas(id) on delete cascade,
  solicitacao_id uuid references public.epi_solicitacoes(id) on delete cascade,
  funcionario_id uuid not null references public.funcionarios(id) on delete restrict,
  company_id uuid not null references public.empresas(id) on delete restrict,
  acao text not null,
  detalhes jsonb not null default '{}'::jsonb,
  user_id uuid,
  usuario_nome text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_epi_solicitacao_funcionarios_solicitacao on public.epi_solicitacao_funcionarios(solicitacao_id);
create index if not exists idx_epi_solicitacao_funcionarios_funcionario on public.epi_solicitacao_funcionarios(funcionario_id);
create index if not exists idx_epi_entregas_funcionario on public.epi_entregas(funcionario_id, created_at desc);
create index if not exists idx_epi_entregas_reposicao on public.epi_entregas(proxima_reposicao) where status = 'entregue';
create index if not exists idx_epi_historico_funcionario on public.epi_historico(funcionario_id, created_at desc);

create or replace function public.epi_set_reposicao_semestral()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  if new.data_entrega is not null then
    new.proxima_reposicao := (new.data_entrega + interval '6 months')::date;
    if new.status <> 'cancelada' then
      new.status := 'entregue';
    end if;
    if new.efetivado_em is null then
      new.efetivado_em := now();
    end if;
  elsif new.status = 'entregue' then
    raise exception 'Entrega efetiva exige data_entrega';
  else
    new.proxima_reposicao := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_epi_set_reposicao_semestral on public.epi_entregas;
create trigger trg_epi_set_reposicao_semestral
before insert or update on public.epi_entregas
for each row execute function public.epi_set_reposicao_semestral();

create or replace function public.epi_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_epi_catalogo_updated_at on public.epi_catalogo;
create trigger trg_epi_catalogo_updated_at before update on public.epi_catalogo
for each row execute function public.epi_touch_updated_at();

drop trigger if exists trg_epi_solicitacoes_updated_at on public.epi_solicitacoes;
create trigger trg_epi_solicitacoes_updated_at before update on public.epi_solicitacoes
for each row execute function public.epi_touch_updated_at();

insert into public.epi_catalogo (codigo, nome, ca, grupo, regra_elegibilidade, quantidade_padrao, ordem)
values
  ('mascara-air-tox-ii', 'Máscara Respiratória Air Tox II', '5757', 'Exclusivo Pintor', 'PINTOR', 1, 10),
  ('protetor-solar', 'Protetor Solar', null, 'Exclusivo Externo', 'MECANICO_EXTERNO', 1, 20),
  ('abafador-concha', 'Abafador de Ruídos (Tipo Concha)', null, 'Proteção Auditiva', 'GERAL', 1, 30),
  ('cinta', 'Cinta', null, 'Kit Básico', 'GERAL', 1, 40),
  ('luvas-seguranca', 'Luvas de segurança', null, 'Kit Básico', 'GERAL', 1, 50),
  ('creme-protetor', 'Creme protetor', null, 'Kit Básico', 'GERAL', 1, 60),
  ('oculos-protecao', 'Óculos de proteção', null, 'Kit Básico', 'GERAL', 1, 70),
  ('protetor-auricular', 'Protetor auricular', null, 'Adicional', 'GERAL', 1, 80),
  ('luvas-procedimento', 'Luvas de procedimento', null, 'Adicional', 'GERAL', 1, 90),
  ('cinto-seguranca-epi', 'Cinto de segurança (EPI)', null, 'Adicional', 'GERAL', 1, 100)
on conflict (codigo) do update set
  nome = excluded.nome,
  ca = excluded.ca,
  grupo = excluded.grupo,
  regra_elegibilidade = excluded.regra_elegibilidade,
  quantidade_padrao = excluded.quantidade_padrao,
  ordem = excluded.ordem,
  ativo = true,
  updated_at = now();

-- Se existir resíduo de catálogo antigo com capacete, ele não participa deste módulo.
update public.epi_catalogo
set ativo = false, updated_at = now()
where lower(nome) like '%capacete%';

create or replace function public.epi_mecanicos_externos()
returns table(funcionario_id uuid)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.topac_has_any_role(array['admin','diretor_geral'], auth.uid()) then
    raise exception 'Acesso negado ao cadastro de mecânicos externos';
  end if;

  return query
  select distinct ae.funcionario_id
  from public.acessos_externos ae
  where ae.funcionario_id is not null
    and coalesce(ae.ativo, false) = true
    and coalesce(ae.acesso_liberado, false) = true
    and lower(coalesce(ae.modulo, '')) = 'mecanico'
    and lower(coalesce(ae.perfil_acesso, '')) = 'mecanico_externo';
end;
$$;

revoke all on function public.epi_mecanicos_externos() from public;
grant execute on function public.epi_mecanicos_externos() to authenticated;

alter table public.epi_catalogo enable row level security;
alter table public.epi_solicitacoes enable row level security;
alter table public.epi_solicitacao_funcionarios enable row level security;
alter table public.epi_entregas enable row level security;
alter table public.epi_historico enable row level security;

drop policy if exists epi_catalogo_select_auth on public.epi_catalogo;
create policy epi_catalogo_select_auth on public.epi_catalogo
for select to authenticated using (true);

drop policy if exists epi_catalogo_admin_write on public.epi_catalogo;
create policy epi_catalogo_admin_write on public.epi_catalogo
for all to authenticated
using (public.topac_has_any_role(array['admin','diretor_geral'], auth.uid()))
with check (public.topac_has_any_role(array['admin','diretor_geral'], auth.uid()));

drop policy if exists epi_solicitacoes_admin_all on public.epi_solicitacoes;
create policy epi_solicitacoes_admin_all on public.epi_solicitacoes
for all to authenticated
using (public.topac_has_any_role(array['admin','diretor_geral'], auth.uid()))
with check (public.topac_has_any_role(array['admin','diretor_geral'], auth.uid()));

drop policy if exists epi_solicitacao_funcionarios_admin_all on public.epi_solicitacao_funcionarios;
create policy epi_solicitacao_funcionarios_admin_all on public.epi_solicitacao_funcionarios
for all to authenticated
using (public.topac_has_any_role(array['admin','diretor_geral'], auth.uid()))
with check (public.topac_has_any_role(array['admin','diretor_geral'], auth.uid()));

drop policy if exists epi_entregas_select_scoped on public.epi_entregas;
create policy epi_entregas_select_scoped on public.epi_entregas
for select to authenticated
using (
  public.topac_has_any_role(array['admin','diretor_geral'], auth.uid())
  or public.topac_filial_employee_allowed(funcionario_id, auth.uid())
);

drop policy if exists epi_entregas_admin_write on public.epi_entregas;
create policy epi_entregas_admin_write on public.epi_entregas
for all to authenticated
using (public.topac_has_any_role(array['admin','diretor_geral'], auth.uid()))
with check (public.topac_has_any_role(array['admin','diretor_geral'], auth.uid()));

drop policy if exists epi_historico_select_scoped on public.epi_historico;
create policy epi_historico_select_scoped on public.epi_historico
for select to authenticated
using (
  public.topac_has_any_role(array['admin','diretor_geral'], auth.uid())
  or public.topac_filial_employee_allowed(funcionario_id, auth.uid())
);

drop policy if exists epi_historico_admin_insert on public.epi_historico;
create policy epi_historico_admin_insert on public.epi_historico
for insert to authenticated
with check (public.topac_has_any_role(array['admin','diretor_geral'], auth.uid()));

grant select on public.epi_catalogo to authenticated;
grant select, insert, update, delete on public.epi_solicitacoes to authenticated;
grant select, insert, update, delete on public.epi_solicitacao_funcionarios to authenticated;
grant select, insert, update, delete on public.epi_entregas to authenticated;
grant select, insert on public.epi_historico to authenticated;
