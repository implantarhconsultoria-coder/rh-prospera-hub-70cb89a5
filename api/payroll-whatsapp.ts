import {
  addEvent,
  encryptSecret,
  maskPhone,
  normalizePhone,
  randomToken,
  readBody,
  requestBaseUrl,
  requireAdmin,
  sendJson,
  sendPayrollMessage,
  sha256,
} from '../src/server/payrollServer.js';

const ALLOWED_CNPJS: Record<string, string> = {
  'topac-matriz': '07291648000103',
  'topac-pg': '07291648000294',
  'topac-gyn': '07291648000375',
  alqui: '14464586000150',
  lmt: '21967711000100',
};

const SIGNABLE_TYPES = new Set([
  'HOLERITE',
  'ADIANTAMENTO',
  'BENEFICIO_VR',
  'BENEFICIO_VT',
  'BENEFICIO_VR_VT',
  'RECIBO_GARAGEM',
  'AVISO_FERIAS',
]);

const digits = (value: unknown) => String(value || '').replace(/\D/g, '');
const safeText = (value: unknown) => String(value || '').trim();
const normalizeCode = (value: unknown) => safeText(value).toLowerCase();
const isUniqueViolation = (error: any) => String(error?.code || '') === '23505';

const formatCompetencia = (value: string) => {
  const [year, month] = String(value || '').split('-');
  return year && month ? `${month}/${year}` : String(value || '');
};

const loadCompany = async (service: any, companyId: string) => {
  const { data, error } = await service.from('empresas').select('id,nome,codigo,cnpj').eq('id', companyId).maybeSingle();
  if (error) throw error;
  if (!data) throw Object.assign(new Error('company_not_found'), { status: 404 });
  const code = normalizeCode(data.codigo);
  if (!ALLOWED_CNPJS[code] || digits(data.cnpj) !== ALLOWED_CNPJS[code]) {
    throw Object.assign(new Error('invalid_company_scope'), { status: 403 });
  }
  return { ...data, code };
};

const assertDocumentEligible = async (service: any, documentId: string) => {
  const { data: doc, error } = await service
    .from('payroll_documents')
    .select('id,company_id,employee_id,competencia,document_type,confirmed,status,is_current')
    .eq('id', documentId)
    .maybeSingle();
  if (error) throw error;
  if (!doc) throw Object.assign(new Error('document_not_found'), { status: 404 });
  if (!doc.employee_id) throw Object.assign(new Error('document_without_employee'), { status: 409 });
  if (doc.confirmed !== true || doc.is_current !== true || !SIGNABLE_TYPES.has(String(doc.document_type || ''))) {
    throw Object.assign(new Error('document_not_released'), { status: 409 });
  }
  if (!['AGUARDANDO_PAGAMENTO', 'AGUARDANDO_ASSINATURA'].includes(String(doc.status || ''))) {
    throw Object.assign(new Error('document_not_released'), { status: 409 });
  }

  const { data: signature, error: signatureError } = await service
    .from('payroll_signatures')
    .select('id,signed_at')
    .eq('document_id', doc.id)
    .maybeSingle();
  if (signatureError) throw signatureError;
  if (signature) throw Object.assign(new Error('document_already_signed'), { status: 409 });

  let receiptId: string | null = null;
  if (doc.document_type === 'HOLERITE') {
    const { data: receipt, error: receiptError } = await service
      .from('payroll_payment_receipts')
      .select('id')
      .eq('document_id', doc.id)
      .eq('company_id', doc.company_id)
      .eq('employee_id', doc.employee_id)
      .eq('status', 'PAGAMENTO_CONFIRMADO')
      .eq('confirmed', true)
      .maybeSingle();
    if (receiptError) throw receiptError;
    if (!receipt) throw Object.assign(new Error('payment_not_confirmed'), { status: 409 });
    receiptId = receipt.id;
  }

  return { doc, receiptId };
};

const ensureSignatureRequest = async (service: any, doc: any, receiptId: string | null, phone: string, userId: string) => {
  const { data: existing, error: existingError } = await service
    .from('payroll_signature_requests')
    .select('*')
    .eq('document_id', doc.id)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) {
    if (existing.company_id !== doc.company_id || existing.employee_id !== doc.employee_id) {
      throw Object.assign(new Error('request_scope_mismatch'), { status: 409 });
    }
    if (existing.status === 'ASSINADO' || existing.signed_at) {
      throw Object.assign(new Error('document_already_signed'), { status: 409 });
    }
    return existing;
  }

  const rawToken = randomToken();
  const encrypted = encryptSecret(rawToken);
  const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60_000).toISOString();
  const payload = {
    company_id: doc.company_id,
    employee_id: doc.employee_id,
    document_id: doc.id,
    receipt_id: receiptId,
    competencia: doc.competencia,
    phone_snapshot: phone,
    public_token_hash: sha256(rawToken),
    public_token_ciphertext: encrypted.ciphertext,
    public_token_nonce: encrypted.nonce,
    token_last4: rawToken.slice(-4),
    expires_at: expiresAt,
    status: 'LINK_GERADO',
    send_attempts: 0,
    created_by: userId,
    idempotency_key: `signature:${doc.id}`,
  };
  const { data: created, error: createError } = await service
    .from('payroll_signature_requests')
    .insert(payload)
    .select('*')
    .single();
  if (!createError) return created;
  if (!isUniqueViolation(createError)) throw createError;

  const { data: raced, error: racedError } = await service
    .from('payroll_signature_requests')
    .select('*')
    .eq('document_id', doc.id)
    .single();
  if (racedError) throw racedError;
  return raced;
};

