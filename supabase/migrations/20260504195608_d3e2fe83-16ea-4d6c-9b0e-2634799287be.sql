CREATE OR REPLACE FUNCTION public.fechamento_filial_breakdown(p_company_id uuid, p_competencia text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r RECORD;
  v_vh NUMERIC; v_he50 NUMERIC; v_he100 NUMERIC; v_totalHE NUMERIC; v_dsr NUMERIC;
  v_falta NUMERIC; v_atraso NUMERIC; v_insal NUMERIC;
  v_inss NUMERIC; v_irrf NUMERIC; v_descVT NUMERIC;
  v_p NUMERIC; v_d NUMERIC; v_liq NUMERIC;
  v_vr NUMERIC; v_va NUMERIC; v_vt NUMERIC;
  v_dias_uteis INT := 22; v_dias_mes INT := 30;
  v_arr JSONB := '[]'::jsonb;
  v_tot_p NUMERIC := 0; v_tot_d NUMERIC := 0; v_tot_b NUMERIC := 0;
BEGIN
  BEGIN
    v_dias_mes := EXTRACT(DAY FROM (date_trunc('month', to_date(p_competencia||'-01','YYYY-MM-DD')) + INTERVAL '1 month - 1 day'))::int;
  EXCEPTION WHEN OTHERS THEN v_dias_mes := 30; END;

  FOR r IN
    SELECT lm.*, f.nome AS func_nome, f.cargo, f.salario_base,
           f.insalubridade_ativa, f.insalubridade_valor,
           f.vr_ativo, f.vr_diario, f.va_ativo, f.va_mensal, f.vt_ativo, f.vt_diario
      FROM public.lancamentos_mensais lm
      JOIN public.funcionarios f ON f.id = lm.funcionario_id
     WHERE lm.company_id = p_company_id
       AND lm.competencia = p_competencia
       AND lm.apagado_em IS NULL
     ORDER BY f.nome
  LOOP
    v_vh    := COALESCE(r.salario_base,0)/220.0;
    v_he50  := v_vh*1.5*COALESCE(r.he50,0);
    v_he100 := v_vh*2.0*COALESCE(r.he100,0);
    v_totalHE := v_he50 + v_he100;
    v_dsr   := CASE WHEN v_dias_uteis>0 THEN v_totalHE/v_dias_uteis*(v_dias_mes-v_dias_uteis) ELSE 0 END;
    v_falta := COALESCE(r.salario_base,0)/30.0*COALESCE(r.faltas_dias,0);
    v_atraso:= v_vh*COALESCE(r.atrasos,0);
    v_insal := CASE WHEN r.insalubridade_aplicada AND r.insalubridade_ativa THEN COALESCE(r.insalubridade_valor,0) ELSE 0 END;
    v_p := COALESCE(r.salario_base,0)+v_he50+v_he100+v_dsr+COALESCE(r.adicionais,0)+v_insal+COALESCE(r.comissao_base,0);
    v_inss := public.calc_inss(v_p);
    v_irrf := public.calc_irrf(v_p - v_inss);
    v_descVT := CASE WHEN r.vt_aplicado AND r.vt_ativo THEN ROUND(COALESCE(r.salario_base,0)*0.06::numeric,2) ELSE 0 END;
    v_d := v_falta+v_atraso+COALESCE(r.descontos_diversos,0)+COALESCE(r.adiantamento,0)+v_inss+v_irrf+v_descVT+COALESCE(r.vt_desconto,0);
    v_liq := v_p - v_d;
    v_vr := CASE WHEN r.vr_aplicado AND r.vr_ativo THEN COALESCE(r.vr_diario,0)*GREATEST(0, COALESCE(r.vr_dias,v_dias_uteis)-COALESCE(r.faltas_dias,0)) ELSE 0 END;
    v_va := CASE WHEN r.va_aplicado AND r.va_ativo THEN COALESCE(r.va_mensal,0) ELSE 0 END;
    v_vt := CASE WHEN r.vt_aplicado AND r.vt_ativo THEN COALESCE(r.vt_diario,0)*GREATEST(0,v_dias_uteis-COALESCE(r.faltas_dias,0)) ELSE 0 END;

    v_tot_p := v_tot_p + v_p; v_tot_d := v_tot_d + v_d; v_tot_b := v_tot_b + v_vr + v_va + v_vt;

    v_arr := v_arr || jsonb_build_object(
      'lancamento_id', r.id, 'funcionario_id', r.funcionario_id, 'nome', r.func_nome, 'cargo', r.cargo,
      'salario_base', ROUND(COALESCE(r.salario_base,0),2),
      'he50_horas', r.he50, 'he50_valor', ROUND(v_he50,2),
      'he100_horas', r.he100, 'he100_valor', ROUND(v_he100,2),
      'dsr', ROUND(v_dsr,2),
      'adicionais', ROUND(COALESCE(r.adicionais,0),2),
      'insalubridade', ROUND(v_insal,2),
      'comissao', ROUND(COALESCE(r.comissao_base,0),2),
      'faltas_dias', r.faltas_dias, 'faltas_valor', ROUND(v_falta,2),
      'atrasos_horas', r.atrasos, 'atrasos_valor', ROUND(v_atraso,2),
      'descontos_diversos', ROUND(COALESCE(r.descontos_diversos,0),2),
      'adiantamento', ROUND(COALESCE(r.adiantamento,0),2),
      'inss', ROUND(v_inss,2), 'irrf', ROUND(v_irrf,2),
      'vt_desconto_6', ROUND(v_descVT,2), 'vt_desconto_extra', ROUND(COALESCE(r.vt_desconto,0),2),
      'vr', ROUND(v_vr,2), 'va', ROUND(v_va,2), 'vt', ROUND(v_vt,2),
      'proventos', ROUND(v_p,2), 'descontos', ROUND(v_d,2), 'liquido', ROUND(v_liq,2)
    );
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'dias_mes', v_dias_mes, 'dias_uteis', v_dias_uteis,
    'totais', jsonb_build_object(
      'proventos', ROUND(v_tot_p,2),
      'descontos', ROUND(v_tot_d,2),
      'liquido',   ROUND(v_tot_p - v_tot_d,2),
      'beneficios',ROUND(v_tot_b,2)
    ),
    'funcionarios', v_arr
  );
END $$;