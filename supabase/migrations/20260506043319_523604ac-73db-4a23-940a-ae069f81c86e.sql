
-- 1) Tabela de log de acessos ao QR
CREATE TABLE IF NOT EXISTS public.qr_access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_qr TEXT,
  data_hora_acesso TIMESTAMPTZ NOT NULL DEFAULT now(),
  dispositivo TEXT,
  navegador TEXT,
  status_abertura TEXT NOT NULL DEFAULT 'opened',
  erro_retornado TEXT
);

CREATE INDEX IF NOT EXISTS idx_qr_access_logs_codigo ON public.qr_access_logs(codigo_qr);
CREATE INDEX IF NOT EXISTS idx_qr_access_logs_data ON public.qr_access_logs(data_hora_acesso DESC);

ALTER TABLE public.qr_access_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin lê logs QR" ON public.qr_access_logs;
CREATE POLICY "Admin lê logs QR" ON public.qr_access_logs
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- 2) Função pública: vitalícia, busca tolerante, sem record "ve"
CREATE OR REPLACE FUNCTION public.qr_abastecimento_dados(p_codigo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v RECORD;
  ve_id UUID;
  ve_placa TEXT;
  ve_modelo TEXT;
  ve_company UUID;
  emp_id UUID;
  emp_nome TEXT;
  v_codigo_norm TEXT;
BEGIN
  v_codigo_norm := upper(trim(coalesce(p_codigo,'')));

  SELECT * INTO v
    FROM public.vales_combustivel
   WHERE deleted_at IS NULL
     AND (codigo = p_codigo OR upper(trim(codigo)) = v_codigo_norm)
   LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO public.qr_access_logs(codigo_qr, status_abertura, erro_retornado)
    VALUES (p_codigo, 'error', 'qr_nao_encontrado');
    RETURN jsonb_build_object('ok', false, 'error', 'qr_nao_encontrado');
  END IF;

  IF v.status = 'bloqueado' OR v.status = 'cancelado' THEN
    INSERT INTO public.qr_access_logs(codigo_qr, status_abertura, erro_retornado)
    VALUES (v.codigo, 'blocked', v.status);
    RETURN jsonb_build_object('ok', false, 'error', 'qr_bloqueado', 'status', v.status);
  END IF;

  IF v.veiculo_id IS NOT NULL THEN
    SELECT id, placa, modelo, company_id
      INTO ve_id, ve_placa, ve_modelo, ve_company
      FROM public.veiculos WHERE id = v.veiculo_id;
    IF ve_company IS NOT NULL THEN
      SELECT id, nome INTO emp_id, emp_nome
        FROM public.empresas WHERE id = ve_company;
    END IF;
  END IF;

  INSERT INTO public.qr_access_logs(codigo_qr, status_abertura)
  VALUES (v.codigo, 'opened');

  RETURN jsonb_build_object(
    'ok', true,
    'agora', now(),
    'vale', jsonb_build_object(
      'id', v.id, 'codigo', v.codigo, 'tipo', v.tipo,
      'valor_limite', v.valor_limite, 'litros_limite', v.litros_limite,
      'validade', v.validade,
      'status', v.status
    ),
    'posto', jsonb_build_object(
      'nome', COALESCE(v.posto_nome,''),
      'cnpj', COALESCE(v.posto_cnpj,''),
      'endereco', COALESCE(v.posto_endereco,'')
    ),
    'veiculo', CASE WHEN ve_id IS NOT NULL
      THEN jsonb_build_object('id', ve_id, 'placa', COALESCE(ve_placa,''), 'modelo', COALESCE(ve_modelo,''))
      ELSE NULL END,
    'empresa', CASE WHEN emp_id IS NOT NULL
      THEN jsonb_build_object('id', emp_id, 'nome', COALESCE(emp_nome,''))
      ELSE NULL END
  );
END
$function$;

-- 3) Função leve de validação também atualizada (sem expiração)
CREATE OR REPLACE FUNCTION public.validar_qr_combustivel_publico(p_codigo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v RECORD;
  v_codigo_norm TEXT;
BEGIN
  v_codigo_norm := upper(trim(coalesce(p_codigo,'')));
  SELECT * INTO v FROM public.vales_combustivel
   WHERE deleted_at IS NULL
     AND (codigo = p_codigo OR upper(trim(codigo)) = v_codigo_norm)
   LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','qr_nao_encontrado'); END IF;
  IF v.status = 'bloqueado' OR v.status = 'cancelado' THEN
    RETURN jsonb_build_object('ok',false,'error','qr_bloqueado','status',v.status);
  END IF;
  RETURN jsonb_build_object('ok',true,'vale', jsonb_build_object(
    'id', v.id, 'codigo', v.codigo,
    'posto_nome', COALESCE(v.posto_nome,''),
    'posto_cnpj', COALESCE(v.posto_cnpj,''),
    'posto_endereco', COALESCE(v.posto_endereco,''),
    'valor_limite', v.valor_limite,
    'litros_limite', v.litros_limite,
    'status', v.status
  ));
END
$function$;
