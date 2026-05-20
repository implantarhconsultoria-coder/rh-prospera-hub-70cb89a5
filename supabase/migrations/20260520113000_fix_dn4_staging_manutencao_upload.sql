-- Correção operacional DN4 + manutenção/frota.
-- Seguro para rodar mais de uma vez no Supabase SQL Editor.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.importacoes_dn4 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  arquivo text NOT NULL,
  storage_path text,
  arquivo_path text,
  arquivo_url text,
  tipo text,
  tipo_arquivo text,
  usuario_id uuid,
  usuario_nome text,
  iniciado_em timestamptz NOT NULL DEFAULT now(),
  finalizado_em timestamptz,
  total_lidos integer NOT NULL DEFAULT 0,
  total_confirmados integer NOT NULL DEFAULT 0,
  total_pendentes integer NOT NULL DEFAULT 0,
  total_erros integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'em_andamento',
  mensagem text,
  texto_extraido text,
  excluido boolean NOT NULL DEFAULT false,
  excluido_em timestamptz,
  motivo_exclusao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.importacoes_dn4
  ADD COLUMN IF NOT EXISTS arquivo_path text,
  ADD COLUMN IF NOT EXISTS arquivo_url text,
  ADD COLUMN IF NOT EXISTS tipo_arquivo text,
  ADD COLUMN IF NOT EXISTS mensagem text,
  ADD COLUMN IF NOT EXISTS texto_extraido text,
  ADD COLUMN IF NOT EXISTS excluido boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS excluido_em timestamptz,
  ADD COLUMN IF NOT EXISTS motivo_exclusao text;

CREATE TABLE IF NOT EXISTS public.staging_clientes_dn4 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  importacao_id uuid REFERENCES public.importacoes_dn4(id) ON DELETE CASCADE,
  arquivo_origem text,
  pagina_origem integer,
  linha_original_extraida jsonb,
  status text NOT NULL DEFAULT 'pendente_conferencia',
  mensagem_erro text,
  data_importacao timestamptz NOT NULL DEFAULT now(),
  usuario_importacao uuid,
  codigo_dn4 text,
  nome_razao_social text,
  cpf_cnpj text,
  inscricao_estadual text,
  endereco text,
  bairro text,
  cidade text,
  uf text,
  cep text,
  empresa_origem text,
  filial_origem text,
  status_cliente text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.staging_representantes_dn4 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  importacao_id uuid REFERENCES public.importacoes_dn4(id) ON DELETE CASCADE,
  arquivo_origem text,
  pagina_origem integer,
  linha_original_extraida jsonb,
  status text NOT NULL DEFAULT 'pendente_conferencia',
  mensagem_erro text,
  data_importacao timestamptz NOT NULL DEFAULT now(),
  usuario_importacao uuid,
  codigo_dn4 text,
  nome text,
  cpf_cnpj text,
  endereco text,
  cidade text,
  uf text,
  email text,
  telefone text,
  tipo_pessoa text,
  empresa_origem text,
  filial_origem text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.staging_equipamentos_dn4 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  importacao_id uuid REFERENCES public.importacoes_dn4(id) ON DELETE CASCADE,
  arquivo_origem text,
  pagina_origem integer,
  linha_original_extraida jsonb,
  status text NOT NULL DEFAULT 'pendente_conferencia',
  mensagem_erro text,
  data_importacao timestamptz NOT NULL DEFAULT now(),
  usuario_importacao uuid,
  codigo_equipamento text,
  numero_patrimonio text,
  descricao text,
  tipo_equipamento text,
  grupo text,
  filial_opera text,
  situacao text,
  numero_serie text,
  valor_venda numeric,
  valor_compra numeric,
  valor_mercado numeric,
  valor_indenizacao numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.staging_historico_locacao_dn4 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  importacao_id uuid REFERENCES public.importacoes_dn4(id) ON DELETE CASCADE,
  arquivo_origem text,
  pagina_origem integer,
  linha_original_extraida jsonb,
  status text NOT NULL DEFAULT 'pendente_conferencia',
  mensagem_erro text,
  data_importacao timestamptz NOT NULL DEFAULT now(),
  usuario_importacao uuid,
  numero_os text,
  pedido text,
  cliente_nome text,
  cliente_cpf_cnpj text,
  quantidade numeric,
  item text,
  patrimonio text,
  descricao_equipamento text,
  periodo_texto text,
  data_inicio date,
  data_fim date,
  valor_pedido_periodo numeric,
  valor_diaria_periodo numeric,
  valor_faturado_periodo numeric,
  numero_nf text,
  filial text,
  cliente_id_resolvido uuid,
  equipamento_id_resolvido uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staging_hist_dn4_importacao ON public.staging_historico_locacao_dn4(importacao_id);
CREATE INDEX IF NOT EXISTS idx_staging_hist_dn4_status ON public.staging_historico_locacao_dn4(status);
CREATE INDEX IF NOT EXISTS idx_staging_hist_dn4_patrimonio ON public.staging_historico_locacao_dn4(patrimonio);

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
CREATE INDEX IF NOT EXISTS idx_veiculo_manutencoes_data ON public.veiculo_manutencoes(data);

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'importacoes_dn4',
    'staging_clientes_dn4',
    'staging_representantes_dn4',
    'staging_equipamentos_dn4',
    'staging_historico_locacao_dn4',
    'veiculo_manutencoes'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS topac_operacao_total ON public.%I', t);
    EXECUTE format($policy$
      CREATE POLICY topac_operacao_total ON public.%I
      FOR ALL TO authenticated
      USING (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.has_role(auth.uid(), 'faturamento'::public.app_role)
        OR public.has_role(auth.uid(), 'financeiro'::public.app_role)
        OR public.has_role(auth.uid(), 'operacional'::public.app_role)
      )
      WITH CHECK (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.has_role(auth.uid(), 'faturamento'::public.app_role)
        OR public.has_role(auth.uid(), 'financeiro'::public.app_role)
        OR public.has_role(auth.uid(), 'operacional'::public.app_role)
      )
    $policy$, t);
  END LOOP;
END $$;

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('documentos-ativos', 'documentos-ativos', true),
  ('dn4-imports', 'dn4-imports', false)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DROP POLICY IF EXISTS topac_documentos_ativos_select ON storage.objects;
CREATE POLICY topac_documentos_ativos_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id IN ('documentos-ativos','dn4-imports'));

DROP POLICY IF EXISTS topac_documentos_ativos_insert ON storage.objects;
CREATE POLICY topac_documentos_ativos_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('documentos-ativos','dn4-imports'));

DROP POLICY IF EXISTS topac_documentos_ativos_update ON storage.objects;
CREATE POLICY topac_documentos_ativos_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id IN ('documentos-ativos','dn4-imports'))
  WITH CHECK (bucket_id IN ('documentos-ativos','dn4-imports'));

NOTIFY pgrst, 'reload schema';
