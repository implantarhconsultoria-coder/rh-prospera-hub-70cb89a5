import {
  addEvent,
  assertCompanyEnabled,
  createReminderJob,
  decryptSecret,
  encryptSecret,
  logMessage,
  normalizePhone,
  randomToken,
  readBody,
  requestBaseUrl,
  requireAdmin,
  sendJson,
  sendPayrollMessage,
  sha256,
  signedUrl,
} from '../src/server/payrollServer';

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

const enabledConfig = async (service: any, companyId: string) => {
  const { data, error } = await service.from('payroll_module_company_config').select('*').eq('company_id', companyId).eq('enabled', true).single();
  if (error || !data) throw Object.assign(new Error('company_not_enabled'), { status: 403 });
  return data;
};

const messageConfigured = () => Boolean(
  process.env.TOPAC_PAYROLL_MESSAGE_WEBHOOK_URL ||
  (process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY && process.env.EVOLUTION_INSTANCE)
);

const initialMessage = (link: string) => `TOPAC — Holerite disponível\n\nSeu holerite está disponível para conferência e assinatura eletrônica.\n\nAcesse o link abaixo para visualizar e assinar seu documento.\n\n${link}\n\nABRIR E ASSINAR`;
const reminderMessage = (link: string) => `TOPAC — Assinatura pendente\n\nSeu holerite continua aguardando sua assinatura.\n\nPor favor, acesse o documento e finalize a confirmação:\n\n${link}\n\nABRIR E ASSINAR`;
const collectionMessage = (link: string) => `TOPAC — Pendência de assinatura\n\nIdentificamos que seu holerite continua pendente de assinatura eletrônica.\n\nPedimos que finalize a assinatura pelo link abaixo:\n\n${link}\n\nASSINAR AGORA`;

