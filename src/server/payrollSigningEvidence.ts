// Consulta feita exclusivamente no servidor: a tela do funcionário não comprova, sozinha,
// que uma verificação facial ocorreu para este documento e nesta sessão.
const FACE_EVENT_TTL_MS = 5 * 60 * 1000;

export type SigningFaceEvidence = {
  authenticationMethod: string;
  faceEventId: string | null;
  faceVerifiedAt: string | null;
  faceSnapshotSha256: string | null;
};

export const resolveSigningFaceEvidence = async (
  service: any,
  input: {
    companyId: string;
    employeeId: string;
    documentId: string;
    sessionHash: string;
    accessAuthMethod?: string;
    viewedAt: string | null;
    now?: Date;
  },
): Promise<SigningFaceEvidence> => {
  const { data: profile, error: profileError } = await service.from('payroll_face_profiles')
    .select('active')
    .eq('company_id', input.companyId)
    .eq('employee_id', input.employeeId)
    .maybeSingle();
  if (profileError) throw profileError;

  // Cadastro facial não é obrigatório por lei para todos os recibos trabalhistas.
  // Sem perfil ativo, o certificado identifica precisamente o método manual empregado.
  if (!profile?.active) return {
    authenticationMethod: input.accessAuthMethod || 'CPF_NASCIMENTO_CELULAR4',
    faceEventId: null,
    faceVerifiedAt: null,
    faceSnapshotSha256: null,
  };

  const now = input.now ?? new Date();
  const cutoff = new Date(now.getTime() - FACE_EVENT_TTL_MS).toISOString();
  const viewedAt = input.viewedAt && Number.isFinite(Date.parse(input.viewedAt))
    ? new Date(input.viewedAt).toISOString() : null;
  if (!viewedAt) throw Object.assign(new Error('document_not_acknowledged'), { status: 409 });
  const minimum = viewedAt > cutoff ? viewedAt : cutoff;

  const { data: faceEvent, error: eventError } = await service.from('payroll_face_events')
    .select('id,created_at,evidence_sha256')
    .eq('company_id', input.companyId)
    .eq('employee_id', input.employeeId)
    .eq('document_id', input.documentId)
    .eq('session_hash', input.sessionHash)
    .eq('event_type', 'SIGNATURE_FACE_VERIFIED')
    .gte('created_at', minimum)
    .lte('created_at', now.toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (eventError) throw eventError;
  if (!faceEvent?.id || !faceEvent?.created_at || !/^[a-f0-9]{64}$/i.test(String(faceEvent.evidence_sha256 || ''))) {
    throw Object.assign(new Error('signature_face_verification_required'), { status: 409 });
  }
  return {
    authenticationMethod: `${input.accessAuthMethod || 'CPF_NASCIMENTO_CELULAR4'}+SIGNATURE_FACE_RECOGNITION`,
    faceEventId: faceEvent.id,
    faceVerifiedAt: faceEvent.created_at,
    faceSnapshotSha256: faceEvent.evidence_sha256,
  };
};
