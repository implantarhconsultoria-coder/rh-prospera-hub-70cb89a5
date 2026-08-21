import { randomUUID } from 'node:crypto';
import {
  addEvent,
  buildCertificatePdf,
  clientIp,
  createReminderJob,
  getServiceClient,
  logMessage,
  maskPhone,
  normalizePhone,
  otpHash,
  parseBrowserDevice,
  randomOtp,
  randomToken,
  readBody,
  safeEqualHex,
  sendJson,
  sendPayrollMessage,
  sha256,
  signedUrl,
  userAgent,
} from '../src/server/payrollServer';

const getRequestByToken = async (service: any, token: string) => {
  if (!token || token.length < 32 || token.length > 256) throw Object.assign(new Error('invalid_link'), { status: 404 });
  const tokenHash = sha256(token);
  const { data, error } = await service.from('payroll_signature_requests').select('*').eq('public_token_hash', tokenHash).maybeSingle();
  if (error || !data) throw Object.assign(new Error('invalid_link'), { status: 404 });
  if (data.status === 'CANCELADO') throw Object.assign(new Error('link_cancelled'), { status: 410 });
  if (data.status === 'ASSINADO') return data;
  if (new Date(data.expires_at).getTime() <= Date.now()) {
    await service.from('payroll_signature_requests').update({ status: 'EXPIRADO' }).eq('id', data.id);
    throw Object.assign(new Error('link_expired'), { status: 410 });
  }
  return data;
};

const getConfig = async (service: any, companyId: string) => {
  const { data, error } = await service.from('payroll_module_company_config').select('*').eq('company_id', companyId).eq('enabled', true).single();
  if (error || !data) throw Object.assign(new Error('company_not_enabled'), { status: 403 });
  return data;
};

const verifySession = async (service: any, requestRow: any, session: string) => {
  if (!session || !requestRow.session_hash || !requestRow.session_expires_at) throw Object.assign(new Error('otp_required'), { status: 401 });
  if (new Date(requestRow.session_expires_at).getTime() <= Date.now()) throw Object.assign(new Error('session_expired'), { status: 401 });
  const incoming = sha256(session);
  if (!safeEqualHex(incoming, requestRow.session_hash)) throw Object.assign(new Error('invalid_session'), { status: 401 });
};

const otpMessage = (otp: string) => `TOPAC — Código de segurança\n\nSeu código de segurança TOPAC é:\n\n${otp}\n\nUse este código para acessar e assinar seu holerite.\n\nO código possui validade curta e é de uso único.`;

const appendPublicEvent = (service: any, requestRow: any, req: any, eventType: string, payload: Record<string, unknown> = {}) =>
  addEvent(service, {
    request_id: requestRow.id,
    company_id: requestRow.company_id,
    employee_id: requestRow.employee_id,
    event_type: eventType,
    actor_type: 'EMPLOYEE',
    ip: clientIp(req),
    user_agent: userAgent(req),
    payload,
  });

