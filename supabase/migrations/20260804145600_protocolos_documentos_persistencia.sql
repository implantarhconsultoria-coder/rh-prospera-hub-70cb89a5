-- Persistência oficial do Protocolo sincronizado com a Frota.

create table if not exists public.protocolos_documentos (
  id uuid primary key default gen_random_uuid(),
  empresa_origem text,
  empresa_destinataria text,
  local_canteiro text,
  responsavel_recebimento text,
  data_emissao date not null default current_date,
  descricao_ativo text,
  placa text,
  renavam text,
  chassi text,
  ano_fabricacao text,
  ano_modelo text,
  patrimonio text,
  exercicio text,
  observacoes text,
  texto_original text,
  pdf_url text,
  ativo_id uuid references public.ativos(id) on delete set null,
  criado_por uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.protocolos_documentos enable row level security;
revoke all on public.protocolos_documentos from anon;
grant select, insert, update, delete on public.protocolos_documentos to authenticated;

drop policy if exists protocolos_documentos_roles_select on public.protocolos_documentos;
create policy protocolos_documentos_roles_select
on public.protocolos_documentos for select to authenticated
using (public.topac_has_any_role(array['admin','diretor_geral','operacional'], auth.uid()));

drop policy if exists protocolos_documentos_roles_insert on public.protocolos_documentos;
create policy protocolos_documentos_roles_insert
on public.protocolos_documentos for insert to authenticated
with check (public.topac_has_any_role(array['admin','diretor_geral','operacional'], auth.uid()));

drop policy if exists protocolos_documentos_roles_update on public.protocolos_documentos;
create policy protocolos_documentos_roles_update
on public.protocolos_documentos for update to authenticated
using (public.topac_has_any_role(array['admin','diretor_geral','operacional'], auth.uid()))
with check (public.topac_has_any_role(array['admin','diretor_geral','operacional'], auth.uid()));

drop policy if exists protocolos_documentos_admin_delete on public.protocolos_documentos;
create policy protocolos_documentos_admin_delete
on public.protocolos_documentos for delete to authenticated
using (public.topac_has_any_role(array['admin','diretor_geral'], auth.uid()));

create index if not exists idx_protocolos_documentos_data
  on public.protocolos_documentos (data_emissao desc, created_at desc);
create index if not exists idx_protocolos_documentos_placa
  on public.protocolos_documentos ((upper(regexp_replace(coalesce(placa, ''), '[^A-Z0-9]', '', 'g'))));
create index if not exists idx_protocolos_documentos_ativo
  on public.protocolos_documentos (ativo_id, created_at desc);
