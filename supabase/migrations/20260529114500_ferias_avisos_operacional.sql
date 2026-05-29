create table if not exists public.ferias_avisos (
  id uuid primary key default gen_random_uuid(),
  funcionario_id uuid references public.funcionarios(id) on delete cascade,
  company_id uuid references public.empresas(id) on delete set null,
  funcionario_nome text not null default '',
  funcionario_cpf text not null default '',
  funcionario_cargo text not null default '',
  empresa_nome text not null default '',
  periodo_aquisitivo_inicio date,
  periodo_aquisitivo_fim date,
  periodo_gozo_inicio date not null,
  periodo_gozo_fim date not null,
  data_retorno date not null,
  dias_ferias integer not null default 30,
  prazo_pagamento date,
  data_pagamento date,
  data_entrega date,
  valor_pago numeric,
  aviso_pdf_url text not null default '',
  assinado_pdf_url text not null default '',
  status text not null default 'marcada',
  status_pagamento text not null default 'pendente',
  observacao text not null default '',
  user_id uuid not null default auth.uid(),
  user_nome text not null default '',
  enviado_contabilidade_destinos text,
  enviado_contabilidade_em timestamptz,
  enviado_contabilidade_por text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ferias_avisos enable row level security;

drop policy if exists "Authenticated can read ferias avisos" on public.ferias_avisos;
drop policy if exists "Authenticated can insert ferias avisos" on public.ferias_avisos;
drop policy if exists "Authenticated can update ferias avisos" on public.ferias_avisos;
drop policy if exists "Authenticated can delete ferias avisos" on public.ferias_avisos;

create policy "Authenticated can read ferias avisos"
  on public.ferias_avisos for select to authenticated
  using (true);

create policy "Authenticated can insert ferias avisos"
  on public.ferias_avisos for insert to authenticated
  with check (true);

create policy "Authenticated can update ferias avisos"
  on public.ferias_avisos for update to authenticated
  using (true)
  with check (true);

create policy "Authenticated can delete ferias avisos"
  on public.ferias_avisos for delete to authenticated
  using (true);

grant select, insert, update, delete on public.ferias_avisos to authenticated;

create index if not exists idx_ferias_avisos_funcionario on public.ferias_avisos(funcionario_id);
create index if not exists idx_ferias_avisos_company on public.ferias_avisos(company_id);
create index if not exists idx_ferias_avisos_periodo on public.ferias_avisos(periodo_gozo_inicio, periodo_gozo_fim);
create index if not exists idx_ferias_avisos_status on public.ferias_avisos(status);
