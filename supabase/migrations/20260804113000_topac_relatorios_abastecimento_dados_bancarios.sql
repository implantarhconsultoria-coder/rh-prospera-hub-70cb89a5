-- TOPAC RH PRO Multiempresas
-- Relatórios históricos de abastecimento + dados bancários estruturados.

alter table public.funcionarios
  add column if not exists banco text,
  add column if not exists banco_codigo text,
  add column if not exists agencia text,
  add column if not exists conta text,
  add column if not exists conta_digito text,
  add column if not exists tipo_conta text,
  add column if not exists titular_conta text,
  add column if not exists cpf_titular text,
  add column if not exists pix text,
  add column if not exists tipo_chave_pix text,
  add column if not exists dados_bancarios_origem text,
  add column if not exists dados_bancarios_atualizado_em timestamptz;

comment on column public.funcionarios.dados_bancarios_origem is
  'Texto colado pelo usuário, mantido para revisão e auditoria do preenchimento automático.';

update public.abastecimentos
set competencia = to_char(data, 'YYYY-MM')
where competencia is null or btrim(competencia) = '';

create index if not exists idx_abastecimentos_periodo_funcionario
  on public.abastecimentos (data, funcionario_id)
  where coalesce(excluido, false) = false and coalesce(registro_teste, false) = false;

create index if not exists idx_abastecimentos_funcionario_periodo
  on public.abastecimentos (funcionario_id, data desc)
  where coalesce(excluido, false) = false and coalesce(registro_teste, false) = false;

