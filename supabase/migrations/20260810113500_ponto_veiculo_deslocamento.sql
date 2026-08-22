create table if not exists public.ponto_veiculo (
  id uuid primary key default gen_random_uuid(),
  funcionario_id uuid references public.funcionarios(id) on delete set null,
  empresa_id uuid references public.empresas(id) on delete set null,
  ativo_id uuid references public.ativos(id) on delete set null,
  employee_code text not null,
  funcionario_nome text not null,
  empresa_nome text,
  filial text,
  data date not null,
  veiculo_placa text not null,
  veiculo_descricao text,
  km_saida bigint not null check (km_saida >= 0),
  km_saida_ocr bigint,
  saida_origem_km text not null default 'ocr_confirmado' check (saida_origem_km in ('ocr_confirmado','manual_corrigido')),
  saida_em timestamptz not null,
  saida_latitude numeric(10,7) not null check (saida_latitude between -90 and 90),
  saida_longitude numeric(10,7) not null check (saida_longitude between -180 and 180),
  saida_precisao_metros numeric(10,2),
  saida_foto_path text not null,
  saida_device text,
  km_chegada bigint,
  km_chegada_ocr bigint,
  chegada_origem_km text check (chegada_origem_km is null or chegada_origem_km in ('ocr_confirmado','manual_corrigido')),
  chegada_em timestamptz,
  chegada_latitude numeric(10,7) check (chegada_latitude is null or chegada_latitude between -90 and 90),
  chegada_longitude numeric(10,7) check (chegada_longitude is null or chegada_longitude between -180 and 180),
  chegada_precisao_metros numeric(10,2),
  chegada_foto_path text,
  chegada_device text,
  km_total bigint generated always as (case when km_chegada is null then null else km_chegada - km_saida end) stored,
  status text not null default 'aberto' check (status in ('aberto','concluido')),
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ponto_veiculo_km_chegada_valido check (km_chegada is null or km_chegada >= km_saida),
  constraint ponto_veiculo_chegada_completa check (
    (status = 'aberto' and km_chegada is null and chegada_em is null and chegada_foto_path is null)
    or
    (status = 'concluido' and km_chegada is not null and chegada_em is not null and chegada_foto_path is not null)
  )
);

create unique index if not exists ponto_veiculo_dia_veiculo_uidx
  on public.ponto_veiculo (employee_code, data, veiculo_placa);

create index if not exists ponto_veiculo_data_idx on public.ponto_veiculo (data desc);
create index if not exists ponto_veiculo_employee_code_data_idx on public.ponto_veiculo (employee_code, data desc);
create index if not exists ponto_veiculo_funcionario_data_idx on public.ponto_veiculo (funcionario_id, data desc);
create index if not exists ponto_veiculo_empresa_data_idx on public.ponto_veiculo (empresa_id, data desc);

alter table public.ponto_veiculo enable row level security;

grant select on table public.ponto_veiculo to authenticated;
grant select, insert, update, delete on table public.ponto_veiculo to service_role;

drop policy if exists ponto_veiculo_gestores_select on public.ponto_veiculo;
create policy ponto_veiculo_gestores_select
  on public.ponto_veiculo
  for select
  to authenticated
  using ((select public.topac_has_any_role(array['admin','diretor_geral']::text[], auth.uid())));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ponto-veiculo',
  'ponto-veiculo',
  false,
  6291456,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists ponto_veiculo_gestores_storage_select on storage.objects;
create policy ponto_veiculo_gestores_storage_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'ponto-veiculo'
    and (select public.topac_has_any_role(array['admin','diretor_geral']::text[], auth.uid()))
  );

comment on table public.ponto_veiculo is 'Ponto diário de deslocamento do veículo usado pelo mecânico, com KM, fotos e geolocalização de saída e chegada.';
comment on column public.ponto_veiculo.km_saida_ocr is 'KM originalmente lido pelo OCR antes da confirmação/correção manual.';
comment on column public.ponto_veiculo.km_chegada_ocr is 'KM originalmente lido pelo OCR antes da confirmação/correção manual.';