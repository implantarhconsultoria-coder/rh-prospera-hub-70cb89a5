-- Estrutura aditiva para preservar os campos operacionais da planilha oficial do Almoxarifado.
alter table public.almoxarifado_itens add column if not exists planilha_entrada_total numeric default 0;
alter table public.almoxarifado_itens add column if not exists planilha_saida_total numeric default 0;
alter table public.almoxarifado_itens add column if not exists planilha_ajuste_aumentar numeric default 0;
alter table public.almoxarifado_itens add column if not exists planilha_ajuste_diminuir numeric default 0;
alter table public.almoxarifado_itens add column if not exists planilha_status text;
alter table public.almoxarifado_itens add column if not exists planilha_ultimo_pedido date;
alter table public.almoxarifado_itens add column if not exists planilha_ultima_saida date;
alter table public.almoxarifado_itens add column if not exists planilha_valor_estoque numeric default 0;
alter table public.almoxarifado_itens add column if not exists planilha_linha integer;
alter table public.almoxarifado_entradas add column if not exists hora_informada boolean not null default true;
alter table public.almoxarifado_saidas add column if not exists hora_informada boolean not null default true;

create or replace view public.almoxarifado_compras_priorizadas
with (security_invoker=true) as
with consumo as (
  select s.item_id,
    coalesce(sum(case when coalesce(s.data_saida,s.created_at::date) >= current_date-90 then greatest(coalesce(s.quantidade_utilizada,s.quantidade,0)-coalesce(s.quantidade_devolvida,0),0) else 0 end),0)::numeric as consumo_90d,
    max(coalesce(s.data_saida,s.created_at::date)) as ultima_saida
  from public.almoxarifado_saidas s group by s.item_id
), base as (
  select i.*,
    coalesce(c.consumo_90d,0) as consumo_90d,
    ceil(coalesce(c.consumo_90d,0)/3.0) as media_mensal,
    greatest(coalesce(i.estoque_minimo,0),ceil(coalesce(c.consumo_90d,0)/3.0)) as minimo_calculado,
    c.ultima_saida
  from public.almoxarifado_itens i left join consumo c on c.item_id=i.id
  where i.ativo=true
)
select b.id as item_id,b.company_id,b.codigo_topac,b.codigo_alternativo,b.nome,b.aplicacao,
  coalesce(b.quantidade,0) as saldo,b.estoque_minimo,b.consumo_90d,b.media_mensal,b.minimo_calculado,
  case when b.consumo_90d>0 then round((coalesce(b.quantidade,0)/(b.consumo_90d/90.0))::numeric,1) else null end as cobertura_dias,
  greatest(ceil(greatest(b.minimo_calculado,1)*1.5)-coalesce(b.quantidade,0),0) as quantidade_sugerida,
  b.ultima_saida,b.planilha_status,
  case
    when coalesce(b.quantidade,0)<=0 and (b.minimo_calculado>0 or upper(coalesce(b.planilha_status,''))='COMPRAR') then 'URGENTE'
    when coalesce(b.quantidade,0)<=b.minimo_calculado and (b.minimo_calculado>0 or upper(coalesce(b.planilha_status,''))='COMPRAR') then 'CRÍTICO'
    when b.minimo_calculado>0 and coalesce(b.quantidade,0)<=ceil(b.minimo_calculado*1.5) then 'NO PRAZO'
    else null
  end as prioridade
from base b;

grant select on public.almoxarifado_compras_priorizadas to authenticated;

