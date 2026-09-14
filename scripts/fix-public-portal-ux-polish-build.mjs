import fs from 'node:fs';

const path = 'src/pages/PayrollSignaturePublicPage.tsx';
let source = fs.readFileSync(path, 'utf8');

const replaceOnce = (before, after, label) => {
  if (source.includes(after)) return;
  if (!source.includes(before)) {
    console.warn(`[public-portal-polish] trecho não encontrado: ${label}`);
    return;
  }
  source = source.replace(before, after);
};

// 1) Estado de transição: evita qualquer flash da tela de login depois do rosto reconhecido.
replaceOnce(
  "  const [faceVerifiedAt, setFaceVerifiedAt] = useState('');",
  "  const [faceVerifiedAt, setFaceVerifiedAt] = useState('');\n  const [faceLoginTransition, setFaceLoginTransition] = useState(false);",
  'estado transicao facial',
);

replaceOnce(
`  const handleFaceLogin = async (faceData: any) => {
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
  };`,
`  const handleFaceLogin = async (faceData: any) => {
    const activeSession = String(faceData?.session || '');
    if (!activeSession) return;
    setFaceMode(null);
    setFaceLoginTransition(true);
    setBusy(true);
    setError('');
    try {
      const data = await publicCall('list', { session: activeSession });
      const nextDocuments = data.documents || [];

      // Carrega tudo antes de revelar o portal. Assim o usuário não volta visualmente ao login.
      await loadArchive(activeSession);
      await refreshFaceStatus(activeSession);

      setSession(activeSession);
      setProfile({
        employee_name: data.employee_name,
        employee_role: data.employee_role,
        company_name: data.company_name,
      });
      setDocuments(nextDocuments);

      const pending = nextDocuments.filter((item: any) => !item.signed);
      if (pending.length === 1) await openDocument(pending[0].document_id, activeSession);
    } catch (e: any) {
      setSession('');
      setProfile(null);
      setDocuments([]);
      setArchiveDocuments([]);
      setError(errorText(e));
    } finally {
      setBusy(false);
      window.setTimeout(() => setFaceLoginTransition(false), 220);
    }
  };`,
  'login facial sem flash',
);

replaceOnce(
  "    setFaceVerifiedAt('');\n  };",
  "    setFaceVerifiedAt('');\n    setFaceLoginTransition(false);\n  };",
  'limpeza transicao facial',
);

// 2) Tela intermediária TOPAC após o reconhecimento.
replaceOnce(
  "      {faceMode && (",
`      {faceLoginTransition && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950 px-6">
          <div className="w-full max-w-sm text-center">
            <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-[28px] border border-cyan-300/30 bg-white shadow-[0_0_50px_rgba(34,211,238,0.16)]">
              <img src="/icons/icon-192.png?v=20260524-2" alt="TOPAC" className="h-20 w-20 object-contain" />
            </div>
            <div className="mt-7 flex items-center justify-center gap-2 text-emerald-300">
              <CheckCircle2 className="h-6 w-6" />
              <p className="text-lg font-bold">Acesso confirmado</p>
            </div>
            <p className="mt-2 text-sm text-slate-400">Carregando seus documentos...</p>
            <Loader2 className="mx-auto mt-6 h-8 w-8 animate-spin text-cyan-300" />
          </div>
        </div>
      )}

      {faceMode && (`,
  'overlay de transicao',
);

// 3) Primeira tela: esconde o cabeçalho duplicado e cria uma entrada centralizada/limpa.
replaceOnce(
  '<header className="mb-5 rounded-2xl border border-cyan-400/20 bg-slate-900 p-4 shadow-xl">',
  '<header className={`${session ? \'\' : \'hidden\'} mb-5 rounded-2xl border border-cyan-400/20 bg-slate-900 p-4 shadow-xl`}>',
  'esconder header no login',
);

replaceOnce(
  '<section className="mx-auto w-full max-w-xl rounded-2xl border border-slate-700 bg-slate-900 p-5 sm:p-7">',
  '<section className="mx-auto w-full max-w-md rounded-[28px] border border-cyan-400/20 bg-gradient-to-b from-slate-900 to-slate-950 p-5 shadow-2xl sm:p-6">',
  'card login',
);

