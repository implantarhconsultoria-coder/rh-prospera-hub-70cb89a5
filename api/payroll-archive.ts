import {
  getServiceClient,
  readBody,
  sendJson,
  sha256,
} from '../src/server/payrollServer.js';

const COMPANY_SCOPE_CNPJS: Record<string, string> = {
  'topac-matriz': '07291648000103',
  'topac-pg': '07291648000294',
  'topac-gyn': '07291648000375',
  alqui: '14464586000150',
  lmt: '21967711000100',
};

const normalizeCompanyScope = (value: unknown) => String(value || '').trim().toLowerCase();
const digits = (value: unknown) => String(value || '').replace(/\D/g, '');
const normalizeText = (value: unknown) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();

const resolveCompanyScope = async (service: any, rawScope: unknown) => {
  const scope = normalizeCompanyScope(rawScope);
  const expectedCnpj = COMPANY_SCOPE_CNPJS[scope];
  if (!expectedCnpj) throw Object.assign(new Error('invalid_company_scope'), { status: 404 });

  const { data: companies, error } = await service.from('empresas').select('id,nome,cnpj');
  if (error) throw error;
  const company = (companies || []).find((row: any) => digits(row.cnpj) === expectedCnpj);
  if (!company) throw Object.assign(new Error('invalid_company_scope'), { status: 404 });

  const { data: enabled, error: enabledError } = await service.rpc('payroll_company_enabled', { p_company_id: company.id });
  if (enabledError || !enabled) throw Object.assign(new Error('company_not_enabled'), { status: 403 });
  return { scope, companyId: company.id, companyName: company.nome };
};

const validatePublicSession = async (service: any, rawSession: string, expectedCompanyId: string) => {
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
  if (data.company_id !== expectedCompanyId) {
    throw Object.assign(new Error('invalid_session'), { status: 401 });
  }

  await service.from('payroll_public_sessions').update({ last_used_at: new Date().toISOString() }).eq('id', data.id);
  return data;
};

const createFileUrl = async (service: any, bucket: string, path: string) => {
  if (!path) return null;
  const { data, error } = await service.storage.from(bucket).createSignedUrl(path, 30 * 60);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
};

const benefitFlags = (value: string) => {
  const text = normalizeText(value);
  const vr = /(^|[^a-z])vr([^a-z]|$)/.test(text)
    || text.includes('vale refeicao')
    || text.includes('vale-refeicao')
    || text.includes('vale alimentacao');
  const vt = /(^|[^a-z])vt([^a-z]|$)/.test(text)
    || text.includes('vale transporte')
    || text.includes('vale-transporte');
  return { vr, vt };
};

