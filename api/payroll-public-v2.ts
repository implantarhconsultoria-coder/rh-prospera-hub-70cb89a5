import originalHandler from './payroll-public.js';
import {
  addEvent,
  clientIp,
  digits,
  getServiceClient,
  randomToken,
  sendJson,
  sha256,
  userAgent,
} from '../src/server/payrollServer.js';

const AUTH_METHOD = 'CPF_NASCIMENTO_CELULAR4';
const SESSION_MINUTES = 30;
const MAX_IP_ATTEMPTS_15M = 8;
const MAX_CPF_ATTEMPTS_15M = 5;

const bodyOf = (req: any) => {
  if (req?.body && typeof req.body === 'object') return req.body;
  if (typeof req?.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return {};
};

const genericIdentityError = (res: any, status = 401) =>
  sendJson(res, { ok: false, error: 'identity_not_validated' }, status);

const assertCompanyEnabled = async (service: any, companyId: string) => {
  const { data, error } = await service.rpc('payroll_company_enabled', { p_company_id: companyId });
  if (error || !data) throw Object.assign(new Error('company_not_enabled'), { status: 403 });
};

const availableDocuments = async (service: any, employeeId: string, companyId: string) => {
  const { data: docs, error: docsError } = await service
    .from('payroll_documents')
    .select('id,company_id,employee_id,competencia,document_version,confirmed,status,is_current,created_at')
    .eq('employee_id', employeeId)
    .eq('company_id', companyId)
    .eq('is_current', true)
    .eq('confirmed', true)
    .eq('status', 'AGUARDANDO_PAGAMENTO')
    .order('competencia', { ascending: false });
  if (docsError) throw docsError;
  if (!docs?.length) return [];

  const ids = docs.map((doc: any) => doc.id);
  const [{ data: receipts, error: receiptError }, { data: signatures, error: signatureError }] = await Promise.all([
    service.from('payroll_payment_receipts').select('document_id,paid_at,status,confirmed').in('document_id', ids).eq('status', 'PAGAMENTO_CONFIRMADO').eq('confirmed', true),
    service.from('payroll_signatures').select('document_id,signed_at').in('document_id', ids),
  ]);
  if (receiptError) throw receiptError;
  if (signatureError) throw signatureError;

  const receiptByDoc = new Map((receipts || []).map((row: any) => [row.document_id, row]));
  const signatureByDoc = new Map((signatures || []).map((row: any) => [row.document_id, row]));
  return docs
    .filter((doc: any) => receiptByDoc.has(doc.id))
    .map((doc: any) => ({
      document_id: doc.id,
      competencia: doc.competencia,
      document_version: doc.document_version,
      payment_at: (receiptByDoc.get(doc.id) as any)?.paid_at || null,
      signed: Boolean(signatureByDoc.get(doc.id)),
      signed_at: (signatureByDoc.get(doc.id) as any)?.signed_at || null,
    }));
};

const authenticate = async (req: any, res: any, body: any) => {
  const service = getServiceClient();
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

  // A identidade é válida mesmo sem documento já liberado.
  // A lista abaixo permanece vazia até HOLERITE CONFERIDO + PAGAMENTO CONFIRMADO.
  const documents = await availableDocuments(service, match.employee_id, match.company_id);

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
  await addEvent(service, {
    company_id: match.company_id,
    employee_id: match.employee_id,
    event_type: 'PORTAL_IDENTIDADE_VALIDADA',
    actor_type: 'EMPLOYEE',
    ip,
    user_agent: userAgent(req),
    payload: { auth_method: AUTH_METHOD, session_id: sessionRow.id, expires_at: expiresAt, available_documents: documents.length },
  });

  return sendJson(res, {
    ok: true,
    session: rawSession,
    session_expires_at: expiresAt,
    employee_name: employee.nome,
    employee_role: employee.cargo || '',
    company_name: company.nome,
    documents,
    document_release_pending: documents.length === 0,
    release_rule: 'HOLERITE_CONFERIDO_E_PAGAMENTO_CONFIRMADO',
  });
};

export default async function handler(req: any, res?: any) {
  if ((req?.method || 'GET') !== 'POST') return sendJson(res, { ok: false, error: 'method_not_allowed' }, 405);
  const body = bodyOf(req);
  if (String(body.action || '') !== 'authenticate') return originalHandler(req, res);

  try {
    return await authenticate(req, res, body);
  } catch (error: any) {
    const status = Number(error?.status || 500);
    return sendJson(res, { ok: false, error: String(error?.message || error) }, status);
  }
}
