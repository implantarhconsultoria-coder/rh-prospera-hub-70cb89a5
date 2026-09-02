alter table public.protocolos_documentos
  add column if not exists categoria_ativo text,
  add column if not exists status_locacao text not null default 'ativo',
  add column if not exists status_atualizado_em timestamptz not null default now(),
  add column if not exists encerrado_em timestamptz,
  add column if not exists devolvido_em timestamptz,
  add column if not exists protocolo_lote_id uuid;

update public.protocolos_documentos
set categoria_ativo = case
  when nullif(trim(coalesce(placa, '')), '') is not null then 'veiculo'
  else 'compressor'
end
where categoria_ativo is null or trim(categoria_ativo) = '';

alter table public.protocolos_documentos
  alter column categoria_ativo set default 'veiculo';

alter table public.protocolos_documentos
  drop constraint if exists protocolos_documentos_categoria_ativo_check;
alter table public.protocolos_documentos
  add constraint protocolos_documentos_categoria_ativo_check
  check (categoria_ativo in ('veiculo','compressor'));

alter table public.protocolos_documentos
  drop constraint if exists protocolos_documentos_status_locacao_check;
alter table public.protocolos_documentos
  add constraint protocolos_documentos_status_locacao_check
  check (status_locacao in ('ativo','encerrado','devolvido','alterado'));

create index if not exists idx_protocolos_documentos_status_locacao
  on public.protocolos_documentos (status_locacao, categoria_ativo, data_emissao desc);
create index if not exists idx_protocolos_documentos_ativo_data
  on public.protocolos_documentos (ativo_id, created_at desc);
create index if not exists idx_protocolos_documentos_lote
  on public.protocolos_documentos (protocolo_lote_id);
