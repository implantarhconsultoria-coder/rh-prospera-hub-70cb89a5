-- Novo estágio de dossiês, em paralelo ao pré-cadastro existente.
create table if not exists public.admission_dossier_workflow (
  pre_cadastro_id uuid primary key references public.pre_cadastros_admissionais(id) on delete cascade,
  dados_bancarios jsonb not null default '{}'::jsonb,
  vr_diario numeric(12,2), vt_diario numeric(12,2),
  contrato_documento_id uuid references public.pre_cadastro_documentos(id) on delete set null,
  contrato_recebido_em timestamptz, pasta_funcionario text,
  efetivado_em timestamptz, efetivado_por uuid,
  finance_snapshot jsonb not null default '{}'::jsonb,
  finance_preparado_em timestamptz, finance_enviado_em timestamptz, finance_enviado_por uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint admission_dossier_vr_nonnegative check (vr_diario is null or vr_diario>=0),
  constraint admission_dossier_vt_nonnegative check (vt_diario is null or vt_diario>=0)
);
alter table public.admission_dossier_workflow enable row level security;
revoke all privileges on public.admission_dossier_workflow from anon;
grant select,insert,update,delete on public.admission_dossier_workflow to authenticated;
drop policy if exists dossier_admin_all on public.admission_dossier_workflow;
create policy dossier_admin_all on public.admission_dossier_workflow for all to authenticated
using (public.topac_has_any_role(array['admin'::text,'diretor_geral'::text],(select auth.uid())))
with check (public.topac_has_any_role(array['admin'::text,'diretor_geral'::text],(select auth.uid())));
create index if not exists admission_dossier_efetivado_idx
on public.admission_dossier_workflow (efetivado_em) where efetivado_em is not null;

