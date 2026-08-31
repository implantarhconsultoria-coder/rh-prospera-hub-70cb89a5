from pathlib import Path

# 1) Edição de benefícios: reconhecer pagamento existente e criar complemento separado.
p = Path('src/components/BenefitValuePaymentEditor.tsx')
s = p.read_text(encoding='utf-8')
s = s.replace("  payment_reason?: string | null;\n  extracted_data?: any;", "  payment_reason?: string | null;\n  payment_state?: 'GERADO' | 'PAGO' | null;\n  extracted_data?: any;")
s = s.replace(".select('id,competencia,net_amount,is_current,status,payment_event_id,payment_kind,payment_sequence,entitlement_amount,prior_paid_amount,payment_reason,extracted_data,created_at')", ".select('id,competencia,net_amount,is_current,status,payment_event_id,payment_kind,payment_sequence,entitlement_amount,prior_paid_amount,payment_reason,payment_state,extracted_data,created_at')")
s = s.replace(".select('id,net_amount,is_current,status,payment_sequence')", ".select('id,net_amount,is_current,status,payment_sequence,payment_state')")
needle = "      const nextSequence = Math.max(context.sequence, ...liveRows.map((row: any) => Number(row.payment_sequence || 1)), 0) + 1;\n      const eventId = crypto.randomUUID();"
replacement = """      // Entrar pela Edição de Benefícios com um recibo já existente significa
      // que esse pagamento anterior deve ser preservado. Ele passa a ser a base
      // paga e somente a diferença vira um novo evento/recibo complementar.
      const liveIds = liveRows.map((row: any) => row.id).filter(Boolean);
      if (liveIds.length) {
        const { error: paidStateError } = await (supabase as any)
          .from('payroll_documents')
          .update({ payment_state: 'PAGO', updated_at: new Date().toISOString() })
          .in('id', liveIds);
        if (paidStateError) throw paidStateError;
      }

      const nextSequence = Math.max(context.sequence, ...liveRows.map((row: any) => Number(row.payment_sequence || 1)), 0) + 1;
      const eventId = crypto.randomUUID();"""
if needle not in s:
    raise SystemExit('BenefitValuePaymentEditor: anchor nextSequence not found')
s = s.replace(needle, replacement)
s = s.replace("        payment_reason: reason.trim(),\n        extracted_data:", "        payment_reason: reason.trim(),\n        payment_state: 'GERADO',\n        extracted_data:")
p.write_text(s, encoding='utf-8')

# 2) EmployeeDetailPage: VR/VT deixam de auto-salvar campo cru e passam pelo editor consciente de pagamento.
p = Path('src/pages/EmployeeDetailPage.tsx')
s = p.read_text(encoding='utf-8')
import_anchor = "import { prepareDocumentTextForSave } from '@/lib/documentoHistoricoTexto';\n"
if import_anchor not in s:
    raise SystemExit('EmployeeDetailPage: import anchor not found')
s = s.replace(import_anchor, import_anchor + "import BenefitValuePaymentEditor from '@/components/BenefitValuePaymentEditor';\n")
old_vr = "{emp.vrAtivo && <Field label=\"Valor Diário VR\" {...fieldFor('vrDiario', 'number')} />}"
new_vr = """{emp.vrAtivo && (
              <BenefitValuePaymentEditor
                benefitType="VR"
                employee={emp}
                company={company}
                currentValue={emp.vrDiario}
                onUpdateValue={(value) => updateEmployee(emp.id, { vrDiario: value })}
                actorId={session?.user?.id}
              />
            )}"""
if old_vr not in s:
    raise SystemExit('EmployeeDetailPage: VR field anchor not found')
s = s.replace(old_vr, new_vr)
old_vt = "{emp.vtAtivo && <Field label=\"Valor Diário VT\" {...fieldFor('vtDiario', 'number')} />}"
new_vt = """{emp.vtAtivo && (
              <BenefitValuePaymentEditor
                benefitType="VT"
                employee={emp}
                company={company}
                currentValue={emp.vtDiario}
                onUpdateValue={(value) => updateEmployee(emp.id, { vtDiario: value })}
                actorId={session?.user?.id}
              />
            )}"""
