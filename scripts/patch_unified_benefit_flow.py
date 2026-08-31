from pathlib import Path

# 1) Edição de Benefícios: recibo gerado é a base; não existe marcação artificial de PAGO.
p = Path('src/components/BenefitValuePaymentEditor.tsx')
s = p.read_text(encoding='utf-8')
s = s.replace(
"""      const reference = sameCompetencia.find(row => Number(row.extracted_data?.dias_finais || 0) > 0)
        || sameCompetencia.find(row => Number(row.extracted_data?.dias_pagos || 0) > 0)
        || sameCompetencia[0];""",
"""      const reference = currentDocs.find(row => row.payment_kind === 'ORIGINAL' && Number(row.extracted_data?.dias_finais || 0) > 0)
        || currentDocs.find(row => row.payment_kind === 'ORIGINAL' && Number(row.extracted_data?.dias_pagos || 0) > 0)
        || currentDocs.find(row => Number(row.extracted_data?.dias_finais || 0) > 0)
        || currentDocs.find(row => Number(row.extracted_data?.dias_pagos || 0) > 0)
        || currentDocs[0]
        || sameCompetencia[0];"""
)
old_paid = """      const liveIds = liveRows.map((row: any) => row.id).filter(Boolean);
      if (liveIds.length) {
        const { error: paidStateError } = await (supabase as any)
          .from('payroll_documents')
          .update({ payment_state: 'PAGO', updated_at: new Date().toISOString() })
          .in('id', liveIds);
        if (paidStateError) throw paidStateError;
      }

"""
if old_paid not in s:
    raise SystemExit('BenefitValuePaymentEditor: paid-state block not found')
s = s.replace(old_paid, '')
p.write_text(s, encoding='utf-8')

# 2) VT: gerar sempre manda original para assinatura. Depois de assinado ou de existir complemento, original fica congelado.
p = Path('src/pages/RelatorioVTPage.tsx')
s = p.read_text(encoding='utf-8')
old = """    // Pagamento original já reconhecido como pago: nunca recalcular/substituir aqui.
    // Diferenças posteriores pertencem à Edição de Benefícios e viram outro recibo.
    if (current?.payment_state === 'PAGO') return false;
    if (current?.document_sha256 === hash && current?.confirmed) return false;
    const paymentEventId = current?.payment_event_id || crypto.randomUUID();
"""
new = """    // O recibo original pode ser regerado/corrigido enquanto ainda não foi assinado
    // e enquanto não existir complemento. Depois disso, ele vira base imutável.
    if (current?.id) {
      const [{ data: complementRows, error: complementError }, { data: signatureRow, error: signatureError }] = await Promise.all([
        (supabase as any).from('payroll_documents')
          .select('id')
          .eq('company_id', block.company.id)
          .eq('employee_id', row.emp.id)
          .eq('competencia', competencia)
          .eq('document_type', VT_DOCUMENT_TYPE)
          .eq('payment_kind', 'COMPLEMENTAR')
          .eq('is_current', true)
          .limit(1),
        (supabase as any).from('payroll_signatures')
          .select('id')
          .eq('document_id', current.id)
          .limit(1),
      ]);
      if (complementError) throw complementError;
      if (signatureError) throw signatureError;
      if ((complementRows || []).length || (signatureRow || []).length) return false;
    }
    if (current?.document_sha256 === hash && current?.confirmed) return false;
    const paymentEventId = current?.payment_event_id || crypto.randomUUID();
"""
if old not in s:
    raise SystemExit('RelatorioVTPage: payment-state guard not found')
s = s.replace(old, new)
p.write_text(s, encoding='utf-8')

# 3) VR: ao clicar Gerar Relatório, já gerar recibos individuais e enviar para Assinatura Digital.
p = Path('src/pages/RelatorioVRPage.tsx')
s = p.read_text(encoding='utf-8')
import_anchor = "import ReciboCorrecaoModal from '@/components/ReciboCorrecaoModal';\n"
imports = """import ReciboCorrecaoModal from '@/components/ReciboCorrecaoModal';
import { supabase } from '@/integrations/supabase/client';
import { sha256Browser } from '@/lib/payrollDocuments';
import { buildVRReceiptPdfBlob } from '@/lib/vrReceiptPdf';
"""
if import_anchor not in s:
    raise SystemExit('RelatorioVRPage: import anchor not found')
s = s.replace(import_anchor, imports, 1)

const_anchor = "const ALL_COMPANIES = 'todas';\n"
consts = """const ALL_COMPANIES = 'todas';
const PAYROLL_BUCKET = 'payroll-private';
const VR_DOCUMENT_TYPE = 'BENEFICIO_VR';
const normalizeEmployeeText = (value: unknown) => String(value || '')
  .normalize('NFD')
  .replace(/[\\u0300-\\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();
const isSignatureExcluded = (employee: any) => {
  const cargo = normalizeEmployeeText(employee?.cargo);
  return cargo.includes('socio') || cargo.includes('pro labore') || cargo.includes('prolabore');
};
const safeFile = (value: string) => value
  .normalize('NFD')
  .replace(/[\\u0300-\\u036f]/g, '')
  .replace(/[^A-Za-z0-9._-]+/g, '_')
  .slice(0, 100);
"""
if const_anchor not in s:
    raise SystemExit('RelatorioVRPage: const anchor not found')
