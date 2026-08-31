from pathlib import Path

p = Path('src/pages/RescisaoPage.tsx')
s = p.read_text(encoding='utf-8')

old = '''  useEffect(() => {
    if (!emp) {
      setDescontos([]);
      return;
    }
    const competencia = dataDesligamento.slice(0, 7);
    const entry = entries.find((item) => item.employeeId === emp.id && item.competencia === competencia);
    const automaticos: RescisaoDescontoInput[] = [];
    const faltasDias = Number(entry?.faltasDias) || 0;
    if (faltasDias > 0) automaticos.push({
      id: 'auto-faltas', tipo: 'faltas', descricao: `Faltas (${faltasDias} dia(s))`,
      valor: Math.round(((Number(emp.salarioBase) || 0) / 30) * faltasDias * 100) / 100,
      observacao: `Importado do fechamento de ${competencia}.`, automatico: true,
    });
    if ((Number(entry?.adiantamento) || 0) > 0) automaticos.push({
      id: 'auto-adiantamento', tipo: 'adiantamento_salarial', descricao: 'Adiantamento salarial',
      valor: Number(entry?.adiantamento) || 0, observacao: `Importado do fechamento de ${competencia}.`, automatico: true,
    });
    if ((Number(entry?.vtDesconto) || 0) > 0) automaticos.push({
      id: 'auto-vt', tipo: 'vale_transporte', descricao: 'Vale-transporte',
      valor: Number(entry?.vtDesconto) || 0, observacao: `Importado do fechamento de ${competencia}.`, automatico: true,
    });
    if ((Number(entry?.descontosDiversos) || 0) > 0) automaticos.push({
      id: 'auto-outros', tipo: 'outros', descricao: 'Descontos diversos do fechamento',
      valor: Number(entry?.descontosDiversos) || 0, observacao: `Importado do fechamento de ${competencia}.`, automatico: true,
    });
    setDescontos(automaticos);
  }, [empId, dataDesligamento, entries]);
'''

new = '''  useEffect(() => {
    let active = true;

    const loadAutomaticDiscounts = async () => {
      if (!emp) {
        setDescontos([]);
        return;
      }

      const competenciaFolha = dataDesligamento.slice(0, 7);
      const [year, month] = competenciaFolha.split('-').map(Number);
      const nextDate = new Date(year, month, 1);
      const competenciaBeneficioSeguinte = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;
      const entry = entries.find((item) => item.employeeId === emp.id && item.competencia === competenciaFolha);
      const automaticos: RescisaoDescontoInput[] = [];

      const faltasDias = Number(entry?.faltasDias) || 0;
      if (faltasDias > 0) automaticos.push({
        id: 'auto-faltas', tipo: 'faltas', descricao: `Faltas (${faltasDias} dia(s))`,
        valor: Math.round(((Number(emp.salarioBase) || 0) / 30) * faltasDias * 100) / 100,
        observacao: `Importado do fechamento de ${competenciaFolha}.`, automatico: true,
      });
      if ((Number(entry?.adiantamento) || 0) > 0) automaticos.push({
        id: 'auto-adiantamento', tipo: 'adiantamento_salarial', descricao: 'Adiantamento salarial',
        valor: Number(entry?.adiantamento) || 0, observacao: `Importado do fechamento de ${competenciaFolha}.`, automatico: true,
      });
      if ((Number(entry?.descontosDiversos) || 0) > 0) automaticos.push({
        id: 'auto-outros', tipo: 'outros', descricao: 'Descontos diversos do fechamento',
        valor: Number(entry?.descontosDiversos) || 0, observacao: `Importado do fechamento de ${competenciaFolha}.`, automatico: true,
      });

      let benefitFound = { vr: false, vt: false };
      try {
        const { data: generationRows, error: generationError } = await (supabase as any)
          .from('benefit_generations')
          .select('tipo,competencia,report_snapshot,generated_at,updated_at,data_pagamento')
          .eq('company_id', emp.companyId)
          .in('tipo', ['vr', 'vt'])
          .in('competencia', [competenciaBeneficioSeguinte, competenciaFolha])
          .order('competencia', { ascending: false })
          .order('updated_at', { ascending: false });
        if (generationError) throw generationError;

        const rows = generationRows || [];
        const findGeneratedBenefit = (kind: 'vr' | 'vt') => {
          for (const generation of rows) {
            if (generation.tipo !== kind) continue;
            const snapshot = Array.isArray(generation.report_snapshot) ? generation.report_snapshot : [];
            const employeeRow = snapshot.find((item: any) => item?.employee_id === emp.id);
            const value = Number(employeeRow?.valor_total) || 0;
            if (employeeRow && value > 0) return { generation, employeeRow, value };
          }
          return null;
        };

        const vr = findGeneratedBenefit('vr');
        const vt = findGeneratedBenefit('vt');

        if (vr) {
          benefitFound.vr = true;
          automaticos.push({
            id: 'auto-vr-beneficio',
            tipo: 'vale_refeicao',
            descricao: `Vale-refeição — benefício ${vr.generation.competencia}`,
            valor: Math.round(vr.value * 100) / 100,
            observacao: `Importado automaticamente do VR já gerado/fechado para ${vr.generation.competencia}${vr.generation.data_pagamento ? ` (pagamento ${vr.generation.data_pagamento})` : ''}.`,
            automatico: true,
          });
        }
        if (vt) {
          benefitFound.vt = true;
          automaticos.push({
            id: 'auto-vt-beneficio',
            tipo: 'vale_transporte',
            descricao: `Vale-transporte — benefício ${vt.generation.competencia}`,
            valor: Math.round(vt.value * 100) / 100,
            observacao: `Importado automaticamente do VT já gerado/fechado para ${vt.generation.competencia}${vt.generation.data_pagamento ? ` (pagamento ${vt.generation.data_pagamento})` : ''}.`,
            automatico: true,
          });
        }
      } catch (error: any) {
        console.warn('[rescisao-beneficios-automaticos]', error?.message || error);
      }

      // Compatibilidade: se ainda não existir um fechamento/geração real de VT,
      // mantém o desconto legado da folha. Quando existe VT gerado, não duplica.
      if (!benefitFound.vt && (Number(entry?.vtDesconto) || 0) > 0) automaticos.push({
        id: 'auto-vt', tipo: 'vale_transporte', descricao: 'Vale-transporte',
        valor: Number(entry?.vtDesconto) || 0, observacao: `Importado do fechamento de ${competenciaFolha}.`, automatico: true,
      });

      if (active) setDescontos(automaticos);
    };

    void loadAutomaticDiscounts();
    return () => { active = false; };
  }, [empId, dataDesligamento, entries, emp?.companyId]);
'''

if old not in s:
    raise SystemExit('target automatic discount block not found')

s = s.replace(old, new, 1)
p.write_text(s, encoding='utf-8')
