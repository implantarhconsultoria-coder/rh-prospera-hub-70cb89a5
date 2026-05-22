-- TOPAC RH PRO - compatibilidade definitiva de funcionarios/beneficios
-- Corrige bases antigas onde a tela ja envia vr_ativo, vt_ativo, va_ativo e insalubridade_ativa.
-- Seguro para rodar mais de uma vez: nao apaga dados e nao sobrescreve valores preenchidos.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.funcionarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.funcionarios
  ADD COLUMN IF NOT EXISTS empresa_id uuid,
  ADD COLUMN IF NOT EXISTS company_id uuid,
  ADD COLUMN IF NOT EXISTS registro text DEFAULT '',
  ADD COLUMN IF NOT EXISTS matricula_esocial text DEFAULT '',
  ADD COLUMN IF NOT EXISTS cpf text DEFAULT '',
  ADD COLUMN IF NOT EXISTS rg text DEFAULT '',
  ADD COLUMN IF NOT EXISTS cargo text DEFAULT '',
  ADD COLUMN IF NOT EXISTS categoria text DEFAULT 'operacional',
  ADD COLUMN IF NOT EXISTS salario numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS salario_base numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS data_admissao date,
  ADD COLUMN IF NOT EXISTS data_nascimento date,
  ADD COLUMN IF NOT EXISTS data_exame_medico date,
  ADD COLUMN IF NOT EXISTS setor_ghe text DEFAULT '',
  ADD COLUMN IF NOT EXISTS telefone text DEFAULT '',
  ADD COLUMN IF NOT EXISTS celular text DEFAULT '',
  ADD COLUMN IF NOT EXISTS email text DEFAULT '',
  ADD COLUMN IF NOT EXISTS endereco text DEFAULT '',
  ADD COLUMN IF NOT EXISTS pix text DEFAULT '',
  ADD COLUMN IF NOT EXISTS banco text DEFAULT '',
  ADD COLUMN IF NOT EXISTS agencia text DEFAULT '',
  ADD COLUMN IF NOT EXISTS conta text DEFAULT '',
  ADD COLUMN IF NOT EXISTS observacoes text DEFAULT '',
  ADD COLUMN IF NOT EXISTS ativo boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'ativo',
  ADD COLUMN IF NOT EXISTS cpf_pendente_acesso boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS vr_ativo boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS vr_diario numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS va_ativo boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS va_mensal numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vt_ativo boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS vt_diario numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS insalubridade_ativa boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS insalubridade_valor numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tem_insalubridade boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS percentual_insalubridade numeric,
  ADD COLUMN IF NOT EXISTS valor_insalubridade numeric,
  ADD COLUMN IF NOT EXISTS base_calculo_insalubridade numeric,
  ADD COLUMN IF NOT EXISTS insalubridade_confirmada boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS insalubridade_pendente boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

UPDATE public.funcionarios
SET
  company_id = COALESCE(company_id, empresa_id),
  empresa_id = COALESCE(empresa_id, company_id),
  salario_base = COALESCE(NULLIF(salario_base, 0), salario, 0),
  salario = COALESCE(NULLIF(salario, 0), salario_base, 0),
  status = COALESCE(NULLIF(status, ''), CASE WHEN COALESCE(ativo, true) THEN 'ativo' ELSE 'desligado' END),
  ativo = CASE WHEN COALESCE(status, 'ativo') = 'desligado' THEN false ELSE COALESCE(ativo, true) END,
  categoria = COALESCE(NULLIF(categoria, ''), 'operacional'),
  cpf_pendente_acesso = CASE
    WHEN COALESCE(regexp_replace(cpf, '\D', '', 'g'), '') = '' THEN true
    ELSE COALESCE(cpf_pendente_acesso, false)
  END,
  tem_insalubridade = COALESCE(tem_insalubridade, insalubridade_ativa, false),
  valor_insalubridade = COALESCE(valor_insalubridade, insalubridade_valor),
  insalubridade_valor = COALESCE(insalubridade_valor, valor_insalubridade, 0);

ALTER TABLE public.funcionarios
  ALTER COLUMN nome SET DEFAULT '',
  ALTER COLUMN registro SET DEFAULT '',
  ALTER COLUMN matricula_esocial SET DEFAULT '',
  ALTER COLUMN cpf SET DEFAULT '',
  ALTER COLUMN rg SET DEFAULT '',
  ALTER COLUMN cargo SET DEFAULT '',
  ALTER COLUMN categoria SET DEFAULT 'operacional',
  ALTER COLUMN salario SET DEFAULT 0,
  ALTER COLUMN salario_base SET DEFAULT 0,
  ALTER COLUMN telefone SET DEFAULT '',
  ALTER COLUMN celular SET DEFAULT '',
  ALTER COLUMN email SET DEFAULT '',
  ALTER COLUMN endereco SET DEFAULT '',
  ALTER COLUMN pix SET DEFAULT '',
  ALTER COLUMN banco SET DEFAULT '',
  ALTER COLUMN agencia SET DEFAULT '',
  ALTER COLUMN conta SET DEFAULT '',
  ALTER COLUMN observacoes SET DEFAULT '',
  ALTER COLUMN ativo SET DEFAULT true,
  ALTER COLUMN status SET DEFAULT 'ativo',
  ALTER COLUMN cpf_pendente_acesso SET DEFAULT false,
  ALTER COLUMN vr_ativo SET DEFAULT false,
  ALTER COLUMN vr_diario SET DEFAULT 0,
  ALTER COLUMN va_ativo SET DEFAULT false,
  ALTER COLUMN va_mensal SET DEFAULT 0,
  ALTER COLUMN vt_ativo SET DEFAULT false,
  ALTER COLUMN vt_diario SET DEFAULT 0,
  ALTER COLUMN insalubridade_ativa SET DEFAULT false,
  ALTER COLUMN insalubridade_valor SET DEFAULT 0,
  ALTER COLUMN tem_insalubridade SET DEFAULT false,
  ALTER COLUMN insalubridade_confirmada SET DEFAULT false,
  ALTER COLUMN insalubridade_pendente SET DEFAULT false,
  ALTER COLUMN updated_at SET DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_funcionarios_empresa_id ON public.funcionarios(empresa_id);
CREATE INDEX IF NOT EXISTS idx_funcionarios_company_id ON public.funcionarios(company_id);
CREATE INDEX IF NOT EXISTS idx_funcionarios_cpf_clean ON public.funcionarios((regexp_replace(COALESCE(cpf, ''), '\D', '', 'g')));
CREATE INDEX IF NOT EXISTS idx_funcionarios_status ON public.funcionarios(status);

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_funcionarios_touch_updated_at ON public.funcionarios;
CREATE TRIGGER trg_funcionarios_touch_updated_at
BEFORE UPDATE ON public.funcionarios
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.funcionarios ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'funcionarios' AND policyname = 'funcionarios_authenticated_select'
  ) THEN
    CREATE POLICY funcionarios_authenticated_select
      ON public.funcionarios
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'funcionarios' AND policyname = 'funcionarios_authenticated_insert'
  ) THEN
    CREATE POLICY funcionarios_authenticated_insert
      ON public.funcionarios
      FOR INSERT
      TO authenticated
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'funcionarios' AND policyname = 'funcionarios_authenticated_update'
  ) THEN
    CREATE POLICY funcionarios_authenticated_update
      ON public.funcionarios
      FOR UPDATE
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE ON public.funcionarios TO authenticated;

NOTIFY pgrst, 'reload schema';
