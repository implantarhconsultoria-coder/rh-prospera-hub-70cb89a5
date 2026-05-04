-- Corrige fechamento_filial_sincronizar para calcular proventos/descontos/líquido
-- usando fórmula contábil real (valor-hora, INSS, IRRF, DSR, VT 6%, benefícios).
-- ANTES: somava quantidade de horas como dinheiro (errado).

CREATE OR REPLACE FUNCTION public.calc_inss(p_base NUMERIC)
RETURNS NUMERIC LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE v NUMERIC := 0; b NUMERIC := COALESCE(p_base,0);
BEGIN
  IF b <= 0 THEN RETURN 0; END IF;
  IF b <= 1412.00 THEN v := b * 0.075;
  ELSIF b <= 2666.68 THEN v := 1412.00*0.075 + (b-1412.00)*0.09;
  ELSIF b <= 4000.03 THEN v := 1412.00*0.075 + (2666.68-1412.00)*0.09 + (b-2666.68)*0.12;
  ELSIF b <= 7786.02 THEN v := 1412.00*0.075 + (2666.68-1412.00)*0.09 + (4000.03-2666.68)*0.12 + (b-4000.03)*0.14;
  ELSE v := 1412.00*0.075 + (2666.68-1412.00)*0.09 + (4000.03-2666.68)*0.12 + (7786.02-4000.03)*0.14;
  END IF;
  RETURN ROUND(v::numeric, 2);
END $$;

CREATE OR REPLACE FUNCTION public.calc_irrf(p_base NUMERIC)
RETURNS NUMERIC LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE b NUMERIC := COALESCE(p_base,0); v NUMERIC := 0;
BEGIN
  IF b <= 2259.20 THEN RETURN 0;
  ELSIF b <= 2826.65 THEN v := b*0.075 - 169.44;
  ELSIF b <= 3751.05 THEN v := b*0.15  - 381.44;
  ELSIF b <= 4664.68 THEN v := b*0.225 - 662.77;
  ELSE v := b*0.275 - 896.00;
  END IF;
  RETURN ROUND(GREATEST(0,v)::numeric, 2);
END $$;

