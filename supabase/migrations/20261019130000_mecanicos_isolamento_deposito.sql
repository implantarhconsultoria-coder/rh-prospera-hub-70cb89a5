-- Correcoes preventivas TOPAC RH PRO | Mecânicos | 19/10/2026.
-- Revisar/testar antes de aplicar. Esta migration NAO ativa novos acessos.
-- Não resolver o problema de auth por ID aqui; exige implementação de sessão servidor-a-servidor.
BEGIN;
CREATE OR REPLACE FUNCTION public.app_mecanico_validar_qr_posto(p_acesso_id uuid, p_codigo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v public.acessos_externos;
  p public.postos_combustivel;
  v_codigo text;
  v_placas text[];
  v_placa text;
  v_ultimo_km numeric;
  v_goiania boolean;
  v_postos jsonb := '[]'::jsonb;
  v_veiculos jsonb := '[]'::jsonb;
  v_unidade_esperada text;
BEGIN
  BEGIN v := public._app_mecanico_get_acesso(p_acesso_id);
  EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('ok',false,'error','acesso_nao_autorizado'); END;

  v_codigo := upper(trim(coalesce(p_codigo,'')));
  SELECT * INTO p FROM public.postos_combustivel
   WHERE upper(trim(codigo))=v_codigo AND deleted_at IS NULL LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','qr_nao_encontrado'); END IF;
  IF p.status <> 'ativo' THEN RETURN jsonb_build_object('ok',false,'error','qr_bloqueado'); END IF;

  -- A unidade e derivada do cadastro validado do mecanico; nunca do QR.
  v_unidade_esperada := CASE
    WHEN upper(coalesce(v.filial,'')) LIKE '%GOIAN%' THEN 'TOPAC GOIANIA'
    WHEN upper(coalesce(v.filial,'')) LIKE '%PRAIA%' THEN 'TOPAC PRAIA GRANDE'
    ELSE 'TOPAC MATRIZ'
  END;
  IF upper(trim(coalesce(p.unidade,''))) <> v_unidade_esperada THEN
    RETURN jsonb_build_object('ok',false,'error','posto_fora_unidade');
  END IF;

  v_goiania := upper(coalesce(v.filial,'')) LIKE '%GOIAN%';
  v_placas := public._app_mecanico_placas_autorizadas(v.funcionario_id,v.observacoes,v.filial);
  v_placa := CASE WHEN v_goiania THEN NULL ELSE nullif(v_placas[1],'') END;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'ativo_id',av.id,
      'placa',x.placa,
      'descricao',coalesce(nullif(av.descricao,''),nullif(trim(concat_ws(' ',av.marca,av.modelo)),''),x.placa),
      'renavam',coalesce(av.renavam,''),
      'chassi',coalesce(av.chassi,''),
      'ano_fabricacao',coalesce(av.ano_fabricacao,''),
      'ano_modelo',coalesce(av.ano_modelo,''),
      'documento_url',coalesce(av.arquivo_url,'')
    ) ORDER BY x.placa),'[]'::jsonb)
    INTO v_veiculos
    FROM unnest(coalesce(v_placas,ARRAY[]::text[])) AS x(placa)
    LEFT JOIN LATERAL (
      SELECT a.* FROM public.ativos a
       WHERE a.tipo='veiculo'
         AND a.status='ativo'
         AND upper(regexp_replace(public.topac_placa_from_ativo(a.placa,a.descricao),'[^A-Z0-9]','','g'))=x.placa
       ORDER BY a.updated_at DESC NULLS LAST
       LIMIT 1
    ) av ON true;

  IF coalesce(p.tipo_qr,'posto')='unidade' THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('id',px.id,'codigo',px.codigo,'nome',px.nome,'unidade',px.unidade,'cnpj',px.cnpj,'endereco',px.endereco,'telefone',px.telefone,'tipo_qr',px.tipo_qr) ORDER BY px.codigo),'[]'::jsonb)
      INTO v_postos
      FROM public.postos_combustivel px
     WHERE px.codigo=ANY(coalesce(p.posto_opcoes,ARRAY[]::text[]))
       AND px.status='ativo'
       AND px.deleted_at IS NULL
       AND upper(trim(coalesce(px.unidade,'')))=v_unidade_esperada;
  END IF;

  SELECT greatest(
    coalesce((SELECT a.km_atual FROM public.abastecimentos a WHERE upper(regexp_replace(coalesce(a.placa,''),'[^A-Z0-9]','','g'))=coalesce(v_placa,v_placas[1],'') AND a.km_atual IS NOT NULL AND coalesce(a.excluido,false)=false ORDER BY a.data DESC,a.hora DESC,a.created_at DESC LIMIT 1),0),
    coalesce((SELECT coalesce(pv.km_chegada,pv.km_saida) FROM public.ponto_veiculo pv WHERE upper(regexp_replace(coalesce(pv.veiculo_placa,''),'[^A-Z0-9]','','g'))=coalesce(v_placa,v_placas[1],'') ORDER BY pv.data DESC,coalesce(pv.chegada_em,pv.saida_em,pv.created_at) DESC LIMIT 1),0)
  ) INTO v_ultimo_km;

  RETURN jsonb_build_object(
    'ok',true,
    'posto',jsonb_build_object('id',p.id,'codigo',p.codigo,'nome',p.nome,'unidade',p.unidade,'cnpj',p.cnpj,'endereco',p.endereco,'telefone',p.telefone,'tipo_qr',coalesce(p.tipo_qr,'posto')),
    'postos',v_postos,
    'mecanico',jsonb_build_object(
      'nome',v.nome,'empresa',coalesce(v.empresa,''),'filial',coalesce(v.filial,''),'funcionario_id',v.funcionario_id,
      'placa',v_placa,
      'carros',coalesce((SELECT jsonb_agg(x) FROM unnest(v_placas) x),'[]'::jsonb),
      'veiculos',v_veiculos,
      'exige_selecao_carro',v_goiania,
      'permite_placa_manual',false,
      'ultimo_km',nullif(v_ultimo_km,0)
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.app_mecanico_abastecimento_contexto(p_acesso_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v public.acessos_externos;
  v_placas text[] := array[]::text[];
  v_goiania boolean := false;
  v_unidade text;
  v_veiculos jsonb := '[]'::jsonb;
  v_postos jsonb := '[]'::jsonb;
  v_active jsonb := null;
  v_placa_fixa text;
begin
  begin
    v := public._app_mecanico_get_acesso(p_acesso_id);
  exception when others then
    return jsonb_build_object('ok',false,'error','acesso_nao_autorizado');
  end;

  perform public._app_mecanico_expirar_solicitacoes_antigas(v.funcionario_id);

  v_goiania := upper(coalesce(v.filial,'')) like '%GOIAN%';
  v_placas := public._app_mecanico_placas_autorizadas(v.funcionario_id,v.observacoes,v.filial);
  if not v_goiania then
    v_placa_fixa := nullif(v_placas[1],'');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'placa',p.placa,
      'descricao',coalesce((
        select coalesce(nullif(trim(a.descricao),''),nullif(trim(concat_ws(' ',a.marca,a.modelo)),''),p.placa)
        from public.ativos a
        where a.tipo='veiculo'
          and a.status='ativo'
          and upper(regexp_replace(public.topac_placa_from_ativo(a.placa,a.descricao),'[^A-Z0-9]','','g'))=p.placa
        order by a.updated_at desc nulls last
        limit 1
      ),p.placa)
    ) order by p.placa),'[]'::jsonb)
    into v_veiculos
    from (select distinct unnest(coalesce(v_placas,array[]::text[])) as placa) p
   where coalesce(p.placa,'')<>'';

  v_unidade := case
    when v_goiania then 'TOPAC GOIANIA'
    when upper(coalesce(v.filial,'')) like '%PRAIA%' then 'TOPAC PRAIA GRANDE'
    else 'TOPAC MATRIZ'
  end;

  select coalesce(jsonb_agg(jsonb_build_object(
      'codigo',pc.codigo,'nome',pc.nome,'unidade',pc.unidade,'cnpj',pc.cnpj,'telefone',pc.telefone,'endereco',pc.endereco
    ) order by pc.nome),'[]'::jsonb)
    into v_postos
    from (
      select * from public.postos_combustivel
       where status='ativo'
         and deleted_at is null
         and coalesce(tipo_qr,'posto')='posto'
         and upper(coalesce(unidade,''))=upper(v_unidade)
       order by nome
       limit 1
    ) pc;

  select to_jsonb(x) into v_active
    from (
      select aa.id,aa.app_request_id,aa.funcionario_nome,aa.empresa_nome,aa.filial,aa.placa,aa.combustivel,
             aa.posto_nome,aa.posto_codigo,aa.valor_estimado,aa.observacao,aa.solicitado_em,aa.status,
             aa.autorizado_em,aa.autorizado_por_nome,aa.categoria,aa.fora_expediente,aa.fim_semana
        from public.abastecimento_autorizacoes aa
       where aa.funcionario_id=v.funcionario_id
         -- Nunca recuperar solicitacao de filial anterior/outro deposito.
         and upper(trim(coalesce(aa.filial,'')))=upper(trim(coalesce(v.filial,'')))
         and (
           upper(trim(coalesce(aa.posto_nome,'')))='VIAGEM / POSTO EXTERNO'
           or exists (
             select 1 from public.postos_combustivel pc
             where pc.codigo=aa.posto_codigo
               and upper(trim(coalesce(pc.unidade,'')))=upper(v_unidade)
           )
         )
         and aa.status in ('pendente','autorizado')
         and aa.solicitado_em >= now() - interval '12 hours'
       order by aa.solicitado_em desc
       limit 1
    ) x;

  return jsonb_build_object(
    'ok',true,
    'mecanico',jsonb_build_object('nome',v.nome,'empresa',v.empresa,'filial',v.filial,'funcao',v.funcao),
    'veiculos',v_veiculos,
    'veiculo_fixo',v_placa_fixa,
    'exige_selecao_veiculo',v_goiania,
    'permite_placa_manual',false,
    'postos',v_postos,
    'solicitacao_ativa',v_active
  );
end;
$function$;

COMMIT;
