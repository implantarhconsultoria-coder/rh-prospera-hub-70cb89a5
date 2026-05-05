
-- RPC pública: dados enriquecidos do vale para a tela do QR Code
CREATE OR REPLACE FUNCTION public.qr_abastecimento_dados(p_codigo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v RECORD;
  ve RECORD;
  emp RECORD;
BEGIN
  SELECT * INTO v FROM public.vales_combustivel
   WHERE codigo = p_codigo AND deleted_at IS NULL LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'vale_invalido');
  END IF;
  IF v.status NOT IN ('ativo') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'vale_indisponivel', 'status', v.status);
  END IF;
  IF v.validade IS NOT NULL AND v.validade < CURRENT_DATE THEN
    RETURN jsonb_build_object('ok', false, 'error', 'vale_vencido');
  END IF;

  -- veiculo (opcional)
  IF v.veiculo_id IS NOT NULL THEN
    SELECT id, placa, modelo, company_id INTO ve FROM public.veiculos WHERE id = v.veiculo_id;
    IF FOUND AND ve.company_id IS NOT NULL THEN
      SELECT id, nome INTO emp FROM public.empresas WHERE id = ve.company_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'agora', now(),
    'vale', jsonb_build_object(
      'id', v.id, 'codigo', v.codigo, 'tipo', v.tipo,
      'valor_limite', v.valor_limite, 'litros_limite', v.litros_limite,
      'validade', v.validade
    ),
    'posto', jsonb_build_object(
      'nome', COALESCE(v.posto_nome,''),
      'cnpj', COALESCE(v.posto_cnpj,''),
      'endereco', COALESCE(v.posto_endereco,'')
    ),
    'veiculo', CASE WHEN ve.id IS NOT NULL
      THEN jsonb_build_object('id', ve.id, 'placa', ve.placa, 'modelo', ve.modelo)
      ELSE NULL END,
    'empresa', CASE WHEN emp.id IS NOT NULL
      THEN jsonb_build_object('id', emp.id, 'nome', emp.nome)
      ELSE NULL END
  );
END $$;

GRANT EXECUTE ON FUNCTION public.qr_abastecimento_dados(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validar_qr_combustivel_publico(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_abastecimento_publico(text, text, text, numeric, numeric, numeric, text, text, text) TO anon, authenticated;
