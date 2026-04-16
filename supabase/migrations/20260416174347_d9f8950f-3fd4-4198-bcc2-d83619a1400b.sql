-- Tabela de ajustes manuais de estoque (rastreabilidade total)
CREATE TABLE IF NOT EXISTS public.almoxarifado_ajustes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id UUID NOT NULL REFERENCES public.almoxarifado_itens(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  usuario_nome TEXT NOT NULL DEFAULT '',
  tipo_movimentacao TEXT NOT NULL DEFAULT 'ajuste', -- 'ajuste' | 'entrada_rapida' | 'saida_rapida' | 'correcao'
  quantidade_anterior NUMERIC NOT NULL,
  quantidade_nova NUMERIC NOT NULL,
  diferenca NUMERIC NOT NULL,
  motivo TEXT NOT NULL DEFAULT '',
  observacao TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.almoxarifado_ajustes ENABLE ROW LEVEL SECURITY;

-- Admin gerencia tudo
CREATE POLICY "Admins manage all ajustes"
  ON public.almoxarifado_ajustes FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Almoxarifado pode inserir e visualizar
CREATE POLICY "Almoxarifado can insert ajustes"
  ON public.almoxarifado_ajustes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Authenticated can view ajustes"
  ON public.almoxarifado_ajustes FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS idx_ajustes_item ON public.almoxarifado_ajustes(item_id);
CREATE INDEX IF NOT EXISTS idx_ajustes_created ON public.almoxarifado_ajustes(created_at DESC);