const claimAttempt = async (service: any, requestRow: any, userId: string) => {
  const recentSentAt = requestRow.sent_at ? new Date(requestRow.sent_at).getTime() : 0;
  if (recentSentAt && Date.now() - recentSentAt < 60_000 && requestRow.status === 'ENVIADO') {
    return { duplicate: true, attempt: Number(requestRow.send_attempts || 1) };
  }

  const attempt = Number(requestRow.send_attempts || 0) + 1;
  const key = `whatsapp:${requestRow.id}:attempt:${attempt}`;
  const { error } = await service.from('payroll_message_logs').insert({
    request_id: requestRow.id,
    company_id: requestRow.company_id,
    employee_id: requestRow.employee_id,
    message_kind: attempt > 1 ? 'REENVIO_ASSINATURA' : 'COBRANCA_ASSINATURA',
    channel: 'WHATSAPP',
    destination_masked: maskPhone(requestRow.phone_snapshot),
    message_template: 'ASSINATURA_PENDENTE',
    status: 'PENDENTE',
    attempt,
    idempotency_key: key,
  });
  if (error && isUniqueViolation(error)) return { duplicate: true, attempt };
  if (error) throw error;

  await service.from('payroll_signature_requests').update({
    status: 'LINK_GERADO',
    send_attempts: attempt,
    send_error: null,
    updated_at: new Date().toISOString(),
  }).eq('id', requestRow.id);

  await addEvent(service, {
    request_id: requestRow.id,
    company_id: requestRow.company_id,
    employee_id: requestRow.employee_id,
    event_type: 'WHATSAPP_ENVIO_INICIADO',
    actor_type: 'ADMIN',
    actor_user_id: userId,
    payload: { attempt },
  });
  return { duplicate: false, attempt, key };
};

const markAttemptFailed = async (service: any, requestRow: any, attempt: number, errorCode: string) => {
  const now = new Date().toISOString();
  await Promise.all([
    service.from('payroll_signature_requests').update({ status: 'ERRO_DE_ENVIO', send_error: errorCode, updated_at: now }).eq('id', requestRow.id),
    service.from('payroll_message_logs').update({ status: 'FALHOU', error: errorCode }).eq('request_id', requestRow.id).eq('attempt', attempt),
  ]);
};

