-- Views operacionais usadas pela nova tela: estoque consolidado e consumo mensal.
create or replace view public.almoxarifado_estoque_resumo
with (security_invoker=true) as
with ent as (
  select item_id,coalesce(sum(quantidade),0) as entradas,max(coalesce(data_entrada,created_at::date)) as ultima_entrada
  from public.almoxarifado_entradas group by item_id
), sai as (
  select item_id,coalesce(sum(quantidade),0) as saidas,max(coalesce(data_saida,created_at::date)) as ultima_saida
  from public.almoxarifado_saidas group by item_id
)
select i.id,i.company_id,i.codigo_topac,i.codigo_alternativo,i.codigo_sku,i.nome,i.categoria,i.aplicacao,i.unidade,i.quantidade as saldo,i.estoque_minimo,
  coalesce(ent.entradas,0)+coalesce(i.planilha_ajuste_aumentar,0) as entradas_total,
  coalesce(sai.saidas,0)+coalesce(i.planilha_ajuste_diminuir,0) as saidas_total,
  i.planilha_ajuste_aumentar,i.planilha_ajuste_diminuir,i.valor_unitario,i.planilha_valor_estoque,
  coalesce(sai.ultima_saida,i.planilha_ultima_saida) as ultima_saida,
  ent.ultima_entrada,i.planilha_ultimo_pedido,i.planilha_status,
  case when coalesce(i.quantidade,0)<=coalesce(i.estoque_minimo,0) then 'COMPRAR' else 'IDEAL' end as status_atual,
  i.ativo,i.observacoes,i.created_at,i.updated_at
from public.almoxarifado_itens i
left join ent on ent.item_id=i.id
left join sai on sai.item_id=i.id;

grant select on public.almoxarifado_estoque_resumo to authenticated;

create or replace view public.almoxarifado_consumo_mensal
with (security_invoker=true) as
select s.item_id,s.company_id,extract(year from coalesce(s.data_saida,s.created_at::date))::int as ano,
  extract(month from coalesce(s.data_saida,s.created_at::date))::int as mes,
  sum(greatest(coalesce(s.quantidade_utilizada,s.quantidade,0)-coalesce(s.quantidade_devolvida,0),0))::numeric as consumo
from public.almoxarifado_saidas s
group by s.item_id,s.company_id,extract(year from coalesce(s.data_saida,s.created_at::date)),extract(month from coalesce(s.data_saida,s.created_at::date));

grant select on public.almoxarifado_consumo_mensal to authenticated;
