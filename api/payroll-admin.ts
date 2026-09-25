import { randomUUID } from 'node:crypto';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import {
  addEvent,
  assertCompanyEnabled,
  PAYROLL_BUCKET,
  readBody,
  sha256,
  requireAdmin,
  sendJson,
  signedUrl,
} from '../src/server/payrollServer.js';

// The employee portal remains paused via payroll_company_enabled.
// Admin archive access must not depend on the employee portal switch.
const ADMIN_COMPANY_CNPJS: Record<string, string> = {
  'topac-matriz': '07291648000103',
  'topac-pg': '07291648000294',
  'topac-gyn': '07291648000375',
  'alqui': '14464586000150',
  'lmt': '21967711000100',
};

const assertAdminArchiveAccess = async (service: any, companyId: string, isAdmin: boolean) => {
  if (!isAdmin) return assertCompanyEnabled(service, companyId);
  const { data: company, error } = await service.from('empresas').select('codigo,cnpj').eq('id', companyId).maybeSingle();
  if (error) throw error;
  const code = String(company?.codigo || '').trim().toLowerCase();
  const cnpj = String(company?.cnpj || '').replace(/\D/g, '');
  if (!ADMIN_COMPANY_CNPJS[code] || ADMIN_COMPANY_CNPJS[code] !== cnpj) {
    throw Object.assign(new Error('invalid_company_scope'), { status: 403 });
  }
};

const loadDocument = async (service: any, isAdmin: boolean, documentId: string) => {
  const { data, error } = await service.from('payroll_documents').select('*').eq('id', documentId).single();
  if (error || !data) throw Object.assign(new Error('document_not_found'), { status: 404 });
  await assertAdminArchiveAccess(service, data.company_id, isAdmin);
  return data;
};

const loadReceipt = async (service: any, isAdmin: boolean, receiptId: string) => {
  const { data, error } = await service.from('payroll_payment_receipts').select('*').eq('id', receiptId).single();
  if (error || !data) throw Object.assign(new Error('receipt_not_found'), { status: 404 });
  await assertAdminArchiveAccess(service, data.company_id, isAdmin);
  return data;
};

const loadRequest = async (service: any, isAdmin: boolean, requestId: string) => {
  const { data, error } = await service.from('payroll_signature_requests').select('*').eq('id', requestId).single();
  if (error || !data) throw Object.assign(new Error('request_not_found'), { status: 404 });
  await assertAdminArchiveAccess(service, data.company_id, isAdmin);
  return data;
};

