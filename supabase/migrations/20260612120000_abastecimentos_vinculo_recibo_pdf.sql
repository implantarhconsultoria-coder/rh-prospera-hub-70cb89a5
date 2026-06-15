ALTER TABLE public.abastecimentos
  ADD COLUMN IF NOT EXISTS recibo_pdf_url text;

CREATE INDEX IF NOT EXISTS idx_abastecimentos_recibo_pdf
  ON public.abastecimentos (recibo_pdf_url)
  WHERE recibo_pdf_url IS NOT NULL;

CREATE OR REPLACE FUNCTION public.app_mecanico_vincular_recibo_pdf(
  p_acesso_id uuid,
  p_abastecimento_id uuid,
  p_recibo_pdf_url text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.acessos_externos;
BEGIN
  BEGIN
    v := public._app_mecanico_get_acesso(p_acesso_id);
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'acesso_nao_autorizado');
  END;

  IF COALESCE(trim(p_recibo_pdf_url), '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'recibo_pdf_url_obrigatoria');
  END IF;

  UPDATE public.abastecimentos
     SET recibo_pdf_url = p_recibo_pdf_url,
         recibo_gerado_em = now(),
         updated_at = now()
   WHERE id = p_abastecimento_id
     AND acesso_externo_id = v.id
     AND COALESCE(excluido, false) = false;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'abastecimento_nao_encontrado');
  END IF;

  RETURN jsonb_build_object('ok', true, 'recibo_pdf_url', p_recibo_pdf_url);
END;
$$;

GRANT EXECUTE ON FUNCTION public.app_mecanico_vincular_recibo_pdf(uuid, uuid, text)
  TO anon, authenticated;