const sendEmployeeNotification = async (service: any, req: any, userId: string, company: any, employeeId: string, requestedDocumentId?: string) => {
  const { data: employee, error: employeeError } = await service
    .from('funcionarios')
    .select('id,nome,company_id,empresa_id,celular,telefone,status,ativo,data_demissao')
    .eq('id', employeeId)
    .maybeSingle();
  if (employeeError) throw employeeError;
  if (!employee) throw Object.assign(new Error('employee_not_found'), { status: 404 });
  const employeeCompanyId = String(employee.company_id || employee.empresa_id || '');
  if (employeeCompanyId !== company.id) throw Object.assign(new Error('employee_company_mismatch'), { status: 409 });
  if (employee.ativo === false || employee.data_demissao || String(employee.status || 'ativo').toLowerCase() !== 'ativo') {
    throw Object.assign(new Error('employee_not_active'), { status: 409 });
  }

  const phone = normalizePhone(employee.celular || employee.telefone);
  if (!phone) throw Object.assign(new Error('invalid_phone'), { status: 409 });

  const { data: docs, error: docsError } = await service
    .from('payroll_documents')
    .select('id')
    .eq('company_id', company.id)
    .eq('employee_id', employee.id)
    .eq('is_current', true)
    .eq('confirmed', true)
    .in('status', ['AGUARDANDO_PAGAMENTO', 'AGUARDANDO_ASSINATURA']);
  if (docsError) throw docsError;
  const ids = (docs || []).map((row: any) => row.id);
  if (!ids.length) throw Object.assign(new Error('no_pending_documents'), { status: 409 });

  const eligible: Array<{ doc: any; receiptId: string | null }> = [];
  for (const id of ids) {
    try {
      const item = await assertDocumentEligible(service, id);
      eligible.push(item);
    } catch (error: any) {
      if (!['document_already_signed', 'payment_not_confirmed', 'document_not_released'].includes(String(error?.message || ''))) throw error;
    }
  }
  if (!eligible.length) throw Object.assign(new Error('no_pending_documents'), { status: 409 });

  if (requestedDocumentId && !eligible.some((item) => item.doc.id === requestedDocumentId)) {
    throw Object.assign(new Error('document_not_pending_for_employee'), { status: 409 });
  }

  const target = requestedDocumentId
    ? eligible.find((item) => item.doc.id === requestedDocumentId)!
    : eligible.length === 1 ? eligible[0] : null;
  const requestTarget = target || eligible[0];
  const requestRow = await ensureSignatureRequest(service, requestTarget.doc, requestTarget.receiptId, phone, userId);
  const claim = await claimAttempt(service, { ...requestRow, phone_snapshot: phone }, userId);
  if (claim.duplicate) return { ok: true, employee_id: employee.id, employee_name: employee.nome, status: 'JA_PROCESSADO', deduplicated: true };

  const competences = [...new Set(eligible.map((item) => formatCompetencia(item.doc.competencia)).filter(Boolean))];
  const deepLink = target
    ? `${requestBaseUrl(req)}/holerite/${encodeURIComponent(company.code)}?document=${encodeURIComponent(target.doc.id)}`
    : `${requestBaseUrl(req)}/holerite/${encodeURIComponent(company.code)}`;
  const competenceText = competences.join(', ');
  const text = `Olá, ${employee.nome}.\n\nIdentificamos que ainda existem documentos pendentes de assinatura referentes ao fechamento de ${competenceText}.\n\nAcesse abaixo para visualizar e assinar:\n\n${deepLink}\n\nTOPAC RH PRO`;

  try {
    const provider = await sendPayrollMessage({ phone, text });
    const now = new Date().toISOString();
    await Promise.all([
      service.from('payroll_signature_requests').update({
        phone_snapshot: phone,
        status: 'ENVIADO',
        sent_at: now,
        send_error: null,
        updated_at: now,
      }).eq('id', requestRow.id),
      service.from('payroll_message_logs').update({
        status: 'ENVIADO',
        provider_message_id: provider.id,
        sent_at: now,
      }).eq('request_id', requestRow.id).eq('attempt', claim.attempt),
    ]);
    await addEvent(service, {
      request_id: requestRow.id,
      company_id: company.id,
      employee_id: employee.id,
      event_type: 'WHATSAPP_ENVIADO',
      actor_type: 'ADMIN',
      actor_user_id: userId,
      payload: { attempt: claim.attempt, provider: provider.provider, document_id: target?.doc.id || null, pending_documents: eligible.length },
    });
    return { ok: true, employee_id: employee.id, employee_name: employee.nome, status: 'ENVIADO', attempt: claim.attempt };
  } catch (error: any) {
    const code = String(error?.code || error?.message || 'message_send_failed').slice(0, 500);
    await markAttemptFailed(service, requestRow, claim.attempt, code);
    await addEvent(service, {
      request_id: requestRow.id,
      company_id: company.id,
      employee_id: employee.id,
      event_type: 'WHATSAPP_FALHA_ENVIO',
      actor_type: 'ADMIN',
      actor_user_id: userId,
      payload: { attempt: claim.attempt, error: code },
    });
    throw Object.assign(new Error(code), { status: code === 'message_channel_not_configured' ? 503 : 502 });
  }
};

export default async function handler(req: any, res?: any) {
  if ((req?.method || 'GET') !== 'POST') return sendJson(res, { ok: false, error: 'method_not_allowed' }, 405);
  try {
    const { service, user } = await requireAdmin(req);
    const body = readBody(req);
    const action = String(body.action || '');

    if (action === 'send-document') {
      const { doc } = await assertDocumentEligible(service, String(body.document_id || ''));
      const company = await loadCompany(service, doc.company_id);
      const result = await sendEmployeeNotification(service, req, user.id, company, doc.employee_id, doc.id);
      return sendJson(res, result);
    }

    if (action === 'send-employee') {
      const company = await loadCompany(service, String(body.company_id || ''));
      const result = await sendEmployeeNotification(service, req, user.id, company, String(body.employee_id || ''));
      return sendJson(res, result);
    }

    if (action === 'send-pending') {
      const company = await loadCompany(service, String(body.company_id || ''));
      const { data: docs, error } = await service
        .from('payroll_documents')
        .select('employee_id')
        .eq('company_id', company.id)
        .eq('is_current', true)
        .eq('confirmed', true)
        .in('status', ['AGUARDANDO_PAGAMENTO', 'AGUARDANDO_ASSINATURA']);
      if (error) throw error;
      const employeeIds = [...new Set((docs || []).map((row: any) => String(row.employee_id || '')).filter(Boolean))];
      const results: any[] = [];
      for (const employeeId of employeeIds) {
        try {
          results.push(await sendEmployeeNotification(service, req, user.id, company, employeeId));
        } catch (error: any) {
          results.push({ ok: false, employee_id: employeeId, status: 'FALHA', error: String(error?.message || error) });
        }
      }
      return sendJson(res, {
        ok: true,
        total: results.length,
        sent: results.filter((item) => item.ok && item.status === 'ENVIADO').length,
        deduplicated: results.filter((item) => item.ok && item.deduplicated).length,
        failed: results.filter((item) => !item.ok).length,
        results,
      });
    }

    return sendJson(res, { ok: false, error: 'unknown_action' }, 400);
  } catch (error: any) {
    return sendJson(res, { ok: false, error: String(error?.message || error) }, Number(error?.status || 500));
  }
}
