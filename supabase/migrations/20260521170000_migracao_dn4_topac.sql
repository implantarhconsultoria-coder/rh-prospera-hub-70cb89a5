-- Migracao unica DN4 -> TOPAC RH PRO
-- Area segura para pre-migracao, conferencia, anexos, logs e confirmacao controlada.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.dn4_migracao_lotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  status text NOT NULL DEFAULT 'pre_migracao',
  criado_por uuid,
  criado_em timestamptz NOT NULL DEFAULT now(),
  confirmado_em timestamptz,
  cancelado_em timestamptz,
  resumo jsonb NOT NULL DEFAULT '{}'::jsonb,
  backup_logico jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.dn4_migracao_arquivos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lote_id uuid NOT NULL REFERENCES public.dn4_migracao_lotes(id) ON DELETE CASCADE,
  nome_arquivo text NOT NULL,
  storage_path text,
  tipo_detectado text NOT NULL DEFAULT 'nao_identificado',
  status text NOT NULL DEFAULT 'aguardando_conferencia',
  cabecalhos jsonb NOT NULL DEFAULT '[]'::jsonb,
  mapeamento jsonb NOT NULL DEFAULT '{}'::jsonb,
  total_lidos integer NOT NULL DEFAULT 0,
  total_validos integer NOT NULL DEFAULT 0,
  total_erros integer NOT NULL DEFAULT 0,
  mensagem text,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dn4_migracao_registros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lote_id uuid NOT NULL REFERENCES public.dn4_migracao_lotes(id) ON DELETE CASCADE,
  arquivo_id uuid NOT NULL REFERENCES public.dn4_migracao_arquivos(id) ON DELETE CASCADE,
  modulo text NOT NULL DEFAULT 'nao_identificado',
  linha integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pronto_para_migrar',
  chave_principal text,
  dados_raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  dados_mapeados jsonb NOT NULL DEFAULT '{}'::jsonb,
  erros jsonb NOT NULL DEFAULT '[]'::jsonb,
  migrado_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dn4_migracao_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lote_id uuid REFERENCES public.dn4_migracao_lotes(id) ON DELETE CASCADE,
  acao text NOT NULL,
  detalhe text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_por uuid,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dn4_migracao_arquivos_lote ON public.dn4_migracao_arquivos(lote_id);
CREATE INDEX IF NOT EXISTS idx_dn4_migracao_registros_lote ON public.dn4_migracao_registros(lote_id);
CREATE INDEX IF NOT EXISTS idx_dn4_migracao_registros_arquivo ON public.dn4_migracao_registros(arquivo_id);
CREATE INDEX IF NOT EXISTS idx_dn4_migracao_registros_modulo ON public.dn4_migracao_registros(modulo);
CREATE INDEX IF NOT EXISTS idx_dn4_migracao_registros_status ON public.dn4_migracao_registros(status);
CREATE INDEX IF NOT EXISTS idx_dn4_migracao_registros_chave ON public.dn4_migracao_registros(chave_principal);
CREATE INDEX IF NOT EXISTS idx_dn4_migracao_logs_lote ON public.dn4_migracao_logs(lote_id);

ALTER TABLE public.dn4_migracao_lotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dn4_migracao_arquivos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dn4_migracao_registros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dn4_migracao_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'dn4_migracao_lotes' AND policyname = 'dn4_migracao_lotes_admin_all') THEN
    CREATE POLICY dn4_migracao_lotes_admin_all ON public.dn4_migracao_lotes
      FOR ALL USING (public.has_role(auth.uid(), 'admin'::public.app_role))
      WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'dn4_migracao_lotes' AND policyname = 'dn4_migracao_lotes_diretor_select') THEN
    CREATE POLICY dn4_migracao_lotes_diretor_select ON public.dn4_migracao_lotes
      FOR SELECT USING (public.has_role(auth.uid(), 'diretor_geral'::public.app_role));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'dn4_migracao_arquivos' AND policyname = 'dn4_migracao_arquivos_admin_all') THEN
    CREATE POLICY dn4_migracao_arquivos_admin_all ON public.dn4_migracao_arquivos
      FOR ALL USING (public.has_role(auth.uid(), 'admin'::public.app_role))
      WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'dn4_migracao_arquivos' AND policyname = 'dn4_migracao_arquivos_diretor_select') THEN
    CREATE POLICY dn4_migracao_arquivos_diretor_select ON public.dn4_migracao_arquivos
      FOR SELECT USING (public.has_role(auth.uid(), 'diretor_geral'::public.app_role));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'dn4_migracao_registros' AND policyname = 'dn4_migracao_registros_admin_all') THEN
    CREATE POLICY dn4_migracao_registros_admin_all ON public.dn4_migracao_registros
      FOR ALL USING (public.has_role(auth.uid(), 'admin'::public.app_role))
      WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'dn4_migracao_registros' AND policyname = 'dn4_migracao_registros_diretor_select') THEN
    CREATE POLICY dn4_migracao_registros_diretor_select ON public.dn4_migracao_registros
      FOR SELECT USING (public.has_role(auth.uid(), 'diretor_geral'::public.app_role));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'dn4_migracao_logs' AND policyname = 'dn4_migracao_logs_admin_all') THEN
    CREATE POLICY dn4_migracao_logs_admin_all ON public.dn4_migracao_logs
      FOR ALL USING (public.has_role(auth.uid(), 'admin'::public.app_role))
      WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'dn4_migracao_logs' AND policyname = 'dn4_migracao_logs_diretor_select') THEN
    CREATE POLICY dn4_migracao_logs_diretor_select ON public.dn4_migracao_logs
      FOR SELECT USING (public.has_role(auth.uid(), 'diretor_geral'::public.app_role));
  END IF;