const buildCompleteDossier = async (service: any, sourceDoc: any) => {
  const { data: docs, error: docsError } = await service
    .from('payroll_documents')
    .select('id,company_id,employee_id,competencia,document_type,storage_path,original_filename,extracted_data,created_at')
    .eq('company_id', sourceDoc.company_id)
    .eq('employee_id', sourceDoc.employee_id)
    .not('storage_path', 'is', null)
    .order('competencia', { ascending: true })
    .order('created_at', { ascending: true });
  if (docsError) throw docsError;
  if (!docs?.length) throw Object.assign(new Error('dossier_without_documents'), { status: 404 });

  const documentIds = docs.map((doc: any) => doc.id);
  const { data: requests, error: requestError } = await service
    .from('payroll_signature_requests')
    .select('id,document_id,status,signed_at')
    .in('document_id', documentIds);
  if (requestError) throw requestError;

  const requestIds = (requests || []).map((row: any) => row.id).filter(Boolean);
  if (!requestIds.length) throw Object.assign(new Error('dossier_without_signed_documents'), { status: 409 });

  const { data: signatures, error: signatureError } = await service
    .from('payroll_signatures')
    .select('id,request_id,document_id,certificate_path,certificate_sha256,signed_at,authentication_method,document_sha256_final,evidence')
    .in('request_id', requestIds)
    .order('signed_at', { ascending: true });
  if (signatureError) throw signatureError;
  if (!signatures?.length) throw Object.assign(new Error('dossier_without_signed_documents'), { status: 409 });

  const requestById = new Map((requests || []).map((row: any) => [row.id, row]));
  const docById = new Map(docs.map((doc: any) => [doc.id, doc]));
  const signedEntries = (signatures || [])
    .map((signature: any) => {
      const request = requestById.get(signature.request_id) as any;
      const documentId = signature.document_id || request?.document_id;
      const doc = docById.get(documentId) as any;
      return { signature, doc };
    })
    .filter((entry: any) => entry.doc?.storage_path)
    .sort((a: any, b: any) => {
      const competenceDiff = String(a.doc.competencia || '').localeCompare(String(b.doc.competencia || ''));
      if (competenceDiff) return competenceDiff;
      const typeDiff = String(a.doc.document_type || '').localeCompare(String(b.doc.document_type || ''));
      if (typeDiff) return typeDiff;
      return new Date(a.signature.signed_at || 0).getTime() - new Date(b.signature.signed_at || 0).getTime();
    });
  if (!signedEntries.length) throw Object.assign(new Error('dossier_without_signed_documents'), { status: 409 });

  const signedDocumentIds = Array.from(new Set(signedEntries.map((entry: any) => entry.doc.id)));
  const { data: receipts, error: receiptError } = await service
    .from('payroll_payment_receipts')
    .select('id,document_id,storage_path,receipt_sha256,amount,paid_at,status,confirmed,created_at')
    .in('document_id', signedDocumentIds)
    .order('created_at', { ascending: true });
  if (receiptError) throw receiptError;
  const receiptsByDoc = new Map<string, any[]>();
  for (const receipt of receipts || []) {
    const list = receiptsByDoc.get(receipt.document_id) || [];
    list.push(receipt);
    receiptsByDoc.set(receipt.document_id, list);
  }

  const output = await PDFDocument.create();
  const appended = new Set<string>();
  const fileChecks: Array<{ path: string; kind: string; sha256: string; expected_sha256: string | null; intact: boolean | null }> = [];
  const appendPdf = async (storagePath: string | null | undefined, label: string, expected?: string | null) => {
    if (!storagePath || appended.has(storagePath)) return;
    const { data, error } = await service.storage.from(PAYROLL_BUCKET).download(storagePath);
    if (error || !data) throw new Error(`dossier_file_download_failed:${label}`);
    const bytes = new Uint8Array(await data.arrayBuffer());
    const actual = sha256(bytes);
    fileChecks.push({ path: storagePath, kind: label, sha256: actual, expected_sha256: expected || null,
      intact: expected ? actual.toLowerCase() === String(expected).toLowerCase() : null });
    try {
      const source = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
      const pages = await output.copyPages(source, source.getPageIndices());
      pages.forEach((page) => output.addPage(page));
      appended.add(storagePath);
    } catch {
      throw new Error(`dossier_invalid_pdf:${label}`);
    }
  };

  for (const { signature, doc } of signedEntries) {
    await appendPdf(doc.storage_path, `${doc.document_type || 'DOCUMENTO'}:${doc.competencia || ''}:documento`, signature.document_sha256_final);
    for (const receipt of receiptsByDoc.get(doc.id) || []) {
      await appendPdf(receipt.storage_path, `${doc.document_type || 'DOCUMENTO'}:${doc.competencia || ''}:comprovante:${receipt.status}`, receipt.receipt_sha256);
    }
    if (signature.certificate_path) {
      await appendPdf(signature.certificate_path, `${doc.document_type || 'DOCUMENTO'}:${doc.competencia || ''}:certificado`, signature.certificate_sha256);
    }
  }

  if (!output.getPageCount()) throw Object.assign(new Error('dossier_empty'), { status: 409 });
  output.setTitle('Dossie completo de assinaturas');
  output.setSubject('Todos os documentos assinados do funcionario, sem filtro de competencia.');
  output.setCreator('TOPAC RH PRO');
  const dossierBytes = await output.save({ addDefaultPage: false, useObjectStreams: false });
  const dossierHash = sha256(dossierBytes);

  const { data: employee } = await service.from('funcionarios').select('nome').eq('id', sourceDoc.employee_id).maybeSingle();
  const employeeName = String(employee?.nome || 'FUNCIONARIO');
  const safeEmployee = employeeName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 80);
  const basePath = `${sourceDoc.company_id}/dossies/${sourceDoc.employee_id}`;
  const exportId = randomUUID();
  const dossierPath = `${basePath}/DOSSIE_COMPLETO_${safeEmployee}_${exportId}.pdf`;
  const indexPath = `${basePath}/INDICE_DOSSIE_COMPLETO_${safeEmployee}_${exportId}.pdf`;

  const dossierUpload = await service.storage.from(PAYROLL_BUCKET).upload(
    dossierPath,
    new Blob([dossierBytes as any], { type: 'application/pdf' }),
    { contentType: 'application/pdf', upsert: false },
  );
  if (dossierUpload.error) throw dossierUpload.error;

  const indexPdf = await PDFDocument.create();
  const font = await indexPdf.embedFont(StandardFonts.Helvetica);
  const bold = await indexPdf.embedFont(StandardFonts.HelveticaBold);
  let page = indexPdf.addPage([595.28, 841.89]);
  let pageNumber = 1;
  const drawIndexHeader = () => {
    page.drawText('TOPAC RH PRO - DOSSIE COMPLETO', { x: 48, y: 790, size: 16, font: bold });
    page.drawText(`Funcionario: ${employeeName}`, { x: 48, y: 760, size: 11, font });
    page.drawText(`Documentos assinados incluidos: ${signedEntries.length}`, { x: 48, y: 740, size: 11, font });
    page.drawText(`Indice de documentos - pagina ${pageNumber}`, { x: 48, y: 720, size: 11, font });
  };
  drawIndexHeader();
  let y = 690;
  for (const { doc, signature } of signedEntries) {
    if (y < 60) {
      page = indexPdf.addPage([595.28, 841.89]);
      pageNumber += 1;
      drawIndexHeader();
      y = 690;
    }
    const line = `${String(doc.competencia || 'SEM COMPETENCIA')} - ${String(doc.document_type || 'DOCUMENTO')} - ${String(signature.id).slice(0, 8)}`;
    page.drawText(line.slice(0, 90), { x: 58, y, size: 9, font });
    y -= 17;
  }
  const indexBytes = await indexPdf.save({ addDefaultPage: false, useObjectStreams: false });
  const indexUpload = await service.storage.from(PAYROLL_BUCKET).upload(
    indexPath,
    new Blob([indexBytes as any], { type: 'application/pdf' }),
    { contentType: 'application/pdf', upsert: false },
  );
  if (indexUpload.error) throw indexUpload.error;

  return {
    dossierPath,
    indexPath,
    documentCount: signedEntries.length,
    dossierHash,
    manifest: {
      schema: 'topac-payroll-evidence-v1', export_id: exportId,
      generated_at: new Date().toISOString(),
      company_id: sourceDoc.company_id, employee_id: sourceDoc.employee_id,
      dossier_sha256: dossierHash, files: fileChecks,
      documents: signedEntries.map(({ doc, signature }: any) => ({
        document_id: doc.id, document_type: doc.document_type, competencia: doc.competencia,
        signature_id: signature.id, signed_at: signature.signed_at,
        authentication_method: signature.authentication_method,
        face_event_id: signature.evidence?.face_event_id || null,
        document_sha256: signature.document_sha256_final,
        certificate_sha256: signature.certificate_sha256 || null,
        receipts: (receiptsByDoc.get(doc.id) || []).map((receipt: any) => ({
          receipt_id: receipt.id, receipt_sha256: receipt.receipt_sha256,
          status: receipt.status, confirmed: receipt.confirmed === true,
          amount: receipt.amount, paid_at: receipt.paid_at,
        })),
      })),
      note: 'Comprovantes nao confirmados sao anexos, nao provas de pagamento confirmado.',
    },
  };
};

