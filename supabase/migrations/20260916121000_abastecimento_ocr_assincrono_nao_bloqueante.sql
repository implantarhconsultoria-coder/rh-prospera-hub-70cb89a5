alter table public.abastecimento_autorizacoes
  add column if not exists ocr_valor numeric,
  add column if not exists ocr_litros numeric,
  add column if not exists ocr_preco_litro numeric,
  add column if not exists ocr_km numeric,
  add column if not exists ocr_bomba_em timestamptz,
  add column if not exists ocr_painel_em timestamptz,
  add column if not exists ocr_status text;

create or replace function public.app_mecanico_registrar_ocr_abastecimento(
  p_acesso_id uuid,
  p_autorizacao_id uuid,
  p_valor numeric default null,
  p_litros numeric default null,
  p_preco_litro numeric default null,
  p_km numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v public.acessos_externos;
  a public.abastecimento_autorizacoes;
  v_valor numeric;
  v_litros numeric;
  v_preco numeric;
  v_km numeric;
begin
  begin
    v := public._app_mecanico_get_acesso(p_acesso_id);
  exception when others then
    return jsonb_build_object('ok',false,'error','acesso_nao_autorizado');
  end;

  select * into a
    from public.abastecimento_autorizacoes
   where id = p_autorizacao_id
     and funcionario_id = v.funcionario_id
   for update;

  if a.id is null then
    return jsonb_build_object('ok',false,'error','solicitacao_nao_encontrada');
  end if;

  v_valor := case when p_valor between 5 and 10000 then p_valor else null end;
  v_litros := case when p_litros between 0.5 and 500 then p_litros else null end;
  v_preco := case when p_preco_litro between 1.5 and 30 then p_preco_litro else null end;
  if v_valor is not null and v_litros is not null and v_preco is null then
    v_preco := round(v_valor / nullif(v_litros,0), 3);
  end if;
  v_km := case when p_km between 1000 and 9999999 then round(p_km) else null end;

  update public.abastecimento_autorizacoes
     set ocr_valor = coalesce(v_valor, ocr_valor),
         ocr_litros = coalesce(v_litros, ocr_litros),
         ocr_preco_litro = coalesce(v_preco, ocr_preco_litro),
         ocr_km = coalesce(v_km, ocr_km),
         ocr_bomba_em = case when v_valor is not null and v_litros is not null then now() else ocr_bomba_em end,
         ocr_painel_em = case when v_km is not null then now() else ocr_painel_em end,
         ocr_status = case
           when coalesce(v_valor,ocr_valor) is not null and coalesce(v_litros,ocr_litros) is not null and coalesce(v_km,ocr_km) is not null then 'completo'
           when coalesce(v_valor,ocr_valor) is not null or coalesce(v_litros,ocr_litros) is not null or coalesce(v_km,ocr_km) is not null then 'parcial'
           else coalesce(ocr_status,'pendente')
         end,
         updated_at = now()
   where id = a.id
   returning * into a;

  update public.abastecimentos ab
     set valor = case when coalesce(a.ocr_valor,0) > 0 then a.ocr_valor else ab.valor end,
         litros = case when coalesce(a.ocr_litros,0) > 0 then a.ocr_litros else ab.litros end,
         valor_por_litro = case
           when coalesce(a.ocr_preco_litro,0) > 0 then a.ocr_preco_litro
           when coalesce(a.ocr_valor,0) > 0 and coalesce(a.ocr_litros,0) > 0 then round(a.ocr_valor/a.ocr_litros,3)
           else ab.valor_por_litro
         end,
         km_atual = case when coalesce(a.ocr_km,0) > 0 then a.ocr_km else ab.km_atual end,
         preenchimento = case
           when coalesce(a.ocr_valor,0) > 0 and coalesce(a.ocr_litros,0) > 0 and coalesce(a.ocr_km,0) > 0 then 'app_mecanicos_ocr_fotos'
           else 'app_mecanicos_fotos_ocr_pendente'
         end,
         observacao = case
           when coalesce(a.ocr_valor,0) > 0 or coalesce(a.ocr_litros,0) > 0 or coalesce(a.ocr_km,0) > 0
             then concat_ws(' | ', nullif(trim(coalesce(ab.observacao,'')),''), 'Leitura automática processada no sistema')
           else ab.observacao
         end,
         updated_at = now()
   where ab.autorizacao_id = a.id;

  return jsonb_build_object(
    'ok',true,
    'valor',a.ocr_valor,
    'litros',a.ocr_litros,
    'valor_por_litro',a.ocr_preco_litro,
    'km_atual',a.ocr_km,
    'status',a.ocr_status
  );
end;
$function$;

grant execute on function public.app_mecanico_registrar_ocr_abastecimento(uuid,uuid,numeric,numeric,numeric,numeric) to anon, authenticated;

create or replace function public.app_mecanico_finalizar_abastecimento_fotografico_v3(
  p_acesso_id uuid,
  p_autorizacao_id uuid,
  p_valor numeric,
  p_litros numeric,
  p_km numeric,
  p_foto_bomba_url text,
  p_foto_painel_url text,
  p_foto_recibo_url text,
  p_latitude double precision,
  p_longitude double precision,
  p_endereco text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v public.acessos_externos;
  a public.abastecimento_autorizacoes;
  v_result jsonb;
  v_id uuid;
  v_valor numeric;
  v_litros numeric;
  v_km numeric;
  v_preco numeric;
  v_recibo text;
  v_ab public.abastecimentos;
begin
  if coalesce(trim(p_foto_bomba_url),'')='' then return jsonb_build_object('ok',false,'error','foto_bomba_obrigatoria'); end if;
  if coalesce(trim(p_foto_painel_url),'')='' then return jsonb_build_object('ok',false,'error','foto_painel_obrigatoria'); end if;
  if coalesce(trim(p_foto_recibo_url),'')='' then return jsonb_build_object('ok',false,'error','foto_recibo_obrigatoria'); end if;

  begin
    v := public._app_mecanico_get_acesso(p_acesso_id);
  exception when others then
    return jsonb_build_object('ok',false,'error','acesso_nao_autorizado');
  end;

  select * into a
    from public.abastecimento_autorizacoes
   where id = p_autorizacao_id
     and funcionario_id = v.funcionario_id
   limit 1;
  if a.id is null then return jsonb_build_object('ok',false,'error','solicitacao_nao_encontrada'); end if;

  v_valor := case when coalesce(p_valor,0) > 0 then p_valor else a.ocr_valor end;
  v_litros := case when coalesce(p_litros,0) > 0 then p_litros else a.ocr_litros end;
  v_km := case when coalesce(p_km,0) > 0 then p_km else a.ocr_km end;
  v_preco := case when coalesce(v_valor,0) > 0 and coalesce(v_litros,0) > 0 then round(v_valor/nullif(v_litros,0),3) else a.ocr_preco_litro end;

  v_result := public.app_mecanico_finalizar_abastecimento_autorizado(
    p_acesso_id,
    p_autorizacao_id,
    coalesce(v_valor,0),
    coalesce(v_litros,0),
    v_km,
    p_foto_bomba_url,
    p_foto_painel_url,
    p_latitude,
    p_longitude,
    p_endereco
  );

  if not coalesce((v_result->>'ok')::boolean,false) or nullif(v_result->>'id','') is null then
    return v_result;
  end if;

  v_id := (v_result->>'id')::uuid;

  update public.abastecimentos
     set foto_recibo_url = p_foto_recibo_url,
         valor = case when coalesce(v_valor,0) > 0 then v_valor else valor end,
         litros = case when coalesce(v_litros,0) > 0 then v_litros else litros end,
         valor_por_litro = case when coalesce(v_preco,0) > 0 then v_preco else valor_por_litro end,
         km_atual = case when coalesce(v_km,0) > 0 then v_km else km_atual end,
         preenchimento = case
           when coalesce(v_valor,0) > 0 and coalesce(v_litros,0) > 0 and coalesce(v_km,0) > 0 then 'app_mecanicos_ocr_fotos'
           else 'app_mecanicos_fotos_ocr_pendente'
         end,
         observacao = concat_ws(' | ', nullif(trim(coalesce(observacao,'')),''), 'Recibo do posto anexado',
           case when coalesce(v_valor,0) > 0 and coalesce(v_litros,0) > 0 and coalesce(v_km,0) > 0 then 'Dados lidos automaticamente pelas fotos' else 'Leitura automática será concluída no sistema' end),
         updated_at = now()
   where id = v_id;

  select * into v_ab from public.abastecimentos where id=v_id;

  if coalesce(v_valor,0) > 0 and coalesce(v_litros,0) > 0 and coalesce(v_km,0) > 0 then
    v_recibo := concat_ws(E'\n',
      'TOPAC RH PRO - COMPROVANTE DE ABASTECIMENTO',
      'Funcionario: '||coalesce(v_ab.mecanico_nome,''),
      'Empresa/Unidade: '||coalesce(v_ab.empresa,'')||case when coalesce(v_ab.filial,'')<>'' then ' - '||v_ab.filial else '' end,
      'Veiculo: '||coalesce(v_ab.placa,''),
      'Posto: '||coalesce(v_ab.posto_nome,''),
      'Combustivel: '||coalesce(v_ab.combustivel,''),
      'Valor total: R$ '||to_char(v_valor,'FM999999990D00'),
      'Litros: '||to_char(v_litros,'FM999999990D000')||' L',
      'Preco por litro: R$ '||to_char(v_preco,'FM999999990D000'),
      'KM/Hodometro: '||to_char(v_km,'FM9999999990'),
      case when coalesce(v_ab.app_request_id,'')<>'' then 'Autorizacao: '||v_ab.app_request_id else null end,
      'Leitura: automatica pelas fotos da bomba e do painel'
    );
    update public.abastecimentos set recibo_texto=v_recibo where id=v_id;
  end if;

  return v_result || jsonb_build_object(
    'foto_recibo_salva',true,
    'valor',coalesce(v_valor,0),
    'litros',coalesce(v_litros,0),
    'valor_por_litro',v_preco,
    'km_atual',v_km,
    'ocr_pendente',not (coalesce(v_valor,0) > 0 and coalesce(v_litros,0) > 0 and coalesce(v_km,0) > 0),
    'preenchimento',case when coalesce(v_valor,0) > 0 and coalesce(v_litros,0) > 0 and coalesce(v_km,0) > 0 then 'app_mecanicos_ocr_fotos' else 'app_mecanicos_fotos_ocr_pendente' end
  );
end;
$function$;

create or replace function public.relatorio_abastecimento_periodo(p_data_inicio date, p_data_fim date)
returns setof jsonb
language plpgsql
stable
set search_path to 'public'
as $function$
begin
  if auth.uid() is null then raise exception 'Autenticação obrigatória'; end if;
  if not public.topac_has_any_role(array['admin','diretor_geral'], auth.uid()) then raise exception 'Acesso restrito à administração'; end if;
  if p_data_inicio is null or p_data_fim is null then raise exception 'Data inicial e data final são obrigatórias'; end if;
  if p_data_fim < p_data_inicio then raise exception 'A data final não pode ser anterior à data inicial'; end if;

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
    'valor', coalesce(nullif(a.valor,0), aa.ocr_valor, 0),
    'litros', coalesce(nullif(a.litros,0), aa.ocr_litros, 0),
    'valor_por_litro', coalesce(a.valor_por_litro, aa.ocr_preco_litro,
      case when coalesce(aa.ocr_valor,0) > 0 and coalesce(aa.ocr_litros,0) > 0 then round(aa.ocr_valor/aa.ocr_litros,3) else null end),
    'km_atual', coalesce(a.km_atual, aa.ocr_km),
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
    'preenchimento', case when aa.ocr_status='completo' then 'app_mecanicos_ocr_fotos' else a.preenchimento end,
    'recibo_pdf_url', a.recibo_pdf_url,
    'recibo_pdf_gerado_em', a.recibo_pdf_gerado_em,
    'created_at', a.created_at
  )
  from public.abastecimentos a
  left join public.abastecimento_autorizacoes aa on aa.id=a.autorizacao_id
  left join public.funcionarios f on f.id = a.funcionario_id
  left join public.empresas e on e.id = coalesce(f.empresa_id, f.company_id)
  where coalesce(a.excluido, false) = false
    and coalesce(a.registro_teste, false) = false
    and a.data between p_data_inicio and p_data_fim
  order by e.nome, coalesce(f.nome, a.mecanico_nome), a.data, a.hora;
end;
$function$;
