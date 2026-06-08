-- Evolucao operacional controlada para Financeiro, Faturamento, Almoxarifado e DN4.
-- Migration aditiva: nao remove dados nem altera politicas existentes.

ALTER TABLE public.contas_bancarias
  ADD COLUMN IF NOT EXISTS chave_pix text DEFAULT '',
  ADD COLUMN IF NOT EXISTS tipo_conta text DEFAULT '',
  ADD COLUMN IF NOT EXISTS codigo_banco text DEFAULT '';

ALTER TABLE public.titulos_pagar
  ADD COLUMN IF NOT EXISTS forma_pagamento_prevista text DEFAULT '',
  ADD COLUMN IF NOT EXISTS comprovante_url text DEFAULT '';

ALTER TABLE public.titulos_receber
  ADD COLUMN IF NOT EXISTS forma_recebimento_prevista text DEFAULT '',
  ADD COLUMN IF NOT EXISTS comprovante_url text DEFAULT '';

ALTER TABLE public.pagamentos
  ADD COLUMN IF NOT EXISTS comprovante_url text DEFAULT '';

ALTER TABLE public.recebimentos
  ADD COLUMN IF NOT EXISTS comprovante_url text DEFAULT '';

ALTER TABLE public.faturas
  ADD COLUMN IF NOT EXISTS servico_produto text DEFAULT '',
  ADD COLUMN IF NOT EXISTS cnpj_emissor text DEFAULT '',
  ADD COLUMN IF NOT EXISTS cnpj_cliente text DEFAULT '',
  ADD COLUMN IF NOT EXISTS nota_numero text DEFAULT '',
  ADD COLUMN IF NOT EXISTS nota_data_emissao date,
  ADD COLUMN IF NOT EXISTS nota_valor numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS nota_pdf_url text DEFAULT '',
  ADD COLUMN IF NOT EXISTS nota_xml_url text DEFAULT '',
  ADD COLUMN IF NOT EXISTS integracao_nf_status text DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS integracao_nf_observacao text DEFAULT '';

ALTER TABLE public.almoxarifado_itens
  ADD COLUMN IF NOT EXISTS empresa_id uuid REFERENCES public.empresas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS codigo text DEFAULT '',
  ADD COLUMN IF NOT EXISTS estoque_minimo numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fornecedor text DEFAULT '',
  ADD COLUMN IF NOT EXISTS observacoes text DEFAULT '';

ALTER TABLE public.almoxarifado_entradas
  ADD COLUMN IF NOT EXISTS empresa_id uuid REFERENCES public.empresas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tipo_documento text DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS numero_documento text DEFAULT '';

ALTER TABLE public.almoxarifado_saidas
  ADD COLUMN IF NOT EXISTS empresa_id uuid REFERENCES public.empresas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS funcionario_id uuid REFERENCES public.funcionarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS veiculo_id uuid REFERENCES public.ativos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS veiculo text DEFAULT '',
  ADD COLUMN IF NOT EXISTS obra text DEFAULT '',
  ADD COLUMN IF NOT EXISTS filial text DEFAULT '',
  ADD COLUMN IF NOT EXISTS carregamento text DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_contas_bancarias_empresa ON public.contas_bancarias(empresa_id);
CREATE INDEX IF NOT EXISTS idx_titulos_pagar_empresa_competencia ON public.titulos_pagar(empresa_id, competencia);
CREATE INDEX IF NOT EXISTS idx_titulos_receber_empresa_competencia ON public.titulos_receber(empresa_id, competencia);
CREATE INDEX IF NOT EXISTS idx_faturas_empresa_competencia ON public.faturas(empresa_id, competencia);
CREATE INDEX IF NOT EXISTS idx_almox_itens_empresa ON public.almoxarifado_itens(empresa_id);
CREATE INDEX IF NOT EXISTS idx_almox_entradas_empresa ON public.almoxarifado_entradas(empresa_id);
CREATE INDEX IF NOT EXISTS idx_almox_saidas_empresa ON public.almoxarifado_saidas(empresa_id);
