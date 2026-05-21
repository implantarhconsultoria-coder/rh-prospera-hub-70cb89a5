-- Consolidated production fix: DN4 migration + admission pre-registration.
-- Idempotent: safe to run more than once without deleting data.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ==================================================
-- PRE-CADASTRO ADMISSIONAL
-- ==================================================

CREATE TABLE IF NOT EXISTS public.pre_cadastros_admissionais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'aguardando_validacao',
  empresa_id uuid NULL,
  empresa_nome text DEFAULT '',
  cnpj text DEFAULT '',
  nome text DEFAULT '',
  cpf text DEFAULT '',
  rg text DEFAULT '',
  data_nascimento date NULL,
  data_admissao date NULL,
  funcao text DEFAULT '',
  setor_ghe text DEFAULT '',
  obra_local text DEFAULT '',
  salario numeric(12,2) NULL,
  tipo_admissao text DEFAULT '',
  jornada text DEFAULT '',
  beneficios text DEFAULT '',
  insalubridade text DEFAULT '',
  filiacao text DEFAULT '',
  endereco text DEFAULT '',
  escolaridade text DEFAULT '',
  experiencia text DEFAULT '',
  epi text DEFAULT '',
  responsavel_contato text DEFAULT '',
  arquivo_ficha_url text DEFAULT '',
  arquivo_aso_url text DEFAULT '',
  dados_extraidos jsonb NOT NULL DEFAULT '{}'::jsonb,
  conferencia jsonb NOT NULL DEFAULT '{}'::jsonb,
  pasta_virtual jsonb NOT NULL DEFAULT '{}'::jsonb,
  historico jsonb NOT NULL DEFAULT '[]'::jsonb,
  email_exame_enviado_em timestamptz NULL,
  email_contabilidade_preparado_em timestamptz NULL,
  aprovado_por uuid NULL,
  aprovado_em timestamptz NULL,
  funcionario_id uuid NULL,
  criado_por uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pre_cadastros_admissionais
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'aguardando_validacao',
  ADD COLUMN IF NOT EXISTS empresa_id uuid NULL,
  ADD COLUMN IF NOT EXISTS empresa_nome text DEFAULT '',
  ADD COLUMN IF NOT EXISTS cnpj text DEFAULT '',
  ADD COLUMN IF NOT EXISTS nome text DEFAULT '',
  ADD COLUMN IF NOT EXISTS cpf text DEFAULT '',
  ADD COLUMN IF NOT EXISTS rg text DEFAULT '',
  ADD COLUMN IF NOT EXISTS data_nascimento date NULL,
  ADD COLUMN IF NOT EXISTS data_admissao date NULL,
  ADD COLUMN IF NOT EXISTS funcao text DEFAULT '',
  ADD COLUMN IF NOT EXISTS setor_ghe text DEFAULT '',
  ADD COLUMN IF NOT EXISTS obra_local text DEFAULT '',
  ADD COLUMN IF NOT EXISTS salario numeric(12,2) NULL,
  ADD COLUMN IF NOT EXISTS tipo_admissao text DEFAULT '',
  ADD COLUMN IF NOT EXISTS jornada text DEFAULT '',
  ADD COLUMN IF NOT EXISTS beneficios text DEFAULT '',
  ADD COLUMN IF NOT EXISTS insalubridade text DEFAULT '',
  ADD COLUMN IF NOT EXISTS filiacao text DEFAULT '',
  ADD COLUMN IF NOT EXISTS endereco text DEFAULT '',
  ADD COLUMN IF NOT EXISTS escolaridade text DEFAULT '',
  ADD COLUMN IF NOT EXISTS experiencia text DEFAULT '',
  ADD COLUMN IF NOT EXISTS epi text DEFAULT '',
  ADD COLUMN IF NOT EXISTS responsavel_contato text DEFAULT '',
  ADD COLUMN IF NOT EXISTS arquivo_ficha_url text DEFAULT '',
  ADD COLUMN IF NOT EXISTS arquivo_aso_url text DEFAULT '',
  ADD COLUMN IF NOT EXISTS dados_extraidos jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS conferencia jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS pasta_virtual jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS historico jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS email_exame_enviado_em timestamptz NULL,
  ADD COLUMN IF NOT EXISTS email_contabilidade_preparado_em timestamptz NULL,
  ADD COLUMN IF NOT EXISTS aprovado_por uuid NULL,
  ADD COLUMN IF NOT EXISTS aprovado_em timestamptz NULL,
  ADD COLUMN IF NOT EXISTS funcionario_id uuid NULL,
  ADD COLUMN IF NOT EXISTS criado_por uuid NULL,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF to_regclass('public.empresas') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pre_cadastros_admissionais_empresa_id_fkey') THEN
    ALTER TABLE public.pre_cadastros_admissionais
      ADD CONSTRAINT pre_cadastros_admissionais_empresa_id_fkey
      FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE SET NULL;
  END IF;

  IF to_regclass('public.funcionarios') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pre_cadastros_admissionais_funcionario_id_fkey') THEN
    ALTER TABLE public.pre_cadastros_admissionais
      ADD CONSTRAINT pre_cadastros_admissionais_funcionario_id_fkey
      FOREIGN KEY (funcionario_id) REFERENCES public.funcionarios(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.pre_cadastro_documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pre_cadastro_id uuid NOT NULL REFERENCES public.pre_cadastros_admissionais(id) ON DELETE CASCADE,
  tipo_documento text NOT NULL DEFAULT 'documento_admissional',
  nome_arquivo text NOT NULL DEFAULT '',
  arquivo_url text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'recebido',
  dados_extraidos jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pre_cadastros_status ON public.pre_cadastros_admissionais(status);
CREATE INDEX IF NOT EXISTS idx_pre_cadastros_empresa ON public.pre_cadastros_admissionais(empresa_id);
CREATE INDEX IF NOT EXISTS idx_pre_cadastros_cpf ON public.pre_cadastros_admissionais((regexp_replace(coalesce(cpf, ''), '\D', '', 'g')));
CREATE INDEX IF NOT EXISTS idx_pre_cadastro_docs_pre ON public.pre_cadastro_documentos(pre_cadastro_id);

DROP TRIGGER IF EXISTS trg_pre_cadastros_touch ON public.pre_cadastros_admissionais;
CREATE TRIGGER trg_pre_cadastros_touch
BEFORE UPDATE ON public.pre_cadastros_admissionais
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.pre_cadastros_admissionais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pre_cadastro_documentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pre_cadastros_admin_all ON public.pre_cadastros_admissionais;
CREATE POLICY pre_cadastros_admin_all ON public.pre_cadastros_admissionais
  FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS pre_cadastro_docs_admin_all ON public.pre_cadastro_documentos;
CREATE POLICY pre_cadastro_docs_admin_all ON public.pre_cadastro_documentos
  FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- ==================================================
-- MIGRACAO DN4
-- ==================================================

CREATE TABLE IF NOT EXISTS public.dn4_migracao_lotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL DEFAULT 'Migracao DN4',
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

CREATE TABLE IF NOT EXISTS public.dn4_registros_migrados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lote_id uuid REFERENCES public.dn4_migracao_lotes(id) ON DELETE SET NULL,
  registro_id uuid REFERENCES public.dn4_migracao_registros(id) ON DELETE SET NULL,
  modulo text NOT NULL,
  chave_principal text NOT NULL,
  dados jsonb NOT NULL DEFAULT '{}'::jsonb,
  dados_raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  origem text NOT NULL DEFAULT 'dn4',
  migrado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (modulo, chave_principal)
);