create or replace function public.almoxarifado_import_excel_batch_v3(p_lote uuid,p_seq integer,p_tipo text,p_company_code text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='public' as $$
declare
  v_company uuid; v_company_name text; v_user uuid; v_count integer:=0; v_missing integer:=0;
  v_items integer:=0; v_entries integer:=0; v_exits integer:=0; v_total numeric:=0;
  v_expected_items integer:=0; v_expected_entries integer:=0; v_expected_exits integer:=0; v_expected_total numeric:=0;
begin
  if p_lote is null or p_seq is null or p_tipo is null or p_payload is null then raise exception 'Payload de importação inválido'; end if;
  if p_tipo not in ('items','entries','exits','finalize') then raise exception 'Tipo de importação inválido: %',p_tipo; end if;
  if p_company_code not in ('topac-matriz','topac-pg','topac-gyn') then raise exception 'Unidade TOPAC inválida'; end if;
  select e.id,e.nome into v_company,v_company_name from public.empresas e where e.codigo=p_company_code and e.status='ativa' limit 1;
  select ur.user_id into v_user from public.user_roles ur where ur.role='admin' order by ur.user_id limit 1;
  if v_company is null or v_user is null then raise exception 'Contexto de importação não encontrado'; end if;
  perform set_config('request.jwt.claim.sub',v_user::text,true); perform set_config('request.jwt.claim.role','authenticated',true); perform public.almoxarifado_set_company_context(v_company);

  if p_tipo<>'finalize' then
    insert into public.almoxarifado_import_payload_staging(lote_id,seq,payload)
    values(p_lote,p_seq,jsonb_build_object('tipo',p_tipo,'company_code',p_company_code,'rows',jsonb_array_length(p_payload))::text)
    on conflict(lote_id,seq) do update set payload=excluded.payload;
  end if;

  if p_tipo='items' then
    with src as (select value v from jsonb_array_elements(p_payload)), ins as (
      insert into public.almoxarifado_itens(user_id,nome,categoria,codigo_sku,unidade,quantidade,valor_unitario,descricao,localizacao,ativo,codigo_topac,codigo_alternativo,aplicacao,empresa,estoque_minimo,observacoes,inativo_em,origem_importacao,importacao_lote_id,company_id,planilha_entrada_total,planilha_saida_total,planilha_ajuste_aumentar,planilha_ajuste_diminuir,planilha_status,planilha_ultimo_pedido,planilha_ultima_saida,planilha_valor_estoque,planilha_linha)
      select v_user,coalesce(nullif(btrim(s.v->>'nome'),''),'ITEM SEM DESCRIÇÃO'),nullif(btrim(s.v->>'categoria'),''),nullif(btrim(s.v->>'codigo_sku'),''),coalesce(nullif(btrim(s.v->>'unidade'),''),'un'),coalesce((s.v->>'saldo')::numeric,0),coalesce((s.v->>'valor_unitario')::numeric,0),nullif(btrim(s.v->>'nome'),''),nullif(btrim(s.v->>'localizacao'),''),not coalesce((s.v->>'inativo')::boolean,false),nullif(btrim(s.v->>'codigo_topac'),''),nullif(btrim(s.v->>'codigo_alternativo'),''),nullif(btrim(s.v->>'aplicacao'),''),v_company_name,coalesce((s.v->>'minimo')::numeric,0),concat_ws(' | ',nullif(btrim(s.v->>'observacoes'),''),'Importado da planilha oficial, linha '||coalesce(nullif(s.v->>'row',''),'histórica')),case when coalesce((s.v->>'inativo')::boolean,false) then now() else null end,'XLSM:'||p_lote::text||':Estoque:'||coalesce(nullif(s.v->>'row',''),'sem-linha'),p_lote,v_company,
      coalesce((s.v->>'entrada_total')::numeric,0),coalesce((s.v->>'saida_total')::numeric,0),coalesce((s.v->>'ajuste_aumentar')::numeric,0),coalesce((s.v->>'ajuste_diminuir')::numeric,0),nullif(btrim(s.v->>'status_planilha'),''),nullif(s.v->>'ultimo_pedido','')::date,nullif(s.v->>'ultima_saida','')::date,coalesce((s.v->>'valor_estoque')::numeric,0),nullif(s.v->>'row','')::integer
      from src s where not exists(select 1 from public.almoxarifado_itens i where i.importacao_lote_id=p_lote and i.origem_importacao='XLSM:'||p_lote::text||':Estoque:'||coalesce(nullif(s.v->>'row',''),'sem-linha')) returning 1)
    select count(*) into v_count from ins;

  elsif p_tipo='entries' then
    perform set_config('topac.almox_history_import','1',true);
    with src as (select value v from jsonb_array_elements(p_payload)), mapped as (
      select s.v,i.id item_id from src s left join lateral(select ai.id from public.almoxarifado_itens ai where ai.importacao_lote_id=p_lote and (ai.codigo_topac=s.v->>'codigo' or ai.codigo_alternativo=s.v->>'codigo' or ai.codigo_sku=s.v->>'codigo') order by ai.ativo desc,(ai.codigo_topac=s.v->>'codigo') desc,ai.id limit 1)i on true), ins as (
      insert into public.almoxarifado_entradas(user_id,item_id,quantidade,fornecedor,valor_unitario,valor_total,nota_fiscal,observacao,observacoes,empresa,data_entrada,responsavel_nome,origem_importacao,importacao_lote_id,created_at,company_id,hora_informada)
      select v_user,m.item_id,coalesce((m.v->>'quantidade')::numeric,0),nullif(btrim(m.v->>'fornecedor'),''),coalesce((m.v->>'valor_unitario')::numeric,0),coalesce((m.v->>'valor_total')::numeric,0),nullif(btrim(m.v->>'nf'),''),concat_ws(' | ',case when nullif(btrim(m.v->>'empresa_compra'),'') is not null then 'Empresa/Compra: '||(m.v->>'empresa_compra') end,case when nullif(btrim(m.v->>'emissao'),'') is not null then 'Emissão: '||(m.v->>'emissao') end,case when nullif(btrim(m.v->>'descricao_nf'),'') is not null then 'Descrição NF: '||(m.v->>'descricao_nf') end,'Importado da aba Entrada, linha '||(m.v->>'row')),'Migração XLSM',v_company_name,nullif(m.v->>'data','')::date,nullif(btrim(m.v->>'responsavel'),''),'XLSM:'||p_lote::text||':Entrada:'||(m.v->>'row'),p_lote,coalesce((nullif(m.v->>'data','')::date::timestamp at time zone 'America/Sao_Paulo'),now()),v_company,false
      from mapped m where m.item_id is not null and coalesce((m.v->>'quantidade')::numeric,0)>0 and not exists(select 1 from public.almoxarifado_entradas e where e.importacao_lote_id=p_lote and e.origem_importacao='XLSM:'||p_lote::text||':Entrada:'||(m.v->>'row')) returning 1)
    select count(*) into v_count from ins;
    select count(*) into v_missing from jsonb_array_elements(p_payload) s(v) where not exists(select 1 from public.almoxarifado_itens ai where ai.importacao_lote_id=p_lote and (ai.codigo_topac=s.v->>'codigo' or ai.codigo_alternativo=s.v->>'codigo' or ai.codigo_sku=s.v->>'codigo'));
    perform set_config('topac.almox_history_import','0',true); if v_missing>0 then raise exception '% entradas sem item correspondente',v_missing; end if;

  elsif p_tipo='exits' then
    perform set_config('topac.almox_history_import','1',true);
    with src as (select value v from jsonb_array_elements(p_payload)), mapped as (
      select s.v,i.id item_id from src s left join lateral(select ai.id from public.almoxarifado_itens ai where ai.importacao_lote_id=p_lote and (ai.codigo_topac=s.v->>'codigo' or ai.codigo_alternativo=s.v->>'codigo' or ai.codigo_sku=s.v->>'codigo') order by ai.ativo desc,(ai.codigo_topac=s.v->>'codigo') desc,ai.id limit 1)i on true), ins as (
      insert into public.almoxarifado_saidas(user_id,item_id,quantidade,funcionario_nome,mecanico_nome,motivo,observacao,observacoes,empresa,data_saida,patrimonio,ficha,quantidade_entregue,quantidade_utilizada,quantidade_devolvida,numero_serie,responsavel_liberacao,origem_importacao,importacao_lote_id,created_at,company_id,hora_informada)
      select v_user,m.item_id,coalesce((m.v->>'quantidade')::numeric,0),nullif(btrim(m.v->>'mecanico'),''),nullif(btrim(m.v->>'mecanico'),''),'Saída histórica importada','Importado da aba Saídas, linha '||(m.v->>'row'),'Migração XLSM',v_company_name,nullif(m.v->>'data','')::date,nullif(btrim(m.v->>'patrimonio'),''),nullif(btrim(m.v->>'ficha'),''),coalesce((m.v->>'quantidade')::numeric,0),case when nullif(m.v->>'utilizado','') is not null then (m.v->>'utilizado')::numeric else null end,0,nullif(btrim(m.v->>'numero_serie'),''),'Importação XLSM','XLSM:'||p_lote::text||':Saidas:'||(m.v->>'row'),p_lote,coalesce((nullif(m.v->>'data','')::date::timestamp at time zone 'America/Sao_Paulo'),now()),v_company,false
      from mapped m where m.item_id is not null and coalesce((m.v->>'quantidade')::numeric,0)>0 and not exists(select 1 from public.almoxarifado_saidas e where e.importacao_lote_id=p_lote and e.origem_importacao='XLSM:'||p_lote::text||':Saidas:'||(m.v->>'row')) returning 1)
    select count(*) into v_count from ins;
    select count(*) into v_missing from jsonb_array_elements(p_payload) s(v) where not exists(select 1 from public.almoxarifado_itens ai where ai.importacao_lote_id=p_lote and (ai.codigo_topac=s.v->>'codigo' or ai.codigo_alternativo=s.v->>'codigo' or ai.codigo_sku=s.v->>'codigo'));
    perform set_config('topac.almox_history_import','0',true); if v_missing>0 then raise exception '% saídas sem item correspondente',v_missing; end if;

  elsif p_tipo='finalize' then
    v_expected_items:=coalesce((p_payload->>'items')::integer,0); v_expected_entries:=coalesce((p_payload->>'entries')::integer,0); v_expected_exits:=coalesce((p_payload->>'exits')::integer,0); v_expected_total:=coalesce((p_payload->>'total_saldo')::numeric,0);
    select count(*),coalesce(sum(quantidade),0) into v_items,v_total from public.almoxarifado_itens where importacao_lote_id=p_lote;
    select count(*) into v_entries from public.almoxarifado_entradas where importacao_lote_id=p_lote;
    select count(*) into v_exits from public.almoxarifado_saidas where importacao_lote_id=p_lote;
    return jsonb_build_object('ok',v_items=v_expected_items and v_entries=v_expected_entries and v_exits=v_expected_exits and abs(v_total-v_expected_total)<0.000001,'items',v_items,'entries',v_entries,'exits',v_exits,'total_saldo',v_total,'expected_items',v_expected_items,'expected_entries',v_expected_entries,'expected_exits',v_expected_exits,'expected_total_saldo',v_expected_total);
  end if;
  return jsonb_build_object('ok',true,'tipo',p_tipo,'inserted',v_count,'seq',p_seq);
end; $$;

revoke all on function public.almoxarifado_import_excel_batch_v3(uuid,integer,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.almoxarifado_import_excel_batch_v3(uuid,integer,text,text,jsonb) to service_role;
