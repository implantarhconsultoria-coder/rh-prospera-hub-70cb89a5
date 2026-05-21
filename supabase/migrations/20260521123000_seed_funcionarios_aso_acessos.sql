-- TOPAC RH PRO - dados oficiais enviados em 21/05/2026.
-- Nao sobrescreve CPF existente com vazio. Atualiza funcao/salario e prepara ASO/acessos.

CREATE EXTENSION IF NOT EXISTS unaccent;

ALTER TABLE public.funcionarios
  ADD COLUMN IF NOT EXISTS data_nascimento date,
  ADD COLUMN IF NOT EXISTS setor_ghe text DEFAULT '',
  ADD COLUMN IF NOT EXISTS cpf_pendente_acesso boolean DEFAULT false;

ALTER TABLE public.aso_agendamentos
  ADD COLUMN IF NOT EXISTS funcionario_id uuid,
  ADD COLUMN IF NOT EXISTS cnpj text DEFAULT '',
  ADD COLUMN IF NOT EXISTS data_nascimento date,
  ADD COLUMN IF NOT EXISTS setor_ghe text DEFAULT '',
  ADD COLUMN IF NOT EXISTS toxicologico boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS nr35 boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS nr33 boolean DEFAULT false;

ALTER TABLE public.ativos
  ADD COLUMN IF NOT EXISTS vencimento_ipva date,
  ADD COLUMN IF NOT EXISTS vencimento_licenciamento date;

