-- Autoriza o estoque pelo auth.uid() e pela role admin oficial do TOPAC RH PRO.
-- Independente do email em cache no cliente/JWT. Mantem a whitelist para as demais contas.
CREATE OR REPLACE FUNCTION public.estoque_interno_cadastrar_item(p_codigo integer, p_descricao text, p_unidade text DEFAULT 'Unidade'::text, p_aplicacao text DEFAULT NULL::text, p_minimo numeric DEFAULT NULL::numeric, p_maximo numeric DEFAULT NULL::numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_email text;v_id uuid;
begin
 select a.email into v_email from public.estoque_interno_meu_acesso() a
   where a.pode_gerenciar;
 if auth.uid() is null or v_email is null then
   raise exception 'Sem permissão para cadastrar produtos' using errcode='42501';
 end if;
 if p_codigo is null or p_codigo<=0 or btrim(coalesce(p_descricao,''))='' then
   raise exception 'Código e descrição obrigatórios';
 end if;
 insert into public.estoque_interno_itens(
   codigo,descricao,unidade,aplicacao,estoque_minimo,estoque_maximo)
 values(p_codigo,btrim(p_descricao),
   coalesce(nullif(btrim(p_unidade),''),'Unidade'),p_aplicacao,p_minimo,p_maximo)
 returning id into v_id;
 return v_id;
end $function$


CREATE OR REPLACE FUNCTION public.estoque_interno_meu_acesso()
 RETURNS TABLE(email text, nome text, ativo boolean, pode_movimentar boolean, pode_gerenciar boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select lower(u.email)::text,
        coalesce(a.nome, nullif(u.raw_user_meta_data->>'nome_completo',''), split_part(u.email,'@',1))::text,
        true,
        (admin.is_admin or coalesce(a.pode_movimentar,false)),
        (admin.is_admin or coalesce(a.pode_gerenciar,false))
 from auth.users as u
 cross join lateral (
   select exists (
     select 1 from public.user_roles ur
     where ur.user_id = u.id and ur.role = 'admin'
   ) as is_admin
 ) as admin
 left join public.estoque_interno_acessos a on a.email = lower(u.email)
 where u.id = auth.uid()
   and (admin.is_admin or coalesce(a.ativo,false))
$function$


CREATE OR REPLACE FUNCTION public.estoque_interno_movimentar(p_codigo integer, p_tipo text, p_quantidade numeric, p_destinatario text DEFAULT NULL::text, p_observacao text DEFAULT NULL::text, p_preco_unitario numeric DEFAULT NULL::numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_email text;v_uid uuid;v_id uuid;v_saldo numeric;v_novo numeric;
begin
 v_uid:=auth.uid();
 select a.email into v_email from public.estoque_interno_meu_acesso() a
   where a.pode_movimentar;
 if v_uid is null or v_email is null then
   raise exception 'Acesso não autorizado ao estoque interno' using errcode='42501';
 end if;
 if p_tipo not in ('entrada','saida') or p_quantidade is null or p_quantidade<=0 or p_quantidade>1000000 then
   raise exception 'Tipo ou quantidade inválida';
 end if;
 if p_tipo='saida' and btrim(coalesce(p_destinatario,''))='' then
   raise exception 'Informe para quem foi entregue';
 end if;
 if p_preco_unitario is not null and p_preco_unitario<0 then
   raise exception 'Preço inválido';
 end if;
 select id,saldo_atual into v_id,v_saldo
 from public.estoque_interno_itens where codigo=p_codigo for update;
 if v_id is null then raise exception 'Produto não encontrado';end if;
 v_novo:=v_saldo+case when p_tipo='entrada' then p_quantidade else -p_quantidade end;
 if v_novo<0 then raise exception 'Saldo insuficiente. Disponível: %',v_saldo;end if;
 update public.estoque_interno_itens
 set saldo_atual=v_novo,atualizado_em=now() where id=v_id;
 insert into public.estoque_interno_movimentos(
   item_id,tipo,quantidade,data_movimento,destinatario,origem_responsavel,
   preco_unitario,observacao,ator_user_id,ator_email,saldo_antes,saldo_depois)
 values(v_id,p_tipo,p_quantidade,(now() at time zone 'America/Sao_Paulo')::date,
   nullif(btrim(coalesce(p_destinatario,'')),''),v_email,p_preco_unitario,
   nullif(btrim(coalesce(p_observacao,'')),''),v_uid,v_email,v_saldo,v_novo);
 return v_id;
end $function$
;

revoke all on function public.estoque_interno_meu_acesso() from public, anon;
grant execute on function public.estoque_interno_meu_acesso() to authenticated;
revoke all on function public.estoque_interno_movimentar(integer,text,numeric,text,text,numeric) from public, anon;
grant execute on function public.estoque_interno_movimentar(integer,text,numeric,text,text,numeric) to authenticated;
revoke all on function public.estoque_interno_cadastrar_item(integer,text,text,text,numeric,numeric) from public, anon;
grant execute on function public.estoque_interno_cadastrar_item(integer,text,text,text,numeric,numeric) to authenticated;

drop policy if exists estoque_interno_acessos_ler on public.estoque_interno_acessos;
create policy estoque_interno_acessos_ler on public.estoque_interno_acessos
  for select to authenticated using (email in (select a.email from public.estoque_interno_meu_acesso() a));
drop policy if exists estoque_interno_itens_ler on public.estoque_interno_itens;
create policy estoque_interno_itens_ler on public.estoque_interno_itens
  for select to authenticated using (exists(select 1 from public.estoque_interno_meu_acesso()));
drop policy if exists estoque_interno_movimentos_ler on public.estoque_interno_movimentos;
create policy estoque_interno_movimentos_ler on public.estoque_interno_movimentos
  for select to authenticated using (exists(select 1 from public.estoque_interno_meu_acesso()));
