-- TOPAC RH PRO: estoque de uniformes por local, tipo, tamanho e modelo.
-- Contagem da ficha manuscrita exige confirmação de unidade e números no aplicativo.
create table if not exists public.uniforme_estoque (
 id uuid primary key default gen_random_uuid(),
 unidade text not null check (unidade in ('SAO_PAULO','PRAIA_GRANDE','GOIANIA')),
 tipo text not null check (length(btrim(tipo))>0),
 tamanho text not null check (length(btrim(tamanho))>0),
 modelo text not null default 'PADRAO' check (length(btrim(modelo))>0),
 saldo integer not null default 0 check (saldo>=0),
 minimo integer not null default 0 check (minimo>=0),
 observacao text,
 atualizado_em timestamptz not null default now(),
 unique(unidade,tipo,tamanho,modelo)
);
create table if not exists public.uniforme_entregas (
 id uuid primary key,
 funcionario_id uuid not null references public.funcionarios(id),
 company_id uuid not null references public.empresas(id),
 unidade text not null check (unidade in ('SAO_PAULO','PRAIA_GRANDE','GOIANIA')),
 data_entrega date not null,
 itens jsonb not null,
 gerado_por uuid not null references auth.users(id),
 criado_em timestamptz not null default now()
);
create table if not exists public.uniforme_movimentos (
 id uuid primary key default gen_random_uuid(),
 estoque_id uuid not null references public.uniforme_estoque(id),
 tipo text not null check (tipo in ('contagem','entrada','saida')),
 quantidade integer not null check (quantidade>0),
 saldo_antes integer not null,
 saldo_depois integer not null check(saldo_depois>=0),
 entrega_id uuid references public.uniforme_entregas(id),
 funcionario_id uuid references public.funcionarios(id),
 responsavel_id uuid not null references auth.users(id),
 observacao text,
 criado_em timestamptz not null default now(),
 unique(entrega_id,estoque_id)
);
create index if not exists uniforme_movimentos_estoque_criado_idx on public.uniforme_movimentos(estoque_id,criado_em desc);
create index if not exists uniforme_entregas_criado_idx on public.uniforme_entregas(criado_em desc);
alter table public.uniforme_estoque enable row level security;
alter table public.uniforme_entregas enable row level security;
alter table public.uniforme_movimentos enable row level security;
drop policy if exists uniforme_estoque_admin_select on public.uniforme_estoque;
create policy uniforme_estoque_admin_select on public.uniforme_estoque for select to authenticated
 using (public.topac_has_any_role(array['admin','diretor_geral'],auth.uid()));
drop policy if exists uniforme_entregas_admin_select on public.uniforme_entregas;
create policy uniforme_entregas_admin_select on public.uniforme_entregas for select to authenticated
 using (public.topac_has_any_role(array['admin','diretor_geral'],auth.uid()));
drop policy if exists uniforme_movimentos_admin_select on public.uniforme_movimentos;
create policy uniforme_movimentos_admin_select on public.uniforme_movimentos for select to authenticated
 using (public.topac_has_any_role(array['admin','diretor_geral'],auth.uid()));

