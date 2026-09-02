from pathlib import Path
import re


def replace_once(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{path}: expected exactly 1 match, found {count}')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')

# 1) Timestamp oficial vindo do PostgreSQL.
replace_once(
    'api/payroll-public.ts',
    "      const signedAt = new Date().toISOString();",
    "      const { data: authoritativeNow, error: authoritativeNowError } = await service.rpc('payroll_authoritative_now');\n      if (authoritativeNowError || !authoritativeNow) throw new Error('authoritative_signature_clock_failed');\n      const signedAt = String(authoritativeNow);",
)

# 2) Certificado: exibir horário de São Paulo corretamente + preservar instante UTC bruto.
replace_once(
    'src/server/payrollServer.ts',
    "export const buildCertificatePdf = (evidence: Record<string, any>) => {\n  const lines = [",
    """const exactSaoPauloDateTime = (value: unknown) => {\n  const raw = String(value || '').trim();\n  const date = new Date(raw);\n  if (!raw || Number.isNaN(date.getTime())) return raw;\n  const parts = new Intl.DateTimeFormat('en-GB', {\n    timeZone: 'America/Sao_Paulo',\n    year: 'numeric', month: '2-digit', day: '2-digit',\n    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',\n  }).formatToParts(date).reduce<Record<string,string>>((acc, part) => {\n    if (part.type !== 'literal') acc[part.type] = part.value;\n    return acc;\n  }, {});\n  const fraction = (raw.match(/\\.(\\d{1,6})/)?.[1] || String(date.getUTCMilliseconds()).padStart(3, '0')).padEnd(3, '0');\n  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}:${parts.second}.${fraction}`;\n};\n\nexport const buildCertificatePdf = (evidence: Record<string, any>) => {\n  const lines = [""",
)
replace_once(
    'src/server/payrollServer.ts',
    "    `Data/hora: ${evidence.signed_at || ''} (America/Sao_Paulo)`,",
    "    `Data/hora oficial: ${exactSaoPauloDateTime(evidence.signed_at)} (America/Sao_Paulo)`,\n    `Instante oficial UTC: ${evidence.signed_at || ''}` ,",
)

# 3) Endpoint de dossiê: ciclo completo da folha + benefícios antecipados do mês seguinte.
admin = Path('api/payroll-admin.ts')
text = admin.read_text(encoding='utf-8')
needle = "    if (action === 'signed-urls') {"
if text.count(needle) != 1:
    raise RuntimeError(f'api/payroll-admin.ts signed-urls marker count={text.count(needle)}')
