-- Rastreamento dos veículos do App Mecânicos: residência como referência de fechamento.
-- Horário fixo deixa de gerar ocorrência; trânsito e viagens não são tratados como uso indevido.

update public.rastreamento_configuracao
set regras_ativas = false,
    tolerancia_minutos = 0,
    updated_at = now()
where provider = 'grtracker';

create or replace function public.admin_app_mecanicos_rastreamento_base()
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_rows jsonb;
begin
  if not public._topac_admin_usuario_autorizado() then
    return jsonb_build_object('ok', false, 'error', 'nao_autorizado');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'acesso_id', x.acesso_id,
    'funcionario_id', x.funcionario_id,
    'nome', x.nome,
    'empresa', x.empresa,
    'filial', x.filial,
    'endereco_residencial', x.endereco_residencial
  ) order by x.empresa, x.nome), '[]'::jsonb)
  into v_rows
  from (
    select
      ae.id as acesso_id,
      ae.funcionario_id,
      coalesce(f.nome, ae.nome) as nome,
      coalesce(e.nome, ae.empresa, 'SEM EMPRESA') as empresa,
      coalesce(ae.filial, '') as filial,
      nullif(trim(f.endereco), '') as endereco_residencial
    from public.acessos_externos ae
    left join public.funcionarios f on f.id = ae.funcionario_id
    left join public.empresas e on e.id = coalesce(f.empresa_id, f.company_id)
    where ae.modulo = 'mecanico'
      and ae.status = 'ativo'
      and ae.acesso_liberado is not false
      and ae.ativo is not false
  ) x;

  return jsonb_build_object('ok', true, 'mecanicos', v_rows);
end;
$function$;

revoke all on function public.admin_app_mecanicos_rastreamento_base() from public;
grant execute on function public.admin_app_mecanicos_rastreamento_base() to authenticated;