CREATE OR REPLACE FUNCTION public.fechamento_filial_sincronizar(p_company_id uuid, p_competencia text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_empresa TEXT;
  v_total_func INT := 0;
  v_proventos NUMERIC := 0;
  v_descontos NUMERIC := 0;
  v_liquido NUMERIC := 0;
  v_fech RECORD;
  r RECORD;
  v_vh NUMERIC; v_he50 NUMERIC; v_he100 NUMERIC; v_totalHE NUMERIC; v_dsr NUMERIC;
  v_falta NUMERIC; v_atraso NUMERIC; v_insal NUMERIC;
  v_brutoFolha NUMERIC; v_inss NUMERIC; v_irrf NUMERIC; v_descVT NUMERIC;
  v_p NUMERIC; v_d NUMERIC;
  v_dias_uteis INT := 22; v_dias_mes INT := 30;
BEGIN
  SELECT nome INTO v_empresa FROM public.empresas WHERE id = p_company_id;
  IF v_empresa IS NULL THEN RETURN jsonb_build_object('ok',false,'error','empresa_nao_encontrada'); END IF;

  -- Dias do mês a partir da competência YYYY-MM
  BEGIN
    v_dias_mes := EXTRACT(DAY FROM (date_trunc('month', to_date(p_competencia||'-01','YYYY-MM-DD')) + INTERVAL '1 month - 1 day'))::int;
  EXCEPTION WHEN OTHERS THEN v_dias_mes := 30;
  END;

  FOR r IN
    SELECT lm.*, f.salario_base, f.insalubridade_ativa, f.insalubridade_valor,
           f.vr_ativo, f.vr_diario, f.va_ativo, f.va_mensal, f.vt_ativo, f.vt_diario
    FROM public.lancamentos_mensais lm
    JOIN public.funcionarios f ON f.id = lm.funcionario_id
    WHERE lm.company_id = p_company_id
      AND lm.competencia = p_competencia
      AND lm.apagado_em IS NULL
  LOOP
    v_total_func := v_total_func + 1;
    v_vh := COALESCE(r.salario_base,0) / 220.0;

    v_he50  := v_vh * 1.5 * COALESCE(r.he50,0);
    v_he100 := v_vh * 2.0 * COALESCE(r.he100,0);
    v_totalHE := v_he50 + v_he100;
    v_dsr := CASE WHEN v_dias_uteis>0 THEN v_totalHE / v_dias_uteis * (v_dias_mes - v_dias_uteis) ELSE 0 END;

    v_falta  := COALESCE(r.salario_base,0)/30.0 * COALESCE(r.faltas_dias,0);
    v_atraso := v_vh * COALESCE(r.atrasos,0);
    v_insal  := CASE WHEN r.insalubridade_aplicada AND r.insalubridade_ativa THEN COALESCE(r.insalubridade_valor,0) ELSE 0 END;

    -- PROVENTOS (folha CLT, sem benefícios)
    v_p := COALESCE(r.salario_base,0) + v_he50 + v_he100 + v_dsr + COALESCE(r.adicionais,0) + v_insal + COALESCE(r.comissao_base,0);

    -- Base INSS / IRRF
    v_brutoFolha := v_p;
    v_inss := public.calc_inss(v_brutoFolha);
    v_irrf := public.calc_irrf(v_brutoFolha - v_inss);

    v_descVT := CASE WHEN r.vt_aplicado AND r.vt_ativo THEN ROUND(COALESCE(r.salario_base,0)*0.06::numeric,2) ELSE 0 END;

    v_d := v_falta + v_atraso + COALESCE(r.descontos_diversos,0) + COALESCE(r.adiantamento,0)
           + v_inss + v_irrf + v_descVT + COALESCE(r.vt_desconto,0);

    v_proventos := v_proventos + v_p;
    v_descontos := v_descontos + v_d;
  END LOOP;

  v_liquido := COALESCE(v_proventos,0) - COALESCE(v_descontos,0);

  SELECT * INTO v_fech FROM public.fechamentos_filial
   WHERE company_id = p_company_id AND competencia = p_competencia LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO public.fechamentos_filial(company_id, empresa_nome, competencia, status, total_funcionarios, total_proventos, total_descontos, total_liquido)
    VALUES (p_company_id, v_empresa, p_competencia,
            CASE WHEN v_total_func > 0 THEN 'aberto' ELSE 'pendente' END,
            v_total_func, ROUND(v_proventos,2), ROUND(v_descontos,2), ROUND(v_liquido,2))
    RETURNING * INTO v_fech;
  ELSE
    IF v_fech.status NOT IN ('fechado') THEN
      UPDATE public.fechamentos_filial
         SET total_funcionarios = v_total_func,
             total_proventos = ROUND(v_proventos,2),
             total_descontos = ROUND(v_descontos,2),
             total_liquido   = ROUND(v_liquido,2),
             status = CASE WHEN v_total_func = 0 THEN 'pendente'
                           WHEN v_fech.status = 'reaberto' THEN 'reaberto'
                           ELSE 'em_andamento' END
       WHERE id = v_fech.id
       RETURNING * INTO v_fech;
    ELSE
      UPDATE public.fechamentos_filial
         SET total_funcionarios = v_total_func,
             total_proventos = ROUND(v_proventos,2),
             total_descontos = ROUND(v_descontos,2),
             total_liquido   = ROUND(v_liquido,2)
       WHERE id = v_fech.id
       RETURNING * INTO v_fech;
    END IF;
  END IF;

  RETURN jsonb_build_object('ok',true,'fechamento', to_jsonb(v_fech));
END $function$;