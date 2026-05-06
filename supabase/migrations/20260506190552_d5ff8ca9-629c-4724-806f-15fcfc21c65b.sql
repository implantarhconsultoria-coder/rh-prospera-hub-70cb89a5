-- 1) Deduplicar registros (cpf_clean, modulo) mantendo o mais antigo (id menor por created_at)
WITH ranked AS (
  SELECT id, cpf_clean, modulo,
         ROW_NUMBER() OVER (PARTITION BY cpf_clean, modulo ORDER BY created_at ASC, id ASC) AS rn
  FROM public.acessos_externos
  WHERE cpf_clean IS NOT NULL
)
DELETE FROM public.acessos_externos a
USING ranked r
WHERE a.id = r.id AND r.rn > 1;

-- 2) Garantir unicidade por CPF + módulo
CREATE UNIQUE INDEX IF NOT EXISTS uniq_acessos_externos_cpf_modulo
  ON public.acessos_externos (cpf_clean, modulo)
  WHERE cpf_clean IS NOT NULL;