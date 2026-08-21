import { randomUUID } from 'node:crypto';
import {
  addEvent,
  buildCertificatePdf,
  clientIp,
  digits,
  encryptSecret,
  getServiceClient,
  normalizePhone,
  parseBrowserDevice,
  randomToken,
  readBody,
  safeEqualHex,
  sendJson,
  sha256,
  signedUrl,
  userAgent,
} from '../src/server/payrollServer.js';

const AUTH_METHOD = 'CPF_NASCIMENTO_CELULAR4';
const SESSION_MINUTES = 30;
const MAX_IP_ATTEMPTS_15M = 8;
const MAX_CPF_ATTEMPTS_15M = 5;

const genericIdentityError = (res: any, status = 401) =>
  sendJson(res, { ok: false, error: 'identity_not_validated' }, status);

const appendPublicEvent = (
  service: any,
  req: any,
  data: { companyId: string; employeeId: string; requestId?: string | null; eventType: string; payload?: Record<string, unknown> },
) => addEvent(service, {
  request_id: data.requestId || null,
  company_id: data.companyId,
  employee_id: data.employeeId,
  event_type: data.eventType,
  actor_type: 'EMPLOYEE',
  ip: clientIp(req),
  user_agent: userAgent(req),
  payload: data.payload || {},
});

const assertCompanyEnabled = async (service: any, companyId: string) => {
  const { data, error } = await service.rpc('payroll_company_enabled', { p_company_id: companyId });
  if (error || !data) throw Object.assign(new Error('company_not_enabled'), { status: 403 });
};

const validatePublicSession = async (service: any, rawSession: string) => {
  if (!rawSession || rawSession.length < 32 || rawSession.length > 256) {
    throw Object.assign(new Error('session_required'), { status: 401 });
  }
  const sessionHash = sha256(rawSession);
  const { data, error } = await service
    .from('payroll_public_sessions')
    .select('*')
    .eq('session_hash', sessionHash)
    .is('revoked_at', null)
    .maybeSingle();
  if (error || !data) throw Object.assign(new Error('invalid_session'), { status: 401 });
  if (new Date(data.expires_at).getTime() <= Date.now()) {
    await service.from('payroll_public_sessions').update({ revoked_at: new Date().toISOString() }).eq('id', data.id);
    throw Object.assign(new Error('session_expired'), { status: 401 });
  }
  await assertCompanyEnabled(service, data.company_id);
  await service.from('payroll_public_sessions').update({ last_used_at: new Date().toISOString() }).eq('id', data.id);
  return data;
};

const availableDocuments = async (service: any, employeeId: string, companyId: string) => {
  const { data: docs, error: docsError } = await service
    .from('payroll_documents')
    .select('id,company_id,employee_id,competencia,document_version,net_amount,confirmed,status,is_current,created_at')
    .eq('employee_id', employeeId)
    .eq('company_id', companyId)
    .eq('is_current', true)
    .eq('confirmed', true)
    .eq('status', 'AGUARDANDO_PAGAMENTO')
    .order('competencia', { ascending: false });
  if (docsError) throw docsError;
  if (!docs?.length) return [];

  const ids = docs.map((doc: any) => doc.id);
  const [{ data: receipts, error: receiptError }, { data: signatures, error: signatureError }, { data: requests, error: requestError }] = await Promise.all([
    service.from('payroll_payment_receipts').select('id,document_id,paid_at,amount,status,confirmed').in('document_id', ids).eq('status', 'PAGAMENTO_CONFIRMADO').eq('confirmed', true),
    service.from('payroll_signatures').select('id,document_id,signed_at').in('document_id', ids),
    service.from('payroll_signature_requests').select('id,document_id,status,opened_at,viewed_at,signed_at,identity_validated_at').in('document_id', ids),
  ]);
  if (receiptError) throw receiptError;
  if (signatureError) throw signatureError;
  if (requestError) throw requestError;

  const receiptByDoc = new Map((receipts || []).map((row: any) => [row.document_id, row]));
  const signatureByDoc = new Map((signatures || []).map((row: any) => [row.document_id, row]));
  const requestByDoc = new Map((requests || []).map((row: any) => [row.document_id, row]));

  return docs
    .filter((doc: any) => receiptByDoc.has(doc.id))
    .map((doc: any) => {
      const receipt: any = receiptByDoc.get(doc.id);
      const signature: any = signatureByDoc.get(doc.id);
      const request: any = requestByDoc.get(doc.id);
      return {
        document_id: doc.id,
        competencia: doc.competencia,
        document_version: doc.document_version,
        payment_at: receipt?.paid_at || null,
        signed: Boolean(signature),
        signed_at: signature?.signed_at || null,
        opened_at: request?.opened_at || null,
        acknowledged_at: request?.viewed_at || null,
      };
    });
};