const loadArchive = async (service: any, employeeId: string, companyId: string) => {
  const { data: payrollDocs, error: payrollError } = await service
    .from('payroll_documents')
    .select('id,document_type,competencia,storage_bucket,storage_path,original_filename,created_at,confirmed_at,is_current,confirmed')
    .eq('employee_id', employeeId)
    .eq('company_id', companyId)
    .eq('is_current', true)
    .eq('confirmed', true)
    .order('competencia', { ascending: false });
  if (payrollError) throw payrollError;

  const payrollIds = (payrollDocs || []).map((doc: any) => doc.id);
  const [{ data: signatures, error: signatureError }, { data: confirmedPayments, error: paymentError }] = await Promise.all([
    payrollIds.length
      ? service.from('payroll_signatures').select('document_id,signed_at').in('document_id', payrollIds)
      : Promise.resolve({ data: [], error: null }),
    payrollIds.length
      ? service.from('payroll_payment_receipts').select('document_id').in('document_id', payrollIds).eq('status', 'PAGAMENTO_CONFIRMADO').eq('confirmed', true)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (signatureError) throw signatureError;
  if (paymentError) throw paymentError;

  const signatureByDocument = new Map((signatures || []).map((row: any) => [row.document_id, row]));
  const paidDocuments = new Set((confirmedPayments || []).map((row: any) => row.document_id));

  const signedPayroll = (payrollDocs || []).filter((doc: any) => {
    if (!signatureByDocument.has(doc.id)) return false;
    if (doc.document_type === 'HOLERITE' && !paidDocuments.has(doc.id)) return false;
    return true;
  });

  const { data: benefitDocs, error: benefitError } = await service
    .from('documentos_funcionario')
    .select('id,tipo_documento,categoria,competencia,descricao,nome_arquivo,data_documento,created_at,storage_bucket,storage_path,arquivo_url,origem')
    .eq('funcionario_id', employeeId)
    .eq('company_id', companyId)
    .neq('origem', 'payroll_portal')
    .order('data_documento', { ascending: false });
  if (benefitError) throw benefitError;

  const historicalBenefits = (benefitDocs || []).filter((doc: any) => {
    const flags = benefitFlags([doc.tipo_documento, doc.categoria, doc.descricao, doc.nome_arquivo].filter(Boolean).join(' | '));
    return flags.vr || flags.vt;
  });

  const payrollItems = await Promise.all(signedPayroll.map(async (doc: any) => {
    const signature: any = signatureByDocument.get(doc.id);
    const bucket = doc.storage_bucket || 'payroll-private';
    const url = await createFileUrl(service, bucket, doc.storage_path);
    if (!url) return null;
    const isBenefit = doc.document_type === 'BENEFICIO_VR_VT';
    return {
      id: `payroll:${doc.id}`,
      source: 'payroll',
      category: isBenefit ? 'beneficio' : 'pagamento',
      benefit_types: isBenefit ? ['VR', 'VT'] : [],
      label: isBenefit ? 'Recibo VR / VT' : 'Holerite',
      competencia: doc.competencia,
      filename: doc.original_filename || '',
      date: signature?.signed_at || doc.confirmed_at || doc.created_at,
      signed: true,
      signed_at: signature?.signed_at || null,
      url,
    };
  }));

  const benefitItems = await Promise.all(historicalBenefits.map(async (doc: any) => {
    const text = [doc.tipo_documento, doc.categoria, doc.descricao, doc.nome_arquivo].filter(Boolean).join(' | ');
    const flags = benefitFlags(text);
    const path = doc.storage_path || (doc.arquivo_url && !/^https?:\/\//i.test(doc.arquivo_url) ? doc.arquivo_url : '');
    const bucket = doc.storage_bucket || 'documentos-funcionarios';
    const url = path
      ? await createFileUrl(service, bucket, path)
      : (/^https?:\/\//i.test(doc.arquivo_url || '') ? doc.arquivo_url : null);
    if (!url) return null;
    return {
      id: `benefit:${doc.id}`,
      source: 'historico',
      category: 'beneficio',
      benefit_types: [flags.vr ? 'VR' : null, flags.vt ? 'VT' : null].filter(Boolean),
      label: flags.vr && flags.vt ? 'Recibo VR + VT' : flags.vr ? 'Recibo VR' : 'Recibo VT',
      competencia: doc.competencia || '',
      filename: doc.nome_arquivo || '',
      date: doc.data_documento || doc.created_at,
      signed: false,
      signed_at: null,
      url,
    };
  }));

  return [...payrollItems, ...benefitItems]
    .filter(Boolean)
    .sort((a: any, b: any) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
};

export default async function handler(req: any, res?: any) {
  if ((req?.method || 'GET') !== 'POST') return sendJson(res, { ok: false, error: 'method_not_allowed' }, 405);

  try {
    const service = getServiceClient();
    const body = readBody(req);
    const scopedCompany = await resolveCompanyScope(service, body.company_scope);
    const sessionRow = await validatePublicSession(service, String(body.session || ''), scopedCompany.companyId);

    const [{ data: employee }, documents] = await Promise.all([
      service.from('funcionarios').select('id,nome,cargo').eq('id', sessionRow.employee_id).single(),
      loadArchive(service, sessionRow.employee_id, sessionRow.company_id),
    ]);

    return sendJson(res, {
      ok: true,
      employee_name: employee?.nome || '',
      employee_role: employee?.cargo || '',
      company_name: scopedCompany.companyName,
      documents,
      session_expires_at: sessionRow.expires_at,
    });
  } catch (error: any) {
    const message = String(error?.message || error);
    const status = Number(error?.status || 500);
    const safeMessage = ['invalid_session', 'session_required', 'session_expired', 'company_not_enabled', 'invalid_company_scope'].includes(message)
      ? message
      : 'request_failed';
    return sendJson(res, { ok: false, error: safeMessage }, status);
  }
}
