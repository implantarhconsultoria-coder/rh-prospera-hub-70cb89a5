-- Histórico de comandos de voz do admin
CREATE TABLE public.voice_command_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  spoken_text TEXT NOT NULL,
  interpreted_action JSONB,
  confirmed BOOLEAN NOT NULL DEFAULT false,
  cancelled BOOLEAN NOT NULL DEFAULT false,
  result TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.voice_command_history ENABLE ROW LEVEL SECURITY;

-- Apenas admin pode ler/inserir/atualizar (usa função has_role já existente)
CREATE POLICY "Admins read voice history"
  ON public.voice_command_history FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins insert voice history"
  ON public.voice_command_history FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND user_id = auth.uid());

CREATE POLICY "Admins update own voice history"
  ON public.voice_command_history FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND user_id = auth.uid());

CREATE INDEX idx_voice_history_user_created ON public.voice_command_history(user_id, created_at DESC);