import fs from 'node:fs';

const file = 'src/pages/AvisoFeriasPage.tsx';
if (!fs.existsSync(file)) process.exit(0);

let source = fs.readFileSync(file, 'utf8');
let changed = false;

const stateNeedle = "  const [feriasAvisos, setFeriasAvisos] = useState<FeriasAvisoRow[]>([]);\n";
const stateInsert = `${stateNeedle}  const [officialPeriods, setOfficialPeriods] = useState<any[]>([]);\n`;
if (!source.includes('const [officialPeriods, setOfficialPeriods]')) {
  if (!source.includes(stateNeedle)) throw new Error('[ferias-oficial] ponto de estado nao encontrado');
  source = source.replace(stateNeedle, stateInsert);
  changed = true;
}

const effectMarker = "  useEffect(() => {\n    if (!selectedEmpId) return;";
const officialBlock = `  const officialByEmployee = useMemo(() => {\n    const latestRefByCompany = new Map<string, string>();\n    officialPeriods.forEach((period: any) => {\n      const companyId = String(period.company_id || '');\n      const reference = String(period.referencia || '');\n      if (!companyId) return;\n      if (reference > (latestRefByCompany.get(companyId) || '')) latestRefByCompany.set(companyId, reference);\n    });\n\n    const map = new Map<string, any[]>();\n    officialPeriods\n      .filter((period: any) => String(period.referencia || '') === latestRefByCompany.get(String(period.company_id || '')))\n      .forEach((period: any) => {\n        if (!period.funcionario_id) return;\n        const current = map.get(period.funcionario_id) || [];\n        map.set(period.funcionario_id, [...current, period].sort((a, b) => String(a.data_limite || '').localeCompare(String(b.data_limite || ''))));\n      });\n    return map;\n  }, [officialPeriods]);\n\n  useEffect(() => {\n    const loadOfficialPeriods = async () => {\n      const employeeIds = employees\n        .filter(e => e.status === 'ativo' && e.categoria === 'operacional')\n        .filter(e => !isFilial || e.companyId === filialCompanyId)\n        .map(e => e.id);\n      if (!employeeIds.length) { setOfficialPeriods([]); return; }\n\n      const { data, error } = await (supabase as any)\n        .from('ferias_periodos_oficiais')\n        .select('id,company_id,funcionario_id,funcionario_codigo,data_admissao,periodo_aquisitivo_inicio,periodo_aquisitivo_fim,data_limite,dias_direito,referencia')\n        .in('funcionario_id', employeeIds)\n        .order('referencia', { ascending: false })\n        .order('data_limite', { ascending: true });\n      if (error) {\n        console.error('[ferias-oficial-resumo]', error);\n        setOfficialPeriods([]);\n        return;\n      }\n      setOfficialPeriods(data || []);\n    };\n    void loadOfficialPeriods();\n  }, [employees, isFilial, filialCompanyId]);\n\n`;
if (!source.includes('const officialByEmployee = useMemo')) {
  if (!source.includes(effectMarker)) throw new Error('[ferias-oficial] ponto de efeito nao encontrado');
  source = source.replace(effectMarker, officialBlock + effectMarker);
  changed = true;
}

const oldMap = `      .map(e => {\n        const fer = buildFeriasInfo(e.dataAdmissao, feriasByEmployee.get(e.id));\n        return { ...e, ferCode: fer.code, ferStatus: fer.status, ferLabel: fer.label, ferMeses: fer.mesesNoPeriodo, ferInicio: fer.inicio, ferFim: fer.fim };\n      })`;
const newMap = `      .map(e => {\n        const aviso = feriasByEmployee.get(e.id);\n        const fallback = buildFeriasInfo(e.dataAdmissao, aviso);\n        const periods = officialByEmployee.get(e.id) || [];\n        const now = todayISO();\n        const acquired = periods.filter((period: any) => String(period.periodo_aquisitivo_fim || '') <= now);\n        const target = (acquired.length ? acquired : periods)[0];\n        if (!target) return { ...e, ferCode: fallback.code, ferStatus: fallback.status, ferLabel: fallback.label, ferMeses: fallback.mesesNoPeriodo, ferInicio: fallback.inicio, ferFim: fallback.fim };\n\n        const livePeriod = aviso?.periodo_gozo_inicio\n          ? feriasPeriodoStatus(aviso.periodo_gozo_inicio, aviso.periodo_gozo_fim || aviso.data_retorno)\n          : null;\n        const liveSchedule = livePeriod && (livePeriod.code === 'marcada' || livePeriod.code === 'em_ferias');\n        const daysRight = Number(target.dias_direito || 0);\n        const limit = String(target.data_limite || '');\n        const acquisitionEnd = String(target.periodo_aquisitivo_fim || '');\n        const daysToLimit = limit ? Math.floor((toDateOnly(limit).getTime() - toDateOnly(now).getTime()) / 86400000) : 99999;\n\n        let code: FeriasStatusCode = 'em_dia';\n        let label = 'Em dia';\n        if (liveSchedule && livePeriod) {\n          code = livePeriod.code;\n          label = livePeriod.label;\n        } else if (acquisitionEnd > now) {\n          code = 'em_dia';\n          label = \\`Em aquisição · \\${daysRight.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}d · limite \\${formatDate(limit)}\\`;\n        } else if (limit && limit < now) {\n          code = 'vencido';\n          label = \\`Vencido · \\${daysRight.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}d · limite \\${formatDate(limit)}\\`;\n        } else if (daysToLimit <= 30) {\n          code = 'atencao';\n          label = \\`Prazo crítico · \\${daysRight.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}d · limite \\${formatDate(limit)}\\`;\n        } else {\n          code = 'em_dia';\n          label = \\`A vencer · \\${daysRight.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}d · limite \\${formatDate(limit)}\\`;\n        }\n\n        return { ...e, ferCode: code, ferStatus: legacyBadgeStatus(code), ferLabel: label, ferMeses: fallback.mesesNoPeriodo, ferInicio: liveSchedule ? aviso?.periodo_gozo_inicio : undefined, ferFim: liveSchedule ? (aviso?.periodo_gozo_fim || aviso?.data_retorno) : undefined };\n      })`;
if (!source.includes('const periods = officialByEmployee.get(e.id) || []')) {
  if (!source.includes(oldMap)) throw new Error('[ferias-oficial] bloco de resumo nao encontrado');
  source = source.replace(oldMap, newMap);
  source = source.replace(
    '  }, [employees, search, filterCompany, isFilial, filialCompanyId, feriasByEmployee]);',
    '  }, [employees, search, filterCompany, isFilial, filialCompanyId, feriasByEmployee, officialByEmployee]);',
  );
  changed = true;
}

if (changed) fs.writeFileSync(file, source, 'utf8');
console.log('[ferias-oficial] resumo do Aviso de Ferias vinculado a escala oficial');
