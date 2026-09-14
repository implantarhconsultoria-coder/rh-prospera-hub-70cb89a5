import fs from 'node:fs';

const file = 'src/pages/PayrollSignaturePublicPage.tsx';
let source = fs.readFileSync(file, 'utf8');

if (source.includes("import FaceRecognitionCapture from '@/components/payroll/FaceRecognitionCapture';")) {
  console.log('[payroll-face] integração facial já aplicada');
  process.exit(0);
}

const replaceOne = (from, to, label) => {
  if (!source.includes(from)) throw new Error(`[payroll-face] trecho não encontrado: ${label}`);
  source = source.replace(from, to);
};

replaceOne(
  "import { Badge } from '@/components/ui/badge';",
  "import { Badge } from '@/components/ui/badge';\nimport FaceRecognitionCapture from '@/components/payroll/FaceRecognitionCapture';",
  'import facial',
);

replaceOne(
  "  const [signedInfo, setSignedInfo] = useState<any>(null);",
  "  const [signedInfo, setSignedInfo] = useState<any>(null);\n  const [faceMode, setFaceMode] = useState<'login' | 'enroll' | 'verify' | null>(null);\n  const [faceProfileActive, setFaceProfileActive] = useState(false);\n  const [faceVerifiedAt, setFaceVerifiedAt] = useState('');",
  'estados facial',
);

replaceOne(
  "  const openDocument = async (documentId: string, forcedSession?: string) => {",
  `  const refreshFaceStatus = async (activeSession: string) => {
    if (!activeSession) return false;
    try {
      const response = await fetch('/api/payroll-face', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ action: 'status', company_scope: companyScope, session: activeSession }),
      });
      const data = await response.json().catch(() => ({}));
      const enrolled = Boolean(response.ok && data.ok && data.enrolled);
      setFaceProfileActive(enrolled);
      return enrolled;
    } catch {
      setFaceProfileActive(false);
      return false;
    }
  };

  const handleFaceLogin = async (faceData: any) => {
    const activeSession = String(faceData?.session || '');
    if (!activeSession) return;
    setFaceMode(null);
    setBusy(true);
    setError('');
    try {
      const data = await publicCall('list', { session: activeSession });
      setSession(activeSession);
      setProfile({
        employee_name: data.employee_name,
        employee_role: data.employee_role,
        company_name: data.company_name,
      });
      const nextDocuments = data.documents || [];
      setDocuments(nextDocuments);
      await loadArchive(activeSession);
      await refreshFaceStatus(activeSession);
      const pending = nextDocuments.filter((item: any) => !item.signed);
      if (pending.length === 1) await openDocument(pending[0].document_id, activeSession);
    } catch (e: any) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const handleFaceSuccess = async (data: any) => {
    if (faceMode === 'login') {
      await handleFaceLogin(data);
      return;
    }
    if (faceMode === 'enroll') {
      setFaceProfileActive(true);
      setFaceMode(null);
      setError('');
      return;
    }
    if (faceMode === 'verify') {
      setFaceVerifiedAt(data?.verified_at || new Date().toISOString());
      setFaceMode(null);
      setConfirmOpen(true);
    }
  };

  const openDocument = async (documentId: string, forcedSession?: string) => {`,
  'funções facial',
);

replaceOne(
  "      await loadArchive(data.session);\n\n      const pending = nextDocuments.filter((item: any) => !item.signed);",
  "      await loadArchive(data.session);\n      await refreshFaceStatus(data.session);\n\n      const pending = nextDocuments.filter((item: any) => !item.signed);",
  'status facial após login tradicional',
);

replaceOne(
  "    setSignedInfo(null);\n    setConfirmOpen(false);\n  };",
  "    setSignedInfo(null);\n    setConfirmOpen(false);\n    setFaceMode(null);\n    setFaceProfileActive(false);\n    setFaceVerifiedAt('');\n  };",
  'limpeza facial no logout',
);

replaceOne(
  "            <div className=\"mt-6 space-y-4\">",
  `            <Button className="mt-6 h-16 w-full text-base font-bold" onClick={() => setFaceMode('login')} disabled={busy}>
              <ShieldCheck className="mr-2 h-5 w-5" />ENTRAR COM RECONHECIMENTO FACIAL
            </Button>
            <div className="my-5 flex items-center gap-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <div className="h-px flex-1 bg-slate-700" /><span>ou use seus dados</span><div className="h-px flex-1 bg-slate-700" />
            </div>

            <div className="space-y-4">`,
  'botão login facial',
);

replaceOne(
  "            <div className=\"rounded-2xl border border-amber-500/20 bg-slate-900 p-4\">",
  `            {!faceProfileActive ? (
              <div className="rounded-2xl border border-cyan-400/30 bg-cyan-400/5 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-bold text-cyan-100">Facilite seus próximos acessos</p>
                    <p className="mt-1 text-sm leading-5 text-slate-400">Cadastre seu rosto uma vez. Depois, basta encaixar o rosto na câmera para entrar.</p>
                  </div>
                  <Button className="shrink-0" onClick={() => setFaceMode('enroll')} disabled={busy}>
                    <ShieldCheck className="mr-2 h-4 w-4" />ATIVAR ACESSO FACIAL
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-3 text-sm text-emerald-200">
                <CheckCircle2 className="h-5 w-5" />Reconhecimento facial ativo neste cadastro.
              </div>
            )}

            <div className="rounded-2xl border border-amber-500/20 bg-slate-900 p-4">`,
  'cadastro facial pós-login',
);

replaceOne(
  "                    <Button className=\"h-14 w-full text-base font-bold\" disabled={busy} onClick={() => setConfirmOpen(true)}>",
  "                    <Button className=\"h-14 w-full text-base font-bold\" disabled={busy} onClick={() => faceProfileActive ? setFaceMode('verify') : setConfirmOpen(true)}>",
  'validação facial antes de assinar',
);

replaceOne(
  "            <p className=\"mt-3 text-xs leading-5 text-slate-400\">O registro inclui data/hora, evidências técnicas e integridade SHA-256 do documento.</p>",
  `            <p className="mt-3 text-xs leading-5 text-slate-400">O registro inclui data/hora, evidências técnicas e integridade SHA-256 do documento.</p>
            {faceProfileActive && faceVerifiedAt && (
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-3 text-xs font-semibold text-emerald-200">
                <CheckCircle2 className="h-4 w-4" />Reconhecimento facial confirmado e registrado para esta assinatura.
              </div>
            )}`,
  'evidência facial no modal',
);

replaceOne(
  "      {confirmOpen && (",
  `      {faceMode && (
        <FaceRecognitionCapture
          mode={faceMode}
          companyScope={companyScope}
          session={session || undefined}
          documentId={faceMode === 'verify' ? doc?.document_id : undefined}
          onSuccess={handleFaceSuccess}
          onCancel={() => setFaceMode(null)}
        />
      )}

      {confirmOpen && (`,
  'modal facial',
);

fs.writeFileSync(file, source);
console.log('[payroll-face] acesso facial, cadastro e evidência de assinatura integrados');
