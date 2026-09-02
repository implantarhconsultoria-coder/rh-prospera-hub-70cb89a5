-- TOPAC RH PRO Multiempresas
-- Anti-duplicidade documental auditável + identidade veicular obrigatória em novas leituras.

create table if not exists public.documentos_duplicidade_auditoria (
  id uuid primary key default gen_random_uuid(),
  tabela_origem text not null,
  registro_mantido_id uuid,
  registro_removido_id uuid not null,
  fingerprint text not null,
  dados_removidos jsonb not null default '{}'::jsonb,
  motivo text not null,
  removido_em timestamptz not null default now(),
  constraint documentos_duplicidade_auditoria_registro_unique
    unique (tabela_origem, registro_removido_id)
);

alter table public.documentos_duplicidade_auditoria enable row level security;
revoke all on public.documentos_duplicidade_auditoria from anon;
grant select on public.documentos_duplicidade_auditoria to authenticated;

drop policy if exists documentos_duplicidade_auditoria_admin_select on public.documentos_duplicidade_auditoria;
create policy documentos_duplicidade_auditoria_admin_select
on public.documentos_duplicidade_auditoria
for select to authenticated
using (public.topac_has_any_role(array['admin','diretor_geral'], auth.uid()));

create or replace function public.topac_document_locator(
  p_bucket text,
  p_path text,
  p_url text
)
returns text
language sql
immutable
parallel safe
set search_path = public
as $function$
  select case
    when btrim(coalesce(p_path, '')) ~* '^https?://' then lower(btrim(p_path))
    when btrim(coalesce(p_path, '')) <> '' then lower(concat_ws('/', nullif(btrim(p_bucket), ''), btrim(p_path)))
    when btrim(coalesce(p_url, '')) <> '' then lower(btrim(p_url))
    else ''
  end;
$function$;

-- Purga inicial: mantém o primeiro vínculo do mesmo arquivo físico para o mesmo contexto.
with ranked as (
  select d.*,
         public.topac_document_locator(d.storage_bucket, d.storage_path, d.arquivo_url) as fingerprint,
         first_value(d.id) over (
           partition by coalesce(d.funcionario_id, '00000000-0000-0000-0000-000000000000'::uuid),
                        public.topac_document_locator(d.storage_bucket, d.storage_path, d.arquivo_url)
           order by d.created_at, d.id
         ) as keep_id,
         row_number() over (
           partition by coalesce(d.funcionario_id, '00000000-0000-0000-0000-000000000000'::uuid),
                        public.topac_document_locator(d.storage_bucket, d.storage_path, d.arquivo_url)
           order by d.created_at, d.id
         ) as rn
  from public.documentos_funcionario d
)
insert into public.documentos_duplicidade_auditoria
  (tabela_origem, registro_mantido_id, registro_removido_id, fingerprint, dados_removidos, motivo)
select 'documentos_funcionario', keep_id, id, fingerprint, to_jsonb(ranked), 'purga_inicial_duplicidade_exata'
from ranked
where rn > 1 and fingerprint <> ''
on conflict (tabela_origem, registro_removido_id) do nothing;

delete from public.documentos_funcionario d
using public.documentos_duplicidade_auditoria a
where a.tabela_origem = 'documentos_funcionario'
  and a.motivo = 'purga_inicial_duplicidade_exata'
  and d.id = a.registro_removido_id;

with ranked as (
  select d.*,
         public.topac_document_locator(null, null, d.arquivo_url) as fingerprint,
         first_value(d.id) over (
           partition by d.pre_cadastro_id, public.topac_document_locator(null, null, d.arquivo_url)
           order by d.created_at, d.id
         ) as keep_id,
         row_number() over (
           partition by d.pre_cadastro_id, public.topac_document_locator(null, null, d.arquivo_url)
           order by d.created_at, d.id
         ) as rn
  from public.pre_cadastro_documentos d
)
insert into public.documentos_duplicidade_auditoria
  (tabela_origem, registro_mantido_id, registro_removido_id, fingerprint, dados_removidos, motivo)
