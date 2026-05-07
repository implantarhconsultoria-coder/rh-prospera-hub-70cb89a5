
-- Conversas do assistente operacional
CREATE TABLE public.assistente_conversas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  titulo TEXT NOT NULL DEFAULT 'Nova conversa',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.assistente_mensagens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id UUID NOT NULL REFERENCES public.assistente_conversas(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','tool','system')),
  content TEXT NOT NULL DEFAULT '',
  data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_assist_msg_conversa ON public.assistente_mensagens(conversa_id, created_at);
CREATE INDEX idx_assist_conv_user ON public.assistente_conversas(user_id, updated_at DESC);

ALTER TABLE public.assistente_conversas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistente_mensagens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin gerencia suas conversas"
  ON public.assistente_conversas FOR ALL
  USING (public.has_role(auth.uid(),'admin') AND user_id = auth.uid())
  WITH CHECK (public.has_role(auth.uid(),'admin') AND user_id = auth.uid());

CREATE POLICY "Admin gerencia mensagens das suas conversas"
  ON public.assistente_mensagens FOR ALL
  USING (
    public.has_role(auth.uid(),'admin') AND EXISTS (
      SELECT 1 FROM public.assistente_conversas c
      WHERE c.id = conversa_id AND c.user_id = auth.uid()
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(),'admin') AND EXISTS (
      SELECT 1 FROM public.assistente_conversas c
      WHERE c.id = conversa_id AND c.user_id = auth.uid()
    )
  );

CREATE TRIGGER trg_assist_conv_updated
  BEFORE UPDATE ON public.assistente_conversas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
