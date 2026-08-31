from pathlib import Path

p = Path('src/components/payroll/BenefitSignatureGenerator.tsx')
s = p.read_text(encoding='utf-8')

s = s.replace(
"  const [pulling, setPulling] = useState(false);\n",
"  const [pulling, setPulling] = useState(false);\n  const [benefitCompetencia, setBenefitCompetencia] = useState(competencia);\n"
)

anchor = """  const load = async () => {
    if (!companyId || !competencia) return;
    setLoading(true);
    try {
      const [sourceResult, docResult] = await Promise.all([
"""
replacement = """  const resolveBenefitCompetencia = async () => {
    const [portalCompetencias, sourceCompetencias] = await Promise.all([
      (supabase as any)
        .from('payroll_documents')
        .select('competencia,created_at')
        .eq('company_id', companyId)
        .in('document_type', [VR_TYPE, VT_TYPE])
        .eq('is_current', true)
        .eq('confirmed', true)
        .order('competencia', { ascending: false })
        .limit(30),
      (supabase as any)
        .from('documentos_funcionario')
        .select('competencia,created_at')
        .eq('company_id', companyId)
        .neq('origem', 'payroll_portal')
        .in('tipo_documento', ['Recibo VR', 'Recibo VT'])
        .not('competencia', 'is', null)
        .order('competencia', { ascending: false })
        .limit(30),
    ]);
    if (portalCompetencias.error) throw portalCompetencias.error;
    if (sourceCompetencias.error) throw sourceCompetencias.error;

    const competencias = [
      ...(portalCompetencias.data || []).map((row: any) => String(row.competencia || '')),
      ...(sourceCompetencias.data || []).map((row: any) => String(row.competencia || '')),
    ].filter((value: string) => /^\\d{4}-\\d{2}$/.test(value));

    if (!competencias.length) return competencia;

    // VR/VT usam a competência gravada no próprio recibo gerado.
    // Não existe conversão mês atual -> mês seguinte dentro da assinatura.
    // Quando houver recibos futuros já gerados, usa a competência mais recente disponível.
    return [...new Set(competencias)].sort().reverse()[0] || competencia;
  };

  const load = async () => {
    if (!companyId || !competencia) return;
    setLoading(true);
    try {
      const effectiveCompetencia = await resolveBenefitCompetencia();
      setBenefitCompetencia(effectiveCompetencia);
      const [sourceResult, docResult] = await Promise.all([
"""
if anchor not in s:
    raise SystemExit('load anchor not found')
s = s.replace(anchor, replacement)

# Only the two queries inside load should use the resolved benefit competence.
s = s.replace("          .eq('competencia', competencia)\n          .neq('origem', 'payroll_portal')", "          .eq('competencia', effectiveCompetencia)\n          .neq('origem', 'payroll_portal')", 1)
s = s.replace("          .eq('competencia', competencia)\n          .in('document_type', [VR_TYPE, VT_TYPE])", "          .eq('competencia', effectiveCompetencia)\n          .in('document_type', [VR_TYPE, VT_TYPE])", 1)

s = s.replace("competenceLabel(competencia)}.`);", "competenceLabel(benefitCompetencia)}.`);")
s = s.replace("_${competencia}.pdf`;", "_${benefitCompetencia}.pdf`;")
s = s.replace("`${companyId}/${competencia}/beneficios/", "`${companyId}/${benefitCompetencia}/beneficios/")

# Object payload and metadata in pullGenerated.
s = s.replace("          competencia,\n          document_type: docType,", "          competencia: benefitCompetencia,\n          document_type: docType,")
s = s.replace("            competencia_uso: competencia,", "            competencia_uso: benefitCompetencia,")

s = s.replace(
"        <p className=\"mt-2 text-sm font-semibold text-cyan-300\">Competência de uso: {competenceLabel(competencia)}</p>\n        <p className=\"mt-1 text-xs text-muted-foreground\">Regra: benefício pago antecipadamente pertence ao mês de uso. Ex.: gerado em agosto para setembro = competência 09/2026.</p>",
"        <p className=\"mt-2 text-sm font-semibold text-cyan-300\">Competência do benefício detectada: {competenceLabel(benefitCompetencia)}</p>\n        <p className=\"mt-1 text-xs text-muted-foreground\">VR e VT usam exatamente a competência em que foram gerados no Fechamento. Não há migração de um mês para o seguinte dentro da Assinatura Digital.</p>"
)

p.write_text(s, encoding='utf-8')