const sendLink = async ({ service, req, user, documentId, explicitResend = false }: any) => {
  const doc = await loadDocument(service, documentId);
  if (!doc.employee_id) throw Object.assign(new Error('document_without_employee'), { status: 409 });
  if (!doc.confirmed || doc.status !== 'AGUARDANDO_PAGAMENTO') throw Object.assign(new Error('holerite_not_confirmed'), { status: 409 });

  const { data: receipt } = await service.from('payroll_payment_receipts')
    .select('*').eq('document_id', doc.id).eq('status', 'PAGAMENTO_CONFIRMADO').eq('confirmed', true).maybeSingle();
  if (!receipt) throw Object.assign(new Error('payment_not_confirmed'), { status: 409 });

  const { data: employee, error: employeeError } = await service.from('funcionarios')
    .select('id,nome,cpf,cargo,telefone,celular,company_id,empresa_id').eq('id', doc.employee_id).single();
  if (employeeError || !employee) throw Object.assign(new Error('employee_not_found'), { status: 404 });
  const phone = normalizePhone(employee.celular || employee.telefone);
  if (!phone) throw Object.assign(new Error('invalid_phone'), { status: 409, code: 'invalid_phone' });
  const config = await enabledConfig(service, doc.company_id);

  const { data: existing } = await service.from('payroll_signature_requests').select('*').eq('document_id', doc.id).maybeSingle();
  if (existing?.status === 'ASSINADO') return { ok: true, status: 'ASSINADO', request_id: existing.id, already_signed: true };
  if (!explicitResend && existing?.status === 'ENVIADO' && existing.sent_at && Date.now() - new Date(existing.sent_at).getTime() < 5 * 60_000) {
    return { ok: true, status: 'ENVIADO', request_id: existing.id, deduplicated: true };
  }

  const rawToken = randomToken();
  const encrypted = encryptSecret(rawToken);
  const tokenHash = sha256(rawToken);
  const expiresAt = new Date(Date.now() + Number(config.link_ttl_hours || 168) * 3600_000).toISOString();
  const baseUrl = requestBaseUrl(req);
  const link = `${baseUrl}/holerite/${encodeURIComponent(rawToken)}`;
  const requestPayload = {
    company_id: doc.company_id,
    employee_id: doc.employee_id,
    document_id: doc.id,
    receipt_id: receipt.id,
    competencia: doc.competencia,
    phone_snapshot: phone,
    public_token_hash: tokenHash,
    public_token_ciphertext: encrypted.ciphertext,
    public_token_nonce: encrypted.nonce,
    token_last4: rawToken.slice(-4),
    expires_at: expiresAt,
    status: 'LINK_GERADO',
    send_error: null,
    created_by: user.id,
    idempotency_key: existing?.idempotency_key || `document:${doc.id}`,
  };

  let requestRow: any;
  if (existing) {
    const { data, error } = await service.from('payroll_signature_requests').update(requestPayload).eq('id', existing.id).select('*').single();
    if (error) throw error;
    requestRow = data;
  } else {
    const { data, error } = await service.from('payroll_signature_requests').insert(requestPayload).select('*').single();
    if (error) throw error;
    requestRow = data;
  }

  await addEvent(service, {
    request_id: requestRow.id, company_id: doc.company_id, employee_id: doc.employee_id,
    event_type: explicitResend ? 'LINK_REGERADO' : 'LINK_GERADO', actor_type: 'ADMIN', actor_user_id: user.id,
    payload: { competencia: doc.competencia, expires_at: expiresAt, token_last4: rawToken.slice(-4) },
  });

  const attempt = Number(requestRow.send_attempts || 0) + 1;
  const template = explicitResend ? 'REENVIO_LINK' : 'PRIMEIRO_ENVIO';
  try {
    const result = await sendPayrollMessage({ phone, text: initialMessage(link) });
    const sentAt = new Date().toISOString();
    const { data: updated, error } = await service.from('payroll_signature_requests').update({
      status: 'ENVIADO', sent_at: sentAt, send_attempts: attempt, send_error: null,
    }).eq('id', requestRow.id).select('*').single();
    if (error) throw error;
    await logMessage(service, {
      requestId: requestRow.id, companyId: doc.company_id, employeeId: doc.employee_id,
      kind: template, phone, template: initialMessage('[LINK INDIVIDUAL PROTEGIDO]'), status: 'ENVIADO', attempt,
      providerId: result.id, idempotencyKey: `${requestRow.id}:${template}:${attempt}`,
    });
    await addEvent(service, {
      request_id: requestRow.id, company_id: doc.company_id, employee_id: doc.employee_id,
      event_type: 'MENSAGEM_ENVIADA', actor_type: 'SYSTEM', payload: { provider: result.provider, attempt, kind: template },
    });
    await createReminderJob(service, updated, config, new Date());
    return { ok: true, status: 'ENVIADO', request_id: requestRow.id, expires_at: expiresAt };
  } catch (error: any) {
    const invalid = error?.code === 'invalid_phone' || error?.message === 'invalid_phone';
    await service.from('payroll_signature_requests').update({
      status: invalid ? 'TELEFONE_INVALIDO' : 'ERRO_DE_ENVIO', send_error: String(error?.message || error), send_attempts: attempt,
    }).eq('id', requestRow.id);
    await logMessage(service, {
      requestId: requestRow.id, companyId: doc.company_id, employeeId: doc.employee_id,
      kind: template, phone, template: initialMessage('[LINK INDIVIDUAL PROTEGIDO]'), status: 'FALHOU', attempt,
      error: String(error?.message || error), idempotencyKey: `${requestRow.id}:${template}:${attempt}`,
    });
    await addEvent(service, {
      request_id: requestRow.id, company_id: doc.company_id, employee_id: doc.employee_id,
      event_type: invalid ? 'TELEFONE_INVALIDO' : 'ERRO_DE_ENVIO', actor_type: 'SYSTEM', payload: { error: String(error?.message || error) },
    });
    return { ok: false, request_id: requestRow.id, status: invalid ? 'TELEFONE_INVALIDO' : 'ERRO_DE_ENVIO', error: String(error?.message || error) };
  }
};

