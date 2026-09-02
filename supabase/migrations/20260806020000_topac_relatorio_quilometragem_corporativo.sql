-- TOPAC RH PRO Multiempresas
-- Relatório corporativo de quilometragem, com sequência por veículo e separação operacional.

create or replace function public.relatorio_quilometragem_periodo(
  p_data_inicio date,
  p_data_fim date
)
returns setof jsonb
language plpgsql
stable
security invoker
set search_path = public
as $function$
begin
  if (select auth.uid()) is null then
    raise exception 'Autenticação obrigatória';
  end if;

  if not public.topac_has_any_role(
    array['admin', 'diretor_geral', 'operacional'],
    (select auth.uid())
  ) then
    raise exception 'Acesso restrito à administração e operação';
  end if;

  if p_data_inicio is null or p_data_fim is null then
    raise exception 'Data inicial e data final são obrigatórias';
  end if;

  if p_data_fim < p_data_inicio then
    raise exception 'A data final não pode ser anterior à data inicial';
  end if;

  return query
  with leituras_validas as (
    select
      a.*,
      upper(trim(a.placa)) as placa_normalizada,
      lag(a.km_atual) over (
        partition by upper(trim(a.placa))
        order by a.data, a.hora, a.created_at, a.id
      ) as km_anterior_veiculo
    from public.abastecimentos a
    where coalesce(a.excluido, false) = false
      and coalesce(a.registro_teste, false) = false
      and coalesce(lower(a.status), '') <> 'cancelado'
      and nullif(trim(a.placa), '') is not null
      and a.km_atual is not null
      and a.km_atual >= 0
      and a.data <= p_data_fim
  ), periodo as (
    select *
    from leituras_validas
    where data between p_data_inicio and p_data_fim
  )
  select jsonb_build_object(
    'id', p.id,
    'funcionario_id', p.funcionario_id,
    'funcionario_nome', coalesce(nullif(trim(f.nome), ''), nullif(trim(p.mecanico_nome), ''), 'Não identificado'),
    'empresa_id', coalesce(f.empresa_id, f.company_id),
    'empresa_nome', coalesce(nullif(trim(e.nome), ''), nullif(trim(p.empresa), ''), nullif(trim(p.filial), ''), 'Empresa não identificada'),
    'empresa', p.empresa,
    'filial', p.filial,
    'placa', p.placa_normalizada,
    'data', p.data,
    'hora', p.hora,
    'km_inicial', case
      when p.km_anterior_veiculo is not null and p.km_atual >= p.km_anterior_veiculo
        then p.km_anterior_veiculo
      when p.km_anterior_veiculo is null
        and p.km_rodado is not null
        and p.km_rodado >= 0
        and p.km_atual >= p.km_rodado
        then p.km_atual - p.km_rodado
      else null
    end,
    'km_final', p.km_atual,
    'total_rodado', case
      when p.km_anterior_veiculo is not null and p.km_atual >= p.km_anterior_veiculo
        then p.km_atual - p.km_anterior_veiculo
      when p.km_anterior_veiculo is null
        and p.km_rodado is not null
        and p.km_rodado >= 0
        and p.km_atual >= p.km_rodado
        then p.km_rodado
      else null
    end,
    'motivo_rota', coalesce(
      nullif(trim(p.observacao), ''),
      nullif(trim(p.endereco), ''),
      case when nullif(trim(p.posto_nome), '') is not null then 'Abastecimento em ' || trim(p.posto_nome) end,
      'Não informado'
    ),
    'fonte_km', case
      when p.km_anterior_veiculo is not null and p.km_atual >= p.km_anterior_veiculo then 'sequencia'
      when p.km_anterior_veiculo is not null and p.km_atual < p.km_anterior_veiculo then 'inconsistente'
      when p.km_anterior_veiculo is null
        and p.km_rodado is not null
        and p.km_rodado >= 0
        and p.km_atual >= p.km_rodado then 'registrado'
      else 'sem_base'
    end,
    'status', p.status,
    'created_at', p.created_at
  )
  from periodo p
  left join public.funcionarios f on f.id = p.funcionario_id
  left join public.empresas e on e.id = coalesce(f.empresa_id, f.company_id)
  order by
    coalesce(e.nome, p.empresa, p.filial, ''),
    coalesce(f.nome, p.mecanico_nome, ''),
    p.placa_normalizada,
    p.data,
    p.hora,
    p.created_at,
    p.id;
end;
$function$;

comment on function public.relatorio_quilometragem_periodo(date, date) is
  'Retorna a sequência de KM por veículo no período, incluindo a leitura anterior válida fora do período para calcular o KM inicial.';

revoke all on function public.relatorio_quilometragem_periodo(date, date) from public, anon;
grant execute on function public.relatorio_quilometragem_periodo(date, date) to authenticated;
