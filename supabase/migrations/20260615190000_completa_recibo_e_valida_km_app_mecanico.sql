alter table public.abastecimentos
  add column if not exists recibo_pdf_url text,
  add column if not exists recibo_pdf_gerado_em timestamptz;

create or replace function public.app_mecanico_vincular_recibo_pdf(
  p_acesso_id uuid,
  p_abastecimento_id uuid,
  p_recibo_pdf_url text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v public.acessos_externos;
  v_id uuid;
begin
  begin
    v := public._app_mecanico_get_acesso(p_acesso_id);
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'acesso_nao_autorizado');
  end;

  if coalesce(trim(p_recibo_pdf_url), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'recibo_pdf_obrigatorio');
  end if;

  update public.abastecimentos
     set recibo_pdf_url = trim(p_recibo_pdf_url),
         recibo_pdf_gerado_em = now()
   where id = p_abastecimento_id
     and acesso_externo_id = v.id
  returning id into v_id;

  if v_id is null then
    return jsonb_build_object('ok', false, 'error', 'abastecimento_nao_encontrado');
  end if;

  return jsonb_build_object('ok', true, 'id', v_id, 'recibo_pdf_url', trim(p_recibo_pdf_url));
end;
$function$;

grant execute on function public.app_mecanico_vincular_recibo_pdf(uuid, uuid, text)
  to anon, authenticated, service_role;

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
set search_path to 'public'
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
  v_ultimo_km numeric;
  v_preco_litro numeric;
  v_km_rodado numeric;
  v_recibo text;
begin
  begin
    v := public._app_mecanico_get_acesso(p_acesso_id);
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'acesso_nao_autorizado');
  end;

  if coalesce(p_foto_bomba_url, '') = '' then return jsonb_build_object('ok', false, 'error', 'foto_bomba_obrigatoria'); end if;
  if coalesce(p_foto_painel_url, '') = '' then return jsonb_build_object('ok', false, 'error', 'foto_painel_obrigatoria'); end if;
  if coalesce(p_valor, 0) <= 0 or coalesce(p_litros, 0) <= 0 then return jsonb_build_object('ok', false, 'error', 'valor_litros_obrigatorios'); end if;
  if coalesce(p_km, 0) <= 0 then return jsonb_build_object('ok', false, 'error', 'km_obrigatorio'); end if;

  select * into p
    from public.postos_combustivel
   where upper(trim(codigo)) = upper(trim(coalesce(p_posto_codigo, '')))
     and status = 'ativo'
     and deleted_at is null
   limit 1;
  if not found or coalesce(p.tipo_qr, 'posto') = 'unidade' then return jsonb_build_object('ok', false, 'error', 'posto_invalido'); end if;

  v_placas := public._app_mecanico_placas_from_obs(v.observacoes);
  v_unidade := upper(coalesce(p.unidade, ''));
  v_empresa := upper(coalesce(v.empresa, '') || ' ' || coalesce(v.filial, ''));
  v_exige_selecao_carro := v_unidade like '%GOIANIA%' or v_unidade like '%PRAIA%' or v_empresa like '%GOIANIA%' or v_empresa like '%PRAIA%';
  v_placa := upper(coalesce(nullif(p_placa, ''), case when v_exige_selecao_carro then null else v_placas[1] end));
  if coalesce(v_placa, '') = '' then return jsonb_build_object('ok', false, 'error', 'placa_obrigatoria'); end if;

  select a.km_atual into v_ultimo_km
    from public.abastecimentos a
   where a.placa is not null
     and upper(replace(a.placa, '-', '')) = upper(replace(coalesce(v_placa, ''), '-', ''))
     and a.km_atual is not null
     and coalesce(a.excluido, false) = false
   order by a.data desc, a.hora desc, a.created_at desc
   limit 1;

  v_preco_litro := round(p_valor / nullif(p_litros, 0), 3);
  v_km_rodado := case when v_ultimo_km is not null and p_km >= v_ultimo_km then p_km - v_ultimo_km else null end;
  v_recibo := concat_ws(E'\n',
    'TOPAC RH PRO - RECIBO DE ABASTECIMENTO',
    'Funcionario: ' || coalesce(v.nome, ''),
    'Empresa/Unidade: ' || coalesce(v.empresa, '') || case when coalesce(v.filial, '') <> '' then ' - ' || v.filial else '' end,
    'Veiculo: ' || coalesce(v_placa, ''),
    'Posto: ' || coalesce(p.nome, ''),
    'CNPJ: ' || coalesce(p.cnpj, ''),
    'Endereco: ' || coalesce(p.endereco, ''),
    'Combustivel: ' || coalesce(p_combustivel, ''),
    'Litros: ' || p_litros::text,
    'Valor por litro: ' || v_preco_litro::text,
    'Valor total: ' || p_valor::text,
    'KM: ' || p_km::text,
    'Data/Hora: ' || to_char(now(), 'DD/MM/YYYY HH24:MI:SS'));

  insert into public.abastecimentos(
    qr_codigo, acesso_externo_id, funcionario_id, mecanico_nome, empresa, filial, placa,
    data, hora, combustivel, valor, litros, valor_por_litro, km_atual, km_rodado,
    posto_nome, posto_cnpj, posto_endereco, posto_id, posto_codigo, posto_telefone,
    foto_bomba_url, foto_painel_url, latitude, longitude, endereco, observacao,
    status, preenchimento, recibo_texto, recibo_gerado_em, validado_por)
  values (
    p.codigo, v.id, v.funcionario_id, v.nome, coalesce(v.empresa, ''), coalesce(v.filial, ''), nullif(v_placa, ''),
    current_date, current_time, nullif(p_combustivel, ''), p_valor, p_litros, v_preco_litro, p_km, v_km_rodado,
    p.nome, p.cnpj, p.endereco, p.id, p.codigo, p.telefone,
    p_foto_bomba_url, p_foto_painel_url, p_latitude, p_longitude, p_endereco, nullif(p_observacao, ''),
    'concluido', 'qr_posto', v_recibo, now(), v.nome)
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'preco_litro', v_preco_litro,
    'valor_por_litro', v_preco_litro,
    'km_rodado', v_km_rodado,
    'recibo_texto', v_recibo
  );
end;
$function$;