-- Carga documental livre vinculada ao almoxarifado, SEM movimento de estoque.
-- Usa almoxarifado_cargas para protocolo, funcionario, empresa, historico e controle.
-- Os itens e o texto original ficam em tabela auxiliar independente do catalogo.
create table if not exists public.almoxarifado_cargas_livres (
 carga_id uuid primary key references public.almoxarifado_cargas(id) on delete cascade,
 texto_original text not null check (char_length(texto_original) between 1 and 16000),
 itens jsonb not null check (jsonb_typeof(itens)='array'),
 created_at timestamptz not null default now()
);
alter table public.almoxarifado_cargas_livres enable row level security;
revoke all on public.almoxarifado_cargas_livres from public, anon, authenticated;
grant select on public.almoxarifado_cargas_livres to authenticated;
drop policy if exists almox_livres_read on public.almoxarifado_cargas_livres;
create policy almox_livres_read on public.almoxarifado_cargas_livres
for select to authenticated
using (
 exists (
  select 1 from public.almoxarifado_cargas c
  where c.id = almoxarifado_cargas_livres.carga_id
    and public.topac_has_any_role(array['admin','diretor_geral','almoxarifado','filial_matriz','filial_goiania','filial_praia'],auth.uid())
    and public.almoxarifado_row_allowed(c.company_id,auth.uid())
 )
);

create or replace function public.almoxarifado_criar_carga_livre(
 p_funcionario_id uuid,
 p_texto text,
 p_itens jsonb,
 p_observacoes text default null
) returns jsonb
language plpgsql security definer
set search_path to 'public'
as $function$
declare
 v_user uuid:=auth.uid();
 v_company_id uuid;
 v_company_nome text;
 v_dest_company uuid;
 v_funcionario_nome text;
 v_dest_nome text;
 v_id uuid;
 v_protocolo text;
 v_row jsonb;
 v_nome text;
 v_quantidade numeric;
 v_itens jsonb:='[]'::jsonb;
 v_registrado_em timestamptz;
begin
 if not public.almoxarifado_is_central(v_user) then raise exception 'Acesso não autorizado'; end if;
 if p_funcionario_id is null then raise exception 'Selecione o funcionário'; end if;
 if nullif(btrim(coalesce(p_texto,'')),'') is null or char_length(p_texto)>16000
   then raise exception 'Texto livre vazio ou maior que 16.000 caracteres'; end if;
 if p_itens is null or jsonb_typeof(p_itens)<>'array'
   then raise exception 'Lista de materiais inválida'; end if;
 if jsonb_array_length(p_itens)<1 or jsonb_array_length(p_itens)>150
   then raise exception 'Informe entre 1 e 150 materiais'; end if;
 if length(coalesce(p_observacoes,''))>4000
   then raise exception 'Observação maior que 4.000 caracteres'; end if;

 select e.id,e.nome into v_company_id,v_company_nome
 from public.empresas e where e.codigo='topac-matriz' limit 1;
 if v_company_id is null or not public.almoxarifado_row_allowed(v_company_id,v_user)
   then raise exception 'Sem acesso ao almoxarifado da Matriz'; end if;

 select f.nome,coalesce(f.company_id,f.empresa_id),e.nome
 into v_funcionario_nome,v_dest_company,v_dest_nome
 from public.funcionarios f
 left join public.empresas e on e.id=coalesce(f.company_id,f.empresa_id)
 where f.id=p_funcionario_id and coalesce(f.ativo,true)=true
   and lower(coalesce(f.status,'')) not in ('desligado','inativo')
 limit 1;
 if v_funcionario_nome is null then raise exception 'Funcionário inexistente ou inativo'; end if;

 for v_row in select value from jsonb_array_elements(p_itens) loop
   if jsonb_typeof(v_row)<>'object' then raise exception 'Linha de material inválida'; end if;
   v_nome:=btrim(coalesce(v_row->>'nome',''));
   if jsonb_typeof(v_row->'quantidade') <> 'number' then raise exception 'Quantidade inválida'; end if;
   v_quantidade:=(v_row->>'quantidade')::numeric;
   if char_length(v_nome)<1 or char_length(v_nome)>400 or v_quantidade<=0 or v_quantidade>100000
     then raise exception 'Material ou quantidade fora dos limites'; end if;
   v_itens:=v_itens||jsonb_build_array(jsonb_build_object('nome',v_nome,'quantidade',v_quantidade));
 end loop;

 v_protocolo:=public.almoxarifado_novo_protocolo('LIV');
 insert into public.almoxarifado_cargas(
   empresa,funcionario_id,funcionario_nome,veiculo,data_carga,status,
   observacoes,user_id,company_id,tipo,protocolo,placa,
   destino_company_id,status_assinatura
 ) values (
   v_company_nome,p_funcionario_id,v_funcionario_nome,null,
   (now() at time zone 'America/Sao_Paulo')::date,'aberta',
   nullif(btrim(coalesce(p_observacoes,'')),''),
   v_user,v_company_id,'livre',v_protocolo,null,v_dest_company,'pendente'
 ) returning id,created_at into v_id,v_registrado_em;

 insert into public.almoxarifado_cargas_livres(carga_id,texto_original,itens)
 values(v_id,p_texto,v_itens);

 return jsonb_build_object(
   'ok',true,'id',v_id,'protocolo',v_protocolo,
   'created_at',v_registrado_em,
   'funcionario',v_funcionario_nome,'empresa_destino',v_dest_nome,
   'itens',v_itens,'tipo','livre'
 );
end;
$function$;
revoke all on function public.almoxarifado_criar_carga_livre(uuid,text,jsonb,text) from public,anon;
grant execute on function public.almoxarifado_criar_carga_livre(uuid,text,jsonb,text) to authenticated;
