-- O app de mecânicos também usa _topac_admin_usuario_autorizado().
-- Restaurar a autorização operacional; isolar concessão de papéis em função própria.
create or replace function public._topac_admin_usuario_autorizado()
returns boolean language sql stable security definer set search_path to 'public','auth'
as $fn$
  select public.has_role(auth.uid(),'admin')
  or exists (
    select 1 from auth.users au
    where au.id=auth.uid() and lower(au.email)='adm.matriz@topac.com.br'
  );
$fn$;

create or replace function public.topac_admin_pode_gerenciar_usuarios()
returns boolean language sql stable security definer set search_path to 'public'
as $fn$
  select public._topac_admin_usuario_autorizado()
     and not public.topac_operador_restrito('assinatura_digital');
$fn$;
revoke all on function public.topac_admin_pode_gerenciar_usuarios() from public,anon;
grant execute on function public.topac_admin_pode_gerenciar_usuarios() to authenticated;

-- Troca somente nas RPCs de gestão de identidade/permissões.
-- Não altera o painel ou a operação de mecânicos.
do $do$
declare v_name text;
        v_def text;
        v_oid oid;
        v_names text[]:=array[
          'admin_aprovar_cadastro_pendente',
          'admin_bloquear_cadastro_pendente',
          'admin_configurar_acessos_funcionario',
          'admin_confirmar_email_manual',
          'admin_excluir_cadastro_pendente',
          'admin_excluir_usuario',
          'admin_listar_usuarios_v2',
          'admin_marcar_reenvio_confirmacao',
          'admin_salvar_usuario_acesso'
        ];
begin
  foreach v_name in array v_names loop
    select p.oid,pg_get_functiondef(p.oid) into v_oid,v_def
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=v_name and p.prokind='f';
    if v_oid is null then
      raise exception 'Função de permissões não encontrada: %',v_name;
    end if;
    if position('public._topac_admin_usuario_autorizado()' in v_def)=0 then
      raise exception 'Verificação esperada ausente: %',v_name;
    end if;
    execute replace(
      v_def,
      'public._topac_admin_usuario_autorizado()',
      'public.topac_admin_pode_gerenciar_usuarios()'
    );
  end loop;
end;
$do$;
