import {
  addEvent,
  assertCompanyEnabled,
  PAYROLL_BUCKET,
  readBody,
  requireAdmin,
  sendJson,
  signedUrl,
} from '../src/server/payrollServer.js';

const loadDocument = async (service: any, documentId: string) => {
  const { data, error } = await service.from('payroll_documents').select('*').eq('id', documentId).single();
  if (error || !data) throw Object.assign(new Error('document_not_found'), { status: 404 });
  await assertCompanyEnabled(service, data.company_id);
  return data;
};

const loadReceipt = async (service: any, receiptId: string) => {
  const { data, error } = await service.from('payroll_payment_receipts').select('*').eq('id', receiptId).single();
  if (error || !data) throw Object.assign(new Error('receipt_not_found'), { status: 404 });
  await assertCompanyEnabled(service, data.company_id);
  return data;
};

const loadRequest = async (service: any, requestId: string) => {
  const { data, error } = await service.from('payroll_signature_requests').select('*').eq('id', requestId).single();
  if (error || !data) throw Object.assign(new Error('request_not_found'), { status: 404 });
  await assertCompanyEnabled(service, data.company_id);
  return data;
};

export default async function handler(req: any, res?: any) {
  const method = req?.method || 'GET';
  try {
    const { service, user } = await requireAdmin(req);

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
      const doc = await loadDocument(service, String(body.document_id || ''));
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
      const receipt = await loadReceipt(service, String(body.receipt_id || ''));
      if (!receipt.employee_id || !receipt.document_id) return sendJson(res, { ok: false, error: 'payment_not_identified' }, 409);
      const doc = await loadDocument(service, receipt.document_id);
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

    if (action === 'delete-payroll-entry') {
      const doc = await loadDocument(service, String(body.document_id || ''));
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
      const requestRow = await loadRequest(service, String(body.request_id || ''));
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
