-- Adiciona campo de bloqueio do link individual do técnico
ALTER TABLE public.tecnicos_campo
  ADD COLUMN IF NOT EXISTS link_bloqueado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS link_bloqueado_em timestamp with time zone,
  ADD COLUMN IF NOT EXISTS link_regenerado_em timestamp with time zone;

-- Tabela de histórico de regeneração de tokens (auditoria)
CREATE TABLE IF NOT EXISTS public.tecnicos_link_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tecnico_id uuid NOT NULL REFERENCES public.tecnicos_campo(id) ON DELETE CASCADE,
  acao text NOT NULL,
  token_anterior text,
  token_novo text,
  realizado_por uuid,
  realizado_por_nome text NOT NULL DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.tecnicos_link_historico ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin manage tecnicos_link_historico" ON public.tecnicos_link_historico;
CREATE POLICY "Admin manage tecnicos_link_historico"
  ON public.tecnicos_link_historico FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Operacional manage tecnicos_link_historico" ON public.tecnicos_link_historico;
CREATE POLICY "Operacional manage tecnicos_link_historico"
  ON public.tecnicos_link_historico FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'operacional'::app_role))
  WITH CHECK (has_role(auth.uid(), 'operacional'::app_role));