CREATE OR REPLACE FUNCTION public.uniforme_contar_estoque(p_unidade text, p_tipo text, p_tamanho text, p_modelo text, p_saldo integer, p_observacao text DEFAULT NULL::text, p_minimo integer DEFAULT 0)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid; v_antes integer; v_delta integer; v_user uuid:=auth.uid();
begin
 if v_user is null or not public.topac_has_any_role(ARRAY['admin','diretor_geral'],v_user)
 then raise exception 'Sem permissao para contar estoque' using errcode='42501'; end if;
 if p_unidade not in ('SAO_PAULO','PRAIA_GRANDE','GOIANIA') or p_tipo is null or btrim(p_tipo)='' or
    p_tamanho is null or btrim(p_tamanho)='' or p_modelo is null or btrim(p_modelo)='' or
    p_saldo is null or p_saldo<0 or p_minimo is null or p_minimo<0
 then raise exception 'Preencha unidade, item, tamanho, modelo, saldo e minimo validos';end if;
 insert into public.uniforme_estoque(unidade,tipo,tamanho,modelo,saldo,minimo)
 values(p_unidade,btrim(p_tipo),upper(btrim(p_tamanho)),upper(btrim(p_modelo)),0,p_minimo)
 on conflict(unidade,tipo,tamanho,modelo) do nothing;
 select id,saldo into v_id,v_antes from public.uniforme_estoque where unidade=p_unidade
 and tipo=btrim(p_tipo) and tamanho=upper(btrim(p_tamanho)) and modelo=upper(btrim(p_modelo)) for update;
 v_delta:=p_saldo-v_antes;
 update public.uniforme_estoque set saldo=p_saldo,minimo=p_minimo,
 observacao=coalesce(nullif(btrim(coalesce(p_observacao,'')),''),observacao),atualizado_em=now() where id=v_id;
 if v_delta<>0 then
 insert into public.uniforme_movimentos(estoque_id,tipo,quantidade,saldo_antes,saldo_depois,responsavel_id,observacao)
 values(v_id,'contagem',abs(v_delta),v_antes,p_saldo,v_user,
 concat('Contagem fisica; diferenca ',v_delta,'. ',coalesce(p_observacao,'')));
 end if;
 return v_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.uniforme_entrar_estoque(p_unidade text, p_tipo text, p_tamanho text, p_modelo text, p_quantidade integer, p_observacao text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid;v_antes integer;v_user uuid:=auth.uid();
begin
 if v_user is null or not public.topac_has_any_role(ARRAY['admin','diretor_geral'],v_user)
 then raise exception 'Sem permissao para entradas de uniformes' using errcode='42501';end if;
 if p_unidade not in ('SAO_PAULO','PRAIA_GRANDE','GOIANIA') or
 p_tipo is null or btrim(p_tipo)='' or p_tamanho is null or btrim(p_tamanho)='' or
 p_modelo is null or btrim(p_modelo)='' or p_quantidade is null or p_quantidade<=0 or p_quantidade>100000
 then raise exception 'Informe unidade, uniforme e quantidade positiva';end if;
 insert into public.uniforme_estoque(unidade,tipo,tamanho,modelo,saldo)
 values(p_unidade,btrim(p_tipo),upper(btrim(p_tamanho)),upper(btrim(p_modelo)),0)
 on conflict(unidade,tipo,tamanho,modelo) do nothing;
 select id,saldo into v_id,v_antes from public.uniforme_estoque
 where unidade=p_unidade and tipo=btrim(p_tipo) and tamanho=upper(btrim(p_tamanho))
 and modelo=upper(btrim(p_modelo)) for update;
 update public.uniforme_estoque set saldo=saldo+p_quantidade,atualizado_em=now() where id=v_id;
 insert into public.uniforme_movimentos(estoque_id,tipo,quantidade,saldo_antes,saldo_depois,responsavel_id,observacao)
 values(v_id,'entrada',p_quantidade,v_antes,v_antes+p_quantidade,v_user,
 nullif(btrim(coalesce(p_observacao,'')),''));
 return v_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.uniforme_registrar_entrega(p_entrega_id uuid, p_funcionario_id uuid, p_company_id uuid, p_unidade text, p_data_entrega date, p_itens jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid:=auth.uid();v_fcompany uuid;v_estoque record;v_entrada record;v_qtd integer;v_itens jsonb:='[]'::jsonb;v_id uuid;
begin
 if v_uid is null or not public.topac_has_any_role(ARRAY['admin','diretor_geral'],v_uid)
 then raise exception 'Sem permissao para entregar uniformes' using errcode='42501';end if;
 if p_entrega_id is null or p_funcionario_id is null or p_company_id is null or p_data_entrega is null
 or p_unidade not in ('SAO_PAULO','PRAIA_GRANDE','GOIANIA')
 or p_itens is null or jsonb_typeof(p_itens)<>'array' or jsonb_array_length(p_itens)=0
 then raise exception 'Ficha incompleta';end if;
 -- serializa a mesma chave de ficha, inclusive duas abas simultaneas
 perform pg_advisory_xact_lock(hashtextextended(p_entrega_id::text,0));
 if exists(select 1 from public.uniforme_entregas where id=p_entrega_id) then return p_entrega_id;end if;
 select coalesce(company_id,empresa_id) into v_fcompany from public.funcionarios
 where id=p_funcionario_id and ativo=true and excluido_em is null;
 if v_fcompany is distinct from p_company_id then raise exception 'Funcionario e empresa nao conferem';end if;
 if exists(select 1 from jsonb_array_elements(p_itens) x where not (x ? 'estoque_id' and x ? 'quantidade')
 or jsonb_typeof(x->'quantidade')<>'number' or (x->>'quantidade') !~ '^[0-9]+$'
 or (x->>'quantidade')::numeric<1 or (x->>'quantidade')::numeric>10000)
 then raise exception 'Itens e quantidades invalidos';end if;
 if exists(select 1 from jsonb_array_elements(p_itens) x group by x->>'estoque_id' having count(*)>1)
 then raise exception 'Junte itens iguais antes da entrega';end if;
 -- travas ordenadas para impedir saldo negativo sob concorrencia
 for v_entrada in select (x->>'estoque_id')::uuid as stock_id,
 (x->>'quantidade')::integer as qtd from jsonb_array_elements(p_itens) x order by 1 loop
 select * into v_estoque from public.uniforme_estoque where id=v_entrada.stock_id and unidade=p_unidade for update;
 if not found then raise exception 'Uniforme nao cadastrado na unidade';end if;
 v_qtd:=v_entrada.qtd;
 if v_estoque.saldo<v_qtd then raise exception 'Saldo insuficiente para % / % / %: disponivel %, solicitado %',
 v_estoque.tipo,v_estoque.tamanho,v_estoque.modelo,v_estoque.saldo,v_qtd;end if;
 update public.uniforme_estoque set saldo=saldo-v_qtd,atualizado_em=now() where id=v_estoque.id;
 v_itens:=v_itens||jsonb_build_array(jsonb_build_object(
 'estoque_id',v_estoque.id,'tipo',v_estoque.tipo,'descricao',v_estoque.modelo,
 'tamanho',v_estoque.tamanho,'quantidade',v_qtd,'modelo',v_estoque.modelo));
 end loop;
 insert into public.uniforme_entregas(id,funcionario_id,company_id,unidade,data_entrega,itens,gerado_por)
 values(p_entrega_id,p_funcionario_id,p_company_id,p_unidade,p_data_entrega,v_itens,v_uid);
 -- gravar saldos pre e pos apos confirmar ficha, recuperados das linhas travadas
 for v_entrada in select (x->>'estoque_id')::uuid as stock_id,
 (x->>'quantidade')::integer as qtd from jsonb_array_elements(p_itens) x order by 1 loop
 select * into v_estoque from public.uniforme_estoque where id=v_entrada.stock_id;
 insert into public.uniforme_movimentos(estoque_id,tipo,quantidade,saldo_antes,saldo_depois,
 entrega_id,funcionario_id,responsavel_id)
 values(v_estoque.id,'saida',v_entrada.qtd,v_estoque.saldo+v_entrada.qtd,v_estoque.saldo,
 p_entrega_id,p_funcionario_id,v_uid);
 end loop;
 return p_entrega_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.uniforme_importar_contagem(p_unidade text, p_linhas jsonb, p_observacao text DEFAULT 'Levantamento fisico confirmado'::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_linha jsonb;v_tipo text;v_modelo text;v_tamanho text;v_qtd integer;
v_quantidade integer:=0;v_chave text;v_vistos text[]:='{}'::text[];
begin
 if auth.uid() is null or not public.topac_has_any_role(ARRAY['admin','diretor_geral'],auth.uid())
 then raise exception 'Sem permissao de inventario' using errcode='42501';end if;
 if p_unidade not in ('SAO_PAULO','PRAIA_GRANDE','GOIANIA') or p_linhas is null
 or jsonb_typeof(p_linhas)<>'array' or jsonb_array_length(p_linhas)=0
 or jsonb_array_length(p_linhas)>150 then raise exception 'Escolha unidade e linhas validas';end if;
 for v_linha in select value from jsonb_array_elements(p_linhas) loop
 v_tipo:=nullif(btrim(v_linha->>'tipo'),'');
 v_tamanho:=nullif(upper(btrim(v_linha->>'tamanho')),'');
 v_modelo:=nullif(upper(btrim(v_linha->>'modelo')),'');
 if v_tipo is null or v_tamanho is null or v_modelo is null
 or (v_linha->>'saldo') !~ '^[0-9]{1,6}$'
 then raise exception 'Linha incompleta no inventario';end if;
 v_qtd:=(v_linha->>'saldo')::integer;
 v_chave:=concat_ws('|',v_tipo,v_modelo,v_tamanho);
 if v_chave=any(v_vistos) then raise exception 'Item repetido: %',v_chave;end if;
 v_vistos:=array_append(v_vistos,v_chave);
 perform public.uniforme_contar_estoque(p_unidade,v_tipo,v_tamanho,v_modelo,v_qtd,
 p_observacao,0);
 v_quantidade:=v_quantidade+1;
 end loop;
 return v_quantidade;
end $function$
;

revoke all on function public.uniforme_contar_estoque(text,text,text,text,integer,text,integer) from public,anon;
grant execute on function public.uniforme_contar_estoque(text,text,text,text,integer,text,integer) to authenticated;
revoke all on function public.uniforme_entrar_estoque(text,text,text,text,integer,text) from public,anon;
grant execute on function public.uniforme_entrar_estoque(text,text,text,text,integer,text) to authenticated;
revoke all on function public.uniforme_registrar_entrega(uuid,uuid,uuid,text,date,jsonb) from public,anon;
grant execute on function public.uniforme_registrar_entrega(uuid,uuid,uuid,text,date,jsonb) to authenticated;
revoke all on function public.uniforme_importar_contagem(text,jsonb,text) from public,anon;
grant execute on function public.uniforme_importar_contagem(text,jsonb,text) to authenticated;
notify pgrst,'reload schema';
