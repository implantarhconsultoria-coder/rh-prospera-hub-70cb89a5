-- TOPAC RH PRO Multiempresas
-- Completa a proteção permanente contra duplicidade no histórico documental.

CREATE OR REPLACE FUNCTION public.topac_block_duplicate_historico_documental()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_fingerprint text;
  v_existing uuid;
BEGIN
  v_fingerprint := public.topac_document_locator(NULL, NULL, NEW.arquivo_url);
  IF v_fingerprint = '' THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      'historico_documental:'
      || coalesce(NEW.funcionario_id::text, '') || ':'
      || coalesce(NEW.company_id::text, '') || ':'
      || v_fingerprint,
      0
    )
  );

  SELECT id
  INTO v_existing
  FROM public.historico_documental
  WHERE coalesce(funcionario_id, '00000000-0000-0000-0000-000000000000'::uuid)
          = coalesce(NEW.funcionario_id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid)
          = coalesce(NEW.company_id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND public.topac_document_locator(NULL, NULL, arquivo_url) = v_fingerprint
    AND id <> NEW.id
  ORDER BY created_at, id
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    INSERT INTO public.documentos_duplicidade_auditoria
      (tabela_origem, registro_mantido_id, registro_removido_id, fingerprint, dados_removidos, motivo)
    VALUES
      ('historico_documental', v_existing, NEW.id, v_fingerprint, to_jsonb(NEW), 'entrada_duplicada_descartada')
    ON CONFLICT (tabela_origem, registro_removido_id) DO NOTHING;
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_historico_documental_antiduplicidade
  ON public.historico_documental;
CREATE TRIGGER trg_historico_documental_antiduplicidade
BEFORE INSERT OR UPDATE OF arquivo_url, funcionario_id, company_id
ON public.historico_documental
FOR EACH ROW
EXECUTE FUNCTION public.topac_block_duplicate_historico_documental();

CREATE UNIQUE INDEX IF NOT EXISTS ux_historico_documental_owner_locator
ON public.historico_documental (
  coalesce(funcionario_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid),
  public.topac_document_locator(NULL, NULL, arquivo_url)
)
WHERE public.topac_document_locator(NULL, NULL, arquivo_url) <> '';

REVOKE ALL ON FUNCTION public.topac_block_duplicate_historico_documental()
  FROM public, anon, authenticated;
