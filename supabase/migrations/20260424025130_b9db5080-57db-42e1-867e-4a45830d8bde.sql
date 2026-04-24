-- Tabela para persistir cartões de ponto importados
CREATE TABLE IF NOT EXISTS public.cartoes_ponto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funcionario_id uuid,
  funcionario_nome text NOT NULL DEFAULT '',
  company_id uuid,
  empresa_nome text NOT NULL DEFAULT '',
  competencia text NOT NULL DEFAULT to_char(CURRENT_DATE, 'YYYY-MM'),
  arquivo_nome text NOT NULL DEFAULT '',
  arquivo_url text NOT NULL DEFAULT '',
  origem text NOT NULL DEFAULT 'ocr', -- 'ocr' | 'manual'
  ocr_confianca numeric NOT NULL DEFAULT 0,
  dias_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  totais_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  divergencias_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  status_conferencia text NOT NULL DEFAULT 'pendente', -- pendente|conferido|divergente|justificado|ignorado
  motivo_ignorado text NOT NULL DEFAULT '',
  enviado_fechamento boolean NOT NULL DEFAULT false,
  enviado_fechamento_em timestamptz,
  importado_por_user_id uuid NOT NULL,
  importado_por_nome text NOT NULL DEFAULT '',
  conferido_por_user_id uuid,
  conferido_por_nome text NOT NULL DEFAULT '',
  conferido_em timestamptz,
  observacao text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cartoes_ponto_competencia ON public.cartoes_ponto(competencia);
CREATE INDEX IF NOT EXISTS idx_cartoes_ponto_empresa ON public.cartoes_ponto(empresa_nome);
CREATE INDEX IF NOT EXISTS idx_cartoes_ponto_funcionario ON public.cartoes_ponto(funcionario_id);

ALTER TABLE public.cartoes_ponto ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manage cartoes_ponto"
ON public.cartoes_ponto FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Filial view own empresa cartoes"
ON public.cartoes_ponto FOR SELECT TO authenticated
USING (empresa_nome = ANY (get_user_empresas()));

CREATE POLICY "Filial insert own empresa cartoes"
ON public.cartoes_ponto FOR INSERT TO authenticated
WITH CHECK (empresa_nome = ANY (get_user_empresas()));

CREATE POLICY "Filial update own empresa cartoes"
ON public.cartoes_ponto FOR UPDATE TO authenticated
USING (empresa_nome = ANY (get_user_empresas()));

CREATE TRIGGER update_cartoes_ponto_updated_at
BEFORE UPDATE ON public.cartoes_ponto
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Coluna status_conferencia em atestados (se não existir)
ALTER TABLE public.atestados
  ADD COLUMN IF NOT EXISTS status_conferencia text NOT NULL DEFAULT 'pendente';