-- A operação atual do almoxarifado é retirada por funcionário, sem assinatura digital.
create or replace function public.almoxarifado_criar_carga_v2(p_tipo text, p_funcionario_id uuid, p_veiculo text default null::text, p_placa text default null::text, p_itens jsonb default '[]'::jsonb, p_observacoes text default null::text) returns jsonb language plpgsql security definer set search_path='public' as $$
declare v_company uuid; v_company_name text; v_dest_company uuid; v_dest_name text; v_func_nome text; v_carga uuid; v_protocolo text; v_row jsonb; v_item uuid; v_qtd numeric;
begin
 if not public.almoxarifado_is_central(auth.uid()) then raise exception 'Acesso não autorizado'; end if;
 if lower(coalesce(p_tipo,'')) not in ('carro','mecanico','retirada') then raise exception 'Tipo de carga inválido'; end if;
 if jsonb_array_length(coalesce(p_itens,'[]'::jsonb))=0 then raise exception 'Adicione ao menos um item'; end if;
 select e.id,e.nome into v_company,v_company_name from public.empresas e where e.codigo='topac-matriz' limit 1;
 select f.nome,coalesce(f.company_id,f.empresa_id),e.nome into v_func_nome,v_dest_company,v_dest_name from public.funcionarios f left join public.empresas e on e.id=coalesce(f.company_id,f.empresa_id) where f.id=p_funcionario_id and coalesce(f.ativo,true)=true limit 1;
 if v_func_nome is null then raise exception 'Funcionário não encontrado ou inativo'; end if;
 v_protocolo:=public.almoxarifado_novo_protocolo(case when lower(p_tipo)='carro' then 'CAR' when lower(p_tipo)='mecanico' then 'MEC' else 'RET' end);
 insert into public.almoxarifado_cargas(empresa,funcionario_id,funcionario_nome,veiculo,data_carga,status,observacoes,user_id,company_id,tipo,protocolo,placa,destino_company_id,status_assinatura)
 values(v_company_name,p_funcionario_id,v_func_nome,nullif(p_veiculo,''),current_date,'concluida',p_observacoes,auth.uid(),v_company,lower(p_tipo),v_protocolo,nullif(p_placa,''),v_dest_company,'nao_aplicavel') returning id into v_carga;
 for v_row in select value from jsonb_array_elements(p_itens) loop
  v_item:=(v_row->>'item_id')::uuid; v_qtd:=coalesce((v_row->>'quantidade')::numeric,0);
  if v_qtd<=0 then raise exception 'Quantidade inválida'; end if;
  update public.almoxarifado_itens set quantidade=quantidade-v_qtd, updated_at=now() where id=v_item and ativo=true and quantidade>=v_qtd;
  if not found then raise exception 'Item sem saldo suficiente'; end if;
  insert into public.almoxarifado_carga_itens(carga_id,item_id,quantidade_entregue,quantidade_utilizada,quantidade_devolvida,observacoes) values(v_carga,v_item,v_qtd,0,0,nullif(v_row->>'observacao',''));
  insert into public.almoxarifado_saidas(user_id,item_id,quantidade,funcionario_id,funcionario_nome,mecanico_nome,motivo,observacao,empresa,data_saida,veiculo,quantidade_entregue,quantidade_devolvida,responsavel_liberacao,company_id,hora_informada)
  values(auth.uid(),v_item,v_qtd,p_funcionario_id,v_func_nome,v_func_nome,'Retirada - '||v_protocolo,p_observacoes,v_company_name,current_date,null,v_qtd,0,coalesce(auth.jwt()->>'email','Usuário'),v_company,true);
 end loop;
 return jsonb_build_object('ok',true,'id',v_carga,'protocolo',v_protocolo,'funcionario',v_func_nome,'empresa_destino',v_dest_name);
end $$;
revoke execute on function public.almoxarifado_criar_carga_v2(text,uuid,text,text,jsonb,text) from public, anon;
grant execute on function public.almoxarifado_criar_carga_v2(text,uuid,text,text,jsonb,text) to authenticated;