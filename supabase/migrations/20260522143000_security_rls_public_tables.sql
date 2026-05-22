-- TOPAC RH PRO - hardening de RLS/Supabase Security Advisor.
-- Idempotente e defensivo: cria backup de estado, habilita RLS somente em tabelas existentes
-- e remove exposicao direta de campos sensiveis de QR tokens.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.security_rls_migration_backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  table_schema text NOT NULL DEFAULT 'public',
  table_name text NOT NULL,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE OR REPLACE FUNCTION public.topac_security_has_any_role(_roles text[], _user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role::text = ANY(_roles)
  );
$$;

CREATE OR REPLACE FUNCTION public.topac_security_column_exists(p_table text, p_column text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = p_table
      AND column_name = p_column
  );
$$;

CREATE OR REPLACE FUNCTION public.topac_security_backup_table(p_table text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_snapshot jsonb;
BEGIN
  IF to_regclass('public.' || p_table) IS NULL THEN
    RETURN;
  END IF;

  SELECT jsonb_build_object(
    'captured_at', now(),
    'relrowsecurity', c.relrowsecurity,
    'grants', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('grantee', grantee, 'privilege_type', privilege_type))
      FROM information_schema.role_table_grants g
      WHERE g.table_schema = 'public' AND g.table_name = p_table
    ), '[]'::jsonb),
    'policies', COALESCE((
      SELECT jsonb_agg(to_jsonb(p))
      FROM pg_policies p
      WHERE p.schemaname = 'public' AND p.tablename = p_table
    ), '[]'::jsonb)
  ) INTO v_snapshot
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = p_table;

  INSERT INTO public.security_rls_migration_backups(migration_name, table_name, snapshot)
  VALUES ('20260522143000_security_rls_public_tables', p_table, COALESCE(v_snapshot, '{}'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.topac_security_company_predicate(p_table text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parts text[] := ARRAY[]::text[];
  v_ax_parts text[] := ARRAY[]::text[];
  v_has_user_empresas boolean := to_regclass('public.user_empresas') IS NOT NULL;
BEGIN
  IF public.topac_security_column_exists(p_table, 'user_id') THEN
    v_parts := v_parts || 'user_id = auth.uid()';
  END IF;
  IF public.topac_security_column_exists(p_table, 'created_by') THEN
    v_parts := v_parts || 'created_by = auth.uid()';
  END IF;
  IF public.topac_security_column_exists(p_table, 'criado_por') THEN
    v_parts := v_parts || 'criado_por = auth.uid()';
  END IF;
  IF v_has_user_empresas AND public.topac_security_column_exists(p_table, 'empresa_id') THEN
    v_parts := v_parts || 'empresa_id IN (SELECT empresa_id FROM public.user_empresas WHERE user_id = auth.uid())';
  END IF;
  IF v_has_user_empresas AND public.topac_security_column_exists(p_table, 'company_id') THEN
    v_parts := v_parts || 'company_id IN (SELECT empresa_id FROM public.user_empresas WHERE user_id = auth.uid())';
  END IF;
  IF v_has_user_empresas AND public.topac_security_column_exists(p_table, 'filial_id') THEN
    v_parts := v_parts || 'filial_id IN (SELECT empresa_id FROM public.user_empresas WHERE user_id = auth.uid())';
  END IF;
  IF public.topac_security_column_exists(p_table, 'pre_cadastro_id')
     AND to_regclass('public.pre_cadastros_admissionais') IS NOT NULL THEN
    IF v_has_user_empresas THEN
      v_parts := v_parts || 'EXISTS (SELECT 1 FROM public.pre_cadastros_admissionais pc WHERE pc.id = pre_cadastro_id AND (pc.criado_por = auth.uid() OR pc.empresa_id IN (SELECT empresa_id FROM public.user_empresas WHERE user_id = auth.uid())))';
    ELSE
      v_parts := v_parts || 'EXISTS (SELECT 1 FROM public.pre_cadastros_admissionais pc WHERE pc.id = pre_cadastro_id AND pc.criado_por = auth.uid())';
    END IF;
  END IF;
  IF public.topac_security_column_exists(p_table, 'acesso_externo_id')
     AND to_regclass('public.acessos_externos') IS NOT NULL THEN
    IF public.topac_security_column_exists('acessos_externos', 'user_id') THEN
      v_ax_parts := v_ax_parts || 'ax.user_id = auth.uid()';
    END IF;
    IF v_has_user_empresas AND public.topac_security_column_exists('acessos_externos', 'empresa_id') THEN
      v_ax_parts := v_ax_parts || 'ax.empresa_id IN (SELECT empresa_id FROM public.user_empresas WHERE user_id = auth.uid())';
    END IF;
    IF array_length(v_ax_parts, 1) IS NOT NULL THEN
      v_parts := v_parts || 'EXISTS (SELECT 1 FROM public.acessos_externos ax WHERE ax.id = acesso_externo_id AND (' || array_to_string(v_ax_parts, ' OR ') || '))';
    END IF;
  END IF;

  IF array_length(v_parts, 1) IS NULL THEN
    RETURN 'false';
  END IF;
  RETURN '(' || array_to_string(v_parts, ' OR ') || ')';
END;
$$;

CREATE OR REPLACE FUNCTION public.topac_security_apply_table(p_table text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_predicate text;
BEGIN
  IF to_regclass('public.' || p_table) IS NULL THEN
    RETURN;
  END IF;

  PERFORM public.topac_security_backup_table(p_table);
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', p_table);

  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p_table || '_admin_direcao_all', p_table);
  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.topac_security_has_any_role(ARRAY[''admin'',''diretor_geral''], auth.uid())) WITH CHECK (public.topac_security_has_any_role(ARRAY[''admin'',''diretor_geral''], auth.uid()))',
    p_table || '_admin_direcao_all', p_table
  );

  v_predicate := public.topac_security_company_predicate(p_table);
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p_table || '_operacional_select', p_table);
  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.topac_security_has_any_role(ARRAY[''operacional'',''filial_matriz'',''filial_praia'',''filial_goiania'',''tecnico_campo'',''financeiro'',''faturamento''], auth.uid()) AND %s)',
    p_table || '_operacional_select', p_table, v_predicate
  );