select 'pre_cadastro_documentos', keep_id, id, fingerprint, to_jsonb(ranked), 'purga_inicial_duplicidade_exata'
from ranked
where rn > 1 and fingerprint <> ''
on conflict (tabela_origem, registro_removido_id) do nothing;

delete from public.pre_cadastro_documentos d
using public.documentos_duplicidade_auditoria a
where a.tabela_origem = 'pre_cadastro_documentos'
  and a.motivo = 'purga_inicial_duplicidade_exata'
  and d.id = a.registro_removido_id;

with ranked as (
  select d.*,
         public.topac_document_locator(null, d.storage_path, coalesce(d.arquivo_url, d.public_url)) as fingerprint,
         first_value(d.id) over (
           partition by coalesce(d.funcionario_id, '00000000-0000-0000-0000-000000000000'::uuid),
                        public.topac_document_locator(null, d.storage_path, coalesce(d.arquivo_url, d.public_url))
           order by d.created_at, d.id
         ) as keep_id,
         row_number() over (
           partition by coalesce(d.funcionario_id, '00000000-0000-0000-0000-000000000000'::uuid),
                        public.topac_document_locator(null, d.storage_path, coalesce(d.arquivo_url, d.public_url))
           order by d.created_at, d.id
         ) as rn
  from public.rh_documentos_uploads d
)
insert into public.documentos_duplicidade_auditoria
  (tabela_origem, registro_mantido_id, registro_removido_id, fingerprint, dados_removidos, motivo)
select 'rh_documentos_uploads', keep_id, id, fingerprint, to_jsonb(ranked), 'purga_inicial_duplicidade_exata'
from ranked
where rn > 1 and fingerprint <> ''
on conflict (tabela_origem, registro_removido_id) do nothing;

delete from public.rh_documentos_uploads d
using public.documentos_duplicidade_auditoria a
where a.tabela_origem = 'rh_documentos_uploads'
  and a.motivo = 'purga_inicial_duplicidade_exata'
  and d.id = a.registro_removido_id;

with ranked as (
  select d.*,
         public.topac_document_locator(null, null, d.arquivo_url) as fingerprint,
         first_value(d.id) over (
           partition by coalesce(d.funcionario_id, '00000000-0000-0000-0000-000000000000'::uuid),
                        coalesce(d.company_id, '00000000-0000-0000-0000-000000000000'::uuid),
                        public.topac_document_locator(null, null, d.arquivo_url)
           order by d.created_at, d.id
         ) as keep_id,
         row_number() over (
           partition by coalesce(d.funcionario_id, '00000000-0000-0000-0000-000000000000'::uuid),
                        coalesce(d.company_id, '00000000-0000-0000-0000-000000000000'::uuid),
                        public.topac_document_locator(null, null, d.arquivo_url)
           order by d.created_at, d.id
         ) as rn
  from public.historico_documental d
)
insert into public.documentos_duplicidade_auditoria
  (tabela_origem, registro_mantido_id, registro_removido_id, fingerprint, dados_removidos, motivo)
select 'historico_documental', keep_id, id, fingerprint, to_jsonb(ranked), 'purga_inicial_duplicidade_exata'
from ranked
where rn > 1 and fingerprint <> ''
on conflict (tabela_origem, registro_removido_id) do nothing;

delete from public.historico_documental d
using public.documentos_duplicidade_auditoria a
where a.tabela_origem = 'historico_documental'
  and a.motivo = 'purga_inicial_duplicidade_exata'
  and d.id = a.registro_removido_id;

-- Triggers de descarte imediato. O lock por fingerprint fecha a janela de corrida.
create or replace function public.topac_block_duplicate_documento_funcionario()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_fingerprint text;
  v_existing uuid;
