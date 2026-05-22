-- TOPAC RH PRO - atualizacao de VR, VT e controle de insalubridade.
-- Fonte: valores enviados em 21/05/2026. VR/VT sao valores diarios.
-- VT diario = 0 desativa VT. VR diario = 0 desativa VR.

CREATE EXTENSION IF NOT EXISTS unaccent;

ALTER TABLE public.funcionarios
  ADD COLUMN IF NOT EXISTS empresa_id uuid,
  ADD COLUMN IF NOT EXISTS company_id uuid,
  ADD COLUMN IF NOT EXISTS cpf text DEFAULT '',
  ADD COLUMN IF NOT EXISTS salario numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS salario_base numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ativo boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'ativo',
  ADD COLUMN IF NOT EXISTS cpf_pendente_acesso boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS vt_ativo boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS vt_diario numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vr_ativo boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS vr_diario numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS va_ativo boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS va_mensal numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS insalubridade_ativa boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS insalubridade_valor numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tem_insalubridade boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS percentual_insalubridade numeric,
  ADD COLUMN IF NOT EXISTS valor_insalubridade numeric,
  ADD COLUMN IF NOT EXISTS base_calculo_insalubridade numeric,
  ADD COLUMN IF NOT EXISTS insalubridade_confirmada boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS insalubridade_pendente boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE OR REPLACE FUNCTION public.topac_norm_name_beneficios(p_nome text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(upper(public.unaccent(coalesce(p_nome, ''))), '\s+', ' ', 'g')
$$;

CREATE OR REPLACE FUNCTION public.topac_empresa_por_codigo_beneficios(p_codigo text)
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT id
  FROM public.empresas
  WHERE codigo = p_codigo
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.topac_atualiza_beneficio_funcionario(
  p_empresa_codigo text,
  p_nome text,
  p_cpf text,
  p_vt_diario numeric,
  p_vr_diario numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa_id uuid;
  v_cpf text := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');
  v_id uuid;
BEGIN
  v_empresa_id := public.topac_empresa_por_codigo_beneficios(p_empresa_codigo);

  SELECT f.id INTO v_id
  FROM public.funcionarios f
  WHERE regexp_replace(coalesce(f.cpf, ''), '\D', '', 'g') = v_cpf
  LIMIT 1;

  IF v_id IS NULL AND v_empresa_id IS NOT NULL THEN
    SELECT f.id INTO v_id
    FROM public.funcionarios f
    WHERE (f.company_id = v_empresa_id OR f.empresa_id = v_empresa_id)
      AND public.topac_norm_name_beneficios(f.nome) = public.topac_norm_name_beneficios(p_nome)
    LIMIT 1;
  END IF;

  IF v_id IS NULL THEN
    RAISE NOTICE 'Funcionario nao encontrado para beneficios: %, CPF %', p_nome, p_cpf;
    RETURN;
  END IF;

  UPDATE public.funcionarios
  SET cpf = CASE
        WHEN regexp_replace(coalesce(cpf, ''), '\D', '', 'g') = '' AND v_cpf <> '' THEN p_cpf
        ELSE cpf
      END,
      vt_ativo = COALESCE(p_vt_diario, 0) > 0,
      vt_diario = COALESCE(p_vt_diario, 0),
      vr_ativo = COALESCE(p_vr_diario, 0) > 0,
      vr_diario = COALESCE(p_vr_diario, 0),
      cpf_pendente_acesso = regexp_replace(coalesce(CASE
        WHEN regexp_replace(coalesce(cpf, ''), '\D', '', 'g') = '' AND v_cpf <> '' THEN p_cpf
        ELSE cpf
      END, ''), '\D', '', 'g') = '',
      insalubridade_pendente = NOT COALESCE(insalubridade_confirmada, false),
      updated_at = now()
  WHERE id = v_id;
END;
$$;

DO $$
BEGIN
  -- ALQUI
  PERFORM public.topac_atualiza_beneficio_funcionario('alqui', 'Adalto Jacinto', '142.959.198-61', 10.00, 27.32);
  PERFORM public.topac_atualiza_beneficio_funcionario('alqui', 'Diego Martins Silva Santos', '538.447.598-67', 0.00, 27.32);
  PERFORM public.topac_atualiza_beneficio_funcionario('alqui', 'Kayky Chafi Servilio', '528.910.058-05', 25.40, 27.32);
  PERFORM public.topac_atualiza_beneficio_funcionario('alqui', 'Leonel de Souza Santos', '029.604.085-19', 0.00, 27.32);
  PERFORM public.topac_atualiza_beneficio_funcionario('alqui', 'Marcelo Soares Bento', '161.135.928-71', 39.36, 27.32);
  PERFORM public.topac_atualiza_beneficio_funcionario('alqui', 'Naciel Santos da Silva', '452.173.078-70', 38.00, 27.32);
  PERFORM public.topac_atualiza_beneficio_funcionario('alqui', 'Samuel da Costa Pereira', '585.209.468-44', 35.10, 27.32);
  PERFORM public.topac_atualiza_beneficio_funcionario('alqui', 'Rodrigo de Souza Sabino', '386.655.478-86', 35.00, 27.32);
  PERFORM public.topac_atualiza_beneficio_funcionario('alqui', 'Robson Chafi Servilio', '258.923.608-57', 0.00, 27.32);
  PERFORM public.topac_atualiza_beneficio_funcionario('alqui', 'Tiago Moreira da Silva', '103.157.625-86', 0.00, 27.32);
  PERFORM public.topac_atualiza_beneficio_funcionario('alqui', 'Tiago Toledo Dias', '323.486.898-04', 0.00, 27.32);

  -- TOPAC/SP
  PERFORM public.topac_atualiza_beneficio_funcionario('topac-matriz', 'Carlos Henrique Alves Silva', '297.101.158-55', 25.50, 27.32);
  PERFORM public.topac_atualiza_beneficio_funcionario('topac-matriz', 'Claudemir Antonio', '135.083.378-98', 21.20, 27.32);
  PERFORM public.topac_atualiza_beneficio_funcionario('topac-matriz', 'David Michael da Silva', '714.776.974-03', 38.00, 27.32);
  PERFORM public.topac_atualiza_beneficio_funcionario('topac-matriz', 'Edinaldo Jose da Silva', '031.828.914-80', 38.00, 27.32);
  PERFORM public.topac_atualiza_beneficio_funcionario('topac-matriz', 'Gisele Medina', '222.116.538-12', 20.40, 0.00);
  PERFORM public.topac_atualiza_beneficio_funcionario('topac-matriz', 'Gustavo Rodrigues Gomes', '505.789.288-13', 35.10, 27.32);
  PERFORM public.topac_atualiza_beneficio_funcionario('topac-matriz', 'Julio Conceicao Oliveira', '420.141.478-76', 25.96, 27.32);
  PERFORM public.topac_atualiza_beneficio_funcionario('topac-matriz', 'Nathan Luciano Dias Rodrigues', '239.071.248-71', 24.20, 27.32);
  PERFORM public.topac_atualiza_beneficio_funcionario('topac-matriz', 'Paula Rubia Faquini Goncalves', '194.597.918-67', 10.60, 27.32);
  PERFORM public.topac_atualiza_beneficio_funcionario('topac-matriz', 'Rafaela Aparecida Del Nobile', '443.268.638-38', 24.20, 27.32);
  PERFORM public.topac_atualiza_beneficio_funcionario('topac-matriz', 'Rodrigo Medrado da Silva', '497.726.618-88', 45.60, 27.32);

  -- LMT
  PERFORM public.topac_atualiza_beneficio_funcionario('lmt', 'Agles Nathan dos Santos', '544.000.478-57', 35.10, 27.32);
  PERFORM public.topac_atualiza_beneficio_funcionario('lmt', 'Douglas Cesar Chiappetta', '127.461.408-29', 10.80, 27.32);
  PERFORM public.topac_atualiza_beneficio_funcionario('lmt', 'Jerri Silva Inocencio', '129.335.298-58', 0.00, 27.32);
  PERFORM public.topac_atualiza_beneficio_funcionario('lmt', 'Lucas Martins Silva dos Santos', '553.645.528-10', 35.10, 27.32);
  PERFORM public.topac_atualiza_beneficio_funcionario('lmt', 'Leandro Martins de Oliveira', '221.464.248-00', 0.00, 27.32);
  PERFORM public.topac_atualiza_beneficio_funcionario('lmt', 'Rander Wyllas Alves Pereira', '090.756.615-41', 35.10, 27.32);
  PERFORM public.topac_atualiza_beneficio_funcionario('lmt', 'Rafael Olimpio', '314.347.998-16', 40.20, 35.42);
  PERFORM public.topac_atualiza_beneficio_funcionario('lmt', 'Renato Barreto de Lima', '380.932.398-55', 32.20, 27.32);

  -- TOPAC PG
  PERFORM public.topac_atualiza_beneficio_funcionario('topac-pg', 'Antonio Carlos Servilio', '610.970.048-72', 0.00, 27.32);
  PERFORM public.topac_atualiza_beneficio_funcionario('topac-pg', 'Edenilson Pereira Vitor', '848.565.134-00', 0.00, 27.32);
  PERFORM public.topac_atualiza_beneficio_funcionario('topac-pg', 'Gabriel Moreno da Silva', '511.226.668-61', 15.40, 27.32);
  PERFORM public.topac_atualiza_beneficio_funcionario('topac-pg', 'Jaqueline Rodrigues da Silva Pereira', '423.747.108-07', 10.50, 27.32);
  PERFORM public.topac_atualiza_beneficio_funcionario('topac-pg', 'Sabrina dos Santos Barreto', '463.134.978-64', 10.50, 27.32);

  -- TOPAC GO
  PERFORM public.topac_atualiza_beneficio_funcionario('topac-gyn', 'Abinadab Martins dos Santos', '008.739.611-45', 8.60, 24.00);
  PERFORM public.topac_atualiza_beneficio_funcionario('topac-gyn', 'Aldenei Pereira dos Santos', '790.911.301-30', 0.00, 24.00);
  PERFORM public.topac_atualiza_beneficio_funcionario('topac-gyn', 'Francinaldo Gil da Conceicao', '055.972.463-21', 8.60, 24.00);
  PERFORM public.topac_atualiza_beneficio_funcionario('topac-gyn', 'Igor Ferreira Abreu', '700.995.111-00', 8.60, 24.00);
  PERFORM public.topac_atualiza_beneficio_funcionario('topac-gyn', 'Ilma Mendes de Mello', '044.192.653-37', 8.60, 24.00);
  PERFORM public.topac_atualiza_beneficio_funcionario('topac-gyn', 'Jose Vinicius Santos Sousa', '068.663.421-71', 8.60, 24.00);
  PERFORM public.topac_atualiza_beneficio_funcionario('topac-gyn', 'Joao Gabriel de Souza Silva', '703.570.251-21', 8.60, 24.00);
  PERFORM public.topac_atualiza_beneficio_funcionario('topac-gyn', 'Shamuel Martins dos Santos', '102.380.943-59', 8.60, 24.00);
END;
$$;

UPDATE public.funcionarios
SET insalubridade_pendente = NOT COALESCE(insalubridade_confirmada, false)
WHERE COALESCE(tem_insalubridade, false) = false
  AND COALESCE(insalubridade_confirmada, false) = false;

NOTIFY pgrst, 'reload schema';
