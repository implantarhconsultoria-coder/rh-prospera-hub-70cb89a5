import { randomUUID } from 'node:crypto';
import {
  clientIp,
  getServiceClient,
  readBody,
  sendJson,
  sha256,
  userAgent,
} from '../src/server/payrollServer.js';

const FACE_BUCKET = 'payroll-face-private';
const FACE_MODEL = 'vladmandic-face-api-1.7.12';
const MATCH_THRESHOLD = 0.52;
const MAX_FACE_FAILURES_15M = 10;

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

const validateMechanicAccess = async (service: any, rawAccessId: unknown) => {
  const accessId = String(rawAccessId || '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(accessId)) {
    throw Object.assign(new Error('invalid_access'), { status: 401 });
  }

  const { data: access, error: accessError } = await service
    .from('acessos_externos')
    .select('id,funcionario_id,nome,empresa,filial,funcao,modulo,status,acesso_liberado,ativo')
    .eq('id', accessId)
    .eq('modulo', 'mecanico')
    .eq('status', 'ativo')
    .eq('acesso_liberado', true)
    .eq('ativo', true)
    .maybeSingle();
  if (accessError || !access?.funcionario_id) {
    throw Object.assign(new Error('invalid_access'), { status: 401 });
  }

  const { data: employee, error: employeeError } = await service
    .from('funcionarios')
    .select('id,nome,empresa_id,ativo')
    .eq('id', access.funcionario_id)
    .maybeSingle();
  if (employeeError || !employee?.empresa_id || employee.ativo === false) {
    throw Object.assign(new Error('invalid_access'), { status: 401 });
  }

  return { access, employee };
};

const addFaceEvent = async (service: any, req: any, input: {
  companyId: string;
  employeeId: string;
  eventType: string;
  accessId: string;
  distance?: number | null;
  score?: number | null;
  evidence?: { bucket: string; path: string; sha256: string } | null;
}) => {
  const { data, error } = await service.from('payroll_face_events').insert({
    company_id: input.companyId,
    employee_id: input.employeeId,
    event_type: input.eventType,
    match_distance: input.distance ?? null,
    face_score: input.score ?? null,
    evidence_bucket: input.evidence?.bucket || null,
    evidence_path: input.evidence?.path || null,
    evidence_sha256: input.evidence?.sha256 || null,
    ip: clientIp(req),
    user_agent: userAgent(req),
    metadata: { access_id: input.accessId, source: 'APP_MECANICO' },
  }).select('id,created_at').single();
  if (error) throw error;
  return data;
};

const status = async (service: any, body: any) => {
  const { access, employee } = await validateMechanicAccess(service, body.access_id);
  const { data, error } = await service.from('payroll_face_profiles')
    .select('id,active,enrolled_at,model')
    .eq('company_id', employee.empresa_id)
    .eq('employee_id', employee.id)
    .maybeSingle();
  if (error) throw error;
  return {
    ok: true,
    access_id: access.id,
    enrolled: Boolean(data?.active),
    enrolled_at: data?.enrolled_at || null,
  };
};

const enroll = async (service: any, req: any, body: any) => {
  const descriptor = parseDescriptor(body.descriptor);
  const faceScore = Number(body.face_score || 0);
  if (!Number.isFinite(faceScore) || faceScore < 0.45) {
    throw Object.assign(new Error('face_not_clear'), { status: 400 });
  }

  const { access, employee } = await validateMechanicAccess(service, body.access_id);
  const { data: existing, error: existingError } = await service.from('payroll_face_profiles')
    .select('id,active')
    .eq('company_id', employee.empresa_id)
    .eq('employee_id', employee.id)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing?.active) {
    return { ok: true, enrolled: true, already_enrolled: true, access_id: access.id };
  }

  const evidence = await saveEvidence(service, {
    companyId: employee.empresa_id,
    employeeId: employee.id,
    eventType: 'MECHANIC_ENROLLMENT_FACE_CAPTURED',
    snapshot: body.snapshot,
  });
  const now = new Date().toISOString();
  const { error: upsertError } = await service.from('payroll_face_profiles').upsert({
    company_id: employee.empresa_id,
    employee_id: employee.id,
    descriptor,
    model: FACE_MODEL,
    enrollment_method: 'MECHANIC_PIN_ACCESS',
    active: true,
    enrolled_at: now,
    updated_at: now,
  }, { onConflict: 'company_id,employee_id' });
  if (upsertError) throw upsertError;

  await addFaceEvent(service, req, {
    companyId: employee.empresa_id,
    employeeId: employee.id,
    accessId: access.id,
    eventType: 'MECHANIC_ENROLLMENT_FACE_CAPTURED',
    score: faceScore,
    evidence,
  });

  return { ok: true, enrolled: true, access_id: access.id, enrolled_at: now };
};