END;
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'mobile_admin_modulos',
    'mobile_admin_user_modulos',
    'rh_documentos_uploads',
    'abastecimento_unidades',
    'abastecimento_postos',
    'abastecimento_qr_tokens',
    'abastecimento_registros',
    'pre_cadastros_admissionais',
    'pre_cadastro_documentos'
  ] LOOP
    PERFORM public.topac_security_apply_table(t);
  END LOOP;
END $$;

DO $$
DECLARE
  v_select_list text;
BEGIN
  IF to_regclass('public.abastecimento_qr_tokens') IS NOT NULL THEN
    REVOKE ALL ON TABLE public.abastecimento_qr_tokens FROM anon;
    REVOKE ALL ON TABLE public.abastecimento_qr_tokens FROM authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.abastecimento_qr_tokens TO service_role;

    SELECT string_agg(format('%I', column_name), ', ' ORDER BY ordinal_position)
    INTO v_select_list
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'abastecimento_qr_tokens'
      AND column_name !~* '(token|secret|hash|senha|password|pin|chave|key|salt|signature|assinatura)';

    IF COALESCE(v_select_list, '') <> '' THEN
      DROP VIEW IF EXISTS public.abastecimento_qr_tokens_public;
      EXECUTE 'CREATE VIEW public.abastecimento_qr_tokens_public AS SELECT ' || v_select_list || ' FROM public.abastecimento_qr_tokens';
      EXECUTE 'GRANT SELECT ON public.abastecimento_qr_tokens_public TO authenticated';
      EXECUTE 'REVOKE ALL ON public.abastecimento_qr_tokens_public FROM anon';
    END IF;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.validar_abastecimento_qr_token_publico(p_codigo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_where text;
BEGIN
  IF to_regclass('public.abastecimento_qr_tokens') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'tabela_qr_tokens_indisponivel');
  END IF;

  IF public.topac_security_column_exists('abastecimento_qr_tokens', 'codigo') THEN
    v_where := 'upper(trim(codigo)) = upper(trim($1))';
  ELSIF public.topac_security_column_exists('abastecimento_qr_tokens', 'token_publico') THEN
    v_where := 'upper(trim(token_publico)) = upper(trim($1))';
  ELSIF public.topac_security_column_exists('abastecimento_qr_tokens', 'public_code') THEN
    v_where := 'upper(trim(public_code)) = upper(trim($1))';
  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'coluna_publica_qr_nao_configurada');
  END IF;

  EXECUTE 'SELECT * FROM public.abastecimento_qr_tokens WHERE ' || v_where || ' LIMIT 1' INTO r USING p_codigo;
  IF r IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'qr_nao_encontrado');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'qr', to_jsonb(r) - 'token' - 'token_hash' - 'secret' - 'secret_hash' - 'senha' - 'password' - 'pin' - 'chave' - 'key' - 'salt' - 'signature' - 'assinatura'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.validar_abastecimento_qr_token_publico(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.topac_security_has_any_role(text[], uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