if old_vt not in s:
    raise SystemExit('EmployeeDetailPage: VT field anchor not found')
s = s.replace(old_vt, new_vt)
p.write_text(s, encoding='utf-8')

# 3) Gerador de VT: só atualiza o evento ORIGINAL. Complementos nunca são substituídos pelo lote.
p = Path('src/pages/RelatorioVTPage.tsx')
s = p.read_text(encoding='utf-8')
old_query = """    const { data: current, error: currentError } = await (supabase as any).from('payroll_documents')
      .select('id,document_sha256,confirmed,is_current')
      .eq('company_id', block.company.id)
      .eq('employee_id', row.emp.id)
      .eq('competencia', competencia)
      .eq('document_type', VT_DOCUMENT_TYPE)
      .eq('is_current', true)
      .maybeSingle();
    if (currentError) throw currentError;
    if (current?.document_sha256 === hash && current?.confirmed) return false;
"""
new_query = """    const { data: current, error: currentError } = await (supabase as any).from('payroll_documents')
      .select('id,document_sha256,confirmed,is_current,payment_event_id,payment_kind,payment_sequence,payment_state')
      .eq('company_id', block.company.id)
      .eq('employee_id', row.emp.id)
      .eq('competencia', competencia)
      .eq('document_type', VT_DOCUMENT_TYPE)
      .eq('payment_kind', 'ORIGINAL')
      .eq('is_current', true)
      .maybeSingle();
    if (currentError) throw currentError;
    // Pagamento original já reconhecido como pago: nunca recalcular/substituir aqui.
    // Diferenças posteriores pertencem à Edição de Benefícios e viram outro recibo.
    if (current?.payment_state === 'PAGO') return false;
    if (current?.document_sha256 === hash && current?.confirmed) return false;
    const paymentEventId = current?.payment_event_id || crypto.randomUUID();
"""
if old_query not in s:
    raise SystemExit('RelatorioVTPage: current query anchor not found')
s = s.replace(old_query, new_query)
insert_anchor = """      net_amount: row.valorTotal,
      extracted_data: {
"""
insert_repl = """      net_amount: row.valorTotal,
      payment_event_id: paymentEventId,
      payment_kind: 'ORIGINAL',
      payment_sequence: 1,
      payment_state: 'GERADO',
      entitlement_amount: row.valorTotal,
      prior_paid_amount: 0,
      payment_reason: row.correcaoMotivo || row.motivo || 'Pagamento original de VT',
      extracted_data: {
"""
if insert_anchor not in s:
    raise SystemExit('RelatorioVTPage: insert anchor not found')
s = s.replace(insert_anchor, insert_repl, 1)
old_correction = """    await persistGeneration(correctedBlock, session.user.id);
    await syncPayrollDocument(correctedBlock, correctedRow, session.user.id);
    setGeneratedBlocks(prev => prev.map(block => block.company.id === correctedBlock.company.id ? correctedBlock : block));
    toast.success('Ajuste aplicado no relatório, recibo e documento pendente de assinatura.');
"""
new_correction = """    await persistGeneration(correctedBlock, session.user.id);
    const synced = await syncPayrollDocument(correctedBlock, correctedRow, session.user.id);
    setGeneratedBlocks(prev => prev.map(block => block.company.id === correctedBlock.company.id ? correctedBlock : block));
    if (synced) {
      toast.success('Ajuste aplicado no relatório, recibo e documento pendente de assinatura.');
    } else {
      toast.info('Pagamento original já está preservado. Para acrescentar valor após pagamento, use a Edição de Benefícios.');
    }
"""
if old_correction not in s:
    raise SystemExit('RelatorioVTPage: correction anchor not found')
s = s.replace(old_correction, new_correction)
p.write_text(s, encoding='utf-8')