begin
  v_fingerprint := public.topac_document_locator(new.storage_bucket, new.storage_path, new.arquivo_url);
  if v_fingerprint = '' then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('documentos_funcionario:' || coalesce(new.funcionario_id::text, '') || ':' || v_fingerprint, 0));
  select id into v_existing
  from public.documentos_funcionario
  where coalesce(funcionario_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(new.funcionario_id, '00000000-0000-0000-0000-000000000000'::uuid)
    and public.topac_document_locator(storage_bucket, storage_path, arquivo_url) = v_fingerprint
    and id <> new.id
  order by created_at, id limit 1;
  if v_existing is not null then
    insert into public.documentos_duplicidade_auditoria
      (tabela_origem, registro_mantido_id, registro_removido_id, fingerprint, dados_removidos, motivo)
    values ('documentos_funcionario', v_existing, new.id, v_fingerprint, to_jsonb(new), 'entrada_duplicada_descartada')
    on conflict (tabela_origem, registro_removido_id) do nothing;
    return null;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_documentos_funcionario_antiduplicidade on public.documentos_funcionario;
create trigger trg_documentos_funcionario_antiduplicidade
before insert or update of storage_bucket, storage_path, arquivo_url, funcionario_id
on public.documentos_funcionario
for each row execute function public.topac_block_duplicate_documento_funcionario();

create or replace function public.topac_block_duplicate_pre_cadastro_documento()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_fingerprint text;
  v_existing uuid;
begin
  v_fingerprint := public.topac_document_locator(null, null, new.arquivo_url);
  if v_fingerprint = '' then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('pre_cadastro_documentos:' || new.pre_cadastro_id::text || ':' || v_fingerprint, 0));
  select id into v_existing
  from public.pre_cadastro_documentos
  where pre_cadastro_id = new.pre_cadastro_id
    and public.topac_document_locator(null, null, arquivo_url) = v_fingerprint
    and id <> new.id
  order by created_at, id limit 1;
  if v_existing is not null then
    insert into public.documentos_duplicidade_auditoria
      (tabela_origem, registro_mantido_id, registro_removido_id, fingerprint, dados_removidos, motivo)
    values ('pre_cadastro_documentos', v_existing, new.id, v_fingerprint, to_jsonb(new), 'entrada_duplicada_descartada')
    on conflict (tabela_origem, registro_removido_id) do nothing;
    return null;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_pre_cadastro_documentos_antiduplicidade on public.pre_cadastro_documentos;
create trigger trg_pre_cadastro_documentos_antiduplicidade
before insert or update of arquivo_url, pre_cadastro_id
on public.pre_cadastro_documentos
for each row execute function public.topac_block_duplicate_pre_cadastro_documento();

create or replace function public.topac_block_duplicate_rh_documento_upload()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_fingerprint text;
  v_existing uuid;
