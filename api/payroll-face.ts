import { randomUUID } from 'node:crypto';
import {
  addEvent,
  assertCompanyEnabled,
  clientIp,
  getServiceClient,
  randomToken,
  readBody,
  sendJson,
  sha256,
  userAgent,
} from '../src/server/payrollServer.js';

const SESSION_MINUTES = 30;
const FACE_BUCKET = 'payroll-face-private';
const FACE_MODEL = 'vladmandic-face-api-1.7.12';
const MATCH_THRESHOLD = 0.52;
const MAX_IP_ATTEMPTS_15M = 10;

const COMPANY_SCOPE_CNPJS: Record<string, string> = {
  'topac-matriz': '07291648000103',
  'topac-pg': '07291648000294',
  'topac-gyn': '07291648000375',
  alqui: '14464586000150',
  lmt: '21967711000100',
};

const digits = (value: unknown) => String(value || '').replace(/\D/g, '');
const normalizeText = (value: unknown) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const signatureExcluded = (employee: any) => {
  const cargo = normalizeText(employee?.cargo);
  return cargo.includes('socio') || cargo.includes('pro labore') || cargo.includes('prolabore');
};

const resolveCompanyScope = async (service: any, rawScope: unknown) => {
  const scope = String(rawScope || '').trim().toLowerCase();
  const expectedCnpj = COMPANY_SCOPE_CNPJS[scope];
  if (!expectedCnpj) throw Object.assign(new Error('invalid_company_scope'), { status: 404 });

  const { data: companies, error } = await service.from('empresas').select('id,nome,cnpj');
  if (error) throw error;
  const company = (companies || []).find((row: any) => digits(row.cnpj) === expectedCnpj);
  if (!company) throw Object.assign(new Error('invalid_company_scope'), { status: 404 });
  await assertCompanyEnabled(service, company.id);
  return { scope, companyId: company.id, companyName: company.nome };
};

const validateSession = async (service: any, rawSession: string, companyId: string) => {
  if (!rawSession || rawSession.length < 32 || rawSession.length > 256) {
    throw Object.assign(new Error('session_required'), { status: 401 });
  }
  const sessionHash = sha256(rawSession);
  const { data, error } = await service
    .from('payroll_public_sessions')
    .select('*')
    .eq('session_hash', sessionHash)
    .eq('company_id', companyId)
    .is('revoked_at', null)
    .maybeSingle();
  if (error || !data) throw Object.assign(new Error('invalid_session'), { status: 401 });
  if (new Date(data.expires_at).getTime() <= Date.now()) {
    await service.from('payroll_public_sessions').update({ revoked_at: new Date().toISOString() }).eq('id', data.id);
    throw Object.assign(new Error('session_expired'), { status: 401 });
  }
  await service.from('payroll_public_sessions').update({ last_used_at: new Date().toISOString() }).eq('id', data.id);
  return data;
};

const parseDescriptor = (value: unknown) => {
  if (!Array.isArray(value) || value.length !== 128) {
    throw Object.assign(new Error('invalid_face_descriptor'), { status: 400 });
  }
  const descriptor = value.map((item) => Number(item));
  if (descriptor.some((item) => !Number.isFinite(item) || Math.abs(item) > 5)) {
    throw Object.assign(new Error('invalid_face_descriptor'), { status: 400 });
  }
  return descriptor;
};

const euclideanDistance = (a: number[], b: number[]) => {
  if (a.length !== b.length) return Number.POSITIVE_INFINITY;
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
};