export default async function handler(req: any, res?: any) {
  const method = req?.method || 'GET';
  try {
    const { service, user } = await requireAdmin(req);
    if (method === 'GET') {
      return sendJson(res, { ok: true, module: 'payroll-electronic-signature', message_channel_configured: messageConfigured() });
    }
    if (method !== 'POST') return sendJson(res, { ok: false, error: 'method_not_allowed' }, 405);
    const body = readBody(req);
    const action = String(body.action || '');

    if (action === 'confirm-document') {
      const doc = await loadDocument(service, String(body.document_id || ''));
      if (!doc.employee_id) return sendJson(res, { ok: false, error: 'document_without_employee' }, 409);
      const { data, error } = await service.from('payroll_documents').update({
        confirmed: true, confirmed_at: new Date().toISOString(), confirmed_by: user.id, status: 'AGUARDANDO_PAGAMENTO',
      }).eq('id', doc.id).select('*').single();
      if (error) throw error;
      await addEvent(service, { company_id: doc.company_id, employee_id: doc.employee_id, event_type: 'HOLERITE_CONFERIDO', actor_type: 'ADMIN', actor_user_id: user.id, payload: { document_id: doc.id, competencia: doc.competencia } });
      return sendJson(res, { ok: true, document: data });
    }

    if (action === 'confirm-payment') {
      const receipt = await loadReceipt(service, String(body.receipt_id || ''));
      if (!receipt.employee_id || !receipt.document_id) return sendJson(res, { ok: false, error: 'payment_not_identified' }, 409);
      const doc = await loadDocument(service, receipt.document_id);
      if (!doc.confirmed || doc.status !== 'AGUARDANDO_PAGAMENTO') return sendJson(res, { ok: false, error: 'holerite_not_confirmed' }, 409);
      if (doc.employee_id !== receipt.employee_id || doc.company_id !== receipt.company_id || doc.competencia !== receipt.competencia) return sendJson(res, { ok: false, error: 'payment_scope_mismatch' }, 409);
      const diff = doc.net_amount != null && receipt.amount != null ? Math.abs(Number(doc.net_amount) - Number(receipt.amount)) : 0;
      if (diff > 0.02 && !String(body.override_reason || '').trim()) return sendJson(res, { ok: false, error: 'payment_amount_mismatch', difference: diff, requires_override_reason: true }, 409);
      const { data, error } = await service.from('payroll_payment_receipts').update({
        confirmed: true, confirmed_at: new Date().toISOString(), confirmed_by: user.id, status: 'PAGAMENTO_CONFIRMADO',
      }).eq('id', receipt.id).select('*').single();
      if (error) throw error;
      await addEvent(service, { company_id: receipt.company_id, employee_id: receipt.employee_id, event_type: 'PAGAMENTO_CONFIRMADO', actor_type: 'ADMIN', actor_user_id: user.id, payload: { receipt_id: receipt.id, document_id: receipt.document_id, override_reason: String(body.override_reason || '') || null } });
      return sendJson(res, { ok: true, receipt: data });
    }

    if (action === 'release-send') {
      const result = await sendLink({ service, req, user, documentId: String(body.document_id || ''), explicitResend: false });
      return sendJson(res, result, result.ok ? 200 : 503);
    }

    if (action === 'resend-link') {
      const requestRow = await loadRequest(service, String(body.request_id || ''));
      const result = await sendLink({ service, req, user, documentId: requestRow.document_id, explicitResend: true });
      return sendJson(res, result, result.ok ? 200 : 503);
    }

    if (action === 'manual-reminder') {
      const requestRow = await loadRequest(service, String(body.request_id || ''));
      if (requestRow.status === 'ASSINADO') return sendJson(res, { ok: true, status: 'ASSINADO', skipped: true });
      const token = decryptSecret(requestRow.public_token_ciphertext, requestRow.public_token_nonce);
      const link = `${requestBaseUrl(req)}/holerite/${encodeURIComponent(token)}`;
      const count = Number(requestRow.reminder_count || 0) + 1;
      const text = count === 1 ? reminderMessage(link) : collectionMessage(link);
      const kind = count === 1 ? 'LEMBRETE' : 'COBRANCA';
      try {
        const result = await sendPayrollMessage({ phone: requestRow.phone_snapshot, text });
        await service.from('payroll_signature_requests').update({ reminder_count: count, send_error: null }).eq('id', requestRow.id);
        await logMessage(service, { requestId: requestRow.id, companyId: requestRow.company_id, employeeId: requestRow.employee_id, kind, phone: requestRow.phone_snapshot, template: text.replace(link,'[LINK INDIVIDUAL PROTEGIDO]'), status: 'ENVIADO', attempt: count, providerId: result.id, idempotencyKey: `${requestRow.id}:MANUAL:${Date.now()}` });
        await addEvent(service, { request_id: requestRow.id, company_id: requestRow.company_id, employee_id: requestRow.employee_id, event_type: 'COBRANCA_MANUAL_ENVIADA', actor_type: 'ADMIN', actor_user_id: user.id, payload: { kind, reminder_count: count } });
        return sendJson(res, { ok: true, reminder_count: count });
      } catch (error: any) {
        await addEvent(service, { request_id: requestRow.id, company_id: requestRow.company_id, employee_id: requestRow.employee_id, event_type: 'ERRO_DE_ENVIO', actor_type: 'SYSTEM', payload: { error: String(error?.message || error), kind } });
        return sendJson(res, { ok: false, error: String(error?.message || error) }, 503);
      }
    }

    if (action === 'signed-urls') {
      const doc = await loadDocument(service, String(body.document_id || ''));
      const { data: receipt } = await service.from('payroll_payment_receipts').select('*').eq('document_id', doc.id).eq('status', 'PAGAMENTO_CONFIRMADO').maybeSingle();
      const { data: requestRow } = await service.from('payroll_signature_requests').select('id').eq('document_id', doc.id).maybeSingle();
      const { data: signature } = requestRow ? await service.from('payroll_signatures').select('*').eq('request_id', requestRow.id).maybeSingle() : { data: null } as any;
      return sendJson(res, {
        ok: true,
        holerite_url: await signedUrl(service, doc.storage_path, 900),
        receipt_url: receipt?.storage_path ? await signedUrl(service, receipt.storage_path, 900) : null,
        certificate_url: signature?.certificate_path ? await signedUrl(service, signature.certificate_path, 900) : null,
      });
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
    const status = Number(error?.status || 500);
    return sendJson(res, { ok: false, error: String(error?.message || error) }, status);
  }
}
