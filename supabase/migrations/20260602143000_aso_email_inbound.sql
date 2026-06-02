CREATE TABLE IF NOT EXISTS public.aso_documentos_pendentes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'vinculado', 'descartado')),
  email_from TEXT DEFAULT '',
  email_subject TEXT DEFAULT '',
  received_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  nome_arquivo TEXT NOT NULL DEFAULT '',
  storage_bucket TEXT NOT NULL DEFAULT 'documentos-funcionarios',
  storage_path TEXT NOT NULL,
  arquivo_url TEXT DEFAULT '',
  cpf_detectado TEXT DEFAULT '',
  nome_detectado TEXT DEFAULT '',
  texto_detectado TEXT DEFAULT '',
  motivo TEXT DEFAULT '',
  funcionario_id UUID REFERENCES public.funcionarios(id) ON DELETE SET NULL,
  vinculado_documento_id UUID REFERENCES public.documentos_funcionario(id) ON DELETE SET NULL,
  vinculado_por_user_id UUID,
  vinculado_por_nome TEXT DEFAULT '',
  vinculado_em TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_aso_documentos_pendentes_status
  ON public.aso_documentos_pendentes(status);

CREATE INDEX IF NOT EXISTS idx_aso_documentos_pendentes_received_at
  ON public.aso_documentos_pendentes(received_at DESC);

ALTER TABLE public.aso_documentos_pendentes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aso_documentos_pendentes_admin_all ON public.aso_documentos_pendentes;
CREATE POLICY aso_documentos_pendentes_admin_all
  ON public.aso_documentos_pendentes FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS aso_documentos_pendentes_authenticated_read ON public.aso_documentos_pendentes;
CREATE POLICY aso_documentos_pendentes_authenticated_read
  ON public.aso_documentos_pendentes FOR SELECT
  TO authenticated
  USING (true);

DROP TRIGGER IF EXISTS update_aso_documentos_pendentes_updated_at ON public.aso_documentos_pendentes;
CREATE TRIGGER update_aso_documentos_pendentes_updated_at
  BEFORE UPDATE ON public.aso_documentos_pendentes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.vincular_aso_pendente(
  p_pendente_id UUID,
  p_funcionario_id UUID,
  p_user_id UUID DEFAULT auth.uid(),
  p_user_nome TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pendente public.aso_documentos_pendentes%ROWTYPE;
  v_funcionario public.funcionarios%ROWTYPE;
  v_empresa_nome TEXT := '';
  v_documento_id UUID;
  v_user_id UUID := COALESCE(p_user_id, auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);
BEGIN
  SELECT *
    INTO v_pendente
    FROM public.aso_documentos_pendentes
   WHERE id = p_pendente_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'documento_pendente_nao_encontrado';
  END IF;

  IF v_pendente.status <> 'pendente' THEN
    RAISE EXCEPTION 'documento_pendente_ja_processado';
  END IF;

  SELECT *
    INTO v_funcionario
    FROM public.funcionarios
   WHERE id = p_funcionario_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'funcionario_nao_encontrado';
  END IF;

  SELECT nome
    INTO v_empresa_nome
    FROM public.empresas
   WHERE id = v_funcionario.company_id;

  INSERT INTO public.documentos_funcionario (
    funcionario_id,
    funcionario_nome,
    company_id,
    empresa_nome,
    tipo_documento,
    competencia,
    descricao,
    arquivo_url,
    gerado_por_user_id,
    gerado_por_nome,
    unidade,
    status_envio,
    categoria,
    origem,
    observacao,
    nome_arquivo,
    data_documento,
    storage_bucket,
    storage_path
  )
  VALUES (
    v_funcionario.id,
    COALESCE(v_funcionario.nome, ''),
    v_funcionario.company_id,
    COALESCE(v_empresa_nome, ''),
    'ASO recebido por e-mail',
    '',
    'ASO recebido por e-mail da clinica/SOC - ' || COALESCE(v_pendente.email_subject, v_pendente.nome_arquivo, ''),
    COALESCE(NULLIF(v_pendente.arquivo_url, ''), v_pendente.storage_path),
    v_user_id,
    COALESCE(NULLIF(p_user_nome, ''), 'RH TOPAC'),
    COALESCE(v_empresa_nome, ''),
    'recebido',
    'ASO',
    'email_clinica_soc',
    'Recebido de: ' || COALESCE(v_pendente.email_from, '-') || ' | Assunto: ' || COALESCE(v_pendente.email_subject, '-'),
    COALESCE(v_pendente.nome_arquivo, 'ASO_RECEBIDO.pdf'),
    COALESCE(v_pendente.received_at, now()),
    COALESCE(NULLIF(v_pendente.storage_bucket, ''), 'documentos-funcionarios'),
    v_pendente.storage_path
  )
  RETURNING id INTO v_documento_id;

  UPDATE public.aso_documentos_pendentes
     SET status = 'vinculado',
         funcionario_id = v_funcionario.id,
         vinculado_documento_id = v_documento_id,
         vinculado_por_user_id = v_user_id,
         vinculado_por_nome = COALESCE(NULLIF(p_user_nome, ''), 'RH TOPAC'),
         vinculado_em = now(),
         updated_at = now()
   WHERE id = v_pendente.id;

  RETURN jsonb_build_object(
    'ok', true,
    'documento_id', v_documento_id,
    'funcionario_id', v_funcionario.id
  );
END;
$$;

GRANT SELECT ON public.aso_documentos_pendentes TO authenticated;
GRANT EXECUTE ON FUNCTION public.vincular_aso_pendente(UUID, UUID, UUID, TEXT) TO authenticated;