create or replace function public.relatorio_abastecimento_periodo(
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
  if auth.uid() is null then
    raise exception 'Autenticação obrigatória';
  end if;

  if not public.topac_has_any_role(array['admin','diretor_geral'], auth.uid()) then
    raise exception 'Acesso restrito à administração';
  end if;

  if p_data_inicio is null or p_data_fim is null then
    raise exception 'Data inicial e data final são obrigatórias';
  end if;

  if p_data_fim < p_data_inicio then
    raise exception 'A data final não pode ser anterior à data inicial';
  end if;

  return query
  select jsonb_build_object(
    'id', a.id,
    'funcionario_id', a.funcionario_id,
    'funcionario_nome', coalesce(nullif(trim(f.nome), ''), nullif(trim(a.mecanico_nome), ''), 'Não identificado'),
    'empresa_id', coalesce(f.empresa_id, f.company_id),
    'empresa_nome', coalesce(nullif(trim(e.nome), ''), nullif(trim(a.empresa), ''), nullif(trim(a.filial), ''), 'Empresa não identificada'),
    'empresa', a.empresa,
    'filial', a.filial,
    'placa', a.placa,
    'data', a.data,
    'hora', a.hora,
    'competencia', coalesce(a.competencia, to_char(a.data, 'YYYY-MM')),
    'combustivel', a.combustivel,
    'valor', a.valor,
    'litros', a.litros,
    'valor_por_litro', a.valor_por_litro,
    'km_atual', a.km_atual,
    'km_rodado', a.km_rodado,
    'posto_nome', a.posto_nome,
    'posto_cnpj', a.posto_cnpj,
    'posto_endereco', a.posto_endereco,
    'posto_telefone', a.posto_telefone,
    'foto_bomba_url', a.foto_bomba_url,
    'foto_painel_url', a.foto_painel_url,
    'latitude', a.latitude,
    'longitude', a.longitude,
    'endereco', a.endereco,
    'observacao', a.observacao,
    'status', a.status,
    'preenchimento', a.preenchimento,
    'recibo_pdf_url', a.recibo_pdf_url,
    'recibo_pdf_gerado_em', a.recibo_pdf_gerado_em,
    'created_at', a.created_at
  )
  from public.abastecimentos a
  left join public.funcionarios f on f.id = a.funcionario_id
  left join public.empresas e on e.id = coalesce(f.empresa_id, f.company_id)
  where coalesce(a.excluido, false) = false
    and coalesce(a.registro_teste, false) = false
    and a.data between p_data_inicio and p_data_fim
  order by e.nome, coalesce(f.nome, a.mecanico_nome), a.data, a.hora;
end;
$function$;

create or replace function public.app_mecanico_registrar_abastecimento_posto(
  p_acesso_id uuid,
  p_posto_codigo text,
  p_valor numeric,
  p_litros numeric,
  p_combustivel text,
  p_km numeric,
  p_placa text default null,
  p_observacao text default null,
  p_foto_bomba_url text default null,
  p_foto_painel_url text default null,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_endereco text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v public.acessos_externos;
  p public.postos_combustivel;
  v_id uuid;
  v_placas text[];
  v_placa text;
  v_unidade text;
  v_empresa text;
  v_exige_selecao_carro boolean;
  v_preco_litro numeric;
  v_recibo text;
  v_now_sp timestamp without time zone := clock_timestamp() at time zone 'America/Sao_Paulo';
begin
  begin
    v := public._app_mecanico_get_acesso(p_acesso_id);
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'acesso_nao_autorizado');
  end;

  if coalesce(p_foto_bomba_url, '') = '' then return jsonb_build_object('ok', false, 'error', 'foto_bomba_obrigatoria'); end if;
  if coalesce(p_foto_painel_url, '') = '' then return jsonb_build_object('ok', false, 'error', 'foto_painel_obrigatoria'); end if;

  select * into p
  from public.postos_combustivel
  where upper(trim(codigo)) = upper(trim(coalesce(p_posto_codigo, '')))
    and status = 'ativo'
    and deleted_at is null
  limit 1;
  if not found or coalesce(p.tipo_qr, 'posto') = 'unidade' then
    return jsonb_build_object('ok', false, 'error', 'posto_invalido');
  end if;

  v_placas := public._app_mecanico_placas_from_obs(v.observacoes);
  v_unidade := upper(coalesce(p.unidade, ''));
  v_empresa := upper(coalesce(v.empresa, '') || ' ' || coalesce(v.filial, ''));
  v_exige_selecao_carro := v_unidade like '%GOIANIA%' or v_unidade like '%PRAIA%' or v_empresa like '%GOIANIA%' or v_empresa like '%PRAIA%';
  v_placa := upper(coalesce(nullif(p_placa, ''), case when v_exige_selecao_carro then null else v_placas[1] end));
  if coalesce(v_placa, '') = '' then return jsonb_build_object('ok', false, 'error', 'placa_obrigatoria'); end if;

  v_preco_litro := case when coalesce(p_valor, 0) > 0 and coalesce(p_litros, 0) > 0 then round(p_valor / p_litros, 3) else null end;
  v_recibo := concat_ws(E'\n',
    'TOPAC RH PRO - COMPROVANTE DE ABASTECIMENTO',
    'Funcionario: ' || coalesce(v.nome, ''),
    'Empresa/Unidade: ' || coalesce(v.empresa, '') || case when coalesce(v.filial, '') <> '' then ' - ' || v.filial else '' end,
    'Veiculo: ' || coalesce(v_placa, ''),
    'Posto: ' || coalesce(p.nome, ''),
    'Dados de valor, litros, preco e KM registrados nas fotos anexas.',
    'Data/Hora: ' || to_char(v_now_sp, 'DD/MM/YYYY HH24:MI:SS'));

  insert into public.abastecimentos(
    qr_codigo, acesso_externo_id, funcionario_id, mecanico_nome, empresa, filial, placa,
    data, hora, competencia, combustivel, valor, litros, valor_por_litro, km_atual, km_rodado,
    posto_nome, posto_cnpj, posto_endereco, posto_id, posto_codigo, posto_telefone,
    foto_bomba_url, foto_painel_url, latitude, longitude, endereco, observacao,
    status, preenchimento, recibo_texto, recibo_gerado_em, validado_por)
  values (
    p.codigo, v.id, v.funcionario_id, v.nome, coalesce(v.empresa, ''), coalesce(v.filial, ''), nullif(v_placa, ''),
    v_now_sp::date, v_now_sp::time, to_char(v_now_sp, 'YYYY-MM'), nullif(p_combustivel, ''), coalesce(p_valor, 0), coalesce(p_litros, 0), v_preco_litro, p_km, null,
    p.nome, p.cnpj, p.endereco, p.id, p.codigo, p.telefone,
    p_foto_bomba_url, p_foto_painel_url, p_latitude, p_longitude, p_endereco, nullif(p_observacao, ''),
    'concluido', 'fotos', v_recibo, clock_timestamp(), v.nome)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'recibo_texto', v_recibo);
end;
$function$;

update public.clinicas_envio_config
set assinatura = E'Atenciosamente,\nAdministrador Topac RH PRO Multiempresas',
    emails_copia = array['adm.matriz@topac.com.br','robson@topac.com.br'],
    updated_at = now()
where codigo = 'ponte-aerea';
