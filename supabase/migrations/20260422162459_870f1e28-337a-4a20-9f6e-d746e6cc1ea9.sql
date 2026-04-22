-- Tabela de combustível dos galões (separado do fluxo de QR/Posto)
CREATE TABLE IF NOT EXISTS public.combustivel_galoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  tecnico_id uuid,
  motorista_nome text NOT NULL DEFAULT '',
  cargo text NOT NULL DEFAULT '',
  veiculo_id uuid,
  placa text NOT NULL DEFAULT '',
  modelo text NOT NULL DEFAULT '',
  tipo_combustivel text NOT NULL DEFAULT 'gasolina',
  quantidade_litros numeric NOT NULL DEFAULT 0,
  observacao text NOT NULL DEFAULT '',
  foto_url text NOT NULL DEFAULT '',
  latitude double precision,
  longitude double precision,
  data date NOT NULL DEFAULT CURRENT_DATE,
  hora time NOT NULL DEFAULT CURRENT_TIME,
  competencia text NOT NULL DEFAULT to_char(CURRENT_DATE, 'YYYY-MM'),
  origem text NOT NULL DEFAULT 'app',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_galoes_data ON public.combustivel_galoes(data DESC);
CREATE INDEX IF NOT EXISTS idx_galoes_tecnico ON public.combustivel_galoes(tecnico_id);
CREATE INDEX IF NOT EXISTS idx_galoes_user ON public.combustivel_galoes(user_id);

ALTER TABLE public.combustivel_galoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manage galoes"
  ON public.combustivel_galoes FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Operacional manage galoes"
  ON public.combustivel_galoes FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'operacional'::app_role))
  WITH CHECK (has_role(auth.uid(), 'operacional'::app_role));

CREATE POLICY "Tecnico view own galoes"
  ON public.combustivel_galoes FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER trg_galoes_updated
  BEFORE UPDATE ON public.combustivel_galoes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Bucket para fotos opcionais
INSERT INTO storage.buckets (id, name, public)
VALUES ('galao-fotos', 'galao-fotos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Galao fotos public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'galao-fotos');

CREATE POLICY "Authenticated upload galao fotos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'galao-fotos');