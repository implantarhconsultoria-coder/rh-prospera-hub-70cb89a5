create table if not exists public.almoxarifado_fechamentos_funcionario (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  funcionario_id uuid not null,
  funcionario_nome text not null,
  company_id uuid null,
  empresa_nome text null,
  protocolo text not null unique,
  status text not null default 'pendente_assinatura',
  movimentacoes jsonb not null default '[]'::jsonb,
  total_movimentacoes integer not null default 0,
  total_itens numeric not null default 0,
  gerado_em timestamptz not null default now(),
  gerado_por uuid null,
  assinado_digital_em timestamptz null,
  assinatura_nome text null,
  impresso_em timestamptz null,
  impresso_por uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint almox_fech_status_chk check (status in ('pendente_assinatura','assinado')),
  constraint almox_fech_func_dia_uniq unique (data, funcionario_id)
);
create index if not exists almox_fech_data_idx on public.almoxarifado_fechamentos_funcionario(data desc);
create index if not exists almox_fech_func_idx on public.almoxarifado_fechamentos_funcionario(funcionario_id, data desc);
alter table public.almoxarifado_fechamentos_funcionario enable row level security;
drop policy if exists almox_fech_select_central on public.almoxarifado_fechamentos_funcionario;
create policy almox_fech_select_central on public.almoxarifado_fechamentos_funcionario for select to authenticated using (public.almoxarifado_is_central(auth.uid()));
grant select on public.almoxarifado_fechamentos_funcionario to authenticated;

create or replace function public.almoxarifado_gerar_fechamentos_diarios(p_data date default current_date)
returns setof public.almoxarifado_fechamentos_funcionario language plpgsql security definer set search_path to 'public' as $function$
declare v_row record; v_movs jsonb; v_total integer; v_qtd numeric; v_empresa text;
begin
  if not public.almoxarifado_is_central(auth.uid()) then raise exception 'Acesso não autorizado'; end if;
  for v_row in select s.funcionario_id,max(coalesce(s.funcionario_nome,s.mecanico_nome,'Funcionário')) funcionario_nome,max(s.company_id) company_id from public.almoxarifado_saidas s where s.data_saida=p_data and s.funcionario_id is not null group by s.funcionario_id loop
    select coalesce(jsonb_agg(jsonb_build_object('saida_id',s.id,'horario',to_char(s.created_at at time zone 'America/Sao_Paulo','HH24:MI'),'created_at',s.created_at,'item_id',s.item_id,'codigo',coalesce(i.codigo_topac,i.codigo_sku,''),'item',coalesce(i.nome,'Item'),'quantidade',s.quantidade,'motivo',coalesce(s.motivo,''),'veiculo',coalesce(s.veiculo,''),'observacao',coalesce(s.observacao,s.observacoes,'')) order by s.created_at),'[]'::jsonb),count(*),coalesce(sum(s.quantidade),0) into v_movs,v_total,v_qtd from public.almoxarifado_saidas s left join public.almoxarifado_itens i on i.id=s.item_id where s.data_saida=p_data and s.funcionario_id=v_row.funcionario_id;
    select e.nome into v_empresa from public.empresas e where e.id=v_row.company_id limit 1;
    insert into public.almoxarifado_fechamentos_funcionario(data,funcionario_id,funcionario_nome,company_id,empresa_nome,protocolo,status,movimentacoes,total_movimentacoes,total_itens,gerado_em,gerado_por,updated_at)
    values(p_data,v_row.funcionario_id,v_row.funcionario_nome,v_row.company_id,v_empresa,'FD-'||to_char(p_data,'YYYYMMDD')||'-'||upper(substr(md5(v_row.funcionario_id::text||p_data::text),1,6)),'pendente_assinatura',v_movs,v_total,v_qtd,now(),auth.uid(),now())
    on conflict (data,funcionario_id) do update set funcionario_nome=excluded.funcionario_nome,company_id=excluded.company_id,empresa_nome=excluded.empresa_nome,movimentacoes=excluded.movimentacoes,total_movimentacoes=excluded.total_movimentacoes,total_itens=excluded.total_itens,gerado_em=now(),gerado_por=auth.uid(),updated_at=now() where public.almoxarifado_fechamentos_funcionario.status<>'assinado';
  end loop;
  return query select f.* from public.almoxarifado_fechamentos_funcionario f where f.data=p_data order by f.funcionario_nome;
end $function$;

create or replace function public.almoxarifado_assinar_fechamento_diario(p_fechamento_id uuid,p_nome text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_f public.almoxarifado_fechamentos_funcionario%rowtype;
begin
  if not public.almoxarifado_is_central(auth.uid()) then raise exception 'Acesso não autorizado'; end if;
  select * into v_f from public.almoxarifado_fechamentos_funcionario where id=p_fechamento_id for update;
  if not found then raise exception 'Fechamento não encontrado'; end if;
  update public.almoxarifado_fechamentos_funcionario set status='assinado',assinado_digital_em=now(),assinatura_nome=coalesce(nullif(btrim(p_nome),''),v_f.funcionario_nome),updated_at=now() where id=p_fechamento_id;
  if not exists(select 1 from public.documentos_funcionario d where d.funcionario_id=v_f.funcionario_id and d.origem='almoxarifado' and d.descricao like '%'||v_f.protocolo||'%') then
    insert into public.documentos_funcionario(funcionario_id,funcionario_nome,company_id,empresa_nome,tipo_documento,competencia,descricao,gerado_por_user_id,gerado_por_nome,status_envio,unidade,categoria,origem,observacao,data_documento)
    values(v_f.funcionario_id,v_f.funcionario_nome,v_f.company_id,v_f.empresa_nome,'RELATORIO_DIARIO_ALMOXARIFADO',to_char(v_f.data,'YYYY-MM'),'Relatório diário de Almoxarifado '||v_f.protocolo,auth.uid(),coalesce(auth.jwt()->>'email','Almoxarifado'),'interno',v_f.empresa_nome,'Almoxarifado','almoxarifado','Assinatura digital: '||coalesce(nullif(btrim(p_nome),''),v_f.funcionario_nome)||' | Data: '||to_char(v_f.data,'DD/MM/YYYY'),now());
  end if;
  return jsonb_build_object('ok',true,'protocolo',v_f.protocolo,'assinado_em',now());
end $function$;

create or replace function public.almoxarifado_marcar_fechamento_impresso(p_fechamento_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
begin
  if not public.almoxarifado_is_central(auth.uid()) then raise exception 'Acesso não autorizado'; end if;
  update public.almoxarifado_fechamentos_funcionario set impresso_em=now(),impresso_por=auth.uid(),updated_at=now() where id=p_fechamento_id;
  if not found then raise exception 'Fechamento não encontrado'; end if;
  return jsonb_build_object('ok',true,'impresso_em',now());
end $function$;

grant execute on function public.almoxarifado_gerar_fechamentos_diarios(date) to authenticated;
grant execute on function public.almoxarifado_assinar_fechamento_diario(uuid,text) to authenticated;
grant execute on function public.almoxarifado_marcar_fechamento_impresso(uuid) to authenticated;