s = s.replace(const_anchor, consts, 1)

old_destructure = "const { companies, employees, entries, getOrCreateEntries, addBenefitReport, getFechamento, userRoles, updateEmployee, refreshData } = useApp();"
new_destructure = "const { companies, employees, entries, getOrCreateEntries, addBenefitReport, getFechamento, userRoles, updateEmployee, refreshData, session } = useApp();"
if old_destructure not in s:
    raise SystemExit('RelatorioVRPage: useApp destructure not found')
s = s.replace(old_destructure, new_destructure, 1)

old_generate = """  const handleGenerate = () => {
    if (!selectedCompany) { toast.error('Selecione uma empresa'); return; }
    reportCompanyIds.forEach(companyId => getOrCreateEntries(companyId, competencia));
    setGenerated(true);
    setSelectedEmployees(new Set());
    toast.success(isAllCompanies ? 'Relatório de VR de todas as empresas gerado!' : 'Relatório de VR gerado!');
  };
"""
new_generate = """  const applyGenerationCorrection = (row: BenefitReportRow, companyId: string) => {
    const correction = correcoes.findFor('vr', companyId, row.emp.id, competencia);
    if (!correction) return row;
    return {
      ...row,
      valorDiario: Number(correction.valor_diario_corrigido ?? row.valorDiario),
      diasFinais: Number(correction.dias_finais_corrigido ?? row.diasFinais),
      valorTotal: Number(correction.valor_total_corrigido ?? row.valorTotal),
      corrigido: true,
      correcaoMotivo: correction.motivo || null,
      correcaoObservacao: correction.observacao || null,
      ...(correction.data_pagamento ? { dataPagamentoCorrecao: correction.data_pagamento } : {}),
    } as BenefitReportRow;
  };

  const persistVrGeneration = async (company: any, generationRows: BenefitReportRow[], actorId: string) => {
    const snapshot = generationRows.map(row => ({
      employee_id: row.emp.id,
      employee_name: row.emp.name,
      cargo: row.emp.cargo,
      valor_diario: row.valorDiario,
      dias_previstos: row.diasPrevistos,
      dias_descontados: row.diasDescontados,
      dias_finais: row.diasFinais,
      valor_total: row.valorTotal,
      motivo: row.motivo || null,
      correcao_motivo: row.correcaoMotivo || null,
      correcao_observacao: row.correcaoObservacao || null,
      data_pagamento_individual: (row as any).dataPagamentoCorrecao || null,
    }));
    const { error } = await (supabase as any).from('benefit_generations').upsert({
      tipo: 'vr',
      company_id: company.id,
      competencia,
      dias_pagos: diasUteis,
      data_pagamento: dataPagamentoManual || null,
      report_snapshot: snapshot,
      total: sumBenefitRows(generationRows),
      generated_by: actorId,
      generated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'tipo,company_id,competencia' });
    if (error) throw error;
  };

  const syncVrPayrollDocument = async (company: any, row: BenefitReportRow, actorId: string) => {
    const effectivePaymentDate = (row as any).dataPagamentoCorrecao || dataPagamentoManual || '';
    const blob = buildVRReceiptPdfBlob(company, row, {
      competencia,
      diasPagos: diasUteis,
      dataPagamento: effectivePaymentDate,
    });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const hash = await sha256Browser(bytes);

    const { data: current, error: currentError } = await (supabase as any).from('payroll_documents')
      .select('id,document_sha256,confirmed,is_current,payment_event_id,payment_kind,payment_sequence')
      .eq('company_id', company.id)
      .eq('employee_id', row.emp.id)
      .eq('competencia', competencia)
      .eq('document_type', VR_DOCUMENT_TYPE)
      .eq('payment_kind', 'ORIGINAL')
      .eq('is_current', true)
      .maybeSingle();
    if (currentError) throw currentError;

    if (current?.id) {
      const [{ data: complementRows, error: complementError }, { data: signatureRows, error: signatureError }] = await Promise.all([
        (supabase as any).from('payroll_documents')
          .select('id')
          .eq('company_id', company.id)
          .eq('employee_id', row.emp.id)
          .eq('competencia', competencia)
          .eq('document_type', VR_DOCUMENT_TYPE)
          .eq('payment_kind', 'COMPLEMENTAR')
          .eq('is_current', true)
          .limit(1),
        (supabase as any).from('payroll_signatures')
          .select('id')
          .eq('document_id', current.id)
          .limit(1),
      ]);
      if (complementError) throw complementError;
      if (signatureError) throw signatureError;
      if ((complementRows || []).length || (signatureRows || []).length) return false;
    }
    if (current?.document_sha256 === hash && current?.confirmed) return false;

    const paymentEventId = current?.payment_event_id || crypto.randomUUID();
    const filename = `RECIBO_VR_${safeFile(row.emp.name)}_${competencia}.pdf`;
    const path = `${company.id}/${competencia}/beneficios/${row.emp.id}/vr/${crypto.randomUUID()}-${filename}`;
    const { error: uploadError } = await supabase.storage.from(PAYROLL_BUCKET).upload(
      path,
      new Blob([bytes as any], { type: 'application/pdf' }),
      { contentType: 'application/pdf', upsert: false },
    );
    if (uploadError) throw uploadError;

    const { error: insertError } = await (supabase as any).from('payroll_documents').insert({
      company_id: company.id,
      employee_id: row.emp.id,
      competencia,
      document_type: VR_DOCUMENT_TYPE,
      storage_bucket: PAYROLL_BUCKET,
      storage_path: path,
      original_filename: filename,
      mime_type: 'application/pdf',
      file_size: bytes.byteLength,
      document_sha256: hash,
      source_sha256: hash,
      net_amount: row.valorTotal,
      payment_event_id: paymentEventId,
      payment_kind: 'ORIGINAL',
      payment_sequence: 1,
      payment_state: 'GERADO',
      entitlement_amount: row.valorTotal,
      prior_paid_amount: 0,
      payment_reason: row.correcaoMotivo || row.motivo || 'Pagamento original de VR',
      extracted_data: {
        origem: 'VR_GERADOR',
        dias_pagos: diasUteis,
        data_pagamento: effectivePaymentDate || null,
        valor_diario: row.valorDiario,
        dias_previstos: row.diasPrevistos,
        dias_descontados: row.diasDescontados,
        dias_finais: row.diasFinais,
        motivo: row.motivo || null,
        correcao_motivo: row.correcaoMotivo || null,
        correcao_observacao: row.correcaoObservacao || null,
      },
      match_confidence: 100,
      status: 'AGUARDANDO_ASSINATURA',
      confirmed: true,
      confirmed_at: new Date().toISOString(),
      confirmed_by: actorId,
      created_by: actorId,
    });
    if (insertError) {
      await supabase.storage.from(PAYROLL_BUCKET).remove([path]);
      throw insertError;
    }
    return true;
  };

  const handleGenerate = async () => {
    if (!selectedCompany) { toast.error('Selecione uma empresa'); return; }
    if (!competencia) { toast.error('Selecione a competência'); return; }
    if (!session?.user?.id) { toast.error('Sessão administrativa expirada. Entre novamente.'); return; }

    try {
      const entryPool = [...entries];
      reportCompanyIds.forEach(companyId => {
        const generatedEntries = getOrCreateEntries(companyId, competencia);
        generatedEntries.forEach(entry => {
          if (!entryPool.some(item => item.employeeId === entry.employeeId && item.competencia === entry.competencia)) entryPool.push(entry);
        });
      });

      let synced = 0;
      for (const companyId of reportCompanyIds) {
        const generationCompany = companies.find(c => c.id === companyId);
        if (!generationCompany) continue;
        const generationEmployees = employees
          .filter(emp => emp.companyId === companyId && emp.status === 'ativo' && emp.vrAtivo && !isSignatureExcluded(emp))
          .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
        const companyEntries = entryPool.filter(entry => entry.companyId === companyId && entry.competencia === competencia);
        const generationRows = buildVRReportRows(generationEmployees, companyEntries, diasUteis)
          .map(row => applyGenerationCorrection(row, companyId));
        await persistVrGeneration(generationCompany, generationRows, session.user.id);
        for (const row of generationRows) {
          if (await syncVrPayrollDocument(generationCompany, row, session.user.id)) synced += 1;
        }
      }

      setGenerated(true);
      setSelectedEmployees(new Set());
      toast.success(`VR gerado: relatório + recibos. ${synced} documento(s) liberado(s) automaticamente na Assinatura Digital.`);
    } catch (error: any) {
      console.error('[vr-generation-signature]', error);
      toast.error(`Não foi possível gerar o VR: ${error?.message || error}`);
    }
  };
"""
if old_generate not in s:
    raise SystemExit('RelatorioVRPage: old handleGenerate not found')
s = s.replace(old_generate, new_generate, 1)

old_comp = """  const compEmps = employees
    .filter(e => reportCompanyIds.includes(e.companyId) && e.status === 'ativo')
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));"""
new_comp = """  const compEmps = employees
    .filter(e => reportCompanyIds.includes(e.companyId) && e.status === 'ativo' && e.vrAtivo && !isSignatureExcluded(e))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));"""
if old_comp not in s:
    raise SystemExit('RelatorioVRPage: compEmps anchor not found')
s = s.replace(old_comp, new_comp, 1)
s = s.replace("<FileText className=\"w-4 h-4 mr-2\" /> Gerar Relatório", "<FileText className=\"w-4 h-4 mr-2\" /> Gerar VR", 1)
p.write_text(s, encoding='utf-8')