insert = r'''    if (action === 'dossier-signed-documents') {
      const sourceDoc = await loadDocument(service, String(body.document_id || ''));
      if (!sourceDoc.employee_id) return sendJson(res, { ok: false, error: 'document_without_employee' }, 409);

      const benefitTypes = new Set(['BENEFICIO_VR', 'BENEFICIO_VT', 'BENEFICIO_VR_VT']);
      const payrollTypes = new Set(['HOLERITE', 'ADIANTAMENTO']);
      const shiftCompetencia = (value: string, delta: number) => {
        const match = /^(\d{4})-(\d{2})$/.exec(String(value || ''));
        if (!match) return String(value || '');
        const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1 + delta, 1));
        return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
      };
      const sourceIsBenefit = benefitTypes.has(String(sourceDoc.document_type || ''));
      const payrollCompetencia = sourceIsBenefit ? shiftCompetencia(sourceDoc.competencia, -1) : sourceDoc.competencia;
      const benefitCompetencia = sourceIsBenefit ? sourceDoc.competencia : shiftCompetencia(sourceDoc.competencia, 1);

      const { data: candidateDocs, error: candidateError } = await service
        .from('payroll_documents')
        .select('id,document_type,competencia,storage_path,original_filename,extracted_data,document_version')
        .eq('company_id', sourceDoc.company_id)
        .eq('employee_id', sourceDoc.employee_id)
        .in('competencia', Array.from(new Set([payrollCompetencia, benefitCompetencia])));
      if (candidateError) throw candidateError;

      const scopedDocs = (candidateDocs || []).filter((doc: any) =>
        (payrollTypes.has(String(doc.document_type || '')) && doc.competencia === payrollCompetencia)
        || (benefitTypes.has(String(doc.document_type || '')) && doc.competencia === benefitCompetencia),
      );
      const documentIds = scopedDocs.map((doc: any) => doc.id);
      if (!documentIds.length) return sendJson(res, { ok: true, items: [], payroll_competencia: payrollCompetencia, benefit_competencia: benefitCompetencia });

      const [{ data: signatures, error: signatureError }, { data: receipts, error: receiptError }] = await Promise.all([
        service.from('payroll_signatures').select('id,document_id,certificate_path,signed_at').in('document_id', documentIds).order('signed_at', { ascending: true }),
        service.from('payroll_payment_receipts').select('document_id,storage_path,status').in('document_id', documentIds).eq('status', 'PAGAMENTO_CONFIRMADO'),
      ]);
      if (signatureError) throw signatureError;
      if (receiptError) throw receiptError;

      const docById = new Map(scopedDocs.map((doc: any) => [doc.id, doc]));
      const receiptByDoc = new Map((receipts || []).map((receipt: any) => [receipt.document_id, receipt]));
      const typeOrder: Record<string, number> = { HOLERITE: 10, ADIANTAMENTO: 20, BENEFICIO_VR: 30, BENEFICIO_VT: 40, BENEFICIO_VR_VT: 50 };
      const typeLabel: Record<string, string> = { HOLERITE: 'Holerite', ADIANTAMENTO: 'Adiantamento', BENEFICIO_VR: 'Recibo VR', BENEFICIO_VT: 'Recibo VT', BENEFICIO_VR_VT: 'Recibo VR + VT' };
      const signedRows = (signatures || [])
        .map((signature: any) => ({ signature, doc: docById.get(signature.document_id) as any }))
        .filter((entry: any) => entry.doc?.storage_path)
        .sort((a: any, b: any) => (typeOrder[a.doc.document_type] || 99) - (typeOrder[b.doc.document_type] || 99) || new Date(a.signature.signed_at).getTime() - new Date(b.signature.signed_at).getTime());

      const items = [];
      for (const { signature, doc } of signedRows) {
        const receipt = receiptByDoc.get(doc.id) as any;
        items.push({
          document_id: doc.id,
          document_type: doc.document_type,
          label: typeLabel[doc.document_type] || doc.document_type,
          competencia: doc.competencia,
          signed_at: signature.signed_at,
          document_version: doc.document_version,
          document_url: await signedUrl(service, doc.storage_path, 900),
          certificate_url: signature.certificate_path ? await signedUrl(service, signature.certificate_path, 900) : null,
          receipt_url: receipt?.storage_path ? await signedUrl(service, receipt.storage_path, 900) : null,
          document_includes_bank_proof: doc?.extracted_data?.includes_bank_proof === true,
        });
      }
      return sendJson(res, { ok: true, items, payroll_competencia: payrollCompetencia, benefit_competencia: benefitCompetencia });
    }

'''
admin.write_text(text.replace(needle, insert + needle, 1), encoding='utf-8')

# 4) UI: dossiê consolidado usa todos os documentos assinados do ciclo, inclusive VR e VT.
ui = Path('src/components/payroll/PayrollPortalAdminModule.tsx')
text = ui.read_text(encoding='utf-8')
pattern = re.compile(r"  const dossier = async \(row: any\) => \{.*?\n  \};", re.S)
match = pattern.search(text)
if not match:
    raise RuntimeError('PayrollPortalAdminModule dossier function not found')
new = r'''  const dossier = async (row: any) => {
    if (row.signature_status !== 'ASSINADO') return toast.error('O dossiê final exige assinatura concluída.');
    try {
      const dossierData = await apiCall('dossier-signed-documents', { document_id: row.document_id });
      const items = Array.isArray(dossierData.items) ? dossierData.items : [];
      if (!items.length) throw new Error('Dossiê incompleto: nenhuma assinatura concluída encontrada.');
      const sources: Array<{url:string;label:string}> = [];
      for (const item of items) {
        if (item.document_url) sources.push({ url: item.document_url, label: `${item.label || item.document_type} ${item.competencia || ''}`.trim() });
        if (!item.document_includes_bank_proof && item.receipt_url) sources.push({ url: item.receipt_url, label: `Comprovante ${item.competencia || ''}`.trim() });
        if (item.certificate_url) sources.push({ url: item.certificate_url, label: `Certificado ${item.label || item.document_type} ${item.competencia || ''}`.trim() });
      }
      if (!sources.length) throw new Error('Dossiê incompleto: arquivos assinados indisponíveis.');
      await mergePdfUrls(sources, `DOSSIE_ASSINATURAS_${safeFile(row.employee_name || 'FUNCIONARIO')}_${dossierData.payroll_competencia || competencia}.pdf`);
    } catch (error: any) { toast.error(error.message); }
  };'''
ui.write_text(text[:match.start()] + new + text[match.end():], encoding='utf-8')

print('PAYROLL_PATCH_OK')
