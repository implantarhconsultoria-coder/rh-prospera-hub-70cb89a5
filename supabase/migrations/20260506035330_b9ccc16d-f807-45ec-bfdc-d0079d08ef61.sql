-- Corrige qr_abastecimento_dados: declara ve/emp como nullable e remove expiração automática (QR vitalício)
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
BEGIN
  SELECT * INTO v FROM public.vales_combustivel
   WHERE codigo = p_codigo AND deleted_at IS NULL LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'qr_nao_encontrado');
  END IF;

  -- QR vitalício: só bloqueia se status explicitamente diferente de ativo/utilizado
  -- (utilizado também segue abrindo para reuso/conferência conforme regra do app)
  IF v.status = 'bloqueado' OR v.status = 'cancelado' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'qr_bloqueado', 'status', v.status);
  END IF;

  -- veículo opcional — sem usar RECORD para evitar "record ve is not assigned yet"
  IF v.veiculo_id IS NOT NULL THEN
    SELECT id, placa, modelo, company_id
      INTO ve_id, ve_placa, ve_modelo, ve_company
      FROM public.veiculos WHERE id = v.veiculo_id;
    IF ve_company IS NOT NULL THEN
      SELECT id, nome INTO emp_id, emp_nome
        FROM public.empresas WHERE id = ve_company;
    END IF;
  END IF;

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
      THEN jsonb_build_object('id', ve_id, 'placa', ve_placa, 'modelo', ve_modelo)
      ELSE NULL END,
    'empresa', CASE WHEN emp_id IS NOT NULL
      THEN jsonb_build_object('id', emp_id, 'nome', emp_nome)
      ELSE NULL END
  );
END $function$;

-- Mesma correção em validar_qr_combustivel_publico: remove expiração por validade (vitalício)
CREATE OR REPLACE FUNCTION public.validar_qr_combustivel_publico(p_codigo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v RECORD;
BEGIN
  SELECT * INTO v FROM public.vales_combustivel
   WHERE codigo = p_codigo AND deleted_at IS NULL LIMIT 1;
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
END $function$;