# 4) Portal de assinatura: diferenciar visualmente recibo complementar.
p = Path('api/payroll-public.ts')
s = p.read_text(encoding='utf-8')
old_label = """const documentLabel = (type: string) => {
  if (type === BENEFICIO_VR) return 'Recibo VR';
  if (type === BENEFICIO_VT) return 'Recibo VT';
  if (type === BENEFICIO) return 'Recibo VR / VT';
  if (type === ADIANTAMENTO) return 'Recibo de Adiantamento';
  return 'Holerite';
};
"""
new_label = """const documentLabel = (type: string, paymentKind?: string | null) => {
  const complement = paymentKind === 'COMPLEMENTAR';
  if (type === BENEFICIO_VR) return complement ? 'Recibo VR — Pagamento complementar' : 'Recibo VR';
  if (type === BENEFICIO_VT) return complement ? 'Recibo VT — Pagamento complementar' : 'Recibo VT';
  if (type === BENEFICIO) return complement ? 'Recibo VR / VT — Pagamento complementar' : 'Recibo VR / VT';
  if (type === ADIANTAMENTO) return 'Recibo de Adiantamento';
  return 'Holerite';
};
"""
if old_label not in s:
    raise SystemExit('payroll-public: label anchor not found')
s = s.replace(old_label, new_label)
s = s.replace(".select('id,company_id,employee_id,competencia,document_type,document_version,net_amount,confirmed,status,is_current,created_at')", ".select('id,company_id,employee_id,competencia,document_type,document_version,net_amount,confirmed,status,is_current,created_at,payment_kind,payment_sequence,payment_reason')", 1)
s = s.replace("document_label: documentLabel(doc.document_type),", "document_label: documentLabel(doc.document_type, doc.payment_kind),\n        payment_sequence: doc.payment_sequence || 1,\n        payment_reason: doc.payment_reason || null,", 1)
p.write_text(s, encoding='utf-8')

# 5) Arquivo do funcionário: manter os dois recibos e identificar o complementar.
p = Path('api/payroll-archive.ts')
s = p.read_text(encoding='utf-8')
s = s.replace(".select('id,document_type,competencia,storage_bucket,storage_path,original_filename,created_at,confirmed_at,is_current,confirmed,extracted_data')", ".select('id,document_type,competencia,storage_bucket,storage_path,original_filename,created_at,confirmed_at,is_current,confirmed,extracted_data,payment_kind,payment_sequence,payment_reason')", 1)
old_archive_label = """    const label = doc.document_type === 'BENEFICIO_VR' ? 'Recibo VR' : doc.document_type === 'BENEFICIO_VT' ? 'Recibo VT' : doc.document_type === 'BENEFICIO_VR_VT' ? 'Recibo VR / VT' : doc.document_type === 'ADIANTAMENTO' ? 'Recibo de Adiantamento' : 'Holerite';
"""
new_archive_label = """    const complement = doc.payment_kind === 'COMPLEMENTAR';
    const baseLabel = doc.document_type === 'BENEFICIO_VR' ? 'Recibo VR' : doc.document_type === 'BENEFICIO_VT' ? 'Recibo VT' : doc.document_type === 'BENEFICIO_VR_VT' ? 'Recibo VR / VT' : doc.document_type === 'ADIANTAMENTO' ? 'Recibo de Adiantamento' : 'Holerite';
    const label = complement && benefitTypes.length ? `${baseLabel} — Pagamento complementar` : baseLabel;
"""
if old_archive_label not in s:
    raise SystemExit('payroll-archive: label anchor not found')
s = s.replace(old_archive_label, new_archive_label)
s = s.replace("      signed_at: signature?.signed_at || null,\n      url,", "      signed_at: signature?.signed_at || null,\n      payment_sequence: doc.payment_sequence || 1,\n      payment_reason: doc.payment_reason || null,\n      url,", 1)
p.write_text(s, encoding='utf-8')
