create or replace function public.app_mecanico_dashboard_resumo(p_acesso_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.acessos_externos;
  v_comp text := to_char(timezone('America/Sao_Paulo', now()), 'YYYY-MM');
  v_hoje date := timezone('America/Sao_Paulo', now())::date;
  v_funcionarios int := 0;
  v_assinaturas int := 0;
  v_filiais int := 0;
  v_pendencias int := 0;
  v_km_hoje bigint := 0;
  v_placa text := '';
  v_veiculo text := '';
  v_ultimo_abast_data date;
  v_ultimo_abast_valor numeric;
begin
  begin
    v := public._app_mecanico_get_acesso(p_acesso_id);
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'acesso_nao_autorizado');
  end;

  select count(*) into v_funcionarios
  from public.funcionarios
  where coalesce(ativo, true) = true
    and lower(coalesce(status, 'ativo')) not like 'inativ%';

  select count(*) into v_assinaturas
  from public.payroll_signatures
  where competencia = v_comp;

  select count(*) into v_filiais
  from public.empresas
  where lower(coalesce(status, 'ativa')) in ('ativa', 'ativo');

  select count(*) into v_pendencias
  from public.chamados
  where colaborador_id = v.funcionario_id
    and lower(coalesce(status, 'aberto')) not in ('concluido','concluída','concluida','cancelado','finalizado');

  select coalesce(sum(coalesce(km_total,0)),0) into v_km_hoje
  from public.ponto_veiculo
  where funcionario_id = v.funcionario_id
    and data = v_hoje
    and lower(coalesce(status,'')) = 'concluido';

  select coalesce(pv.veiculo_placa,''), coalesce(pv.veiculo_descricao,'')
    into v_placa, v_veiculo
  from public.ponto_veiculo pv
  where pv.funcionario_id = v.funcionario_id
  order by coalesce(pv.chegada_em,pv.saida_em,pv.created_at) desc
  limit 1;

  if coalesce(v_placa,'') = '' then
    select coalesce(a.placa,''), a.data, a.valor
      into v_placa, v_ultimo_abast_data, v_ultimo_abast_valor
    from public.abastecimentos a
    where a.acesso_externo_id = v.id and coalesce(a.excluido,false)=false
    order by a.data desc, a.hora desc
    limit 1;
  else
    select a.data, a.valor
      into v_ultimo_abast_data, v_ultimo_abast_valor
    from public.abastecimentos a
    where a.acesso_externo_id = v.id and coalesce(a.excluido,false)=false
    order by a.data desc, a.hora desc
    limit 1;
  end if;

  return jsonb_build_object(
    'ok', true,
    'funcionarios_ativos', v_funcionarios,
    'assinaturas_concluidas', v_assinaturas,
    'filiais_ativas', v_filiais,
    'pendencias', v_pendencias,
    'competencia', v_comp,
    'km_hoje', v_km_hoje,
    'veiculo_placa', coalesce(v_placa,''),
    'veiculo_descricao', coalesce(v_veiculo,''),
    'ultimo_abastecimento_data', v_ultimo_abast_data,
    'ultimo_abastecimento_valor', v_ultimo_abast_valor
  );
end;
$$;

grant execute on function public.app_mecanico_dashboard_resumo(uuid) to anon, authenticated;
