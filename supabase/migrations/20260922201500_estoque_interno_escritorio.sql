-- Estoque Interno do Escritorio. Isolado de almoxarifado_itens/entradas/saidas.
-- Produção implantada em 22/09/2026. Este arquivo documenta a estrutura reproduzível.
create table if not exists public.estoque_interno_acessos (
  email text primary key check(email=lower(email)),
  nome text not null,
  pode_movimentar boolean not null default true,
  pode_gerenciar boolean not null default false,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
create table if not exists public.estoque_interno_itens (
  id uuid primary key default gen_random_uuid(),
  codigo integer not null unique check(codigo>0),
  descricao text not null check(btrim(descricao)<>''),
  aplicacao text,
  unidade text not null default 'Unidade',
  saldo_inicial numeric(18,3) not null default 0,
  saldo_atual numeric(18,3) not null default 0 check(saldo_atual>=0),
  estoque_minimo numeric(18,3),
  estoque_maximo numeric(18,3),
  entradas_planilha numeric(18,3),
  saidas_planilha numeric(18,3),
  divergencia_historico numeric(18,3) not null default 0,
  origem_linha integer,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create table if not exists public.estoque_interno_movimentos (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.estoque_interno_itens(id),
  tipo text not null check(tipo in ('entrada','saida')),
  quantidade numeric(18,3) not null check(quantidade>=0),
  data_movimento date, -- nulo permitido: registros antigos sem data valida
  destinatario text, origem_responsavel text,
  preco_unitario numeric(18,4),observacao text,
  ator_user_id uuid,ator_email text,
  historico_importado boolean not null default false,
  lote_importacao text,aba_origem text,linha_origem integer,
  data_suspeita boolean not null default false,
  saldo_antes numeric(18,3),saldo_depois numeric(18,3),
  criado_em timestamptz not null default now(),
  unique(lote_importacao,aba_origem,linha_origem)
);
create index if not exists estoque_interno_movimentos_item_data_idx
  on public.estoque_interno_movimentos(item_id,data_movimento desc);
create index if not exists estoque_interno_movimentos_data_idx
  on public.estoque_interno_movimentos(data_movimento desc);
alter table public.estoque_interno_movimentos alter column data_movimento drop not null;
alter table public.estoque_interno_acessos enable row level security;
alter table public.estoque_interno_itens enable row level security;
alter table public.estoque_interno_movimentos enable row level security;
revoke all on public.estoque_interno_acessos,public.estoque_interno_itens,public.estoque_interno_movimentos from anon,authenticated;
grant select on public.estoque_interno_acessos,public.estoque_interno_itens,public.estoque_interno_movimentos to authenticated;
drop policy if exists estoque_interno_acessos_ler on public.estoque_interno_acessos;
create policy estoque_interno_acessos_ler on public.estoque_interno_acessos
  for select to authenticated using (
    (select auth.uid()) is not null and
    email=lower(coalesce((select auth.jwt()->>'email'),''))
  );
drop policy if exists estoque_interno_itens_ler on public.estoque_interno_itens;
create policy estoque_interno_itens_ler on public.estoque_interno_itens
  for select to authenticated using(exists(
    select 1 from public.estoque_interno_acessos a
    where a.email=lower(coalesce((select auth.jwt()->>'email'),'')) and a.ativo
  ));
drop policy if exists estoque_interno_movimentos_ler on public.estoque_interno_movimentos;
create policy estoque_interno_movimentos_ler on public.estoque_interno_movimentos
  for select to authenticated using(exists(
    select 1 from public.estoque_interno_acessos a
    where a.email=lower(coalesce((select auth.jwt()->>'email'),'')) and a.ativo
  ));
insert into public.estoque_interno_acessos(email,nome,pode_movimentar,pode_gerenciar)
values ('faturamento.matriz@topac.com.br','Kayky',true,false),
 ('fat2.matriz@topac.com.br','Amanda',true,false),
 ('fat3.matriz@topac.com.br','Rafaela',true,false),
 ('compras@topac.com.br','Renato',true,false),
 ('financeiro@topac.com.br','Paula',true,false),
 ('adm.matriz@topac.com.br','Rodrigo',true,true),
 ('adm.topac@topac.com.br','Administração TOPAC',true,true)
on conflict(email) do update set
 nome=excluded.nome,pode_movimentar=excluded.pode_movimentar,
 pode_gerenciar=excluded.pode_gerenciar,ativo=true;

-- A movimentacao passa exclusivamente por uma operacao atomica/auditavel.
create or replace function public.estoque_interno_movimentar(
 p_codigo integer,p_tipo text,p_quantidade numeric,
 p_destinatario text default null,p_observacao text default null,
 p_preco_unitario numeric default null)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_email text;v_uid uuid;v_id uuid;v_saldo numeric;v_novo numeric;
begin
 v_uid:=auth.uid();v_email:=lower(coalesce(auth.jwt()->>'email',''));
 if v_uid is null or not exists(select 1 from public.estoque_interno_acessos
   where email=v_email and ativo and pode_movimentar) then
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
end $$;
revoke all on function public.estoque_interno_movimentar(integer,text,numeric,text,text,numeric) from public,anon;
grant execute on function public.estoque_interno_movimentar(integer,text,numeric,text,text,numeric) to authenticated;

create or replace function public.estoque_interno_cadastrar_item(
 p_codigo integer,p_descricao text,p_unidade text default 'Unidade',
 p_aplicacao text default null,p_minimo numeric default null,p_maximo numeric default null)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_email text;v_id uuid;
begin
 v_email:=lower(coalesce(auth.jwt()->>'email',''));
 if auth.uid() is null or not exists(select 1 from public.estoque_interno_acessos
   where email=v_email and ativo and pode_gerenciar) then
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
end $$;
revoke all on function public.estoque_interno_cadastrar_item(integer,text,text,text,numeric,numeric) from public,anon;
grant execute on function public.estoque_interno_cadastrar_item(integer,text,text,text,numeric,numeric) to authenticated;
