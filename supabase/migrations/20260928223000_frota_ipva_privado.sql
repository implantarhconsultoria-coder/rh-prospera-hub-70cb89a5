-- Acesso privado ao módulo de Frota/IPVA.
-- Mantém abastecimento, KM, app mecânico e demais usos de veículos intactos.
-- A restrição vale somente para as telas/rotas de Frota, IPVA, licenciamento e monitoramento.

create table if not exists public.modulo_acessos_privados (
  chave text not null,
  user_id uuid not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (chave, user_id)
);

alter table public.modulo_acessos_privados enable row level security;

revoke all on public.modulo_acessos_privados from anon, authenticated;

insert into public.modulo_acessos_privados(chave, user_id, ativo)
values ('frota_ipva', 'd8a9f8a0-153b-4882-8f98-3c6cfbf51652'::uuid, true)
on conflict (chave, user_id) do update
set ativo = true, updated_at = now();

create or replace function public.topac_tem_acesso_privado(p_chave text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.modulo_acessos_privados a
    where a.chave = p_chave
      and a.user_id = auth.uid()
      and a.ativo = true
  );
$$;

revoke all on function public.topac_tem_acesso_privado(text) from public, anon;
grant execute on function public.topac_tem_acesso_privado(text) to authenticated;
