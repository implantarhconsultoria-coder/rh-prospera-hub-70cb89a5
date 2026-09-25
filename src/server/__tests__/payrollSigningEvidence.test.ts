import { describe, expect, it } from 'vitest';
import { resolveSigningFaceEvidence } from '../payrollSigningEvidence';
import { buildCertificatePdf, payrollBrazilDateTime } from '../payrollServer';

const NOW = new Date('2026-09-25T03:22:00.000Z');
const SHA = 'a'.repeat(64);
const input = {
  companyId: 'company-1', employeeId: 'employee-1', documentId: 'document-1',
  sessionHash: 'session-1', viewedAt: '2026-09-25T03:20:00.000Z', now: NOW,
};

const mockService = (active: boolean | null, event?: Record<string, unknown>, dbError?: Error) => ({
  from(table: string) {
    const where: Array<[string, string, unknown]> = [];
    const chain = {
      select: (_columns: string) => chain,
      eq: (key: string, value: unknown) => { where.push(['eq', key, value]); return chain; },
      gte: (key: string, value: unknown) => { where.push(['gte', key, value]); return chain; },
      lte: (key: string, value: unknown) => { where.push(['lte', key, value]); return chain; },
      order: (_key: string, _options: unknown) => chain,
      limit: (_value: number) => chain,
      async maybeSingle() {
        if (dbError) return { data: null, error: dbError };
        if (table === 'payroll_face_profiles') return { data: active == null ? null : { active }, error: null };
        if (table !== 'payroll_face_events' || !event) return { data: null, error: null };
        const found = where.every(([op, key, expected]) => {
          if (op === 'eq') return event[key] === expected;
          if (op === 'gte') return String(event[key]) >= String(expected);
          return String(event[key]) <= String(expected);
        });
        return { data: found ? event : null, error: null };
      },
    };
    return chain;
  },
});

const validEvent = {
  id: 'face-event-1', company_id: input.companyId, employee_id: input.employeeId,
  document_id: input.documentId, session_hash: input.sessionHash,
  event_type: 'SIGNATURE_FACE_VERIFIED', created_at: '2026-09-25T03:21:00.000Z',
  evidence_sha256: SHA,
};

describe('payroll — comprovação de autoria por documento', () => {
  it('descreve o método manual, sem alegar que houve biometria', async () => {
    const proof = await resolveSigningFaceEvidence(mockService(null), input);
    expect(proof).toEqual({ authenticationMethod: 'CPF_NASCIMENTO_CELULAR4',
      faceEventId: null, faceVerifiedAt: null, faceSnapshotSha256: null });
  });

  it('vincula evento facial verificável ao empregado, documento e sessão', async () => {
    const proof = await resolveSigningFaceEvidence(mockService(true, validEvent), input);
    expect(proof.authenticationMethod).toContain('FACE_RECOGNITION');
    expect(proof.faceEventId).toBe('face-event-1');
    expect(proof.faceSnapshotSha256).toBe(SHA);
  });

  it('não aceita evento de outro documento ou sessão', async () => {
    await expect(resolveSigningFaceEvidence(mockService(true, validEvent),
      { ...input, documentId: 'document-2' })).rejects.toThrow('signature_face_verification_required');
    await expect(resolveSigningFaceEvidence(mockService(true, validEvent),
      { ...input, sessionHash: 'session-2' })).rejects.toThrow('signature_face_verification_required');
  });

  it('não aceita prova anterior ao aceite nem prova com mais de cinco minutos', async () => {
    await expect(resolveSigningFaceEvidence(mockService(true, validEvent),
      { ...input, viewedAt: '2026-09-25T03:21:30.000Z' })).rejects.toThrow('signature_face_verification_required');
    await expect(resolveSigningFaceEvidence(mockService(true, { ...validEvent,
      created_at: '2026-09-25T03:15:00.000Z' }), input)).rejects.toThrow('signature_face_verification_required');
  });

  it('bloqueia prova sem hash de captura e falha fechada em erro de consulta', async () => {
    await expect(resolveSigningFaceEvidence(mockService(true, { ...validEvent,
      evidence_sha256: null }), input)).rejects.toThrow('signature_face_verification_required');
    await expect(resolveSigningFaceEvidence(mockService(true, validEvent, new Error('db-offline')),
      input)).rejects.toThrow('db-offline');
  });
});

describe('payroll — certificado de evidências', () => {
  it('converte UTC em horário real de Brasília, inclusive troca de dia', () => {
    expect(payrollBrazilDateTime('2026-09-25T02:30:00.000Z')).toContain('24/09/2026');
    expect(payrollBrazilDateTime('2026-09-25T02:30:00.000Z')).toContain('23:30:00');
  });

  it('não se apresenta como certificado qualificado ICP-Brasil', () => {
    const bytes = buildCertificatePdf({ signed_at: '2026-09-25T02:30:00.000Z',
      authentication_method: 'CPF_NASCIMENTO_CELULAR4+FACE_RECOGNITION',
      face_event_id: 'face-event-1' });
    const source = bytes.toString('latin1');
    expect(source).toContain('Data/hora Brasilia:');
    expect(source).toContain('face-event-1');
    expect(source).toContain('nao e certificado ICP-Brasil');
  });
});
