-- Tabela de carga (registro/conferência) — não mexe no estoque
CREATE TABLE IF NOT EXISTS public.almoxarifado_carga (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  usuario_nome TEXT NOT NULL DEFAULT '',
  funcionario_id UUID,
  funcionario_nome TEXT NOT NULL DEFAULT '',
  empresa_nome TEXT NOT NULL DEFAULT '',
  company_id UUID,
  veiculo TEXT NOT NULL DEFAULT '',
  data_carga DATE NOT NULL DEFAULT CURRENT_DATE,
  email_bruto TEXT NOT NULL DEFAULT '',
  itens_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  observacao TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pendente',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.almoxarifado_carga ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated view cargas"
  ON public.almoxarifado_carga
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated insert own carga"
  ON public.almoxarifado_carga
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owner update own carga"
  ON public.almoxarifado_carga
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admin manage cargas"
  ON public.almoxarifado_carga
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Owner delete own carga"
  ON public.almoxarifado_carga
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER update_almoxarifado_carga_updated_at
BEFORE UPDATE ON public.almoxarifado_carga
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
