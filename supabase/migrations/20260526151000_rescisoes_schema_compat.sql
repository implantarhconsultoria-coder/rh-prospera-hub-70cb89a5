-- Compatibilidade de producao para o modulo de rescisoes.
-- Garante a tabela esperada pelo front e recarrega o schema do PostgREST.

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.rescisoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funcionario_id uuid,
  funcionario_nome text NOT NULL DEFAULT '',
  company_id uuid,
  empresa_nome text NOT NULL DEFAULT '',
  empresa_cnpj text,
  empresa_municipio text,
  empresa_uf text,
  cargo text NOT NULL DEFAULT '',
  cpf text,
  endereco text,
  data_admissao date,
  data_desligamento date NOT NULL,
  tipo_rescisao text NOT NULL DEFAULT 'sem_justa_causa',
  motivo text NOT NULL DEFAULT '',
  aviso_previo text NOT NULL DEFAULT 'indenizado',
  dias_aviso numeric NOT NULL DEFAULT 0,
  salario_base numeric NOT NULL DEFAULT 0,
  dependentes integer NOT NULL DEFAULT 0,
  saldo_fgts_depositado numeric NOT NULL DEFAULT 0,
  saldo_salario numeric NOT NULL DEFAULT 0,
  aviso_previo_valor numeric NOT NULL DEFAULT 0,
  ferias_vencidas numeric NOT NULL DEFAULT 0,
  ferias_proporcionais numeric NOT NULL DEFAULT 0,
  terco_ferias numeric NOT NULL DEFAULT 0,
  decimo_terceiro numeric NOT NULL DEFAULT 0,
  inss numeric NOT NULL DEFAULT 0,
  irrf numeric NOT NULL DEFAULT 0,
  fgts_mes numeric NOT NULL DEFAULT 0,
  multa_fgts numeric NOT NULL DEFAULT 0,
  outros_descontos numeric NOT NULL DEFAULT 0,
  total_proventos numeric NOT NULL DEFAULT 0,
  total_descontos numeric NOT NULL DEFAULT 0,
  liquido numeric NOT NULL DEFAULT 0,
  observacoes text NOT NULL DEFAULT '',
  snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'finalizada',
  user_id uuid,
  usuario_nome text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rescisoes ADD COLUMN IF NOT EXISTS empresa_cnpj text;
ALTER TABLE public.rescisoes ADD COLUMN IF NOT EXISTS empresa_municipio text;
ALTER TABLE public.rescisoes ADD COLUMN IF NOT EXISTS empresa_uf text;
ALTER TABLE public.rescisoes ADD COLUMN IF NOT EXISTS cpf text;
ALTER TABLE public.rescisoes ADD COLUMN IF NOT EXISTS endereco text;
ALTER TABLE public.rescisoes ADD COLUMN IF NOT EXISTS snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.rescisoes ADD COLUMN IF NOT EXISTS usuario_nome text NOT NULL DEFAULT '';
ALTER TABLE public.rescisoes ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.rescisoes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'rescisoes' AND policyname = 'Admin manage rescisoes'
  ) THEN
    CREATE POLICY "Admin manage rescisoes" ON public.rescisoes
      FOR ALL TO authenticated
      USING (public.has_role(auth.uid(), 'admin'::public.app_role))
      WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'rescisoes' AND policyname = 'Filial view own empresa rescisoes'
  ) THEN
    CREATE POLICY "Filial view own empresa rescisoes" ON public.rescisoes
      FOR SELECT TO authenticated
      USING (empresa_nome = ANY (public.get_user_empresas()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'rescisoes' AND policyname = 'Filial insert own empresa rescisoes'
  ) THEN
    CREATE POLICY "Filial insert own empresa rescisoes" ON public.rescisoes
      FOR INSERT TO authenticated
      WITH CHECK (empresa_nome = ANY (public.get_user_empresas()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'rescisoes' AND policyname = 'Filial update own empresa rescisoes'
  ) THEN
    CREATE POLICY "Filial update own empresa rescisoes" ON public.rescisoes
      FOR UPDATE TO authenticated
      USING (empresa_nome = ANY (public.get_user_empresas()))
      WITH CHECK (empresa_nome = ANY (public.get_user_empresas()));
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_rescisoes_updated_at'
      AND tgrelid = 'public.rescisoes'::regclass
  ) THEN
    CREATE TRIGGER trg_rescisoes_updated_at
      BEFORE UPDATE ON public.rescisoes
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END;
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rescisoes TO authenticated;

NOTIFY pgrst, 'reload schema';
