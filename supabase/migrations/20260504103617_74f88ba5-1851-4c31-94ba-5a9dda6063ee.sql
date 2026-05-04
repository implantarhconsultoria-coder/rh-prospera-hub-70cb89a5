-- ============ acoes_log ============
DROP POLICY IF EXISTS auth_select_acoes_log ON public.acoes_log;
DROP POLICY IF EXISTS auth_insert_acoes_log ON public.acoes_log;
DROP POLICY IF EXISTS anon_insert_acoes_log ON public.acoes_log;

CREATE POLICY "Auth insert own acoes_log"
  ON public.acoes_log FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- (admin_all_acoes_log already covers admin SELECT/UPDATE/DELETE/INSERT)

-- ============ apontamentos_contabilidade ============
DROP POLICY IF EXISTS auth_select_apont ON public.apontamentos_contabilidade;
DROP POLICY IF EXISTS auth_insupd_apont ON public.apontamentos_contabilidade;
DROP POLICY IF EXISTS auth_upd_apont ON public.apontamentos_contabilidade;

CREATE POLICY "Filial select own empresa apont"
  ON public.apontamentos_contabilidade FOR SELECT
  TO authenticated
  USING (empresa_nome = ANY (public.get_user_empresas()));

-- ============ apontamentos_contabilidade_itens ============
DROP POLICY IF EXISTS auth_select_apont_itens ON public.apontamentos_contabilidade_itens;
DROP POLICY IF EXISTS auth_ins_apont_itens   ON public.apontamentos_contabilidade_itens;
DROP POLICY IF EXISTS auth_upd_apont_itens   ON public.apontamentos_contabilidade_itens;
DROP POLICY IF EXISTS auth_del_apont_itens   ON public.apontamentos_contabilidade_itens;

CREATE POLICY "Filial select own empresa apont itens"
  ON public.apontamentos_contabilidade_itens FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.apontamentos_contabilidade a
      WHERE a.id = apontamento_id
        AND a.empresa_nome = ANY (public.get_user_empresas())
    )
  );

-- ============ config_emails_contabilidade ============
DROP POLICY IF EXISTS "Authenticated read config emails" ON public.config_emails_contabilidade;
-- (Admin manage config emails already covers admin)

-- ============ rescisao_historico ============
CREATE POLICY "Filial view own empresa rescisao_historico"
  ON public.rescisao_historico FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.rescisoes r
      WHERE r.id = rescisao_historico.rescisao_id
        AND r.empresa_nome = ANY (public.get_user_empresas())
    )
  );

-- ============ STORAGE: documentos-funcionarios (folder layout: <empresa_nome>/...) ============
DROP POLICY IF EXISTS "Authenticated users can upload documentos" ON storage.objects;
DROP POLICY IF EXISTS "Admin manage documentos-funcionarios"      ON storage.objects;
DROP POLICY IF EXISTS "Filial upload documentos-funcionarios"     ON storage.objects;
DROP POLICY IF EXISTS "Filial update documentos-funcionarios"     ON storage.objects;
DROP POLICY IF EXISTS "Filial delete documentos-funcionarios"     ON storage.objects;

CREATE POLICY "Admin manage documentos-funcionarios"
  ON storage.objects FOR ALL
  TO authenticated
  USING (bucket_id = 'documentos-funcionarios' AND public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (bucket_id = 'documentos-funcionarios' AND public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Filial upload documentos-funcionarios"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'documentos-funcionarios'
    AND (storage.foldername(name))[1] = ANY (public.get_user_empresas())
  );

CREATE POLICY "Filial update documentos-funcionarios"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'documentos-funcionarios'
    AND (storage.foldername(name))[1] = ANY (public.get_user_empresas())
  );

-- ============ STORAGE: documentos-ativos ============
DROP POLICY IF EXISTS "Authenticated users can upload docs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update docs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete docs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view docs"   ON storage.objects;
DROP POLICY IF EXISTS "Admin manage documentos-ativos"      ON storage.objects;
DROP POLICY IF EXISTS "Filial upload documentos-ativos"     ON storage.objects;
DROP POLICY IF EXISTS "Filial update documentos-ativos"     ON storage.objects;

CREATE POLICY "Admin manage documentos-ativos"
  ON storage.objects FOR ALL
  TO authenticated
  USING (bucket_id = 'documentos-ativos' AND public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (bucket_id = 'documentos-ativos' AND public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Filial upload documentos-ativos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'documentos-ativos'
    AND (storage.foldername(name))[1] = ANY (public.get_user_empresas())
  );

CREATE POLICY "Filial update documentos-ativos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'documentos-ativos'
    AND (storage.foldername(name))[1] = ANY (public.get_user_empresas())
  );

-- ============ STORAGE: ferias-avisos ============
DROP POLICY IF EXISTS "Auth upload ferias-avisos" ON storage.objects;
DROP POLICY IF EXISTS "Auth update ferias-avisos" ON storage.objects;
DROP POLICY IF EXISTS "Auth delete ferias-avisos" ON storage.objects;
DROP POLICY IF EXISTS "Admin manage ferias-avisos" ON storage.objects;
DROP POLICY IF EXISTS "Filial upload ferias-avisos" ON storage.objects;
DROP POLICY IF EXISTS "Filial update ferias-avisos" ON storage.objects;

CREATE POLICY "Admin manage ferias-avisos"
  ON storage.objects FOR ALL
  TO authenticated
  USING (bucket_id = 'ferias-avisos' AND public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (bucket_id = 'ferias-avisos' AND public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Filial upload ferias-avisos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'ferias-avisos'
    AND (storage.foldername(name))[1] = ANY (public.get_user_empresas())
  );

CREATE POLICY "Filial update ferias-avisos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'ferias-avisos'
    AND (storage.foldername(name))[1] = ANY (public.get_user_empresas())
  );

-- ============ STORAGE: atestados ============
DROP POLICY IF EXISTS "Authenticated upload atestados" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update atestados" ON storage.objects;
DROP POLICY IF EXISTS "Admin manage atestados"         ON storage.objects;
DROP POLICY IF EXISTS "Filial upload atestados"        ON storage.objects;
DROP POLICY IF EXISTS "Filial update atestados"        ON storage.objects;

CREATE POLICY "Admin manage atestados"
  ON storage.objects FOR ALL
  TO authenticated
  USING (bucket_id = 'atestados' AND public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (bucket_id = 'atestados' AND public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Filial upload atestados"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'atestados'
    AND (storage.foldername(name))[1] = ANY (public.get_user_empresas())
  );

CREATE POLICY "Filial update atestados"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'atestados'
    AND (storage.foldername(name))[1] = ANY (public.get_user_empresas())
  );

-- ============ STORAGE: faturamento-docs (admin only for write) ============
DROP POLICY IF EXISTS "Authenticated upload faturamento-docs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update faturamento-docs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete faturamento-docs" ON storage.objects;
DROP POLICY IF EXISTS "Admin manage faturamento-docs"         ON storage.objects;

CREATE POLICY "Admin manage faturamento-docs"
  ON storage.objects FOR ALL
  TO authenticated
  USING (bucket_id = 'faturamento-docs' AND public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (bucket_id = 'faturamento-docs' AND public.has_role(auth.uid(), 'admin'::public.app_role));