replaceOnce(
`            <LockKeyhole className="mb-3 h-8 w-8 text-cyan-300" />
            <h2 className="text-xl font-bold">Acesso seguro aos seus documentos</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">Informe os mesmos dados cadastrados no RH da {companyLabel}. Nenhum documento é exibido antes da validação.</p>`,
`            <div className="text-center">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[24px] border border-cyan-300/25 bg-white shadow-lg">
                <img src="/icons/icon-192.png?v=20260524-2" alt="TOPAC" className="h-[68px] w-[68px] object-contain" />
              </div>
              <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-300">TOPAC RH PRO</p>
              <h1 className="mt-1 text-2xl font-bold text-white">Portal de Documentos</h1>
              <div className="mx-auto mt-2 inline-flex rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-semibold text-slate-300">{companyLabel}</div>
              <p className="mx-auto mt-4 max-w-xs text-sm leading-6 text-slate-400">Entre com reconhecimento facial ou, se precisar, use seus dados cadastrados no RH.</p>
            </div>`,
  'cabecalho login centralizado',
);

replaceOnce(
  '<Button className="mt-6 h-16 w-full text-base font-bold" onClick={() => setFaceMode(\'login\')} disabled={busy}>\n              <ShieldCheck className="mr-2 h-5 w-5" />ENTRAR COM RECONHECIMENTO FACIAL\n            </Button>',
  '<Button className="mt-6 h-14 w-full rounded-2xl bg-cyan-400 text-base font-extrabold text-slate-950 shadow-[0_10px_30px_rgba(34,211,238,0.18)] hover:bg-cyan-300 hover:text-slate-950" onClick={() => setFaceMode(\'login\')} disabled={busy}>\n              <ShieldCheck className="mr-2 h-5 w-5" />ENTRAR COM MEU ROSTO\n            </Button>',
  'botao facial principal',
);

replaceOnce(
  '<div className="my-5 flex items-center gap-3 text-xs font-semibold uppercase tracking-wider text-slate-500">\n              <div className="h-px flex-1 bg-slate-700" /><span>ou use seus dados</span><div className="h-px flex-1 bg-slate-700" />\n            </div>',
  '<div className="my-5 flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">\n              <div className="h-px flex-1 bg-slate-800" /><span>ou use seus dados</span><div className="h-px flex-1 bg-slate-800" />\n            </div>',
  'divisor login',
);

// 4) Botões que estavam branco-no-branco no iPhone: cores explícitas.
replaceOnce(
  '<Button size="sm" variant="outline" onClick={() => void logout()}>',
  '<Button size="sm" variant="outline" className="border-cyan-400/40 bg-slate-950 text-cyan-100 hover:bg-cyan-400/10 hover:text-white" onClick={() => void logout()}>',
  'botao sair visivel',
);

replaceOnce(
  '<Button size="sm" variant="outline" disabled={busy} onClick={() => void refreshList()}>',
  '<Button size="sm" variant="outline" className="w-full border-slate-600 bg-slate-950 text-slate-100 hover:border-cyan-400/50 hover:bg-cyan-400/10 hover:text-white sm:w-auto" disabled={busy} onClick={() => void refreshList()}>',
  'botao atualizar visivel',
);

replaceOnce(
  '<Button className="w-full" variant="outline" disabled={busy} onClick={() => void openDocument(doc.document_id)}>',
  '<Button className="w-full border-slate-600 bg-slate-950 text-slate-100 hover:border-cyan-400/50 hover:bg-cyan-400/10 hover:text-white" variant="outline" disabled={busy} onClick={() => void openDocument(doc.document_id)}>',
  'botao atualizar documento visivel',
);

// O botão manual também recebe contraste explícito para não depender do tema do navegador.
replaceOnce(
  '<Button className="mt-5 h-14 w-full text-base font-bold" disabled={busy || !canAuthenticate} onClick={() => void authenticate()}>',
  '<Button className="mt-5 h-14 w-full rounded-2xl bg-blue-600 text-base font-bold text-white hover:bg-blue-500 hover:text-white disabled:bg-slate-800 disabled:text-slate-500" disabled={busy || !canAuthenticate} onClick={() => void authenticate()}>',
  'botao acesso manual',
);

fs.writeFileSync(path, source, 'utf8');
console.log('[public-portal-polish] login alinhado, botoes visiveis e acesso facial sem flash de login');
