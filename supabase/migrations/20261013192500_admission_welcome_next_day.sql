-- Novas aprovações passam a usar o dia calendário seguinte, no fuso operacional TOPAC.
-- Registros que já possuem aprovado_em ou funcionario_id não têm data histórica reescrita por esta regra.
create or replace function public.admin_pre_cadastro_aprovar_oficial(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r public.pre_cadastros_admissionais%rowtype;
  v_funcionario_id uuid;
  v_cpf_clean text;
  v_banco jsonb;
  v_tem_insalubridade boolean;
  v_insalubridade_valor numeric := 0;
  v_data_admissao date;
begin
  select * into r from public.pre_cadastros_admissionais where id = p_id for update;
  if not found then raise exception 'Pre-cadastro nao encontrado'; end if;
  if nullif(trim(r.nome), '') is null then raise exception 'Nome obrigatorio'; end if;
  if r.empresa_id is null then raise exception 'Empresa obrigatoria'; end if;
  if nullif(trim(coalesce(r.funcao,'')), '') is null then raise exception 'Cargo/funcao obrigatorio'; end if;
  if r.salario is null or r.salario <= 0 then raise exception 'Salario obrigatorio'; end if;

  -- Somente a primeira aprovação real recebe a nova regra.
  -- A data é calculada no calendário de America/Sao_Paulo, sem conversão UTC de DATE puro.
  if r.aprovado_em is null and r.funcionario_id is null then
    v_data_admissao := ((now() at time zone 'America/Sao_Paulo')::date + 1);
    update public.pre_cadastros_admissionais
       set data_admissao = v_data_admissao,
           updated_at = now()
     where id = p_id;
    r.data_admissao := v_data_admissao;
  else
    v_data_admissao := r.data_admissao;
  end if;

  v_banco := coalesce(r.dados_bancarios, '{}'::jsonb);
  v_cpf_clean := regexp_replace(coalesce(r.cpf, ''), '\D', '', 'g');
  v_tem_insalubridade := upper(coalesce(r.insalubridade,'')) not in ('','NAO','NÃO','SEM','0');
  begin
    v_insalubridade_valor := coalesce(nullif(regexp_replace(coalesce(r.insalubridade,''), '[^0-9,.-]', '', 'g'), '')::numeric, 0);
  exception when others then v_insalubridade_valor := 0; end;

  if v_cpf_clean <> '' then
    select id into v_funcionario_id
      from public.funcionarios
     where regexp_replace(coalesce(cpf, ''), '\D', '', 'g') = v_cpf_clean
     limit 1;
  end if;

  if v_funcionario_id is null then
    insert into public.funcionarios (
      nome, cpf, rg, empresa_id, company_id, cargo, salario_base, salario,
      data_admissao, data_nascimento, setor_ghe, endereco, status, ativo, categoria,
      cpf_pendente_acesso, telefone, celular, email,
      banco, agencia, conta, conta_digito, tipo_conta, titular_conta, cpf_titular, pix, tipo_chave_pix,
      dados_bancarios_origem, dados_bancarios_atualizado_em,
      vr_ativo, vt_ativo, vt_diario, insalubridade_ativa, tem_insalubridade, insalubridade_valor, valor_insalubridade
    ) values (
      r.nome, r.cpf, r.rg, r.empresa_id, r.empresa_id, r.funcao, coalesce(r.salario, 0), coalesce(r.salario, 0),
      r.data_admissao, r.data_nascimento, r.setor_ghe, r.endereco, 'ativo', true, 'operacional',
      (v_cpf_clean = ''), r.celular, r.celular, r.email,
      nullif(v_banco->>'banco',''), nullif(v_banco->>'agencia',''), nullif(v_banco->>'conta',''), nullif(v_banco->>'digito',''), nullif(v_banco->>'tipo_conta',''), nullif(v_banco->>'titular',''), nullif(v_banco->>'cpf_titular',''), nullif(v_banco->>'pix',''), nullif(v_banco->>'tipo_pix',''),
      case when r.origem_cadastro='link_publico' then 'pre_cadastro_candidato' else 'pre_cadastro' end, now(),
      coalesce(r.vale_refeicao,false), coalesce(r.vale_transporte,false), coalesce(r.vt_valor_diario,0), v_tem_insalubridade, v_tem_insalubridade, v_insalubridade_valor, nullif(v_insalubridade_valor,0)
    ) returning id into v_funcionario_id;
  else
    update public.funcionarios
       set nome = coalesce(nullif(r.nome, ''), nome), cpf = coalesce(nullif(r.cpf, ''), cpf), rg = coalesce(nullif(r.rg, ''), rg),
           empresa_id = r.empresa_id, company_id = r.empresa_id, cargo = coalesce(nullif(r.funcao, ''), cargo),
           salario_base = coalesce(r.salario, salario_base), salario = coalesce(r.salario, salario),
           data_admissao = coalesce(r.data_admissao, data_admissao), data_nascimento = coalesce(r.data_nascimento, data_nascimento),
           setor_ghe = coalesce(nullif(r.setor_ghe, ''), setor_ghe), endereco = coalesce(nullif(r.endereco, ''), endereco),
           telefone = coalesce(nullif(r.celular,''), telefone), celular = coalesce(nullif(r.celular,''), celular), email = coalesce(nullif(r.email,''), email),
           banco = coalesce(nullif(v_banco->>'banco',''), banco), agencia = coalesce(nullif(v_banco->>'agencia',''), agencia), conta = coalesce(nullif(v_banco->>'conta',''), conta),
           conta_digito = coalesce(nullif(v_banco->>'digito',''), conta_digito), tipo_conta = coalesce(nullif(v_banco->>'tipo_conta',''), tipo_conta),
           titular_conta = coalesce(nullif(v_banco->>'titular',''), titular_conta), cpf_titular = coalesce(nullif(v_banco->>'cpf_titular',''), cpf_titular),
           pix = coalesce(nullif(v_banco->>'pix',''), pix), tipo_chave_pix = coalesce(nullif(v_banco->>'tipo_pix',''), tipo_chave_pix),
           dados_bancarios_origem = case when r.origem_cadastro='link_publico' then 'pre_cadastro_candidato' else 'pre_cadastro' end,
           dados_bancarios_atualizado_em = now(), vr_ativo = coalesce(r.vale_refeicao,vr_ativo), vt_ativo = coalesce(r.vale_transporte,vt_ativo),
           vt_diario = coalesce(r.vt_valor_diario,vt_diario), insalubridade_ativa = v_tem_insalubridade, tem_insalubridade = v_tem_insalubridade,
           insalubridade_valor = case when v_tem_insalubridade then v_insalubridade_valor else 0 end,
           valor_insalubridade = case when v_tem_insalubridade and v_insalubridade_valor > 0 then v_insalubridade_valor else valor_insalubridade end,
           status = 'ativo', ativo = true, cpf_pendente_acesso = (v_cpf_clean = ''), updated_at = now()
     where id = v_funcionario_id;
  end if;

  update public.pre_cadastros_admissionais
     set status = 'cadastro_oficial', aprovado_por = auth.uid(), aprovado_em = now(), funcionario_id = v_funcionario_id, updated_at = now()
   where id = p_id;

  insert into public.pre_cadastro_eventos(pre_cadastro_id,tipo,descricao,dados,created_by)
  values (p_id,'cadastro_oficial','Pré-cadastro convertido em funcionário sem duplicar CPF.',jsonb_build_object('funcionario_id',v_funcionario_id,'data_admissao',r.data_admissao),auth.uid());
  return v_funcionario_id;
end;
$function$;
