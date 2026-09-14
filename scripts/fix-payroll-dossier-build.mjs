import fs from 'node:fs';

const apiPath = 'api/payroll-admin.ts';
const uiPath = 'src/components/payroll/PayrollPortalAdminModule.tsx';

let api = fs.readFileSync(apiPath, 'utf8');
const signedUrlsStart = api.indexOf("    if (action === 'signed-urls') {");
const deleteEntryStart = api.indexOf("\n    if (action === 'delete-payroll-entry') {", signedUrlsStart);
if (signedUrlsStart < 0 || deleteEntryStart < 0) {
  throw new Error('[dossier-direct] bloco signed-urls não encontrado em payroll-admin.ts');
}

const apiReplacement = `    if (action === 'signed-urls') {
      const doc = await loadDocument(service, String(body.document_id || ''));
      const { data: receipt } = await service.from('payroll_payment_receipts').select('*').eq('document_id', doc.id).eq('status', 'PAGAMENTO_CONFIRMADO').maybeSingle();
      const { data: requestRow } = await service.from('payroll_signature_requests').select('id').eq('document_id', doc.id).maybeSingle();
      const { data: signature } = requestRow
        ? await service.from('payroll_signatures').select('*').eq('request_id', requestRow.id).maybeSingle()
        : { data: null } as any;
      return sendJson(res, {
        ok: true,
        holerite_url: await signedUrl(service, doc.storage_path, 900),
        receipt_url: receipt?.storage_path ? await signedUrl(service, receipt.storage_path, 900) : null,
        certificate_url: signature?.certificate_path ? await signedUrl(service, signature.certificate_path, 900) : null,
        document_includes_bank_proof: doc?.extracted_data?.includes_bank_proof === true,
      });
    }

    if (action === 'dossier-url') {
      const doc = await loadDocument(service, String(body.document_id || ''));
      if (!doc.employee_id) return sendJson(res, { ok: false, error: 'document_without_employee' }, 409);
      const complete = await buildCompleteDossier(service, doc);
      return sendJson(res, {
        ok: true,
        dossier_url: await signedUrl(service, complete.dossierPath, 900),
        dossier_scope: 'ALL_SIGNED_DOCUMENTS_ALL_COMPETENCIAS',
        dossier_document_count: complete.documentCount,
      });
    }
`;

api = api.slice(0, signedUrlsStart) + apiReplacement + api.slice(deleteEntryStart);
fs.writeFileSync(apiPath, api, 'utf8');

let ui = fs.readFileSync(uiPath, 'utf8');
const dossierStart = ui.indexOf('  const dossier = async (row: any) => {');
const dossierEndMarker = '\n  };';
const dossierEndStart = ui.indexOf(dossierEndMarker, dossierStart);
if (dossierStart < 0 || dossierEndStart < 0) {
  throw new Error('[dossier-direct] função dossier não encontrada em PayrollPortalAdminModule.tsx');
}
const dossierEnd = dossierEndStart + dossierEndMarker.length;

const dossierReplacement = `  const dossier = async (row: any) => {
    if (row.signature_status !== 'ASSINADO') return toast.error('O dossiê final exige assinatura concluída.');
    try {
      const result = await apiCall('dossier-url', { document_id: row.document_id });
      if (!result.dossier_url) throw new Error('O servidor não retornou o dossiê completo.');

      const response = await fetch(result.dossier_url, { cache: 'no-store' });
      if (!response.ok) throw new Error(\`Falha \${response.status} ao baixar o dossiê completo.\`);
      const blob = await response.blob();
      if (!blob.size) throw new Error('O dossiê completo foi gerado vazio.');

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = \`DOSSIE_COMPLETO_\${safeFile(row.employee_name || 'FUNCIONARIO')}_TODOS_OS_DOCUMENTOS.pdf\`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 3000);
      toast.success(\`Dossiê completo gerado com \${Number(result.dossier_document_count || 0)} documento(s) assinado(s).\`);
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível gerar o dossiê completo.');
    }
  };`;

ui = ui.slice(0, dossierStart) + dossierReplacement + ui.slice(dossierEnd);
fs.writeFileSync(uiPath, ui, 'utf8');

console.log('[dossier-direct] signed-urls restaurado; dossiê separado e download direto aplicado');
