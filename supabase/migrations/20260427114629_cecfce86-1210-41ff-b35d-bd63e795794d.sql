
-- ============================================================
-- ONDA 1: Suporte a auditoria, acesso por horário e correções
-- ============================================================

-- 1) Garante que existe user_id em lancamentos_mensais (nullable, p/ auditoria de exclusão)
ALTER TABLE public.lancamentos_mensais
  ADD COLUMN IF NOT EXISTS apagado_em TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS apagado_por_user_id UUID NULL,
  ADD COLUMN IF NOT EXISTS apagado_por_nome TEXT NULL DEFAULT '';

-- 2) Tabela de acesso excepcional (fora do horário)
CREATE TABLE IF NOT EXISTS public.acesso_excepcional (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  user_email TEXT NOT NULL DEFAULT '',
  user_nome TEXT NOT NULL DEFAULT '',
  data_solicitada DATE NOT NULL,
  hora_inicio TIME NOT NULL,
  hora_fim TIME NOT NULL,
  motivo TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pendente', -- pendente|aprovado|negado
  aprovado_por_user_id UUID NULL,
  aprovado_por_nome TEXT NULL DEFAULT '',
  aprovado_em TIMESTAMPTZ NULL,
  observacao TEXT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.acesso_excepcional ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin manage acesso_excepcional" ON public.acesso_excepcional;
CREATE POLICY "Admin manage acesso_excepcional" ON public.acesso_excepcional
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "User insert own acesso_excepcional" ON public.acesso_excepcional;
CREATE POLICY "User insert own acesso_excepcional" ON public.acesso_excepcional
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "User view own acesso_excepcional" ON public.acesso_excepcional;
CREATE POLICY "User view own acesso_excepcional" ON public.acesso_excepcional
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- 3) Sessões de acesso (histórico real por pessoa, com início/fim/duração)
CREATE TABLE IF NOT EXISTS public.user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  user_email TEXT NOT NULL DEFAULT '',
  user_nome TEXT NOT NULL DEFAULT '',
  iniciou_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  encerrou_em TIMESTAMPTZ NULL,
  duracao_segundos INTEGER NULL,
  rota_inicial TEXT NOT NULL DEFAULT '',
  ultima_rota TEXT NOT NULL DEFAULT '',
  ultima_atividade_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip TEXT NULL DEFAULT '',
  user_agent TEXT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON public.user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_iniciou ON public.user_sessions(iniciou_em DESC);
CREATE INDEX IF NOT EXISTS idx_user_sessions_ativa ON public.user_sessions(user_id) WHERE encerrou_em IS NULL;

ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin view all sessions" ON public.user_sessions;
CREATE POLICY "Admin view all sessions" ON public.user_sessions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "User view own sessions" ON public.user_sessions;
CREATE POLICY "User view own sessions" ON public.user_sessions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "User insert own sessions" ON public.user_sessions;
CREATE POLICY "User insert own sessions" ON public.user_sessions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "User update own sessions" ON public.user_sessions;
CREATE POLICY "User update own sessions" ON public.user_sessions
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

-- 4) Configuração global do acesso por horário (registro único em config_financeiro)
INSERT INTO public.config_financeiro (chave, valor, descricao)
VALUES
  ('acesso_horario_ativo', 'false', 'Liga/desliga restrição global de acesso por janela de horário'),
  ('acesso_hora_inicio', '07:00', 'Hora inicial permitida (HH:MM) quando restrição ativa'),
  ('acesso_hora_fim', '18:00', 'Hora final permitida (HH:MM); fora dela usuários (exceto admin) são bloqueados'),
  ('acesso_dias_uteis_apenas', 'true', 'Se true, bloqueia sábados e domingos')
ON CONFLICT DO NOTHING;