export default async function handler(req: any, res?: any) {
  const method = req?.method || 'GET';
  if (method !== 'POST') return sendJson(res, { ok: false, error: 'method_not_allowed' }, 405);

  try {
    const service = getServiceClient();
    const body = readBody(req);
    const action = String(body.action || '');
    const token = String(body.token || '');
    const requestRow = await getRequestByToken(service, token);
    const config = await getConfig(service, requestRow.company_id);

    if (action === 'open') {
      if (!requestRow.opened_at) {
        const openedAt = new Date().toISOString();
        await service.from('payroll_signature_requests').update({ opened_at: openedAt, status: requestRow.status === 'ENVIADO' ? 'VISUALIZADO' : requestRow.status }).eq('id', requestRow.id);
        await appendPublicEvent(service, requestRow, req, 'LINK_ABERTO');
      }
      if (requestRow.status === 'ASSINADO') {
        return sendJson(res, { ok: true, signed: true, status: 'ASSINADO' });
      }
      return sendJson(res, {
        ok: true,
        signed: false,
        masked_phone: maskPhone(requestRow.phone_snapshot),
        status: requestRow.status,
        otp_ttl_minutes: Number(config.otp_ttl_minutes || 5),
        resend_seconds: Number(config.otp_resend_seconds || 60),
      });
    }

    if (action === 'request-otp') {
      if (requestRow.status === 'ASSINADO') return sendJson(res, { ok: true, signed: true, status: 'ASSINADO' });
      const { data: lastChallenge, error: lastError } = await service.from('payroll_otp_challenges')
        .select('*').eq('request_id', requestRow.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (lastError) throw lastError;
      if (lastChallenge?.resend_after && new Date(lastChallenge.resend_after).getTime() > Date.now()) {
        const wait = Math.ceil((new Date(lastChallenge.resend_after).getTime() - Date.now()) / 1000);
        return sendJson(res, { ok: false, error: 'otp_resend_limited', retry_after_seconds: Math.max(1, wait) }, 429);
      }

      await service.from('payroll_otp_challenges').update({ status: 'CANCELADO' }).eq('request_id', requestRow.id).eq('status', 'PENDENTE');
      const challengeId = randomUUID();
      const otp = randomOtp();
      const expiresAt = new Date(Date.now() + Number(config.otp_ttl_minutes || 5) * 60_000).toISOString();
      const resendAfter = new Date(Date.now() + Number(config.otp_resend_seconds || 60) * 1000).toISOString();
      const hash = otpHash(challengeId, otp);
      const ip = clientIp(req);
      const ua = userAgent(req);
      const { error: insertError } = await service.from('payroll_otp_challenges').insert({
        id: challengeId,
        request_id: requestRow.id,
        otp_hash: hash,
        expires_at: expiresAt,
        max_attempts: Number(config.otp_max_attempts || 5),
        resend_after: resendAfter,
        requested_ip: ip,
        requested_user_agent: ua,
      });
      if (insertError) throw insertError;

      try {
        const result = await sendPayrollMessage({ phone: requestRow.phone_snapshot, text: otpMessage(otp), copyCode: otp });
        await service.from('payroll_otp_challenges').update({ sent_at: new Date().toISOString() }).eq('id', challengeId);
        await logMessage(service, {
          requestId: requestRow.id,
          companyId: requestRow.company_id,
          employeeId: requestRow.employee_id,
          kind: 'OTP',
          phone: requestRow.phone_snapshot,
          template: 'TOPAC — Código de segurança. [OTP PROTEGIDO]. Botão: COPIAR CÓDIGO.',
          status: 'ENVIADO',
          attempt: 1,
          providerId: result.id,
          idempotencyKey: `${requestRow.id}:OTP:${challengeId}`,
        });
        await appendPublicEvent(service, requestRow, req, 'OTP_SOLICITADO', { challenge_id: challengeId, expires_at: expiresAt, provider: result.provider });
        return sendJson(res, { ok: true, masked_phone: maskPhone(requestRow.phone_snapshot), expires_at: expiresAt, resend_after: resendAfter });
      } catch (sendError: any) {
        await service.from('payroll_otp_challenges').update({ status: 'CANCELADO' }).eq('id', challengeId);
        await logMessage(service, {
          requestId: requestRow.id,
          companyId: requestRow.company_id,
          employeeId: requestRow.employee_id,
          kind: 'OTP',
          phone: requestRow.phone_snapshot,
          template: 'TOPAC — Código de segurança. [OTP PROTEGIDO].',
          status: 'FALHOU',
          attempt: 1,
          error: String(sendError?.message || sendError),
          idempotencyKey: `${requestRow.id}:OTP:${challengeId}`,
        });
        await appendPublicEvent(service, requestRow, req, 'OTP_ERRO_ENVIO', { error: String(sendError?.message || sendError) });
        return sendJson(res, { ok: false, error: 'otp_delivery_failed' }, 503);
      }
    }

    if (action === 'verify-otp') {
      const otp = String(body.otp || '').replace(/\D/g, '');
      if (!/^\d{6}$/.test(otp)) return sendJson(res, { ok: false, error: 'invalid_otp_format' }, 400);
      const { data: challenge, error } = await service.from('payroll_otp_challenges')
        .select('*').eq('request_id', requestRow.id).eq('status', 'PENDENTE').order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      if (!challenge) return sendJson(res, { ok: false, error: 'otp_not_requested' }, 409);
      if (new Date(challenge.expires_at).getTime() <= Date.now()) {
        await service.from('payroll_otp_challenges').update({ status: 'EXPIRADO' }).eq('id', challenge.id);
        await appendPublicEvent(service, requestRow, req, 'OTP_EXPIRADO', { challenge_id: challenge.id });
        return sendJson(res, { ok: false, error: 'otp_expired' }, 410);
      }
      if (Number(challenge.attempts || 0) >= Number(challenge.max_attempts || 5)) {
        await service.from('payroll_otp_challenges').update({ status: 'BLOQUEADO' }).eq('id', challenge.id);
        return sendJson(res, { ok: false, error: 'otp_blocked' }, 429);
      }

      const expected = otpHash(challenge.id, otp);
      if (!safeEqualHex(expected, challenge.otp_hash)) {
        const attempts = Number(challenge.attempts || 0) + 1;
        const blocked = attempts >= Number(challenge.max_attempts || 5);
        await service.from('payroll_otp_challenges').update({ attempts, status: blocked ? 'BLOQUEADO' : 'PENDENTE' }).eq('id', challenge.id);
        await appendPublicEvent(service, requestRow, req, 'OTP_INVALIDO', { challenge_id: challenge.id, attempt: attempts, blocked });
        return sendJson(res, { ok: false, error: blocked ? 'otp_blocked' : 'invalid_otp', attempts_remaining: Math.max(0, Number(challenge.max_attempts || 5) - attempts) }, blocked ? 429 : 401);
      }

      const session = randomToken();
      const sessionHash = sha256(session);
      const sessionExpiresAt = new Date(Date.now() + 30 * 60_000).toISOString();
      const now = new Date().toISOString();
      await service.from('payroll_otp_challenges').update({ status: 'VALIDADO', consumed_at: now }).eq('id', challenge.id);
      const { error: requestError } = await service.from('payroll_signature_requests').update({
        status: 'ASSINATURA_PENDENTE',
        otp_validated_at: now,
        session_hash: sessionHash,
        session_expires_at: sessionExpiresAt,
      }).eq('id', requestRow.id);
      if (requestError) throw requestError;
      await appendPublicEvent(service, requestRow, req, 'OTP_VALIDADO', { challenge_id: challenge.id, session_expires_at: sessionExpiresAt });
      return sendJson(res, { ok: true, session, session_expires_at: sessionExpiresAt });
    }

    const session = String(body.session || '');
    await verifySession(service, requestRow, session);

    if (action === 'document') {
      const [{ data: doc, error: docError }, { data: employee, error: employeeError }, { data: company, error: companyError }] = await Promise.all([
        service.from('payroll_documents').select('id,company_id,employee_id,competencia,storage_path,document_sha256,document_version,net_amount,status').eq('id', requestRow.document_id).single(),
        service.from('funcionarios').select('id,nome,cargo').eq('id', requestRow.employee_id).single(),
        service.from('empresas').select('id,nome').eq('id', requestRow.company_id).single(),
      ]);
      if (docError || !doc) throw new Error('document_not_found');
      if (employeeError || !employee) throw new Error('employee_not_found');
      if (companyError || !company) throw new Error('company_not_found');
      if (doc.company_id !== requestRow.company_id || doc.employee_id !== requestRow.employee_id || doc.competencia !== requestRow.competencia) throw new Error('document_scope_mismatch');
      const url = await signedUrl(service, doc.storage_path, 300);
      return sendJson(res, {
        ok: true,
        document_url: url,
        document_expires_seconds: 300,
        employee_name: employee.nome,
        employee_role: employee.cargo || '',
        company_name: company.nome,
        competencia: requestRow.competencia,
        already_acknowledged: Boolean(requestRow.viewed_at),
      });
    }

    if (action === 'acknowledge') {
      if (!requestRow.viewed_at) {
        const viewedAt = new Date().toISOString();
        await service.from('payroll_signature_requests').update({ viewed_at: viewedAt }).eq('id', requestRow.id);
        await appendPublicEvent(service, requestRow, req, 'DOCUMENTO_VISUALIZADO_E_CONFERIDO', { viewed_at: viewedAt });
      }
      return sendJson(res, { ok: true });
    }

    if (action === 'sign') {
      if (requestRow.status === 'ASSINADO') {
        const { data: existing } = await service.from('payroll_signatures').select('id,signed_at').eq('request_id', requestRow.id).maybeSingle();
        return sendJson(res, { ok: true, signed: true, signature_id: existing?.id, signed_at: existing?.signed_at });
      }
      if (!requestRow.viewed_at) return sendJson(res, { ok: false, error: 'document_not_acknowledged' }, 409);
      if (body.confirm !== true) return sendJson(res, { ok: false, error: 'signature_confirmation_required' }, 400);

      const [{ data: doc, error: docError }, { data: receipt, error: receiptError }, { data: employee, error: employeeError }, { data: company, error: companyError }] = await Promise.all([
        service.from('payroll_documents').select('*').eq('id', requestRow.document_id).single(),
        service.from('payroll_payment_receipts').select('*').eq('id', requestRow.receipt_id).single(),
        service.from('funcionarios').select('id,nome,cpf,cargo,telefone,celular').eq('id', requestRow.employee_id).single(),
        service.from('empresas').select('id,nome,cnpj').eq('id', requestRow.company_id).single(),
      ]);
      if (docError || !doc) throw new Error('document_not_found');
      if (receiptError || !receipt || !receipt.confirmed || receipt.status !== 'PAGAMENTO_CONFIRMADO') throw new Error('payment_not_confirmed');
      if (employeeError || !employee) throw new Error('employee_not_found');
      if (companyError || !company) throw new Error('company_not_found');

      const { data: fileBytes, error: fileError } = await service.storage.from('payroll-private').download(doc.storage_path);
      if (fileError || !fileBytes) throw new Error('document_download_failed');
      const bytes = Buffer.from(await fileBytes.arrayBuffer());
      const recomputedHash = sha256(bytes);
      if (!safeEqualHex(recomputedHash, doc.document_sha256)) {
        await appendPublicEvent(service, requestRow, req, 'INTEGRIDADE_DOCUMENTO_FALHOU', { expected: doc.document_sha256, computed: recomputedHash });
        return sendJson(res, { ok: false, error: 'document_integrity_failed' }, 409);
      }

      const signatureId = randomUUID();
      const signedAt = new Date().toISOString();
      const ua = userAgent(req);
      const ip = clientIp(req);
      const parsed = parseBrowserDevice(ua);
      const evidence: Record<string, any> = {
        signature_id: signatureId,
        employee_name: employee.nome,
        employee_cpf: employee.cpf,
        phone_used: requestRow.phone_snapshot,
        company_name: company.nome,
        company_cnpj: company.cnpj,
        employee_role: employee.cargo || '',
        competencia: requestRow.competencia,
        document_id: doc.id,
        receipt_id: receipt.id,
        net_amount: doc.net_amount,
        payment_at: receipt.paid_at,
        link_sent_at: requestRow.sent_at,
        opened_at: requestRow.opened_at,
        otp_validated_at: requestRow.otp_validated_at,
        viewed_at: requestRow.viewed_at,
        signed_at: signedAt,
        timezone: 'America/Sao_Paulo',
        ip,
        user_agent: ua,
        browser: parsed.browser,
        device: parsed.device,
        authentication_method: 'OTP',
        document_sha256_before: doc.document_sha256,
        document_sha256_final: recomputedHash,
        document_version: doc.document_version,
      };
      const certificate = buildCertificatePdf(evidence);
      const certificateHash = sha256(certificate);
      const certPath = `${requestRow.company_id}/${requestRow.competencia}/certificados/${requestRow.employee_id}/${signatureId}.pdf`;
      const { error: uploadError } = await service.storage.from('payroll-private').upload(certPath, certificate, { contentType: 'application/pdf', upsert: false });
      if (uploadError) throw uploadError;

      const { error: signError } = await service.from('payroll_signatures').insert({
        id: signatureId,
        request_id: requestRow.id,
        company_id: requestRow.company_id,
        employee_id: requestRow.employee_id,
        document_id: doc.id,
        receipt_id: receipt.id,
        competencia: requestRow.competencia,
        employee_name: employee.nome,
        employee_cpf: employee.cpf,
        phone_used: requestRow.phone_snapshot,
        company_name: company.nome,
        company_cnpj: company.cnpj,
        employee_role: employee.cargo || '',
        net_amount: doc.net_amount,
        payment_at: receipt.paid_at,
        link_sent_at: requestRow.sent_at,
        opened_at: requestRow.opened_at,
        otp_validated_at: requestRow.otp_validated_at,
        viewed_at: requestRow.viewed_at,
        signed_at: signedAt,
        ip,
        user_agent: ua,
        browser: parsed.browser,
        device: parsed.device,
        authentication_method: 'OTP',
        session_fingerprint: requestRow.session_hash,
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
          const { data: existing } = await service.from('payroll_signatures').select('id,signed_at').eq('request_id', requestRow.id).single();
          return sendJson(res, { ok: true, signed: true, signature_id: existing.id, signed_at: existing.signed_at, deduplicated: true });
        }
        throw signError;
      }

      const { error: updateError } = await service.from('payroll_signature_requests').update({
        status: 'ASSINADO',
        signed_at: signedAt,
        session_hash: null,
        session_expires_at: null,
        next_reminder_at: null,
      }).eq('id', requestRow.id);
      if (updateError) throw updateError;
      await service.from('payroll_otp_challenges').update({ status: 'CANCELADO' }).eq('request_id', requestRow.id).eq('status', 'PENDENTE');
      await service.from('payroll_reminder_jobs').update({ status: 'CANCELADO', processed_at: signedAt }).eq('request_id', requestRow.id).in('status', ['PENDENTE','PROCESSANDO']);
      await appendPublicEvent(service, requestRow, req, 'ASSINADO_E_SE LADO'.replace(' ', ''), {
        signature_id: signatureId,
        certificate_sha256: certificateHash,
        document_sha256: recomputedHash,
      });
      await addEvent(service, {
        request_id: requestRow.id,
        company_id: requestRow.company_id,
        employee_id: requestRow.employee_id,
        event_type: 'DOCUMENTO_SELADO',
        actor_type: 'SYSTEM',
        payload: { signature_id: signatureId, document_sha256: recomputedHash, certificate_sha256: certificateHash },
      });
      return sendJson(res, { ok: true, signed: true, signature_id: signatureId, signed_at: signedAt });
    }

    return sendJson(res, { ok: false, error: 'unknown_action' }, 400);
  } catch (error: any) {
    return sendJson(res, { ok: false, error: String(error?.message || error) }, Number(error?.status || 500));
  }
}