const ensureRequest = async (service: any, req: any, sessionRow: any, documentId: string) => {
  const { data: doc, error: docError } = await service
    .from('payroll_documents')
    .select('*')
    .eq('id', documentId)
    .eq('employee_id', sessionRow.employee_id)
    .eq('company_id', sessionRow.company_id)
    .eq('is_current', true)
    .eq('confirmed', true)
    .eq('status', 'AGUARDANDO_PAGAMENTO')
    .maybeSingle();
  if (docError || !doc) throw Object.assign(new Error('document_not_available'), { status: 404 });

  const { data: receipt, error: receiptError } = await service
    .from('payroll_payment_receipts')
    .select('*')
    .eq('document_id', doc.id)
    .eq('employee_id', sessionRow.employee_id)
    .eq('company_id', sessionRow.company_id)
    .eq('status', 'PAGAMENTO_CONFIRMADO')
    .eq('confirmed', true)
    .maybeSingle();
  if (receiptError || !receipt) throw Object.assign(new Error('payment_not_confirmed'), { status: 409 });

  const { data: employee, error: employeeError } = await service
    .from('funcionarios')
    .select('id,nome,cpf,cargo,telefone,celular,data_nascimento')
    .eq('id', sessionRow.employee_id)
    .single();
  if (employeeError || !employee) throw Object.assign(new Error('employee_not_found'), { status: 404 });

  const phone = normalizePhone(employee.celular || employee.telefone) || digits(employee.celular || employee.telefone);
  const now = new Date().toISOString();
  const { data: existing, error: existingError } = await service
    .from('payroll_signature_requests')
    .select('*')
    .eq('document_id', doc.id)
    .maybeSingle();
  if (existingError) throw existingError;

  if (existing) {
    if (existing.employee_id !== sessionRow.employee_id || existing.company_id !== sessionRow.company_id) {
      throw Object.assign(new Error('request_scope_mismatch'), { status: 409 });
    }
    if (existing.status !== 'ASSINADO') {
      const { data: updated, error } = await service.from('payroll_signature_requests').update({
        receipt_id: receipt.id,
        phone_snapshot: phone,
        status: 'ASSINATURA_PENDENTE',
        identity_validated_at: now,
        identity_method: AUTH_METHOD,
        session_hash: sessionRow.session_hash,
        session_expires_at: sessionRow.expires_at,
        send_error: null,
        updated_at: now,
      }).eq('id', existing.id).select('*').single();
      if (error) throw error;
      return { requestRow: updated, doc, receipt, employee };
    }
    return { requestRow: existing, doc, receipt, employee };
  }

  const internalToken = randomToken();
  const encrypted = encryptSecret(internalToken);
  const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60_000).toISOString();
  const { data: created, error: createError } = await service.from('payroll_signature_requests').insert({
    company_id: sessionRow.company_id,
    employee_id: sessionRow.employee_id,
    document_id: doc.id,
    receipt_id: receipt.id,
    competencia: doc.competencia,
    phone_snapshot: phone,
    public_token_hash: sha256(internalToken),
    public_token_ciphertext: encrypted.ciphertext,
    public_token_nonce: encrypted.nonce,
    token_last4: null,
    expires_at: expiresAt,
    status: 'ASSINATURA_PENDENTE',
    identity_validated_at: now,
    identity_method: AUTH_METHOD,
    session_hash: sessionRow.session_hash,
    session_expires_at: sessionRow.expires_at,
    idempotency_key: `portal:${doc.id}`,
  }).select('*').single();
  if (createError) throw createError;

  await appendPublicEvent(service, req, {
    companyId: sessionRow.company_id,
    employeeId: sessionRow.employee_id,
    requestId: created.id,
    eventType: 'HOLERITE_LIBERADO_NO_PORTAL',
    payload: { document_id: doc.id, competencia: doc.competencia, authentication_method: AUTH_METHOD },
  });
  return { requestRow: created, doc, receipt, employee };
};