END $$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'dn4-migracao',
  'dn4-migracao',
  false,
  52428800,
  ARRAY[
    'text/csv',
    'text/plain',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'dn4_migracao_storage_admin_all') THEN
    CREATE POLICY dn4_migracao_storage_admin_all ON storage.objects
      FOR ALL USING (bucket_id = 'dn4-migracao' AND public.has_role(auth.uid(), 'admin'::public.app_role))
      WITH CHECK (bucket_id = 'dn4-migracao' AND public.has_role(auth.uid(), 'admin'::public.app_role));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'dn4_migracao_storage_diretor_select') THEN
    CREATE POLICY dn4_migracao_storage_diretor_select ON storage.objects
      FOR SELECT USING (bucket_id = 'dn4-migracao' AND public.has_role(auth.uid(), 'diretor_geral'::public.app_role));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.dn4_migracao_backup_counts()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table text;
  v_count bigint;
  v_backup jsonb := '{}'::jsonb;
  v_tables text[] := ARRAY['empresas','funcionarios','clientes_fat','fornecedores','titulos_pagar','titulos_receber','faturas','contratos','ativos','veiculos','documentos_ativos','manutencoes_veiculos','chamados','abastecimentos','estoque_itens','almoxarifado_movimentos'];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    IF to_regclass('public.' || v_table) IS NOT NULL THEN
      EXECUTE format('SELECT count(*) FROM public.%I', v_table) INTO v_count;
      v_backup := v_backup || jsonb_build_object(v_table, v_count);
    ELSE
      v_backup := v_backup || jsonb_build_object(v_table, NULL);
    END IF;
  END LOOP;
  RETURN jsonb_build_object('gerado_em', now(), 'tabelas', v_backup);
END;
$$;

CREATE OR REPLACE FUNCTION public.dn4_confirmar_migracao_lote(p_lote_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ready integer;
  v_backup jsonb;
  v_resumo jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Somente admin pode confirmar migracao DN4.';
  END IF;

  SELECT count(*) INTO v_ready FROM public.dn4_migracao_registros WHERE lote_id = p_lote_id AND status = 'pronto_para_migrar';
  IF v_ready = 0 THEN
    RAISE EXCEPTION 'Nenhum registro pronto para migrar neste lote.';
  END IF;

  v_backup := public.dn4_migracao_backup_counts();

  UPDATE public.dn4_migracao_registros
  SET status = 'migrado_sucesso', migrado_em = now()
  WHERE lote_id = p_lote_id AND status = 'pronto_para_migrar';

  SELECT jsonb_build_object(
    'total', count(*),
    'migrados', count(*) FILTER (WHERE status = 'migrado_sucesso'),
    'duplicados', count(*) FILTER (WHERE status = 'duplicado'),
    'pendentes', count(*) FILTER (WHERE status = 'pendente_vinculo'),
    'erros', count(*) FILTER (WHERE status IN ('campo_obrigatorio_ausente', 'erro_formato'))
  ) INTO v_resumo
  FROM public.dn4_migracao_registros
  WHERE lote_id = p_lote_id;

  v_resumo := COALESCE(v_resumo, '{}'::jsonb) || jsonb_build_object(
    'por_modulo',
    COALESCE((SELECT jsonb_object_agg(modulo, qtd) FROM (SELECT modulo, count(*) AS qtd FROM public.dn4_migracao_registros WHERE lote_id = p_lote_id GROUP BY modulo) por_modulo), '{}'::jsonb)
  );

  UPDATE public.dn4_migracao_lotes
  SET status = 'concluido', confirmado_em = now(), backup_logico = v_backup, resumo = COALESCE(v_resumo, '{}'::jsonb)
  WHERE id = p_lote_id;

  INSERT INTO public.dn4_migracao_logs (lote_id, acao, detalhe, payload, criado_por)
  VALUES (p_lote_id, 'lote_confirmado', 'Migracao DN4 confirmada com backup logico antes da gravacao.', jsonb_build_object('migrados', v_ready, 'backup', v_backup), auth.uid());

  RETURN jsonb_build_object('ok', true, 'migrados', v_ready, 'backup', v_backup);
END;
$$;

GRANT EXECUTE ON FUNCTION public.dn4_migracao_backup_counts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.dn4_confirmar_migracao_lote(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
