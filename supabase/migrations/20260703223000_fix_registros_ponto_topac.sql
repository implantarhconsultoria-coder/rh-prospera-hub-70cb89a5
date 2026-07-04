create extension if not exists pgcrypto;

create table if not exists public.registros_ponto (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  acesso_externo_id uuid null,
  funcionario_id uuid null,
  veiculo_id uuid null,
  tipo text not null check (tipo in ('entrada', 'almoco_saida', 'almoco_volta', 'almoco_inicio', 'almoco_fim', 'saida')),
  data date not null default current_date,
  hora time without time zone not null default localtime,
  latitude double precision not null,
  longitude double precision not null,
  selfie_url text null,
  origem text not null default 'campo',
  status text not null default 'registrado',
  registro_teste boolean not null default false,
  mecanico_nome text null,
  empresa text null,
  filial text null,
  observacao text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_registros_ponto_user_data on public.registros_ponto(user_id, data);
create index if not exists idx_registros_ponto_acesso_data on public.registros_ponto(acesso_externo_id, data);
create index if not exists idx_registros_ponto_funcionario_data on public.registros_ponto(funcionario_id, data);

alter table public.registros_ponto enable row level security;

create policy registros_ponto_insert_own
  on public.registros_ponto
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy registros_ponto_select_own
  on public.registros_ponto
  for select
  to authenticated
  using (auth.uid() = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ponto-selfies', 'ponto-selfies', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;