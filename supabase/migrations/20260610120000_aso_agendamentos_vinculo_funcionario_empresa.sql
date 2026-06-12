-- Vincula cada agendamento de ASO diretamente ao funcionario e a empresa da ficha.
ALTER TABLE public.aso_agendamentos
  ADD COLUMN IF NOT EXISTS funcionario_id uuid,
  ADD COLUMN IF NOT EXISTS company_id uuid;

-- Recupera vinculos antigos pelo CPF. Nome e empresa ficam apenas como dados legados
-- e nao sao usados como identificadores quando o CPF esta disponivel.
UPDATE public.aso_agendamentos AS agendamento
SET funcionario_id = funcionario.id
FROM public.funcionarios AS funcionario
WHERE agendamento.funcionario_id IS NULL
  AND regexp_replace(coalesce(agendamento.cpf, ''), '\D', '', 'g') <> ''
  AND regexp_replace(coalesce(funcionario.cpf, ''), '\D', '', 'g') =
      regexp_replace(coalesce(agendamento.cpf, ''), '\D', '', 'g');

UPDATE public.aso_agendamentos AS agendamento
SET company_id = funcionario.company_id
FROM public.funcionarios AS funcionario
WHERE agendamento.company_id IS NULL
  AND funcionario.id = agendamento.funcionario_id;

-- Normaliza valores legados antes de restringir os status aceitos.
UPDATE public.aso_agendamentos
SET status = CASE lower(trim(coalesce(status, '')))
  WHEN 'pendente' THEN 'pendente'
  WHEN 'agendado' THEN 'agendado'
  WHEN 'confirmado' THEN 'confirmado'
  WHEN 'realizado' THEN 'realizado'
  WHEN 'concluido' THEN 'realizado'
  WHEN 'concluído' THEN 'realizado'
  WHEN 'cancelado' THEN 'cancelado'
  WHEN 'vencido' THEN 'vencido'
  ELSE 'pendente'
END;

-- Agendamentos ainda abertos cuja data ja passou ficam vencidos.
UPDATE public.aso_agendamentos
SET status = 'vencido', updated_at = now()
WHERE data_exame < current_date
  AND status IN ('pendente', 'agendado', 'confirmado');

DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT con.conname
    FROM pg_constraint con
    WHERE con.conrelid = 'public.aso_agendamentos'::regclass
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.aso_agendamentos DROP CONSTRAINT %I', constraint_name);
  END LOOP;

  ALTER TABLE public.aso_agendamentos
    ADD CONSTRAINT aso_agendamentos_status_check
    CHECK (status IN ('pendente', 'agendado', 'confirmado', 'realizado', 'cancelado', 'vencido'));

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'aso_agendamentos_funcionario_id_fkey'
      AND conrelid = 'public.aso_agendamentos'::regclass
  ) THEN
    ALTER TABLE public.aso_agendamentos
      ADD CONSTRAINT aso_agendamentos_funcionario_id_fkey
      FOREIGN KEY (funcionario_id) REFERENCES public.funcionarios(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'aso_agendamentos_company_id_fkey'
      AND conrelid = 'public.aso_agendamentos'::regclass
  ) THEN
    ALTER TABLE public.aso_agendamentos
      ADD CONSTRAINT aso_agendamentos_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES public.empresas(id) ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_aso_agendamentos_funcionario_id
  ON public.aso_agendamentos(funcionario_id);

CREATE INDEX IF NOT EXISTS idx_aso_agendamentos_company_id
  ON public.aso_agendamentos(company_id);

CREATE INDEX IF NOT EXISTS idx_aso_agendamentos_funcionario_data
  ON public.aso_agendamentos(funcionario_id, data_exame DESC);

-- Garante que company_id corresponda a empresa atual do funcionario e atualiza
-- automaticamente o status para vencido quando um registro aberto e gravado com data passada.
CREATE OR REPLACE FUNCTION public.topac_preparar_aso_agendamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  funcionario_company_id uuid;
BEGIN
  IF NEW.funcionario_id IS NOT NULL THEN
    SELECT company_id INTO funcionario_company_id
    FROM public.funcionarios
    WHERE id = NEW.funcionario_id;

    IF funcionario_company_id IS NULL THEN
      RAISE EXCEPTION 'Funcionario informado no agendamento de ASO nao existe.';
    END IF;

    IF NEW.company_id IS NULL THEN
      NEW.company_id := funcionario_company_id;
    ELSIF NEW.company_id <> funcionario_company_id THEN
      RAISE EXCEPTION 'Empresa do agendamento de ASO difere da empresa do funcionario.';
    END IF;
  END IF;

  IF NEW.data_exame < current_date
     AND NEW.status IN ('pendente', 'agendado', 'confirmado') THEN
    NEW.status := 'vencido';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS preparar_aso_agendamento ON public.aso_agendamentos;
CREATE TRIGGER preparar_aso_agendamento
  BEFORE INSERT OR UPDATE OF funcionario_id, company_id, data_exame, status
  ON public.aso_agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.topac_preparar_aso_agendamento();

-- Quando um ASO e realizado, a data do exame passa a ser a data medica da ficha.
CREATE OR REPLACE FUNCTION public.topac_sincronizar_aso_realizado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'realizado'
     AND NEW.funcionario_id IS NOT NULL
     AND NEW.data_exame IS NOT NULL THEN
    UPDATE public.funcionarios
    SET data_exame_medico = NEW.data_exame,
        updated_at = now()
    WHERE id = NEW.funcionario_id
      AND (data_exame_medico IS NULL OR data_exame_medico <= NEW.data_exame);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sincronizar_aso_realizado ON public.aso_agendamentos;
CREATE TRIGGER sincronizar_aso_realizado
  AFTER INSERT OR UPDATE OF status, data_exame, funcionario_id
  ON public.aso_agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.topac_sincronizar_aso_realizado();

-- Sincroniza tambem os ASOs realizados que ja existiam antes da migration.
UPDATE public.funcionarios AS funcionario
SET data_exame_medico = realizado.ultima_data,
    updated_at = now()
FROM (
  SELECT funcionario_id, max(data_exame) AS ultima_data
  FROM public.aso_agendamentos
  WHERE status = 'realizado'
    AND funcionario_id IS NOT NULL
    AND data_exame IS NOT NULL
  GROUP BY funcionario_id
) AS realizado
WHERE funcionario.id = realizado.funcionario_id
  AND (funcionario.data_exame_medico IS NULL OR funcionario.data_exame_medico <= realizado.ultima_data);
