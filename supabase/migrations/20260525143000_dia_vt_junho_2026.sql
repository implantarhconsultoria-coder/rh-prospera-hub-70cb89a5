-- TOPAC RH PRO - DIA/VT junho/2026.
-- Atualiza somente o valor diario de VT e alimenta lancamentos de junho.
-- TOTAL:VT segue calculado pela aplicacao como DIA/VT x DIAS.

CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION public.topac_norm_name_beneficios(p_nome text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(upper(public.unaccent(coalesce(p_nome, ''))), '\s+', ' ', 'g')
$$;

DROP TABLE IF EXISTS pg_temp.topac_dia_vt_junho_2026;
CREATE TEMP TABLE topac_dia_vt_junho_2026 (
  empresa_codigo text NOT NULL,
  nome text NOT NULL,
  cpf text NOT NULL DEFAULT '',
  vt_diario numeric NOT NULL
) ON COMMIT DROP;

INSERT INTO topac_dia_vt_junho_2026 (empresa_codigo, nome, cpf, vt_diario) VALUES
  -- TOPAC GO
  ('topac-gyn', 'Shamuel Martins dos Santos', '102.380.943-59', 8.60),

  -- ALQUI
  ('alqui', 'Adalto Jacinto', '142.959.198-61', 10.00),
  ('alqui', 'Diego Martins Silva Santos', '538.447.598-67', 0.00),
  ('alqui', 'Kayky Chafi Servilio', '528.910.058-05', 25.40),
  ('alqui', 'Leonel de Souza Santos', '029.604.085-19', 0.00),
  ('alqui', 'Marcelo Soares Bento', '161.135.928-71', 39.36),
  ('alqui', 'Naciel Santos da Silva', '452.173.078-70', 38.00),
  ('alqui', 'Samuel da Costa Pereira', '585.209.468-44', 35.10),
  ('alqui', 'Rodrigo de Souza Sabino', '386.655.478-86', 35.00),
  ('alqui', 'Robson Chafi Servilio', '258.923.608-57', 0.00),
  ('alqui', 'Tiago Moreira da Silva', '103.157.625-86', 0.00),
  ('alqui', 'Tiago Toledo Dias', '323.486.898-04', 0.00),

  -- TOPAC/SP
  ('topac-matriz', 'Carlos Henrique Alves Silva', '297.101.158-55', 25.50),
  ('topac-matriz', 'Claudemir Antonio', '135.083.378-98', 21.20),
  ('topac-matriz', 'David Michael da Silva', '714.776.974-03', 38.00),
  ('topac-matriz', 'Bruno Vinicius Soares Rodrigues', '422.523.398-70', 38.00),
  ('topac-matriz', 'Edinaldo Jose da Silva', '031.828.914-80', 38.00),
  ('topac-matriz', 'Gisele Medina', '222.116.538-12', 20.40),
  ('topac-matriz', 'Gustavo Rodrigues Gomes', '505.789.288-13', 35.10),
  ('topac-matriz', 'Julio Conceicao Oliveira', '420.141.478-76', 25.96),
  ('topac-matriz', 'Nathan Luciano Dias Rodrigues', '239.071.248-71', 24.20),
  ('topac-matriz', 'Paula Rubia Faquini Goncalves', '194.597.918-67', 10.60),
  ('topac-matriz', 'Rafaela Aparecida Del Nobile', '443.268.638-38', 24.20),
  ('topac-matriz', 'Rodrigo Medrado da Silva', '497.726.618-88', 35.00),

  -- LMT
  ('lmt', 'Agles Nathan dos Santos', '544.000.478-57', 35.10),
  ('lmt', 'Douglas Cesar Chiappetta', '127.461.408-29', 10.80),
  ('lmt', 'Jerri Silva Inocencio', '129.335.298-58', 0.00),
  ('lmt', 'Lucas Martins Silva dos Santos', '553.645.528-10', 35.10),
  ('lmt', 'Leandro Martins de Oliveira', '221.464.248-00', 0.00),
  ('lmt', 'Rander Wyllas Alves Pereira', '090.756.615-41', 35.10),
  ('lmt', 'Rafael Olimpio', '314.347.998-16', 40.20),
  ('lmt', 'Renato Barreto de Lima', '380.932.398-55', 32.20),

  -- TOPAC PG
  ('topac-pg', 'Antonio Carlos Servilio', '610.970.048-72', 0.00),
  ('topac-pg', 'Edenilson Pereira Vitor', '848.565.134-00', 0.00),
  ('topac-pg', 'Gabriel Moreno da Silva', '511.226.668-61', 15.40),
  ('topac-pg', 'Jaqueline Rodrigues da Silva Pereira', '423.747.108-07', 10.50),
  ('topac-pg', 'Sabrina dos Santos Barreto', '463.134.978-64', 10.50);

DROP TABLE IF EXISTS pg_temp.topac_alvos_dia_vt_junho_2026;
CREATE TEMP TABLE topac_alvos_dia_vt_junho_2026 ON COMMIT DROP AS
SELECT
  v.empresa_codigo,
  v.nome,
  f.id AS funcionario_id,
  COALESCE(f.company_id, f.empresa_id, e.id) AS company_id,
  v.vt_diario,
  COALESCE(f.vr_ativo, false) AS vr_ativo
FROM topac_dia_vt_junho_2026 v
LEFT JOIN public.empresas e ON e.codigo = v.empresa_codigo
JOIN LATERAL (
  SELECT fx.*
  FROM public.funcionarios fx
  WHERE regexp_replace(coalesce(fx.cpf, ''), '\D', '', 'g') = regexp_replace(v.cpf, '\D', '', 'g')
     OR (
       e.id IS NOT NULL
       AND (fx.company_id = e.id OR fx.empresa_id = e.id)
       AND public.topac_norm_name_beneficios(fx.nome) = public.topac_norm_name_beneficios(v.nome)
     )
  ORDER BY
    CASE
      WHEN regexp_replace(coalesce(fx.cpf, ''), '\D', '', 'g') = regexp_replace(v.cpf, '\D', '', 'g') THEN 0
      ELSE 1
    END,
    fx.updated_at DESC NULLS LAST
  LIMIT 1
) f ON true;

UPDATE public.funcionarios f
SET
  vt_ativo = a.vt_diario > 0,
  vt_diario = a.vt_diario,
  updated_at = now()
FROM topac_alvos_dia_vt_junho_2026 a
WHERE f.id = a.funcionario_id;

INSERT INTO public.lancamentos_mensais (
  funcionario_id,
  company_id,
  competencia,
  vr_aplicado,
  vr_dias,
  vt_aplicado,
  vt_desconto,
  status_conferencia
)
SELECT
  a.funcionario_id,
  a.company_id,
  '2026-06',
  a.vr_ativo,
  CASE WHEN a.vr_ativo THEN 21 ELSE 0 END,
  a.vt_diario > 0,
  a.vt_diario,
  'pendente'
FROM topac_alvos_dia_vt_junho_2026 a
WHERE a.company_id IS NOT NULL
ON CONFLICT (funcionario_id, competencia)
DO UPDATE SET
  vt_aplicado = EXCLUDED.vt_aplicado,
  vt_desconto = EXCLUDED.vt_desconto,
  updated_at = now();

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT v.*
    FROM topac_dia_vt_junho_2026 v
    LEFT JOIN topac_alvos_dia_vt_junho_2026 a
      ON a.empresa_codigo = v.empresa_codigo
     AND a.nome = v.nome
    WHERE a.funcionario_id IS NULL
  LOOP
    RAISE NOTICE 'Funcionario nao encontrado para DIA/VT junho/2026: % - %', r.empresa_codigo, r.nome;
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
