-- TOPAC RH PRO - ajuste de producao.
-- Cria as tabelas que a tela de Frota usa e libera leitura/escrita do ADM.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.ativos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  tipo text NOT NULL DEFAULT 'veiculo',
  descricao text NOT NULL DEFAULT '',
  placa text DEFAULT '',
  patrimonio text DEFAULT '',
  renavam text DEFAULT '',
  chassi text DEFAULT '',
  ano_fabricacao text DEFAULT '',
  ano_modelo text DEFAULT '',
  empresa text DEFAULT '',
  arquivo_url text DEFAULT '',
  observacao text DEFAULT '',
  status text NOT NULL DEFAULT 'ativo',
  vencimento_ipva date,
  vencimento_licenciamento date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ativos
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS tipo text DEFAULT 'veiculo',
  ADD COLUMN IF NOT EXISTS descricao text DEFAULT '',
  ADD COLUMN IF NOT EXISTS placa text DEFAULT '',
  ADD COLUMN IF NOT EXISTS patrimonio text DEFAULT '',
  ADD COLUMN IF NOT EXISTS renavam text DEFAULT '',
  ADD COLUMN IF NOT EXISTS chassi text DEFAULT '',
  ADD COLUMN IF NOT EXISTS ano_fabricacao text DEFAULT '',
  ADD COLUMN IF NOT EXISTS ano_modelo text DEFAULT '',
  ADD COLUMN IF NOT EXISTS empresa text DEFAULT '',
  ADD COLUMN IF NOT EXISTS arquivo_url text DEFAULT '',
  ADD COLUMN IF NOT EXISTS observacao text DEFAULT '',
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'ativo',
  ADD COLUMN IF NOT EXISTS vencimento_ipva date,
  ADD COLUMN IF NOT EXISTS vencimento_licenciamento date,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_ativos_tipo ON public.ativos(tipo);
CREATE INDEX IF NOT EXISTS idx_ativos_placa ON public.ativos(placa);
CREATE INDEX IF NOT EXISTS idx_ativos_empresa ON public.ativos(empresa);

CREATE TABLE IF NOT EXISTS public.veiculo_manutencoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ativo_id uuid REFERENCES public.ativos(id) ON DELETE SET NULL,
  veiculo_descricao text,
  placa text,
  data date NOT NULL DEFAULT CURRENT_DATE,
  km numeric(12,1),
  descricao text NOT NULL,
  fornecedor text,
  nota_numero text,
  valor numeric(12,2) NOT NULL DEFAULT 0,
  arquivo_url text,
  arquivo_nome text,
  origem text NOT NULL DEFAULT 'manual',
  observacao text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_veiculo_manutencoes_ativo ON public.veiculo_manutencoes(ativo_id);
CREATE INDEX IF NOT EXISTS idx_veiculo_manutencoes_placa ON public.veiculo_manutencoes(placa);
CREATE INDEX IF NOT EXISTS idx_veiculo_manutencoes_data ON public.veiculo_manutencoes(data);

ALTER TABLE public.ativos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.veiculo_manutencoes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funcionarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "TOPAC admin gerencia empresas" ON public.empresas;
CREATE POLICY "TOPAC admin gerencia empresas" ON public.empresas
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
  ));

DROP POLICY IF EXISTS "TOPAC admin gerencia funcionarios" ON public.funcionarios;
CREATE POLICY "TOPAC admin gerencia funcionarios" ON public.funcionarios
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
  ));

DROP POLICY IF EXISTS "TOPAC admin gerencia ativos" ON public.ativos;
CREATE POLICY "TOPAC admin gerencia ativos" ON public.ativos
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
  ));

DROP POLICY IF EXISTS "TOPAC admin gerencia manutencoes veiculos" ON public.veiculo_manutencoes;
CREATE POLICY "TOPAC admin gerencia manutencoes veiculos" ON public.veiculo_manutencoes
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
  ));

DROP POLICY IF EXISTS "TOPAC admin ve storage select" ON storage.objects;
CREATE POLICY "TOPAC admin ve storage select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'documentos-ativos');

DROP POLICY IF EXISTS "TOPAC admin ve storage insert" ON storage.objects;
CREATE POLICY "TOPAC admin ve storage insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'documentos-ativos');

INSERT INTO storage.buckets (id, name, public)
VALUES ('documentos-ativos', 'documentos-ativos', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DROP TRIGGER IF EXISTS tg_ativos_touch ON public.ativos;
CREATE TRIGGER tg_ativos_touch BEFORE UPDATE ON public.ativos
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS tg_veiculo_manutencoes_touch ON public.veiculo_manutencoes;
CREATE TRIGGER tg_veiculo_manutencoes_touch BEFORE UPDATE ON public.veiculo_manutencoes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

NOTIFY pgrst, 'reload schema';