const authenticate = async (service: any, req: any, res: any, body: any) => {
  const cpf = digits(body.cpf);
  const birth = String(body.birth_date || '').trim();
  const phoneLast4 = digits(body.phone_last4).slice(-4);
  const ip = clientIp(req) || 'unknown';
  const identifierHash = sha256(`payroll-identity:${cpf || 'invalid'}`);
  const cutoff = new Date(Date.now() - 15 * 60_000).toISOString();

  const [{ count: ipCount }, { count: cpfCount }] = await Promise.all([
    service.from('payroll_public_access_attempts').select('id', { count: 'exact', head: true }).eq('ip', ip).gte('created_at', cutoff),
    service.from('payroll_public_access_attempts').select('id', { count: 'exact', head: true }).eq('identifier_hash', identifierHash).gte('created_at', cutoff),
  ]);
  if (Number(ipCount || 0) >= MAX_IP_ATTEMPTS_15M || Number(cpfCount || 0) >= MAX_CPF_ATTEMPTS_15M) {
    await service.from('payroll_public_access_attempts').insert({ identifier_hash: identifierHash, ip, success: false, failure_reason: 'RATE_LIMIT' });
    return sendJson(res, { ok: false, error: 'too_many_attempts' }, 429);
  }

  if (!/^\d{11}$/.test(cpf) || !/^\d{4}-\d{2}-\d{2}$/.test(birth) || !/^\d{4}$/.test(phoneLast4)) {
    await service.from('payroll_public_access_attempts').insert({ identifier_hash: identifierHash, ip, success: false, failure_reason: 'INVALID_FORMAT' });
    return genericIdentityError(res);
  }

  const { data: matches, error: matchError } = await service.rpc('payroll_match_identity', {
    p_cpf: cpf,
    p_birth: birth,
    p_phone_last4: phoneLast4,
  });
  if (matchError) throw matchError;
  if (!matches || matches.length !== 1) {
    await service.from('payroll_public_access_attempts').insert({ identifier_hash: identifierHash, ip, success: false, failure_reason: 'NO_UNIQUE_MATCH' });
    return genericIdentityError(res);
  }

  const match = matches[0];
  await assertCompanyEnabled(service, match.company_id);
  const [{ data: employee, error: employeeError }, { data: company, error: companyError }] = await Promise.all([
    service.from('funcionarios').select('id,nome,cargo').eq('id', match.employee_id).single(),
    service.from('empresas').select('id,nome').eq('id', match.company_id).single(),
  ]);
  if (employeeError || !employee || companyError || !company) return genericIdentityError(res);

  const documents = await availableDocuments(service, match.employee_id, match.company_id);
  if (!documents.length) return genericIdentityError(res);

  const rawSession = randomToken();
  const sessionHash = sha256(rawSession);
  const expiresAt = new Date(Date.now() + SESSION_MINUTES * 60_000).toISOString();
  const { data: sessionRow, error: sessionError } = await service.from('payroll_public_sessions').insert({
    company_id: match.company_id,
    employee_id: match.employee_id,
    session_hash: sessionHash,
    auth_method: AUTH_METHOD,
    expires_at: expiresAt,
    ip,
    user_agent: userAgent(req),
  }).select('*').single();
  if (sessionError) throw sessionError;

  await service.from('payroll_public_access_attempts').insert({
    identifier_hash: identifierHash,
    ip,
    success: true,
    company_id: match.company_id,
    employee_id: match.employee_id,
  });
  await appendPublicEvent(service, req, {
    companyId: match.company_id,
    employeeId: match.employee_id,
    eventType: 'PORTAL_IDENTIDADE_VALIDADA',
    payload: { auth_method: AUTH_METHOD, session_id: sessionRow.id, expires_at: expiresAt },
  });

  return sendJson(res, {
    ok: true,
    session: rawSession,
    session_expires_at: expiresAt,
    employee_name: employee.nome,
    employee_role: employee.cargo || '',
    company_name: company.nome,
    documents,
  });
};

