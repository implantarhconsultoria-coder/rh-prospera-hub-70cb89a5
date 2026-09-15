import fs from 'node:fs';

const replaceOnce = (source, before, after, label) => {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`[facial-access-guard] trecho não encontrado: ${label}`);
  return source.replace(before, after);
};

// 1) O limite do facial conta somente falhas faciais reais daquela empresa.
{
  const path = 'api/payroll-face.ts';
  let source = fs.readFileSync(path, 'utf8');
  source = replaceOnce(
    source,
`  const { count } = await service.from('payroll_public_access_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('ip', ip)
    .gte('created_at', cutoff);`,
`  const { count } = await service.from('payroll_public_access_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('ip', ip)
    .eq('company_id', scopedCompany.companyId)
    .eq('success', false)
    .in('failure_reason', ['FACE_NO_MATCH', 'FACE_AMBIGUOUS'])
    .gte('created_at', cutoff);`,
    'limite facial isolado',
  );
  fs.writeFileSync(path, source, 'utf8');
}

// 2) O login por CPF/data/celular não é bloqueado por tentativas do reconhecimento facial.
{
  const path = 'api/payroll-public.ts';
  let source = fs.readFileSync(path, 'utf8');

  if (!source.includes("const MANUAL_AUTH_FAILURES = ['INVALID_FORMAT', 'NO_MATCH_IN_COMPANY_SCOPE', 'SIGNATURE_EXCLUDED'];")) {
    source = replaceOnce(
      source,
      'const MAX_CPF_ATTEMPTS_15M = 5;',
      "const MAX_CPF_ATTEMPTS_15M = 5;\nconst MANUAL_AUTH_FAILURES = ['INVALID_FORMAT', 'NO_MATCH_IN_COMPANY_SCOPE', 'SIGNATURE_EXCLUDED'];",
      'lista de falhas manuais',
    );
  }

  source = replaceOnce(
    source,
    "    service.from('payroll_public_access_attempts').select('id', { count: 'exact', head: true }).eq('ip', ip).gte('created_at', cutoff),",
    "    service.from('payroll_public_access_attempts').select('id', { count: 'exact', head: true }).eq('ip', ip).eq('success', false).in('failure_reason', MANUAL_AUTH_FAILURES).gte('created_at', cutoff),",
    'limite manual por IP',
  );

  source = replaceOnce(
    source,
    "    service.from('payroll_public_access_attempts').select('id', { count: 'exact', head: true }).eq('identifier_hash', identifierHash).gte('created_at', cutoff),",
    "    service.from('payroll_public_access_attempts').select('id', { count: 'exact', head: true }).eq('identifier_hash', identifierHash).eq('success', false).in('failure_reason', MANUAL_AUTH_FAILURES).gte('created_at', cutoff),",
    'limite manual por CPF',
  );

  fs.writeFileSync(path, source, 'utf8');
}

// 3) Uma leitura facial recusada encerra a câmera e o timer. Não repete requisições sozinho.
{
  const path = 'src/components/payroll/FaceRecognitionCapture.tsx';
  let source = fs.readFileSync(path, 'utf8');

  source = replaceOnce(
    source,
`            if (['face_not_recognized', 'face_not_clear'].includes(code)) {
              setError(friendlyError(code));
              setStage('error');
              return;
            }`,
`            if (['face_not_recognized', 'face_not_clear'].includes(code)) {
              submittingRef.current = true;
              if (timer) {
                window.clearInterval(timer);
                timer = null;
              }
              stopCamera();
              setError(friendlyError(code));
              setStage('error');
              return;
            }`,
    'parar após falha facial',
  );

  source = replaceOnce(
    source,
`        timer = window.setInterval(() => void scan().catch((scanError: any) => {
          if (cancelled) return;
          setError(friendlyError(scanError?.message || 'face_failed'));
          setStage('error');
          stopCamera();
        }), 850);`,
`        timer = window.setInterval(() => void scan().catch((scanError: any) => {
          if (cancelled) return;
          if (timer) {
            window.clearInterval(timer);
            timer = null;
          }
          submittingRef.current = true;
          setError(friendlyError(scanError?.message || 'face_failed'));
          setStage('error');
          stopCamera();
        }), 850);`,
    'parar timer em erro de leitura',
  );

  fs.writeFileSync(path, source, 'utf8');
}

console.log('[facial-access-guard] tentativa facial unica e limites facial/manual isolados');
await import('./fix-mechanic-face-capture-build.mjs');
