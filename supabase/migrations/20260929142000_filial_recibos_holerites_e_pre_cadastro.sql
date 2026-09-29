create table if not exists public.filial_documentos_fluxo (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.empresas(id) on delete cascade,
  funcionario_id uuid not null references public.funcionarios(id) on delete cascade,
  source_documento_id uuid not null references public.documentos_funcionario(id) on delete cascade,
  devolvido_documento_id uuid references public.documentos_funcionario(id) on delete set null,
  competencia text not null default '',
  tipo text not null default 'documento',
  status text not null default 'disponivel'
    check (status in ('disponivel','impresso','devolvido','solicitado')),
  acesso_externo_id uuid references public.acessos_externos(id) on delete set null,
  impresso_em timestamptz,
  devolvido_em timestamptz,
  solicitado_em timestamptz,
  solicitado_por_nome text,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_documento_id)
);

create index if not exists idx_filial_documentos_fluxo_company
  on public.filial_documentos_fluxo(company_id,status,competencia);
create index if not exists idx_filial_documentos_fluxo_funcionario
  on public.filial_documentos_fluxo(funcionario_id,competencia);

alter table public.filial_documentos_fluxo enable row level security;

drop policy if exists filial_documentos_fluxo_admin_all on public.filial_documentos_fluxo;
create policy filial_documentos_fluxo_admin_all
on public.filial_documentos_fluxo
for all to authenticated
using (
  public.has_role(auth.uid(),'admin')
  or public.has_role(auth.uid(),'diretor_geral')
  or public.topac_filial_company_allowed(company_id,auth.uid())
)
with check (
  public.has_role(auth.uid(),'admin')
  or public.has_role(auth.uid(),'diretor_geral')
  or (
    public.topac_filial_company_allowed(company_id,auth.uid())
    and public.topac_filial_employee_allowed(funcionario_id,auth.uid())
  )
);

alter table public.pre_cadastros_admissionais
  add column if not exists criado_por_acesso_externo_id uuid references public.acessos_externos(id) on delete set null,
  add column if not exists filial_origem text,
  add column if not exists email_filial_origem text;

comment on table public.filial_documentos_fluxo is
  'Fila da filial para recibos/holerites: disponibiliza, registra impressão, devolução assinada e nova solicitação.';