export default async function handler(req: any, res?: any) {
  if ((req?.method || 'GET') !== 'POST') return sendJson(res, { ok: false, error: 'method_not_allowed' }, 405);

  try {
    const service = getServiceClient();
    const body = readBody(req);
    const action = String(body.action || '');

    if (action === 'authenticate') return authenticate(service, req, res, body);

    const sessionRow = await validatePublicSession(service, String(body.session || ''));

    if (action === 'list') {
      const [{ data: employee }, { data: company }] = await Promise.all([
        service.from('funcionarios').select('id,nome,cargo').eq('id', sessionRow.employee_id).single(),
        service.from('empresas').select('id,nome').eq('id', sessionRow.company_id).single(),
      ]);
      return sendJson(res, {
        ok: true,
        employee_name: employee?.nome || '',
        employee_role: employee?.cargo || '',
        company_name: company?.nome || '',
        documents: await availableDocuments(service, sessionRow.employee_id, sessionRow.company_id),
        session_expires_at: sessionRow.expires_at,
      });
    }

    if (action === 'document') {
      const { requestRow, doc, employee } = await ensureRequest(service, req, sessionRow, String(body.document_id || ''));
      if (requestRow.status !== 'ASSINADO' && !requestRow.opened_at) {
        const openedAt = new Date().toISOString();
        await service.from('payroll_signature_requests').update({ opened_at: openedAt }).eq('id', requestRow.id);
        await appendPublicEvent(service, req, {
          companyId: sessionRow.company_id,
          employeeId: sessionRow.employee_id,
          requestId: requestRow.id,
          eventType: 'HOLERITE_ABERTO_NO_PORTAL',
          payload: { document_id: doc.id, competencia: doc.competencia },
        });
        requestRow.opened_at = openedAt;
      }
      const { data: signature } = await service.from('payroll_signatures').select('id,signed_at').eq('document_id', doc.id).maybeSingle();
      return sendJson(res, {
        ok: true,
        document_id: doc.id,
        document_url: await signedUrl(service, doc.storage_path, 300),
        document_expires_seconds: 300,
        employee_name: employee.nome,
        employee_role: employee.cargo || '',
        competencia: doc.competencia,
        already_acknowledged: Boolean(requestRow.viewed_at),
        signed: Boolean(signature),
        signed_at: signature?.signed_at || null,
      });
    }

    if (action === 'acknowledge') {
      const { requestRow, doc } = await ensureRequest(service, req, sessionRow, String(body.document_id || ''));
      if (!requestRow.viewed_at) {
        const viewedAt = new Date().toISOString();
        await service.from('payroll_signature_requests').update({ viewed_at: viewedAt }).eq('id', requestRow.id);
        await appendPublicEvent(service, req, {
          companyId: sessionRow.company_id,
          employeeId: sessionRow.employee_id,
          requestId: requestRow.id,
          eventType: 'DOCUMENTO_VISUALIZADO_E_CONFERIDO',
          payload: { document_id: doc.id, viewed_at: viewedAt },
        });
      }
      return sendJson(res, { ok: true });
    }

    if (action === 'sign') {
      const { requestRow, doc, receipt, employee } = await ensureRequest(service, req, sessionRow, String(body.document_id || ''));
      const { data: existingSignature } = await service.from('payroll_signatures').select('id,signed_at').eq('document_id', doc.id).maybeSingle();
      if (existingSignature) return sendJson(res, { ok: true, signed: true, signature_id: existingSignature.id, signed_at: existingSignature.signed_at, deduplicated: true });
      if (!requestRow.viewed_at) return sendJson(res, { ok: false, error: 'document_not_acknowledged' }, 409);
      if (body.confirm !== true) return sendJson(res, { ok: false, error: 'signature_confirmation_required' }, 400);

      const { data: company, error: companyError } = await service.from('empresas').select('id,nome,cnpj').eq('id', sessionRow.company_id).single();
      if (companyError || !company) throw new Error('company_not_found');

      const { data: fileBytes, error: fileError } = await service.storage.from('payroll-private').download(doc.storage_path);
      if (fileError || !fileBytes) throw new Error('document_download_failed');
      const bytes = Buffer.from(await fileBytes.arrayBuffer());
      const recomputedHash = sha256(bytes);
      if (!safeEqualHex(recomputedHash, doc.document_sha256)) {
        await appendPublicEvent(service, req, {
          companyId: sessionRow.company_id,
          employeeId: sessionRow.employee_id,
          requestId: requestRow.id,
          eventType: 'INTEGRIDADE_DOCUMENTO_FALHOU',
          payload: { expected: doc.document_sha256, computed: recomputedHash },
        });
        return sendJson(res, { ok: false, error: 'document_integrity_failed' }, 409);
      }

      const signatureId = randomUUID();
      const signedAt = new Date().toISOString();
      const ua = userAgent(req);
      const ip = clientIp(req);
      const parsed = parseBrowserDevice(ua);
      const phone = normalizePhone(employee.celular || employee.telefone) || digits(employee.celular || employee.telefone);
      const evidence: Record<string, any> = {
        signature_id: signatureId,
        employee_name: employee.nome,
        employee_cpf: employee.cpf,
        phone_used: phone,
        company_name: company.nome,
        company_cnpj: company.cnpj,
        employee_role: employee.cargo || '',
        competencia: doc.competencia,
        document_id: doc.id,
        receipt_id: receipt.id,
        net_amount: doc.net_amount,
        payment_at: receipt.paid_at,
        identity_validated_at: requestRow.identity_validated_at,
        opened_at: requestRow.opened_at,
        viewed_at: requestRow.viewed_at,
        signed_at: signedAt,
        timezone: 'America/Sao_Paulo',
        ip,
        user_agent: ua,
        browser: parsed.browser,
        device: parsed.device,
        authentication_method: AUTH_METHOD,
        document_sha256_before: doc.document_sha256,
        document_sha256_final: recomputedHash,
        document_version: doc.document_version,
      };
      const certificate = buildCertificatePdf(evidence);
      const certificateHash = sha256(certificate);
      const certPath = `${sessionRow.company_id}/${doc.competencia}/certificados/${sessionRow.employee_id}/${signatureId}.pdf`;
      const { error: uploadError } = await service.storage.from('payroll-private').upload(certPath, certificate, { contentType: 'application/pdf', upsert: false });
      if (uploadError) throw uploadError;

      const { error: signError } = await service.from('payroll_signatures').insert({
        id: signatureId,
        request_id: requestRow.id,
        company_id: sessionRow.company_id,
        employee_id: sessionRow.employee_id,
        document_id: doc.id,
        receipt_id: receipt.id,
        competencia: doc.competencia,
        employee_name: employee.nome,
        employee_cpf: employee.cpf,
        phone_used: phone,
        company_name: company.nome,
        company_cnpj: company.cnpj,
        employee_role: employee.cargo || '',
        net_amount: doc.net_amount,
        payment_at: receipt.paid_at,
        link_sent_at: null,
        opened_at: requestRow.opened_at,
        otp_validated_at: null,
        viewed_at: requestRow.viewed_at,
        signed_at: signedAt,
        ip,
        user_agent: ua,
        browser: parsed.browser,
        device: parsed.device,
        authentication_method: AUTH_METHOD,
        session_fingerprint: sessionRow.session_hash,
        document_sha256_before: doc.document_sha256,
        document_sha256_final: recomputedHash,
        document_version: doc.document_version,
        certificate_bucket: 'payroll-private',
        certificate_path: certPath,
        certificate_sha256: certificateHash,
        evidence,
      });
      if (signError) {
        if (signError.code === '23505') {
          const { data: existing } = await service.from('payroll_signatures').select('id,signed_at').eq('document_id', doc.id).single();
          return sendJson(res, { ok: true, signed: true, signature_id: existing.id, signed_at: existing.signed_at, deduplicated: true });
        }
        await service.storage.from('payroll-private').remove([certPath]);
        throw signError;
      }

      await service.from('payroll_terms_acceptances').insert({
        company_id: sessionRow.company_id,
        employee_id: sessionRow.employee_id,
        term_version: 'payroll-signature-v1',
        accepted: true,
        authentication_method: AUTH_METHOD,
        accepted_at: signedAt,
        request_id: requestRow.id,
      });
      const { error: updateError } = await service.from('payroll_signature_requests').update({
        status: 'ASSINADO',
        signed_at: signedAt,
        next_reminder_at: null,
        updated_at: signedAt,
      }).eq('id', requestRow.id);
      if (updateError) throw updateError;
      await service.from('payroll_otp_challenges').update({ status: 'CANCELADO' }).eq('request_id', requestRow.id).eq('status', 'PENDENTE');
      await service.from('payroll_reminder_jobs').update({ status: 'CANCELADO', processed_at: signedAt }).eq('request_id', requestRow.id).in('status', ['PENDENTE','PROCESSANDO']);

      await appendPublicEvent(service, req, {
        companyId: sessionRow.company_id,
        employeeId: sessionRow.employee_id,
        requestId: requestRow.id,
        eventType: 'ASSINATURA_CONCLUIDA',
        payload: { signature_id: signatureId, authentication_method: AUTH_METHOD, certificate_sha256: certificateHash, document_sha256: recomputedHash },
      });
      await addEvent(service, {
        request_id: requestRow.id,
        company_id: sessionRow.company_id,
        employee_id: sessionRow.employee_id,
        event_type: 'DOCUMENTO_SELADO',
        actor_type: 'SYSTEM',
        payload: { signature_id: signatureId, document_sha256: recomputedHash, certificate_sha256: certificateHash },
      });
      return sendJson(res, { ok: true, signed: true, signature_id: signatureId, signed_at: signedAt });
    }

    if (action === 'logout') {
      await service.from('payroll_public_sessions').update({ revoked_at: new Date().toISOString() }).eq('id', sessionRow.id);
      return sendJson(res, { ok: true });
    }

    return sendJson(res, { ok: false, error: 'unknown_action' }, 400);
  } catch (error: any) {
    const message = String(error?.message || error);
    const status = Number(error?.status || 500);
    const safeMessage = ['invalid_session','session_required','session_expired','document_not_available','payment_not_confirmed','document_not_acknowledged','signature_confirmation_required','document_integrity_failed','company_not_enabled'].includes(message)
      ? message
      : 'request_failed';
    return sendJson(res, { ok: false, error: safeMessage }, status);
  }
}