const parseSnapshot = (value: unknown) => {
  const raw = String(value || '');
  const match = raw.match(/^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw Object.assign(new Error('invalid_face_snapshot'), { status: 400 });
  const buffer = Buffer.from(match[1], 'base64');
  if (!buffer.length || buffer.length > 900_000) {
    throw Object.assign(new Error('invalid_face_snapshot'), { status: 400 });
  }
  return buffer;
};

const saveEvidence = async (service: any, input: {
  companyId: string;
  employeeId: string;
  eventType: string;
  snapshot: unknown;
}) => {
  const buffer = parseSnapshot(input.snapshot);
  const now = new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const path = `${input.companyId}/${input.employeeId}/${yyyy}/${mm}/${input.eventType.toLowerCase()}-${Date.now()}-${randomUUID()}.jpg`;
  const { error } = await service.storage.from(FACE_BUCKET).upload(path, buffer, {
    contentType: 'image/jpeg',
    upsert: false,
    cacheControl: '0',
  });
  if (error) throw error;
  return { bucket: FACE_BUCKET, path, sha256: sha256(buffer) };
};

const addFaceEvent = async (service: any, req: any, data: {
  companyId: string;
  employeeId: string | null;
  documentId?: string | null;
  sessionHash?: string | null;
  eventType: string;
  matchDistance?: number | null;
  faceScore?: number | null;
  evidence?: { bucket: string; path: string; sha256: string } | null;
  metadata?: Record<string, unknown>;
}) => {
  const { data: row, error } = await service.from('payroll_face_events').insert({
    company_id: data.companyId,
    employee_id: data.employeeId,
    document_id: data.documentId || null,
    session_hash: data.sessionHash || null,
    event_type: data.eventType,
    match_distance: data.matchDistance ?? null,
    face_score: data.faceScore ?? null,
    evidence_bucket: data.evidence?.bucket || null,
    evidence_path: data.evidence?.path || null,
    evidence_sha256: data.evidence?.sha256 || null,
    ip: clientIp(req),
    user_agent: userAgent(req),
    metadata: data.metadata || {},
  }).select('id,created_at').single();
  if (error) throw error;
  return row;
};

const faceStatus = async (service: any, sessionRow: any) => {
  const { data, error } = await service.from('payroll_face_profiles')
    .select('id,active,enrolled_at,model')
    .eq('company_id', sessionRow.company_id)
    .eq('employee_id', sessionRow.employee_id)
    .maybeSingle();
  if (error) throw error;
  return { ok: true, enrolled: Boolean(data?.active), enrolled_at: data?.enrolled_at || null, model: data?.model || null };
};

const enroll = async (service: any, req: any, body: any, sessionRow: any) => {
  const descriptor = parseDescriptor(body.descriptor);
  const faceScore = Number(body.face_score || 0);
  if (!Number.isFinite(faceScore) || faceScore < 0.45) throw Object.assign(new Error('face_not_clear'), { status: 400 });

  const { data: employee, error: employeeError } = await service.from('funcionarios')
    .select('id,nome,cargo,ativo')
    .eq('id', sessionRow.employee_id)
    .single();
  if (employeeError || !employee || employee.ativo === false || signatureExcluded(employee)) {
    throw Object.assign(new Error('employee_not_available'), { status: 403 });
  }

  const evidence = await saveEvidence(service, {
    companyId: sessionRow.company_id,
    employeeId: sessionRow.employee_id,
    eventType: 'ENROLLMENT_FACE_CAPTURED',
    snapshot: body.snapshot,
  });

  const now = new Date().toISOString();
  const { error: upsertError } = await service.from('payroll_face_profiles').upsert({
    company_id: sessionRow.company_id,
    employee_id: sessionRow.employee_id,
    descriptor,
    model: FACE_MODEL,
    enrollment_method: 'TRUSTED_SESSION',
    active: true,
    enrolled_at: now,
    updated_at: now,
  }, { onConflict: 'company_id,employee_id' });
  if (upsertError) throw upsertError;

  const faceEvent = await addFaceEvent(service, req, {
    companyId: sessionRow.company_id,
    employeeId: sessionRow.employee_id,
    sessionHash: sessionRow.session_hash,
    eventType: 'ENROLLMENT_FACE_CAPTURED',
    faceScore,
    evidence,
    metadata: { model: FACE_MODEL, trusted_auth_method: sessionRow.auth_method },
  });

  await addEvent(service, {
    company_id: sessionRow.company_id,
    employee_id: sessionRow.employee_id,
    event_type: 'BIOMETRIA_FACIAL_CADASTRADA',
    actor_type: 'EMPLOYEE',
    ip: clientIp(req),
    user_agent: userAgent(req),
    payload: { face_event_id: faceEvent.id, model: FACE_MODEL },
  });

  return { ok: true, enrolled: true, enrolled_at: now };
};

const identify = async (service: any, req: any, body: any, scopedCompany: any) => {
  const descriptor = parseDescriptor(body.descriptor);
  const faceScore = Number(body.face_score || 0);
  if (!Number.isFinite(faceScore) || faceScore < 0.45) throw Object.assign(new Error('face_not_clear'), { status: 400 });

  const ip = clientIp(req) || 'unknown';
  const cutoff = new Date(Date.now() - 15 * 60_000).toISOString();
  const { count } = await service.from('payroll_public_access_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('ip', ip)
    .gte('created_at', cutoff);
  if (Number(count || 0) >= MAX_IP_ATTEMPTS_15M) {
    throw Object.assign(new Error('too_many_attempts'), { status: 429 });
  }

  const { data: profiles, error: profilesError } = await service.from('payroll_face_profiles')
    .select('employee_id,descriptor')
    .eq('company_id', scopedCompany.companyId)
    .eq('active', true);
  if (profilesError) throw profilesError;
  if (!profiles?.length) throw Object.assign(new Error('face_not_registered'), { status: 401 });

  const ranked = profiles
    .map((profile: any) => ({
      employeeId: profile.employee_id,
      distance: euclideanDistance(descriptor, Array.isArray(profile.descriptor) ? profile.descriptor.map(Number) : []),
    }))
    .sort((a: any, b: any) => a.distance - b.distance);
  const best = ranked[0];
  const second = ranked[1];
  const ambiguous = second && second.distance - best.distance < 0.035;
  if (!best || best.distance > MATCH_THRESHOLD || ambiguous) {
    await service.from('payroll_public_access_attempts').insert({
      identifier_hash: sha256(`payroll-face:${scopedCompany.companyId}:${ip}`),
      ip,
      success: false,
      failure_reason: ambiguous ? 'FACE_AMBIGUOUS' : 'FACE_NO_MATCH',
      company_id: scopedCompany.companyId,
    });
    throw Object.assign(new Error('face_not_recognized'), { status: 401 });
  }

  const { data: employee, error: employeeError } = await service.from('funcionarios')
    .select('id,nome,cargo,ativo')
    .eq('id', best.employeeId)
    .eq('empresa_id', scopedCompany.companyId)
    .maybeSingle();
  if (employeeError || !employee || employee.ativo === false || signatureExcluded(employee)) {
    throw Object.assign(new Error('face_not_recognized'), { status: 401 });
  }

  const evidence = await saveEvidence(service, {
    companyId: scopedCompany.companyId,
    employeeId: employee.id,
    eventType: 'ACCESS_FACE_VERIFIED',
    snapshot: body.snapshot,
  });

  const rawSession = randomToken();
  const sessionHash = sha256(rawSession);
  const expiresAt = new Date(Date.now() + SESSION_MINUTES * 60_000).toISOString();
  const { data: sessionRow, error: sessionError } = await service.from('payroll_public_sessions').insert({
    company_id: scopedCompany.companyId,
    employee_id: employee.id,
    session_hash: sessionHash,
    auth_method: 'FACE_RECOGNITION',
    expires_at: expiresAt,
    ip: clientIp(req),
    user_agent: userAgent(req),
  }).select('*').single();
  if (sessionError) throw sessionError;

  await service.from('payroll_public_access_attempts').insert({
    identifier_hash: sha256(`payroll-face:${scopedCompany.companyId}:${employee.id}`),
    ip,
    success: true,
    failure_reason: null,
    company_id: scopedCompany.companyId,
    employee_id: employee.id,
  });

  const faceEvent = await addFaceEvent(service, req, {
    companyId: scopedCompany.companyId,
    employeeId: employee.id,
    sessionHash,
    eventType: 'ACCESS_FACE_VERIFIED',
    matchDistance: best.distance,
    faceScore,
    evidence,
    metadata: { model: FACE_MODEL, threshold: MATCH_THRESHOLD },
  });

  await addEvent(service, {
    company_id: scopedCompany.companyId,
    employee_id: employee.id,
    event_type: 'ACESSO_FACIAL_VALIDADO',
    actor_type: 'EMPLOYEE',
    ip: clientIp(req),
    user_agent: userAgent(req),
    payload: { face_event_id: faceEvent.id, match_distance: best.distance, auth_method: 'FACE_RECOGNITION' },
  });

  return {
    ok: true,
    session: rawSession,
    session_expires_at: expiresAt,
    employee_name: employee.nome,
    employee_role: employee.cargo || '',
    company_name: scopedCompany.companyName,
  };
};

const verifySignature = async (service: any, req: any, body: any, sessionRow: any) => {
  const descriptor = parseDescriptor(body.descriptor);
  const faceScore = Number(body.face_score || 0);
  const documentId = String(body.document_id || '');
  if (!documentId) throw Object.assign(new Error('document_required'), { status: 400 });
  if (!Number.isFinite(faceScore) || faceScore < 0.45) throw Object.assign(new Error('face_not_clear'), { status: 400 });

  const [{ data: profile, error: profileError }, { data: doc, error: docError }] = await Promise.all([
    service.from('payroll_face_profiles').select('descriptor,active').eq('company_id', sessionRow.company_id).eq('employee_id', sessionRow.employee_id).maybeSingle(),
    service.from('payroll_documents').select('id').eq('id', documentId).eq('company_id', sessionRow.company_id).eq('employee_id', sessionRow.employee_id).maybeSingle(),
  ]);
  if (profileError) throw profileError;
  if (docError) throw docError;
  if (!profile?.active) throw Object.assign(new Error('face_not_registered'), { status: 409 });
  if (!doc) throw Object.assign(new Error('document_not_available'), { status: 404 });

  const stored = Array.isArray(profile.descriptor) ? profile.descriptor.map(Number) : [];
  const distance = euclideanDistance(descriptor, stored);
  if (distance > MATCH_THRESHOLD) throw Object.assign(new Error('face_not_recognized'), { status: 401 });

  const evidence = await saveEvidence(service, {
    companyId: sessionRow.company_id,
    employeeId: sessionRow.employee_id,
    eventType: 'SIGNATURE_FACE_VERIFIED',
    snapshot: body.snapshot,
  });

  const faceEvent = await addFaceEvent(service, req, {
    companyId: sessionRow.company_id,
    employeeId: sessionRow.employee_id,
    documentId,
    sessionHash: sessionRow.session_hash,
    eventType: 'SIGNATURE_FACE_VERIFIED',
    matchDistance: distance,
    faceScore,
    evidence,
    metadata: { model: FACE_MODEL, threshold: MATCH_THRESHOLD },
  });

  await addEvent(service, {
    company_id: sessionRow.company_id,
    employee_id: sessionRow.employee_id,
    event_type: 'FACE_ASSINATURA_VALIDADA',
    actor_type: 'EMPLOYEE',
    ip: clientIp(req),
    user_agent: userAgent(req),
    payload: { face_event_id: faceEvent.id, document_id: documentId, match_distance: distance },
  });

  return { ok: true, verified: true, match_distance: distance, verified_at: faceEvent.created_at };
};

export default async function handler(req: any, res?: any) {
  if ((req?.method || 'GET') !== 'POST') return sendJson(res, { ok: false, error: 'method_not_allowed' }, 405);

  try {
    const service = getServiceClient();
    const body = readBody(req);
    const action = String(body.action || '');
    const scopedCompany = await resolveCompanyScope(service, body.company_scope);

    if (action === 'identify') {
      const result = await identify(service, req, body, scopedCompany);
      return sendJson(res, result);
    }

    const sessionRow = await validateSession(service, String(body.session || ''), scopedCompany.companyId);
    if (action === 'status') return sendJson(res, await faceStatus(service, sessionRow));
    if (action === 'enroll') return sendJson(res, await enroll(service, req, body, sessionRow));
    if (action === 'verify_signature') return sendJson(res, await verifySignature(service, req, body, sessionRow));
    return sendJson(res, { ok: false, error: 'invalid_action' }, 400);
  } catch (error: any) {
    console.error('[payroll-face]', error?.message || error);
    return sendJson(res, { ok: false, error: error?.message || 'internal_error' }, Number(error?.status || 500));
  }
}
