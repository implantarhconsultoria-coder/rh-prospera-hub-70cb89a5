
-- 1) ALMOXARIFADO: políticas que permitem ADMIN gerenciar tudo
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='almoxarifado_itens' AND policyname='Admins manage all almox itens') THEN
    DROP POLICY "Admins manage all almox itens" ON public.almoxarifado_itens;
  END IF;
END $$;
CREATE POLICY "Admins manage all almox itens" ON public.almoxarifado_itens
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='almoxarifado_entradas' AND policyname='Admins manage all almox entradas') THEN
    DROP POLICY "Admins manage all almox entradas" ON public.almoxarifado_entradas;
  END IF;
END $$;
CREATE POLICY "Admins manage all almox entradas" ON public.almoxarifado_entradas
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='almoxarifado_saidas' AND policyname='Admins manage all almox saidas') THEN
    DROP POLICY "Admins manage all almox saidas" ON public.almoxarifado_saidas;
  END IF;
END $$;
CREATE POLICY "Admins manage all almox saidas" ON public.almoxarifado_saidas
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Adiciona campos extras para edição completa (quando ainda não existirem)
ALTER TABLE public.almoxarifado_itens ADD COLUMN IF NOT EXISTS estoque_minimo NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.almoxarifado_itens ADD COLUMN IF NOT EXISTS empresa TEXT;
ALTER TABLE public.almoxarifado_itens ADD COLUMN IF NOT EXISTS observacoes TEXT;
ALTER TABLE public.almoxarifado_itens ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.almoxarifado_itens ADD COLUMN IF NOT EXISTS arquivo_url TEXT;

-- 2) DOCUMENTOS DO FUNCIONÁRIO: categorias/pasta
ALTER TABLE public.documentos_funcionario ADD COLUMN IF NOT EXISTS categoria TEXT NOT NULL DEFAULT 'outros';
ALTER TABLE public.documentos_funcionario ADD COLUMN IF NOT EXISTS arquivo_assinado_url TEXT;
ALTER TABLE public.documentos_funcionario ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'emitido';
ALTER TABLE public.documentos_funcionario ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_docfunc_funcionario_categoria
  ON public.documentos_funcionario(funcionario_id, categoria);

-- Garante que admin gerencie tudo em documentos_funcionario
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='documentos_funcionario' AND policyname='Admins manage all docs func') THEN
    DROP POLICY "Admins manage all docs func" ON public.documentos_funcionario;
  END IF;
END $$;
CREATE POLICY "Admins manage all docs func" ON public.documentos_funcionario
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3) ALERTAS DE FILIAL
CREATE TABLE IF NOT EXISTS public.alertas_filial (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filial TEXT NOT NULL,
  empresa_nome TEXT,
  funcionario_id UUID,
  funcionario_nome TEXT,
  cpf TEXT,
  modulo TEXT NOT NULL,
  acao TEXT NOT NULL,
  responsavel_user_id UUID,
  responsavel_nome TEXT,
  responsavel_cpf TEXT,
  dado_anterior JSONB,
  dado_novo JSONB,
  nivel TEXT NOT NULL DEFAULT 'informativo' CHECK (nivel IN ('informativo','atencao','critico')),
  situacao TEXT NOT NULL DEFAULT 'novo' CHECK (situacao IN ('novo','revisado','aprovado','contestado')),
  observacao TEXT,
  revisado_por_user_id UUID,
  revisado_por_nome TEXT,
  revisado_em TIMESTAMPTZ,
  ip TEXT,
  dispositivo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_alertas_filial ON public.alertas_filial(filial, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alertas_filial_nivel ON public.alertas_filial(nivel, situacao);
ALTER TABLE public.alertas_filial ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin manage alertas" ON public.alertas_filial;
CREATE POLICY "Admin manage alertas" ON public.alertas_filial
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "Filial view own alertas" ON public.alertas_filial;
CREATE POLICY "Filial view own alertas" ON public.alertas_filial
  FOR SELECT TO authenticated
  USING (
    (public.has_role(auth.uid(),'filial_praia') AND filial ILIKE '%praia%')
    OR (public.has_role(auth.uid(),'filial_goiania') AND filial ILIKE '%goi%')
  );

DROP POLICY IF EXISTS "Filial insert alertas" ON public.alertas_filial;
CREATE POLICY "Filial insert alertas" ON public.alertas_filial
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(),'filial_praia')
    OR public.has_role(auth.uid(),'filial_goiania')
    OR public.has_role(auth.uid(),'admin')
  );

DROP TRIGGER IF EXISTS trg_alertas_filial_updated ON public.alertas_filial;
CREATE TRIGGER trg_alertas_filial_updated BEFORE UPDATE ON public.alertas_filial
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) APONTAMENTOS DE FILIAL (envio para central, sem fechar folha)
CREATE TABLE IF NOT EXISTS public.apontamentos_filial (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filial TEXT NOT NULL,
  empresa_nome TEXT,
  competencia TEXT NOT NULL,
  funcionario_id UUID,
  funcionario_nome TEXT,
  tipo TEXT NOT NULL,             -- ponto, falta, hora_extra, atestado, observacao, anexo
  data DATE,
  quantidade NUMERIC,
  valor NUMERIC,
  observacao TEXT,
  anexo_url TEXT,
  status TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','enviado','recebido','conferido','devolvido')),
  registrado_por_user_id UUID,
  registrado_por_nome TEXT,
  enviado_em TIMESTAMPTZ,
  conferido_por_user_id UUID,
  conferido_por_nome TEXT,
  conferido_em TIMESTAMPTZ,
  devolucao_motivo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_apont_filial ON public.apontamentos_filial(filial, competencia, status);
CREATE INDEX IF NOT EXISTS idx_apont_filial_func ON public.apontamentos_filial(funcionario_id);
ALTER TABLE public.apontamentos_filial ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin manage apont filial" ON public.apontamentos_filial;
CREATE POLICY "Admin manage apont filial" ON public.apontamentos_filial
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "Filial manage own apontamentos" ON public.apontamentos_filial;
CREATE POLICY "Filial manage own apontamentos" ON public.apontamentos_filial
  FOR ALL TO authenticated
  USING (
    (public.has_role(auth.uid(),'filial_praia') AND filial ILIKE '%praia%')
    OR (public.has_role(auth.uid(),'filial_goiania') AND filial ILIKE '%goi%')
  )
  WITH CHECK (
    (public.has_role(auth.uid(),'filial_praia') AND filial ILIKE '%praia%')
    OR (public.has_role(auth.uid(),'filial_goiania') AND filial ILIKE '%goi%')
  );

DROP TRIGGER IF EXISTS trg_apont_filial_updated ON public.apontamentos_filial;
CREATE TRIGGER trg_apont_filial_updated BEFORE UPDATE ON public.apontamentos_filial
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5) ÍNDICES PARA AUDITORIA UNIVERSAL
CREATE INDEX IF NOT EXISTS idx_acoes_log_func ON public.acoes_log(funcionario_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_acoes_log_modulo ON public.acoes_log(modulo, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_acoes_log_entidade ON public.acoes_log(entidade, entidade_id);