const identify = async (service: any, req: any, body: any) => {
  const descriptor = parseDescriptor(body.descriptor);
  const faceScore = Number(body.face_score || 0);
  if (!Number.isFinite(faceScore) || faceScore < 0.45) {
    throw Object.assign(new Error('face_not_clear'), { status: 400 });
  }

  const ip = clientIp(req) || 'unknown';
  const cutoff = new Date(Date.now() - 15 * 60_000).toISOString();
  const { count } = await service.from('payroll_public_access_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('ip', ip)
    .eq('success', false)
    .in('failure_reason', ['MECHANIC_FACE_NO_MATCH', 'MECHANIC_FACE_AMBIGUOUS'])
    .gte('created_at', cutoff);
  if (Number(count || 0) >= MAX_FACE_FAILURES_15M) {
    throw Object.assign(new Error('too_many_attempts'), { status: 429 });
  }

  const { data: accesses, error: accessError } = await service.from('acessos_externos')
    .select('id,funcionario_id,nome')
    .eq('modulo', 'mecanico')
    .eq('status', 'ativo')
    .eq('acesso_liberado', true)
    .eq('ativo', true)
    .not('funcionario_id', 'is', null);
  if (accessError) throw accessError;
  if (!accesses?.length) throw Object.assign(new Error('face_not_registered'), { status: 401 });

  const employeeIds = [...new Set(accesses.map((row: any) => row.funcionario_id).filter(Boolean))];
  const [{ data: employees, error: employeeError }, { data: profiles, error: profileError }] = await Promise.all([
    service.from('funcionarios').select('id,nome,empresa_id,ativo').in('id', employeeIds),
    service.from('payroll_face_profiles').select('employee_id,company_id,descriptor,active').in('employee_id', employeeIds).eq('active', true),
  ]);
  if (employeeError) throw employeeError;
  if (profileError) throw profileError;

  const employeeById = new Map((employees || []).filter((row: any) => row.ativo !== false).map((row: any) => [row.id, row]));
  const accessByEmployee = new Map(accesses.map((row: any) => [row.funcionario_id, row]));
  const ranked = (profiles || [])
    .filter((profile: any) => {
      const employee: any = employeeById.get(profile.employee_id);
      return employee && employee.empresa_id === profile.company_id && accessByEmployee.has(profile.employee_id);
    })
    .map((profile: any) => ({
      profile,
      distance: euclideanDistance(descriptor, Array.isArray(profile.descriptor) ? profile.descriptor.map(Number) : []),
    }))
    .sort((a: any, b: any) => a.distance - b.distance);

  if (!ranked.length) throw Object.assign(new Error('face_not_registered'), { status: 401 });
  const best = ranked[0];
  const second = ranked[1];
  const ambiguous = Boolean(second && second.distance - best.distance < 0.035);
  if (best.distance > MATCH_THRESHOLD || ambiguous) {
    await service.from('payroll_public_access_attempts').insert({
      identifier_hash: sha256(`mechanic-face:${ip}`),
      ip,
      success: false,
      failure_reason: ambiguous ? 'MECHANIC_FACE_AMBIGUOUS' : 'MECHANIC_FACE_NO_MATCH',
    });
    throw Object.assign(new Error('face_not_recognized'), { status: 401 });
  }

  const employee: any = employeeById.get(best.profile.employee_id);
  const access: any = accessByEmployee.get(best.profile.employee_id);
  if (!employee || !access) throw Object.assign(new Error('face_not_recognized'), { status: 401 });

  const evidence = await saveEvidence(service, {
    companyId: employee.empresa_id,
    employeeId: employee.id,
    eventType: 'MECHANIC_ACCESS_FACE_VERIFIED',
    snapshot: body.snapshot,
  });

  await addFaceEvent(service, req, {
    companyId: employee.empresa_id,
    employeeId: employee.id,
    accessId: access.id,
    eventType: 'MECHANIC_ACCESS_FACE_VERIFIED',
    distance: best.distance,
    score: faceScore,
    evidence,
  });

  await service.from('acessos_externos').update({ ultimo_acesso_em: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', access.id);

  return {
    ok: true,
    access_id: access.id,
    employee_name: access.nome || employee.nome,
    match_distance: best.distance,
  };
};

export default async function handler(req: any, res?: any) {
  if ((req?.method || 'GET') !== 'POST') return sendJson(res, { ok: false, error: 'method_not_allowed' }, 405);
  try {
    const service = getServiceClient();
    const body = readBody(req);
    const action = String(body.action || '');
    if (action === 'status') return sendJson(res, await status(service, body));
    if (action === 'enroll') return sendJson(res, await enroll(service, req, body));
    if (action === 'identify') return sendJson(res, await identify(service, req, body));
    return sendJson(res, { ok: false, error: 'invalid_action' }, 400);
  } catch (error: any) {
    console.error('[mechanic-face]', error?.message || error);
    return sendJson(res, { ok: false, error: error?.message || 'internal_error' }, Number(error?.status || 500));
  }
}