export default async function handler(req: any, res?: any) {
  const method = req?.method || 'GET';
  try {
    const { service, user, roles } = await requireAdmin(req);
    const isAdmin = roles.includes('admin');

    if (method === 'GET') {
      return sendJson(res, {
        ok: true,
        module: 'payroll-electronic-signature',
        public_portal: '/holerite',
        identity_method: 'CPF_NASCIMENTO_CELULAR4',
        external_message_channel_required: false,
      });
    }
    if (method !== 'POST') return sendJson(res, { ok: false, error: 'method_not_allowed' }, 405);

    const body = readBody(req);
    const action = String(body.action || '');

    if (['release-send','resend-link','manual-reminder','discard-unmatched-receipts'].includes(action)) {
      return sendJson(res, { ok: false, error: 'legacy_flow_disabled', public_portal: '/holerite' }, 410);
    }

    if (action === 'confirm-document') {
      const doc = await loadDocument(service, isAdmin, String(body.document_id || ''));
      if (!doc.employee_id) return sendJson(res, { ok: false, error: 'document_without_employee' }, 409);
      const { data, error } = await service.from('payroll_documents').update({
        confirmed: true,
        confirmed_at: new Date().toISOString(),
        confirmed_by: user.id,
        status: 'AGUARDANDO_PAGAMENTO',
        updated_at: new Date().toISOString(),
      }).eq('id', doc.id).select('*').single();
      if (error) throw error;
      await addEvent(service, {
        company_id: doc.company_id,
        employee_id: doc.employee_id,
        event_type: 'HOLERITE_CONFERIDO',
        actor_type: 'ADMIN',
        actor_user_id: user.id,
        payload: { document_id: doc.id, competencia: doc.competencia, automatico: true },
      });
      return sendJson(res, { ok: true, document: data });
    }

    if (action === 'confirm-payment') {
      const receipt = await loadReceipt(service, isAdmin, String(body.receipt_id || ''));
      if (!receipt.employee_id || !receipt.document_id) return sendJson(res, { ok: false, error: 'payment_not_identified' }, 409);
      const doc = await loadDocument(service, isAdmin, receipt.document_id);
      if (!doc.confirmed) return sendJson(res, { ok: false, error: 'document_not_ready' }, 409);
      if (doc.employee_id !== receipt.employee_id || doc.company_id !== receipt.company_id || doc.competencia !== receipt.competencia) {
        return sendJson(res, { ok: false, error: 'payment_scope_mismatch' }, 409);
      }

      // No fluxo sequencial a segunda página já pertence ao recibo anterior.
      // Valor/score/OCR não criam uma etapa humana de validação.
      const sequential = receipt?.extracted_data?.ingestion_mode === 'SEQUENTIAL_RECEIPT_PROOF';
      const diff = doc.net_amount != null && receipt.amount != null ? Math.abs(Number(doc.net_amount) - Number(receipt.amount)) : 0;
      if (!sequential && diff > 0.02 && !String(body.override_reason || '').trim()) {
        return sendJson(res, { ok: false, error: 'payment_amount_mismatch', difference: diff, requires_override_reason: true }, 409);
      }

      const { data, error } = await service.from('payroll_payment_receipts').update({
        confirmed: true,
        confirmed_at: new Date().toISOString(),
        confirmed_by: user.id,
        status: 'PAGAMENTO_CONFIRMADO',
        updated_at: new Date().toISOString(),
      }).eq('id', receipt.id).select('*').single();
      if (error) throw error;
      await addEvent(service, {
        company_id: receipt.company_id,
        employee_id: receipt.employee_id,
        event_type: 'PAGAMENTO_CONFIRMADO',
        actor_type: 'ADMIN',
        actor_user_id: user.id,
        payload: {
          receipt_id: receipt.id,
          document_id: receipt.document_id,
          automatico: sequential,
          override_reason: String(body.override_reason || '') || null,
          portal: '/holerite',
        },
      });
      return sendJson(res, { ok: true, receipt: data, public_portal: '/holerite' });
    }

    if (action === 'signed-urls') {
      const doc = await loadDocument(service, isAdmin, String(body.document_id || ''));
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
      const doc = await loadDocument(service, isAdmin, String(body.document_id || ''));
      if (!doc.employee_id) return sendJson(res, { ok: false, error: 'document_without_employee' }, 409);
      const complete = await buildCompleteDossier(service, doc);
      return sendJson(res, {
        ok: true,
        dossier_url: await signedUrl(service, complete.dossierPath, 900),
        dossier_scope: 'ALL_SIGNED_DOCUMENTS_ALL_COMPETENCIAS',
        dossier_document_count: complete.documentCount,
        dossier_sha256: complete.dossierHash,
        index_url: await signedUrl(service, complete.indexPath, 900),
        manifest: complete.manifest,
      });
    }

    if (action === 'delete-payroll-entry') {
      const doc = await loadDocument(service, isAdmin, String(body.document_id || ''));
      const { data: requestRows, error: requestError } = await service
        .from('payroll_signature_requests')
        .select('id')
        .eq('document_id', doc.id);
      if (requestError) throw requestError;
      const requestIds = (requestRows || []).map((row: any) => row.id).filter(Boolean);

      if (requestIds.length) {
        const { data: signatures, error: signatureError } = await service
          .from('payroll_signatures')
          .select('id')
          .in('request_id', requestIds);
        if (signatureError) throw signatureError;
        if ((signatures || []).length) {
          return sendJson(res, { ok: false, error: 'signed_document_cannot_be_deleted' }, 409);
        }
      }

      const { data: receipts, error: receiptError } = await service
        .from('payroll_payment_receipts')
        .select('id,storage_path')
        .eq('document_id', doc.id);
      if (receiptError) throw receiptError;
      const receiptPaths = (receipts || []).map((row: any) => row.storage_path).filter(Boolean);

      if (requestIds.length) {
        const { error: messageDeleteError } = await service.from('payroll_message_logs').delete().in('request_id', requestIds);
        if (messageDeleteError) throw messageDeleteError;
        const { error: eventDeleteError } = await service.from('payroll_signature_events').delete().in('request_id', requestIds);
        if (eventDeleteError) throw eventDeleteError;
        const { error: requestDeleteError } = await service.from('payroll_signature_requests').delete().in('id', requestIds);
        if (requestDeleteError) throw requestDeleteError;
      }

      const { error: receiptDeleteError } = await service.from('payroll_payment_receipts').delete().eq('document_id', doc.id);
      if (receiptDeleteError) throw receiptDeleteError;
      const { error: documentDeleteError } = await service.from('payroll_documents').delete().eq('id', doc.id);
      if (documentDeleteError) throw documentDeleteError;

      const paths = [doc.storage_path, ...receiptPaths].filter(Boolean);
      if (paths.length) {
        const { error: storageDeleteError } = await service.storage.from(PAYROLL_BUCKET).remove(paths);
        if (storageDeleteError) console.warn('[payroll-delete-storage]', storageDeleteError);
      }

      await addEvent(service, {
        company_id: doc.company_id,
        employee_id: doc.employee_id,
        event_type: 'DOCUMENTO_FOLHA_EXCLUIDO',
        actor_type: 'ADMIN',
        actor_user_id: user.id,
        payload: { document_id: doc.id, competencia: doc.competencia },
      });
      return sendJson(res, { ok: true, deleted_document_id: doc.id });
    }

    if (action === 'timeline') {
      const requestRow = await loadRequest(service, isAdmin, String(body.request_id || ''));
      const [{ data: events, error: eventError }, { data: messages, error: messageError }] = await Promise.all([
        service.from('payroll_signature_events').select('*').eq('request_id', requestRow.id).order('created_at', { ascending: true }),
        service.from('payroll_message_logs').select('*').eq('request_id', requestRow.id).order('created_at', { ascending: true }),
      ]);
      if (eventError) throw eventError;
      if (messageError) throw messageError;
      return sendJson(res, { ok: true, events: events || [], messages: messages || [] });
    }

    return sendJson(res, { ok: false, error: 'unknown_action' }, 400);
  } catch (error: any) {
    return sendJson(res, { ok: false, error: String(error?.message || error) }, Number(error?.status || 500));
  }
}