CREATE INDEX IF NOT EXISTS idx_dn4_migracao_arquivos_lote ON public.dn4_migracao_arquivos(lote_id);
CREATE INDEX IF NOT EXISTS idx_dn4_migracao_registros_lote ON public.dn4_migracao_registros(lote_id);
CREATE INDEX IF NOT EXISTS idx_dn4_migracao_registros_arquivo ON public.dn4_migracao_registros(arquivo_id);
CREATE INDEX IF NOT EXISTS idx_dn4_migracao_registros_modulo ON public.dn4_migracao_registros(modulo);
CREATE INDEX IF NOT EXISTS idx_dn4_migracao_registros_status ON public.dn4_migracao_registros(status);
CREATE INDEX IF NOT EXISTS idx_dn4_migracao_registros_chave ON public.dn4_migracao_registros(chave_principal);
CREATE INDEX IF NOT EXISTS idx_dn4_migracao_logs_lote ON public.dn4_migracao_logs(lote_id);
CREATE INDEX IF NOT EXISTS idx_dn4_registros_migrados_modulo ON public.dn4_registros_migrados(modulo);

ALTER TABLE public.dn4_migracao_lotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dn4_migracao_arquivos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dn4_migracao_registros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dn4_migracao_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dn4_registros_migrados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dn4_migracao_lotes_all ON public.dn4_migracao_lotes;
CREATE POLICY dn4_migracao_lotes_all ON public.dn4_migracao_lotes FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS dn4_migracao_arquivos_all ON public.dn4_migracao_arquivos;
CREATE POLICY dn4_migracao_arquivos_all ON public.dn4_migracao_arquivos FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS dn4_migracao_registros_all ON public.dn4_migracao_registros;
CREATE POLICY dn4_migracao_registros_all ON public.dn4_migracao_registros FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS dn4_migracao_logs_all ON public.dn4_migracao_logs;
CREATE POLICY dn4_migracao_logs_all ON public.dn4_migracao_logs FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS dn4_registros_migrados_all ON public.dn4_registros_migrados;
CREATE POLICY dn4_registros_migrados_all ON public.dn4_registros_migrados FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

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
  v_tables text[] := ARRAY['empresas','funcionarios','clientes_fat','fornecedores','titulos_pagar','titulos_receber','faturas','contratos','ativos','veiculos','documentos_ativos','manutencoes_veiculos','chamados','abastecimentos','estoque_itens','almoxarifado_movimentos','dn4_registros_migrados'];
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
  SELECT count(*) INTO v_ready
  FROM public.dn4_migracao_registros
  WHERE lote_id = p_lote_id AND status = 'pronto_para_migrar' AND nullif(chave_principal, '') IS NOT NULL;

  IF v_ready = 0 THEN
    RAISE EXCEPTION 'Nenhum registro pronto para migrar neste lote.';
  END IF;

  v_backup := public.dn4_migracao_backup_counts();

  INSERT INTO public.dn4_registros_migrados (lote_id, registro_id, modulo, chave_principal, dados, dados_raw, migrado_em)
  SELECT lote_id, id, modulo, chave_principal, dados_mapeados, dados_raw, now()
  FROM public.dn4_migracao_registros
  WHERE lote_id = p_lote_id AND status = 'pronto_para_migrar' AND nullif(chave_principal, '') IS NOT NULL
  ON CONFLICT (modulo, chave_principal) DO UPDATE
  SET dados = EXCLUDED.dados, dados_raw = EXCLUDED.dados_raw, lote_id = EXCLUDED.lote_id, registro_id = EXCLUDED.registro_id, migrado_em = now();

  UPDATE public.dn4_migracao_registros
  SET status = 'migrado_sucesso', migrado_em = now()
  WHERE lote_id = p_lote_id AND status = 'pronto_para_migrar';

  SELECT jsonb_build_object(
    'total', count(*),
    'migrados', count(*) FILTER (WHERE status = 'migrado_sucesso'),
    'duplicados', count(*) FILTER (WHERE status = 'duplicado'),
    'pendentes', count(*) FILTER (WHERE status = 'pendente_vinculo'),
    'erros', count(*) FILTER (WHERE status IN ('campo_obrigatorio_ausente', 'erro_formato')),
    'por_modulo', COALESCE((
      SELECT jsonb_object_agg(modulo, qtd)
      FROM (SELECT modulo, count(*) AS qtd FROM public.dn4_migracao_registros WHERE lote_id = p_lote_id GROUP BY modulo) por_modulo
    ), '{}'::jsonb)
  ) INTO v_resumo
  FROM public.dn4_migracao_registros
  WHERE lote_id = p_lote_id;

  UPDATE public.dn4_migracao_lotes
  SET status = 'concluido', confirmado_em = now(), backup_logico = v_backup, resumo = COALESCE(v_resumo, '{}'::jsonb)
  WHERE id = p_lote_id;

  INSERT INTO public.dn4_migracao_logs (lote_id, acao, detalhe, payload, criado_por)
  VALUES (p_lote_id, 'lote_confirmado', 'Migracao DN4 confirmada com gravacao real em dn4_registros_migrados.', jsonb_build_object('migrados', v_ready, 'backup', v_backup), auth.uid());

  RETURN jsonb_build_object('ok', true, 'migrados', v_ready, 'backup', v_backup);
