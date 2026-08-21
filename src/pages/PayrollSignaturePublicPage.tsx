import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, ClipboardPaste, Copy, FileCheck2, Loader2, LockKeyhole, RefreshCw, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const getToken = () => {
  const match = window.location.pathname.match(/^\/holerite\/([^/]+)\/?$/);
  return match ? decodeURIComponent(match[1]) : '';
};

const publicCall = async (action: string, payload: Record<string, unknown> = {}) => {
  const response = await fetch('/api/payroll-public', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({ action, token: getToken(), ...payload }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) {
    const error: any = new Error(data.error || `Falha ${response.status}`);
    error.payload = data;
    error.status = response.status;
    throw error;
  }
  return data;
};

const errorText = (error: any) => {
  const code = error?.payload?.error || error?.message;
  const map: Record<string,string> = {
    invalid_link: 'Este link não é válido.',
    link_expired: 'Este link expirou. Solicite um novo envio ao RH.',
    link_cancelled: 'Este link foi cancelado pelo RH.',
    otp_delivery_failed: 'Não foi possível enviar o código de segurança. O RH foi informado do erro de envio.',
    otp_resend_limited: `Aguarde ${error?.payload?.retry_after_seconds || 60}s para pedir outro código.`,
    invalid_otp: 'Código inválido. Confira e tente novamente.',
    otp_expired: 'O código expirou. Solicite um novo código.',
    otp_blocked: 'Muitas tentativas inválidas. Solicite um novo código após o bloqueio.',
    invalid_otp_format: 'Informe os 6 dígitos do código.',
    session_expired: 'A autenticação expirou. Valide um novo código.',
    otp_required: 'Valide o código de segurança para continuar.',
    document_integrity_failed: 'O documento não passou na validação de integridade. A assinatura foi bloqueada.',
    document_not_acknowledged: 'Confirme primeiro que leu e conferiu o documento.',
  };
  return map[code] || 'Não foi possível concluir esta etapa. Tente novamente.';
};

const PayrollSignaturePublicPage: React.FC = () => {
  const token = useMemo(getToken, []);
  const [stage, setStage] = useState<'loading'|'otp'|'document'|'signed'|'fatal'>('loading');
  const [maskedPhone, setMaskedPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [session, setSession] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [resendAt, setResendAt] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [doc, setDoc] = useState<any>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const otpRef = useRef<HTMLInputElement>(null);

  const requestOtp = async () => {
    setBusy(true); setError('');
    try {
      const data = await publicCall('request-otp');
      setMaskedPhone(data.masked_phone || maskedPhone);
      const next = data.resend_after ? new Date(data.resend_after).getTime() : Date.now() + 60_000;
      setResendAt(next);
      setStage('otp');
      window.setTimeout(() => otpRef.current?.focus(), 100);
    } catch (e: any) {
      if (e?.status === 429) {
        setResendAt(Date.now() + Number(e.payload?.retry_after_seconds || 60) * 1000);
        setStage('otp');
      }
      setError(errorText(e));
    } finally { setBusy(false); }
  };

  useEffect(() => {
    if (!token) { setError('Este link não é válido.'); setStage('fatal'); return; }
    (async () => {
      try {
        const data = await publicCall('open');
        if (data.signed) { setStage('signed'); return; }
        setMaskedPhone(data.masked_phone || '');
        setStage('otp');
        await requestOtp();
      } catch (e: any) { setError(errorText(e)); setStage('fatal'); }
    })();
  }, [token]);

  useEffect(() => {
    const timer = window.setInterval(() => setSeconds(Math.max(0, Math.ceil((resendAt - Date.now()) / 1000))), 500);
    return () => window.clearInterval(timer);
  }, [resendAt]);

  const verify = async () => {
    setBusy(true); setError('');
    try {
      const data = await publicCall('verify-otp', { otp });
      setSession(data.session);
      const documentData = await publicCall('document', { session: data.session });
      setDoc(documentData);
      setAcknowledged(Boolean(documentData.already_acknowledged));
      setStage('document');
    } catch (e: any) { setError(errorText(e)); }
    finally { setBusy(false); }
  };

  const pasteCode = async () => {
    setError('');
    try {
      const text = await navigator.clipboard.readText();
      const code = text.replace(/\D/g, '').slice(0, 6);
      if (code.length === 6) { setOtp(code); otpRef.current?.focus(); }
      else { otpRef.current?.focus(); setError('A área de transferência não contém um código de 6 dígitos.'); }
    } catch {
      otpRef.current?.focus();
      setError('Não foi possível ler a área de transferência. Toque no campo e use Colar.');
    }
  };

  const acknowledge = async () => {
    setBusy(true); setError('');
    try { await publicCall('acknowledge', { session }); setAcknowledged(true); }
    catch (e: any) { setError(errorText(e)); }
    finally { setBusy(false); }
  };

  const sign = async () => {
    setBusy(true); setError('');
    try {
      await publicCall('sign', { session, confirm: true });
      setConfirmOpen(false); setSession(''); setStage('signed');
    } catch (e: any) { setConfirmOpen(false); setError(errorText(e)); }
    finally { setBusy(false); }
  };

  return <div className="min-h-screen bg-slate-950 text-slate-100">
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-6 sm:px-6">
      <header className="mb-5 rounded-2xl border border-cyan-400/20 bg-slate-900 p-4 shadow-xl">
        <div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-400/10"><ShieldCheck className="h-6 w-6 text-cyan-300"/></div><div><p className="text-xs font-bold tracking-widest text-cyan-300">TOPAC RH PRO</p><h1 className="text-lg font-bold">Assinatura eletrônica de holerite</h1></div></div>
      </header>

      {stage === 'loading' && <section className="flex flex-1 items-center justify-center"><div className="text-center"><Loader2 className="mx-auto h-8 w-8 animate-spin text-cyan-300"/><p className="mt-3 text-sm text-slate-400">Validando acesso seguro...</p></div></section>}

      {(stage === 'otp' || stage === 'fatal') && <section className="rounded-2xl border border-slate-700 bg-slate-900 p-5 sm:p-7">
        <LockKeyhole className="mb-3 h-8 w-8 text-cyan-300"/><h2 className="text-xl font-bold">Autenticação de segurança</h2>
        {stage !== 'fatal' && <><p className="mt-2 text-sm text-slate-400">Enviamos um código de 6 dígitos para o telefone pessoal cadastrado:</p><p className="mt-2 font-bold">{maskedPhone || 'telefone cadastrado'}</p>
          <div className="mt-5"><label className="mb-2 block text-sm font-semibold">Código de segurança</label><Input ref={otpRef} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={e=>setOtp(e.target.value.replace(/\D/g,'').slice(0,6))} className="h-14 text-center text-2xl tracking-[.5em]" placeholder="000000"/></div>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2"><Button type="button" variant="outline" onClick={()=>void pasteCode()}><ClipboardPaste className="mr-2 h-4 w-4"/>COLAR CÓDIGO</Button><Button disabled={busy || otp.length !== 6} onClick={()=>void verify()}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <ShieldCheck className="mr-2 h-4 w-4"/>}CONFIRMAR</Button></div>
          <Button className="mt-3 w-full" variant="ghost" disabled={busy || seconds > 0} onClick={()=>void requestOtp()}><RefreshCw className="mr-2 h-4 w-4"/>{seconds > 0 ? `Reenviar em ${seconds}s` : 'Reenviar código'}</Button>
        </>}
        {error && <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>}
      </section>}

      {stage === 'document' && doc && <section className="space-y-4">
        <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4"><p className="text-xs uppercase tracking-wide text-cyan-300">Holerite — {doc.competencia}</p><h2 className="mt-1 text-xl font-bold">{doc.employee_name}</h2><p className="text-sm text-slate-400">{doc.company_name}</p></div>
        <div className="overflow-hidden rounded-2xl border border-slate-700 bg-white"><iframe title="Holerite" src={doc.document_url} className="h-[60vh] min-h-[520px] w-full bg-white"/></div>
        {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>}
        {!acknowledged ? <Button className="h-14 w-full text-base font-bold" disabled={busy} onClick={()=>void acknowledge()}><FileCheck2 className="mr-2 h-5 w-5"/>LI E CONFERI</Button> : <><div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200"><CheckCircle2 className="h-5 w-5"/>Leitura e conferência registradas.</div><Button className="h-14 w-full text-base font-bold" disabled={busy} onClick={()=>setConfirmOpen(true)}><Copy className="mr-2 h-5 w-5"/>ASSINAR ELETRONICAMENTE</Button></>}
      </section>}

      {stage === 'signed' && <section className="flex flex-1 items-center justify-center"><div className="w-full rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-7 text-center"><CheckCircle2 className="mx-auto h-12 w-12 text-emerald-300"/><h2 className="mt-4 text-2xl font-bold">Documento assinado</h2><p className="mt-2 text-sm text-emerald-100/80">Sua assinatura eletrônica foi registrada com autenticação e trilha de evidências. Você pode fechar esta página.</p></div></section>}
    </main>

    {confirmOpen && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center"><div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl"><h3 className="text-lg font-bold">Confirmar assinatura</h3><p className="mt-3 text-sm leading-6 text-slate-300">Confirmo que visualizei este documento e desejo assiná-lo eletronicamente.</p><div className="mt-5 grid grid-cols-2 gap-2"><Button variant="outline" disabled={busy} onClick={()=>setConfirmOpen(false)}>CANCELAR</Button><Button disabled={busy} onClick={()=>void sign()}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>CONFIRMAR ASSINATURA</Button></div></div></div>}
  </div>;
};

export default PayrollSignaturePublicPage;
