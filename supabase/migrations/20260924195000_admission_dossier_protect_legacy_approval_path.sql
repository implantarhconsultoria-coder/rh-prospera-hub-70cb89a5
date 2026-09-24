-- Preserva o pré-cadastro antigo para uso normal, porém obriga o novo dossiê
-- a concluir a admissão apenas pelo OK próprio e após recebimento do contrato.
create or replace function public.topac_dossier_legacy_approval_guard()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.status = 'cadastro_oficial'
    and (tg_op='INSERT' or old.status is distinct from new.status)
    and exists (select 1 from public.admission_dossier_workflow w where w.pre_cadastro_id=new.id)
    and current_setting('topac.dossier_approval',true) is distinct from 'true'
  then
    raise exception 'Este candidato está no Dossiê Admissional. O OK só pode ser dado dentro do dossiê, com contrato recebido e conferido.';
  end if;
  return new;
end $$;
drop trigger if exists topac_dossier_legacy_approval_guard_tg on public.pre_cadastros_admissionais;
create trigger topac_dossier_legacy_approval_guard_tg
before insert or update of status on public.pre_cadastros_admissionais
for each row execute function public.topac_dossier_legacy_approval_guard();

do $$
declare definition text;
begin
 select pg_get_functiondef(p.oid) into definition
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='admin_dossie_aprovar_com_contrato';
 if definition is null then raise exception 'Função de aprovação de dossiê não encontrada'; end if;
 if position('v_employee := public.admin_pre_cadastro_aprovar_oficial(p_id);' in definition)=0 then
   raise exception 'Trecho de chamada legada não encontrado, abortando patch.';
 end if;
 definition:=replace(definition,
   'v_employee := public.admin_pre_cadastro_aprovar_oficial(p_id);',
   'perform set_config(''topac.dossier_approval'', ''true'', true);' || chr(10) ||
   '  v_employee := public.admin_pre_cadastro_aprovar_oficial(p_id);' || chr(10) ||
   '  perform set_config(''topac.dossier_approval'', ''false'', true);');
 execute definition;
end $$;