END;
$$;

GRANT EXECUTE ON FUNCTION public.dn4_migracao_backup_counts() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.dn4_confirmar_migracao_lote(uuid) TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.admin_pre_cadastro_marcar_exame_enviado(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.pre_cadastros_admissionais
  SET status = 'aguardando_aso', email_exame_enviado_em = now(), historico = historico || jsonb_build_array(jsonb_build_object('em', now(), 'acao', 'exame_solicitado'))
  WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_pre_cadastro_marcar_aso_recebido(p_id uuid, p_arquivo_url text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.pre_cadastros_admissionais
  SET status = 'documentacao_completa', arquivo_aso_url = coalesce(p_arquivo_url, arquivo_aso_url), historico = historico || jsonb_build_array(jsonb_build_object('em', now(), 'acao', 'aso_recebido'))
  WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_pre_cadastro_preparar_contabilidade(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.pre_cadastros_admissionais
  SET status = 'pronto_para_registro', email_contabilidade_preparado_em = now(), historico = historico || jsonb_build_array(jsonb_build_object('em', now(), 'acao', 'contabilidade_preparada'))
  WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_pre_cadastro_aprovar_oficial(p_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.pre_cadastros_admissionais%rowtype;
  v_funcionario_id uuid;
  v_cpf_clean text;
BEGIN
  IF to_regclass('public.funcionarios') IS NULL THEN
    RAISE EXCEPTION 'Tabela funcionarios nao existe neste banco.';
  END IF;

  SELECT * INTO r FROM public.pre_cadastros_admissionais WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pre-cadastro nao encontrado'; END IF;
  IF nullif(trim(r.nome), '') IS NULL THEN RAISE EXCEPTION 'Nome obrigatorio para aprovar cadastro oficial'; END IF;
  IF r.empresa_id IS NULL THEN RAISE EXCEPTION 'Empresa obrigatoria para aprovar cadastro oficial'; END IF;

  v_cpf_clean := regexp_replace(coalesce(r.cpf, ''), '\D', '', 'g');

  IF v_cpf_clean <> '' THEN
    SELECT id INTO v_funcionario_id FROM public.funcionarios WHERE regexp_replace(coalesce(cpf, ''), '\D', '', 'g') = v_cpf_clean LIMIT 1;
  END IF;

  IF v_funcionario_id IS NULL THEN
    INSERT INTO public.funcionarios (nome, cpf, rg, company_id, cargo, salario_base, salario, data_admissao, data_nascimento, setor_ghe, endereco, status, categoria)
    VALUES (r.nome, r.cpf, r.rg, r.empresa_id, r.funcao, coalesce(r.salario, 0), coalesce(r.salario, 0), r.data_admissao, r.data_nascimento, r.setor_ghe, r.endereco, 'ativo', 'operacional')
    RETURNING id INTO v_funcionario_id;
  ELSE
    UPDATE public.funcionarios
    SET nome = coalesce(nullif(r.nome, ''), nome), rg = coalesce(nullif(r.rg, ''), rg), company_id = r.empresa_id, cargo = coalesce(nullif(r.funcao, ''), cargo), salario_base = coalesce(r.salario, salario_base), salario = coalesce(r.salario, salario), data_admissao = coalesce(r.data_admissao, data_admissao), data_nascimento = coalesce(r.data_nascimento, data_nascimento), setor_ghe = coalesce(nullif(r.setor_ghe, ''), setor_ghe), endereco = coalesce(nullif(r.endereco, ''), endereco), status = 'ativo'
    WHERE id = v_funcionario_id;
  END IF;

  UPDATE public.pre_cadastros_admissionais
  SET status = 'cadastro_oficial', aprovado_por = auth.uid(), aprovado_em = now(), funcionario_id = v_funcionario_id, historico = historico || jsonb_build_array(jsonb_build_object('em', now(), 'acao', 'cadastro_oficial_aprovado', 'funcionario_id', v_funcionario_id))
  WHERE id = p_id;

  RETURN v_funcionario_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_pre_cadastro_marcar_exame_enviado(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.admin_pre_cadastro_marcar_aso_recebido(uuid, text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.admin_pre_cadastro_preparar_contabilidade(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.admin_pre_cadastro_aprovar_oficial(uuid) TO authenticated, anon;

INSERT INTO storage.buckets (id, name, public)
VALUES ('documentos-admissionais', 'documentos-admissionais', true)
ON CONFLICT (id) DO UPDATE SET public = true;

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('dn4-migracao', 'dn4-migracao', false, 52428800)
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 52428800;

DROP POLICY IF EXISTS documentos_admissionais_all ON storage.objects;
CREATE POLICY documentos_admissionais_all ON storage.objects
  FOR ALL TO authenticated USING (bucket_id = 'documentos-admissionais') WITH CHECK (bucket_id = 'documentos-admissionais');

DROP POLICY IF EXISTS dn4_migracao_storage_all ON storage.objects;
CREATE POLICY dn4_migracao_storage_all ON storage.objects
  FOR ALL TO authenticated USING (bucket_id = 'dn4-migracao') WITH CHECK (bucket_id = 'dn4-migracao');

NOTIFY pgrst, 'reload schema';
