-- Persistências operacionais de 16/09/2026 aplicadas em produção.
create table if not exists public.almoxarifado_documentos_assinados (
 id uuid primary key default gen_random_uuid(), fechamento_funcionario_id uuid references public.almoxarifado_fechamentos_funcionario(id) on delete set null,
 funcionario_id uuid references public.funcionarios(id) on delete set null, funcionario_nome text not null, data_referencia date not null,
 arquivo_url text not null, arquivo_nome text, enviado_por uuid, enviado_por_nome text, created_at timestamptz not null default now()
);
create index if not exists idx_almox_docs_func_data on public.almoxarifado_documentos_assinados(funcionario_id,data_referencia desc);
create table if not exists public.almoxarifado_autorizacoes_excepcionais (
 id uuid primary key default gen_random_uuid(), data_hora timestamptz not null default now(), funcionario_id uuid references public.funcionarios(id) on delete set null,
 funcionario_nome text, motivo text not null, autorizado_por uuid, autorizado_por_nome text not null, operador_id uuid, operador_nome text not null,
 carga_id uuid references public.almoxarifado_cargas(id) on delete set null, created_at timestamptz not null default now()
);
create table if not exists public.almoxarifado_fechamentos_mensais (
 id uuid primary key default gen_random_uuid(), competencia date not null, company_id uuid, empresa_nome text, resumo jsonb not null default '[]'::jsonb,
 detalhe jsonb not null default '[]'::jsonb, fechado_por uuid, fechado_por_nome text, fechado_em timestamptz not null default now(), unique(competencia,company_id)
);
create table if not exists public.ativos_documentos_historico (
 id uuid primary key default gen_random_uuid(), ativo_id uuid not null references public.ativos(id) on delete cascade, placa text, descricao text, empresa text,
 ano_fabricacao text, ano_modelo text, renavam text, chassi text, documento_url text, documento_nome text, documento_atualizado_em timestamptz,
 arquivado_em timestamptz not null default now(), arquivado_por uuid
);
create index if not exists idx_ativos_docs_hist_ativo on public.ativos_documentos_historico(ativo_id,arquivado_em desc);
create or replace function public.arquivar_documento_ativo_anterior() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if old.documento_url is not null and new.documento_url is distinct from old.documento_url then
  insert into public.ativos_documentos_historico(ativo_id,placa,descricao,empresa,ano_fabricacao,ano_modelo,renavam,chassi,documento_url,documento_nome,documento_atualizado_em,arquivado_por)
  values(old.id,old.placa,old.descricao,old.empresa,old.ano_fabricacao,old.ano_modelo,old.renavam,old.chassi,old.documento_url,old.documento_nome,old.documento_atualizado_em,new.user_id);
 end if; return new;
end $$;
drop trigger if exists trg_ativos_arquiva_documento on public.ativos;
create trigger trg_ativos_arquiva_documento before update of documento_url on public.ativos for each row execute function public.arquivar_documento_ativo_anterior();
alter table public.almoxarifado_documentos_assinados enable row level security;
alter table public.almoxarifado_autorizacoes_excepcionais enable row level security;
alter table public.almoxarifado_fechamentos_mensais enable row level security;
alter table public.ativos_documentos_historico enable row level security;
create policy almox_docs_central_all on public.almoxarifado_documentos_assinados for all to authenticated using (public.almoxarifado_is_central(auth.uid())) with check (public.almoxarifado_is_central(auth.uid()));
create policy almox_aut_central_all on public.almoxarifado_autorizacoes_excepcionais for all to authenticated using (public.almoxarifado_is_central(auth.uid())) with check (public.almoxarifado_is_central(auth.uid()));
create policy almox_mensal_central_all on public.almoxarifado_fechamentos_mensais for all to authenticated using (public.almoxarifado_is_central(auth.uid())) with check (public.almoxarifado_is_central(auth.uid()));
create policy ativos_hist_auth_read on public.ativos_documentos_historico for select to authenticated using (true);
revoke execute on function public.arquivar_documento_ativo_anterior() from public, anon, authenticated;