begin
  v_fingerprint := public.topac_document_locator(null, new.storage_path, coalesce(new.arquivo_url, new.public_url));
  if v_fingerprint = '' then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('rh_documentos_uploads:' || coalesce(new.funcionario_id::text, '') || ':' || v_fingerprint, 0));
  select id into v_existing
  from public.rh_documentos_uploads
  where coalesce(funcionario_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(new.funcionario_id, '00000000-0000-0000-0000-000000000000'::uuid)
    and public.topac_document_locator(null, storage_path, coalesce(arquivo_url, public_url)) = v_fingerprint
    and id <> new.id
  order by created_at, id limit 1;
  if v_existing is not null then
    insert into public.documentos_duplicidade_auditoria
      (tabela_origem, registro_mantido_id, registro_removido_id, fingerprint, dados_removidos, motivo)
    values ('rh_documentos_uploads', v_existing, new.id, v_fingerprint, to_jsonb(new), 'entrada_duplicada_descartada')
    on conflict (tabela_origem, registro_removido_id) do nothing;
    return null;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_rh_documentos_uploads_antiduplicidade on public.rh_documentos_uploads;
create trigger trg_rh_documentos_uploads_antiduplicidade
before insert or update of storage_path, arquivo_url, public_url, funcionario_id
on public.rh_documentos_uploads
for each row execute function public.topac_block_duplicate_rh_documento_upload();

create or replace function public.topac_validate_vehicle_document_identity()
returns trigger
language plpgsql
set search_path = public
as $function$
declare
  v_document_changed boolean;
begin
  if coalesce(new.tipo, '') <> 'veiculo' then return new; end if;
  v_document_changed := tg_op = 'INSERT'
    or new.arquivo_url is distinct from old.arquivo_url
    or new.documento_url is distinct from old.documento_url
    or new.renavam is distinct from old.renavam
    or new.chassi is distinct from old.chassi;
  if not v_document_changed then return new; end if;

  new.placa := upper(regexp_replace(coalesce(new.placa, ''), '[^A-Z0-9]', '', 'g'));
  new.renavam := regexp_replace(coalesce(new.renavam, ''), '\D', '', 'g');
  new.chassi := upper(regexp_replace(coalesce(new.chassi, ''), '[^A-HJ-NPR-Z0-9]', '', 'g'));

  if length(new.renavam) < 9 then
    raise exception using errcode = '23514', message = 'RENAVAM obrigatório: o documento da Frota não pode ser salvo sem RENAVAM válido.';
  end if;
  if length(new.chassi) <> 17 then
    raise exception using errcode = '23514', message = 'Chassi obrigatório: o documento da Frota não pode ser salvo sem chassi completo de 17 caracteres.';
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_ativos_vehicle_required_identity on public.ativos;
create trigger trg_ativos_vehicle_required_identity
before insert or update of tipo, arquivo_url, documento_url, renavam, chassi, placa
on public.ativos
for each row execute function public.topac_validate_vehicle_document_identity();

create unique index if not exists ux_documentos_funcionario_owner_locator
on public.documentos_funcionario (
  coalesce(funcionario_id, '00000000-0000-0000-0000-000000000000'::uuid),
  public.topac_document_locator(storage_bucket, storage_path, arquivo_url)
)
where public.topac_document_locator(storage_bucket, storage_path, arquivo_url) <> '';

create unique index if not exists ux_pre_cadastro_documentos_owner_locator
on public.pre_cadastro_documentos (
  pre_cadastro_id,
  public.topac_document_locator(null, null, arquivo_url)
)
where public.topac_document_locator(null, null, arquivo_url) <> '';

create unique index if not exists ux_rh_documentos_uploads_owner_locator
on public.rh_documentos_uploads (
  coalesce(funcionario_id, '00000000-0000-0000-0000-000000000000'::uuid),
  public.topac_document_locator(null, storage_path, coalesce(arquivo_url, public_url))
)
where public.topac_document_locator(null, storage_path, coalesce(arquivo_url, public_url)) <> '';

create unique index if not exists ux_ativos_vehicle_placa
on public.ativos ((upper(regexp_replace(coalesce(placa, ''), '[^A-Z0-9]', '', 'g'))))
where tipo = 'veiculo' and upper(regexp_replace(coalesce(placa, ''), '[^A-Z0-9]', '', 'g')) <> '';

create unique index if not exists ux_ativos_vehicle_renavam
on public.ativos ((regexp_replace(coalesce(renavam, ''), '\D', '', 'g')))
where tipo = 'veiculo' and regexp_replace(coalesce(renavam, ''), '\D', '', 'g') <> '';

create unique index if not exists ux_ativos_vehicle_chassi
on public.ativos ((upper(regexp_replace(coalesce(chassi, ''), '[^A-HJ-NPR-Z0-9]', '', 'g'))))
where tipo = 'veiculo' and upper(regexp_replace(coalesce(chassi, ''), '[^A-HJ-NPR-Z0-9]', '', 'g')) <> '';
