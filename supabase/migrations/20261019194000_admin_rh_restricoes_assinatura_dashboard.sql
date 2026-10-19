-- Restricoes de administracao para operadores RH. Nao modifica as permissoes do ADM master.
create table if not exists public.topac_admin_restricoes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  bloquear_assinatura_digital boolean not null default true,
  ocultar_valores_dashboard boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.topac_admin_restricoes enable row level security;
revoke all on public.topac_admin_restricoes from public,anon,authenticated;
-- O cliente não tem permissão nem para ler nem para modificar as restrições.
-- O servidor é a autoridade para permitir operações sensíveis.

create or replace function public.topac_operador_restrito(p_recurso text, p_user uuid default auth.uid())
returns boolean language sql stable security definer
set search_path to 'public'
as $fn$
  select exists(
    select 1 from public.topac_admin_restricoes r
    where r.user_id = p_user
      and (case p_recurso
        when 'assinatura_digital' then r.bloquear_assinatura_digital
        when 'dashboard_valores' then r.ocultar_valores_dashboard
        else false
      end)
  );
$fn$;
revoke all on function public.topac_operador_restrito(text,uuid) from public,anon;
grant execute on function public.topac_operador_restrito(text,uuid) to authenticated;

create or replace function public.topac_minhas_restricoes()
returns jsonb language sql stable security definer set search_path to 'public'
as $fn$
  select jsonb_build_object(
    'assinatura_digital', public.topac_operador_restrito('assinatura_digital', auth.uid()),
    'dashboard_valores', public.topac_operador_restrito('dashboard_valores', auth.uid())
  ) where auth.uid() is not null;
$fn$;
revoke all on function public.topac_minhas_restricoes() from public,anon;
grant execute on function public.topac_minhas_restricoes() to authenticated;

-- A administradora operacional não pode aprovar novos administradores
-- ou alterar os próprios papéis por funções administrativas.
create or replace function public._topac_admin_usuario_autorizado()
returns boolean language sql stable security definer set search_path to 'public','auth'
as $fn$
  select not public.topac_operador_restrito('assinatura_digital',auth.uid())
   and (
    public.has_role(auth.uid(),'admin')
    or exists(
      select 1 from auth.users au
      where au.id=auth.uid() and lower(au.email)='adm.matriz@topac.com.br'
    )
  );
$fn$;

-- Não basta esconder o menu: bloquear SELECT/INSERT/UPDATE de documentos e
-- arquivos da Assinatura Digital pelas RLS atuais via a função de autorização.
create or replace function public.payroll_admin_authorized(p_company_id uuid)
returns boolean language sql stable security definer set search_path to 'public'
as $fn$
  select not public.topac_operador_restrito('assinatura_digital',auth.uid())
  and exists (
    select 1 from public.payroll_module_company_config c
    join public.empresas e on e.id=c.company_id
    where c.company_id=p_company_id
    and (
      (lower(coalesce(e.codigo,''))='topac-matriz' and regexp_replace(coalesce(e.cnpj,''),'[^0-9]','','g')='07291648000103')
      or (lower(coalesce(e.codigo,''))='topac-pg' and regexp_replace(coalesce(e.cnpj,''),'[^0-9]','','g')='07291648000294')
      or (lower(coalesce(e.codigo,''))='topac-gyn' and regexp_replace(coalesce(e.cnpj,''),'[^0-9]','','g')='07291648000375')
      or (lower(coalesce(e.codigo,''))='alqui' and regexp_replace(coalesce(e.cnpj,''),'[^0-9]','','g')='14464586000150')
      or (lower(coalesce(e.codigo,''))='lmt' and regexp_replace(coalesce(e.cnpj,''),'[^0-9]','','g')='21967711000100')
    )
  )
  and (
    public.topac_has_any_role(array['admin'],auth.uid())
    or (
      public.payroll_company_enabled(p_company_id)
      and public.topac_has_any_role(array['diretor_geral'],auth.uid())
    )
  );
$fn$;

-- Views de assinatura eram SECURITY DEFINER implicitamente e contornavam RLS.
-- Passam a respeitar as políticas de cada tabela no JWT que as consulta.
alter view public.payroll_admin_status_v set (security_invoker = true);
alter view public.payroll_signature_status_v set (security_invoker = true);
-- payroll_identity_readiness_v já era security_invoker=true.

-- Preparar a restrição antes de conceder acesso de administração.
insert into public.topac_admin_restricoes(user_id,bloquear_assinatura_digital,ocultar_valores_dashboard)
select id,true,true from auth.users where lower(email)='adm1.matriz@topac.com.br'
on conflict (user_id) do update set
 bloquear_assinatura_digital=true, ocultar_valores_dashboard=true,updated_at=now();