CREATE OR REPLACE FUNCTION public.admin_dossie_aprovar_com_contrato(p_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_pre public.pre_cadastros_admissionais%rowtype;
  v_stage public.admission_dossier_workflow%rowtype;
  v_doc public.pre_cadastro_documentos%rowtype;
  v_employee uuid;
  v_company text;
  v_folder text;
  v_contract text;
begin
  if auth.uid() is null or not public.topac_has_any_role(array['admin'::text,'diretor_geral'::text],auth.uid()) then
    raise exception 'Aprovação permitida apenas para administração ou diretoria.';
  end if;
  select * into v_pre from public.pre_cadastros_admissionais where id=p_id for update;
  if not found then raise exception 'Pré-cadastro não localizado.'; end if;
  if v_pre.empresa_id is null or nullif(btrim(v_pre.nome),'') is null then
    raise exception 'Confira empresa e nome antes de aprovar.';
  end if;
  if v_pre.funcionario_id is not null and v_pre.status='cadastro_oficial' then return v_pre.funcionario_id; end if;
  select * into v_stage from public.admission_dossier_workflow where pre_cadastro_id=p_id for update;
  if not found then raise exception 'Salve o dossiê de admissão antes do OK.'; end if;
  if v_stage.contrato_documento_id is null then
    raise exception 'OK bloqueado: anexe o contrato de trabalho recebido e confira o arquivo.';
  end if;
  select * into v_doc from public.pre_cadastro_documentos
  where id=v_stage.contrato_documento_id and pre_cadastro_id=p_id
    and tipo_documento='contrato_recebido' and nullif(btrim(arquivo_url),'') is not null;
  if not found then raise exception 'Contrato de trabalho não identificado entre os documentos deste candidato.'; end if;
  if v_pre.vale_refeicao and coalesce(v_stage.vr_diario,0)<=0 then
    raise exception 'Informe VR diário antes de aprovar e preparar o financeiro.';
  end if;
  if v_pre.vale_transporte and coalesce(v_stage.vt_diario,0)<=0 then
    raise exception 'Informe VT diário antes de aprovar e preparar o financeiro.';
  end if;
  select e.nome into v_company from public.empresas e where e.id=v_pre.empresa_id;
  if nullif(btrim(v_company),'') is null then raise exception 'Empresa contratante não localizada.'; end if;
  -- Chamada legada somente depois de validar contrato e valores do novo fluxo.
  v_employee := public.admin_pre_cadastro_aprovar_oficial(p_id);
  update public.funcionarios set
    banco = coalesce(nullif(v_stage.dados_bancarios->>'banco',''),banco),
    banco_codigo = coalesce(nullif(v_stage.dados_bancarios->>'bancoCodigo',''),banco_codigo),
    agencia = coalesce(nullif(v_stage.dados_bancarios->>'agencia',''),agencia),
    conta = coalesce(nullif(v_stage.dados_bancarios->>'conta',''),conta),
    conta_digito = coalesce(nullif(v_stage.dados_bancarios->>'digito',''),conta_digito),
    tipo_conta = coalesce(nullif(v_stage.dados_bancarios->>'tipoConta',''),tipo_conta),
    titular_conta = coalesce(nullif(v_stage.dados_bancarios->>'titular',''),titular_conta),
    cpf_titular = coalesce(nullif(v_stage.dados_bancarios->>'cpfTitular',''),cpf_titular),
    pix = coalesce(nullif(v_stage.dados_bancarios->>'chavePix',''),pix),
    tipo_chave_pix = coalesce(nullif(v_stage.dados_bancarios->>'tipoChavePix',''),tipo_chave_pix),
    dados_bancarios_origem = coalesce(nullif(v_stage.dados_bancarios->>'textoOriginal',''),dados_bancarios_origem),
    vr_ativo = v_pre.vale_refeicao,
    vr_diario = case when v_pre.vale_refeicao then v_stage.vr_diario else 0 end,
    vt_ativo = v_pre.vale_transporte,
    vt_diario = case when v_pre.vale_transporte then v_stage.vt_diario else 0 end
  where id=v_employee;
  -- Pasta lógica sob a empresa certa. Ordenação alfabética é da consulta da UI.
  v_folder := v_pre.empresa_id::text || '/funcionarios/' ||
    regexp_replace(upper(unaccent(v_pre.nome)),'[^A-Z0-9]+','_','g') || '_' || v_employee::text;
  insert into public.documentos_funcionario
    (funcionario_id,funcionario_nome,company_id,empresa_nome,tipo_documento,competencia,
     descricao,arquivo_url,gerado_por_user_id,gerado_por_nome,unidade,status_envio,
     categoria,origem,observacao,nome_arquivo,data_documento,storage_bucket,storage_path)
  select
    v_employee,v_pre.nome,v_pre.empresa_id,v_company,d.tipo_documento,
    coalesce(to_char(d.created_at,'YYYY-MM'),''),
    coalesce(d.nome_arquivo,'Documento admissional'),d.arquivo_url,auth.uid(),
    coalesce(auth.jwt()->>'email','Administração'),v_company,'gerado',
    d.tipo_documento,'pre_cadastro',
    'Dossiê aprovado ' || p_id::text || ' | fonte ' || d.id::text,
    d.nome_arquivo,d.created_at,'documentos-admissionais',d.arquivo_url
  from public.pre_cadastro_documentos d where d.pre_cadastro_id=p_id
    and nullif(btrim(d.arquivo_url),'') is not null
    and not exists (
      select 1 from public.documentos_funcionario f
      where f.funcionario_id=v_employee and f.origem='pre_cadastro'
        and f.observacao like '%' || d.id::text || '%'
    );
  update public.admission_dossier_workflow
    set pasta_funcionario=v_folder,efetivado_em=now(),efetivado_por=auth.uid(),updated_at=now()
  where pre_cadastro_id=p_id;
  update public.pre_cadastros_admissionais
    set pasta_virtual=jsonb_set(coalesce(pasta_virtual,'{}'::jsonb),'{pasta_funcionario}',to_jsonb(v_folder),true)
  where id=p_id;
  return v_employee;
end $function$

revoke all on function public.admin_dossie_aprovar_com_contrato(uuid) from public,anon;
grant execute on function public.admin_dossie_aprovar_com_contrato(uuid) to authenticated;
