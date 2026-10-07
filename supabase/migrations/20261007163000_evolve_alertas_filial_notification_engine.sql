alter table public.alertas_filial
  add column if not exists titulo text,
  add column if not exists mensagem text,
  add column if not exists empresa_id uuid references public.empresas(id) on delete set null,
  add column if not exists origem_registro_id text,
  add column if not exists destinatario_user_id uuid,
  add column if not exists escopo text not null default 'filial',
  add column if not exists acao_url text,
  add column if not exists status text not null default 'ativo',
  add column if not exists recorrencia jsonb,
  add column if not exists resolvido_em timestamptz,
  add column if not exists resolvido_por_user_id uuid,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_alertas_filial_empresa_id on public.alertas_filial(empresa_id);
create index if not exists idx_alertas_filial_destinatario on public.alertas_filial(destinatario_user_id);
create index if not exists idx_alertas_filial_status_nivel on public.alertas_filial(status, nivel);
create index if not exists idx_alertas_filial_created_at on public.alertas_filial(created_at desc);

create table if not exists public.alertas_filial_leituras (
  alerta_id uuid not null references public.alertas_filial(id) on delete cascade,
  user_id uuid not null,
  lido_em timestamptz not null default now(),
  primary key (alerta_id, user_id)
);

alter table public.alertas_filial_leituras enable row level security;

create policy alertas_filial_leituras_select_own
  on public.alertas_filial_leituras for select
  using (user_id = auth.uid());

create policy alertas_filial_leituras_insert_own
  on public.alertas_filial_leituras for insert
  with check (user_id = auth.uid());

create policy alertas_filial_leituras_update_own
  on public.alertas_filial_leituras for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy alertas_filial_select_engine
  on public.alertas_filial for select
  using (
    auth.uid() is not null
    and (
      destinatario_user_id = auth.uid()
      or (
        destinatario_user_id is null
        and (
          escopo = 'global'
          or (empresa_id is not null and public.topac_filial_company_allowed(empresa_id, auth.uid()))
          or (empresa_id is null and (
            (public.has_role(auth.uid(), 'filial_praia') and upper(filial) like '%PRAIA%')
            or (public.has_role(auth.uid(), 'filial_goiania') and upper(filial) like '%GOI%')
            or (public.has_role(auth.uid(), 'filial_matriz') and upper(filial) like '%MATRIZ%')
            or public.topac_has_any_role(array['admin','diretor_geral'], auth.uid())
          ))
        )
      )
    )
  );