CREATE OR REPLACE FUNCTION public.topac_norm_name(p_nome text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(upper(public.unaccent(coalesce(p_nome, ''))), '\s+', ' ', 'g')
$$;

CREATE OR REPLACE FUNCTION public.topac_seed_empresa(p_codigo text, p_nome text, p_cnpj text, p_cidade text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id
  FROM public.empresas
  WHERE regexp_replace(coalesce(cnpj, ''), '\D', '', 'g') = regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g')
     OR codigo = p_codigo
  LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO public.empresas(codigo, nome, cnpj, cidade, status, observacoes)
    VALUES (p_codigo, p_nome, p_cnpj, p_cidade, 'ativa', 'Cadastro essencial TOPAC RH')
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.empresas
    SET codigo = COALESCE(NULLIF(codigo, ''), p_codigo),
        nome = p_nome,
        cnpj = p_cnpj,
        cidade = COALESCE(NULLIF(cidade, ''), p_cidade),
        status = 'ativa',
        updated_at = now()
    WHERE id = v_id;
  END IF;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.topac_upsert_funcionario(
  p_empresa_id uuid,
  p_nome text,
  p_cargo text,
  p_salario numeric,
  p_cpf text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_cpf text := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');
BEGIN
  SELECT id INTO v_id
  FROM public.funcionarios
  WHERE (company_id = p_empresa_id OR empresa_id = p_empresa_id)
    AND public.topac_norm_name(nome) = public.topac_norm_name(p_nome)
  LIMIT 1;

  IF v_id IS NULL AND v_cpf <> '' THEN
    SELECT id INTO v_id
    FROM public.funcionarios
    WHERE regexp_replace(coalesce(cpf, ''), '\D', '', 'g') = v_cpf
    LIMIT 1;
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.funcionarios(
      company_id, empresa_id, nome, cpf, cargo, categoria, setor,
      salario_base, salario, status, ativo, cpf_pendente_acesso
    )
    VALUES (
      p_empresa_id, p_empresa_id, p_nome, COALESCE(NULLIF(p_cpf, ''), ''),
      p_cargo, 'operacional', 'operacional', p_salario, p_salario,
      'ativo', true, v_cpf = ''
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.funcionarios
    SET company_id = p_empresa_id,
        empresa_id = p_empresa_id,
        cargo = p_cargo,
        salario_base = p_salario,
        salario = p_salario,
        status = COALESCE(NULLIF(status, ''), 'ativo'),
        ativo = COALESCE(ativo, true),
        cpf = CASE WHEN v_cpf <> '' THEN p_cpf ELSE cpf END,
        cpf_pendente_acesso = regexp_replace(coalesce(CASE WHEN v_cpf <> '' THEN p_cpf ELSE cpf END, ''), '\D', '', 'g') = '',
        updated_at = now()
    WHERE id = v_id;
  END IF;

  RETURN v_id;
END;
$$;

DO $$
DECLARE
  v_lmt uuid;
  v_pg uuid;
  v_alqui uuid;
  v_gyn uuid;
BEGIN
  v_lmt := public.topac_seed_empresa('lmt', 'LMT', '21.967.711/0001-00', 'Sao Paulo');
  v_pg := public.topac_seed_empresa('topac-pg', 'TOPAC FILIAL PRAIA GRANDE', '07.291.648/0002-94', 'Praia Grande');
  v_alqui := public.topac_seed_empresa('alqui', 'ALQUI OBRAS', '14.464.586/0001-50', 'Sao Paulo');
  v_gyn := public.topac_seed_empresa('topac-gyn', 'TOPAC FILIAL GOIANIA', '07.291.648/0003-75', 'Goiania');

  PERFORM public.topac_upsert_funcionario(v_lmt, 'AGLES NATHAN ALVES DOS SANTOS', 'TECNICO MECANICO JUNIOR', 2738.62, NULL);
  PERFORM public.topac_upsert_funcionario(v_lmt, 'DOUGLAS CESAR CHIAPPETTA', 'ASSISTENTE ADM JUNIOR', 2896.99, NULL);
  PERFORM public.topac_upsert_funcionario(v_lmt, 'JERRI SILVA INOCENCIO', 'CONSULTOR DE VENDAS', 2678.66, NULL);
  PERFORM public.topac_upsert_funcionario(v_lmt, 'LEANDRO MARTINS DE OLIVEIRA', 'TECNICO MECANICO PLENO', 3024.71, NULL);
  PERFORM public.topac_upsert_funcionario(v_lmt, 'LUCAS MARTINS SILVA DOS SANTOS', 'AUXILIAR DE ALMOXARIFADO', 2000.00, NULL);
  PERFORM public.topac_upsert_funcionario(v_lmt, 'RAFAEL OLIMPIO', 'GUINCHEIRO', 2832.33, NULL);
  PERFORM public.topac_upsert_funcionario(v_lmt, 'RANDER WYLLAS ALVES PEREIRA', 'AUXILIAR OPERACIONAL JUNIOR', 1500.00, NULL);
  PERFORM public.topac_upsert_funcionario(v_lmt, 'RENATO BARRETO DE LIMA', 'COMPRADOR(A)', 2872.59, NULL);

  PERFORM public.topac_upsert_funcionario(v_pg, 'ANTONIO CARLOS SERVILIO', 'GERENTE ADMINISTRATIVO', 2122.60, NULL);
  PERFORM public.topac_upsert_funcionario(v_pg, 'EDENILSON PEREIRA VITOR', 'TECNICO MECANICO PLENO', 3024.71, NULL);
  PERFORM public.topac_upsert_funcionario(v_pg, 'GABRIEL MORENO DA SILVA', 'TECNICO MECANICO JUNIOR', 2738.62, NULL);
  PERFORM public.topac_upsert_funcionario(v_pg, 'JAQUELINE RODRIGUES DA SILVA PEREIRA', 'AUXILIAR ADMINISTRATIVO', 2001.29, NULL);
  PERFORM public.topac_upsert_funcionario(v_pg, 'SABRINA DOS SANTOS BARRETO', 'AUXILIAR ADMINISTRATIVO', 1800.00, NULL);

  PERFORM public.topac_upsert_funcionario(v_alqui, 'ADALTO JACINTO', 'TORNEIRO MECANICO', 3192.22, NULL);
  PERFORM public.topac_upsert_funcionario(v_alqui, 'DIEGO MARTINS SILVA SANTOS', 'TECNICO MECANICO JUNIOR', 2738.62, NULL);
  PERFORM public.topac_upsert_funcionario(v_alqui, 'KAYKY CHAFI SERVILIO', 'AJUDANTE DE ALMOXARIFADO', 2228.73, NULL);
  PERFORM public.topac_upsert_funcionario(v_alqui, 'LEONEL DE SOUZA SANTOS', 'ENCARREGADO DE OFICINA', 5798.93, NULL);
  PERFORM public.topac_upsert_funcionario(v_alqui, 'MARCELO SOARES BENTO', 'AUXILIAR OPERACIONAL PLENO', 2658.61, NULL);
  PERFORM public.topac_upsert_funcionario(v_alqui, 'NACIEL SANTOS DA SILVA', 'TECNICO MECANICO JUNIOR', 2738.62, NULL);
  PERFORM public.topac_upsert_funcionario(v_alqui, 'RODRIGO DE SOUZA SABINO', 'ASSISTENTE ADM JUNIOR', 2896.99, NULL);
  PERFORM public.topac_upsert_funcionario(v_alqui, 'SAMUEL DA COSTA PEREIRA', 'AJUDANTE MECANICO', 2118.78, NULL);
  PERFORM public.topac_upsert_funcionario(v_alqui, 'TIAGO MOREIRA DA SILVA FERREIRA', 'TECNICO MECANICO PLENO', 3024.71, NULL);
  PERFORM public.topac_upsert_funcionario(v_alqui, 'TIAGO TOLEDO DIAS', 'TECNICO MECANICO PLENO', 3024.71, NULL);

  PERFORM public.topac_upsert_funcionario(v_gyn, 'ABINADAB MARTINS DOS SANTOS', 'CONSULTOR DE VENDAS', 2200.00, '008.739.611-45');
  PERFORM public.topac_upsert_funcionario(v_gyn, 'ALDENEI PEREIRA DOS SANTOS', 'GERENTE COMERCIAL', 3840.05, '790.911.301-30');
  PERFORM public.topac_upsert_funcionario(v_gyn, 'FRANCINALDO GIL DA CONCEICAO', 'TECNICO DE MECANICO SENIOR', 4134.00, '055.972.463-21');
  PERFORM public.topac_upsert_funcionario(v_gyn, 'IGOR FERREIRA ABREU', 'AUXILIAR ADMINISTRATIVO', 2014.00, '700.995.111-00');
  PERFORM public.topac_upsert_funcionario(v_gyn, 'ILMA MENDES DE MELLO', 'ASSISTENTE ADMINISTRATIVO PLENO', 2438.00, '044.192.653-37');
  PERFORM public.topac_upsert_funcionario(v_gyn, 'JOAO GABRIEL DE SOUZA SILVA', 'AUXILIAR DE ALMOXARIFADO', 1999.00, '703.570.251-21');
  PERFORM public.topac_upsert_funcionario(v_gyn, 'JOSE VINICIUS SANTOS SOUSA', 'MECANICO', 2650.00, '068.663.421-71');
  PERFORM public.topac_upsert_funcionario(v_gyn, 'SHAMUEL MARTINS DOS SANTOS', 'TECNICO MECANICO JUNIOR', 2332.00, '102.380.943-59');
END;
$$;

UPDATE public.funcionarios
SET cpf_pendente_acesso = regexp_replace(coalesce(cpf, ''), '\D', '', 'g') = '',
    updated_at = now();

CREATE OR REPLACE FUNCTION public.acessos_externos_normalize()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.cpf_clean := regexp_replace(COALESCE(NEW.cpf_clean, NEW.cpf, ''), '[^0-9]', '', 'g');
  IF length(NEW.cpf_clean) < 11 THEN
    RAISE EXCEPTION 'CPF obrigatorio para liberacao de acesso';
  END IF;
  NEW.pin := right(NEW.cpf_clean, 4);
  NEW.cpf := COALESCE(NULLIF(NEW.cpf, ''), NEW.cpf_clean);
  NEW.status := COALESCE(NULLIF(NEW.status, ''), 'ativo');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_acessos_externos_normalize ON public.acessos_externos;
CREATE TRIGGER tg_acessos_externos_normalize
BEFORE INSERT OR UPDATE ON public.acessos_externos
FOR EACH ROW EXECUTE FUNCTION public.acessos_externos_normalize();

CREATE OR REPLACE FUNCTION public.funcionarios_alertas_rh()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'cpf_pendente', COALESCE(jsonb_agg(jsonb_build_object('id', id, 'nome', nome, 'empresa_id', COALESCE(company_id, empresa_id))) FILTER (WHERE cpf_pendente_acesso), '[]'::jsonb),
    'aso_pendente', COALESCE(jsonb_agg(jsonb_build_object('id', id, 'nome', nome, 'empresa_id', COALESCE(company_id, empresa_id))) FILTER (WHERE data_exame_medico IS NULL), '[]'::jsonb),
    'aso_vencido', COALESCE(jsonb_agg(jsonb_build_object('id', id, 'nome', nome, 'empresa_id', COALESCE(company_id, empresa_id))) FILTER (WHERE data_exame_medico IS NOT NULL AND data_exame_medico <= current_date - interval '1 year'), '[]'::jsonb),
    'aso_proximo', COALESCE(jsonb_agg(jsonb_build_object('id', id, 'nome', nome, 'empresa_id', COALESCE(company_id, empresa_id))) FILTER (WHERE data_exame_medico IS NOT NULL AND data_exame_medico > current_date - interval '1 year' AND data_exame_medico <= current_date - interval '11 months'), '[]'::jsonb)
  )
  FROM public.funcionarios
  WHERE COALESCE(status, 'ativo') <> 'desligado';
$$;

GRANT EXECUTE ON FUNCTION public.funcionarios_alertas_rh() TO authenticated, anon;

NOTIFY pgrst, 'reload schema';
