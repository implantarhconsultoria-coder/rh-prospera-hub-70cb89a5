import React, { useMemo, useState } from 'react';
import {
  Archive,
  Bus,
  CheckCircle2,
  ExternalLink,
  FileCheck2,
  FileSignature,
  FileText,
  Loader2,
  LockKeyhole,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Utensils,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

const COMPANY_SCOPE_LABELS: Record<string, string> = {
  'topac-matriz': 'TOPAC Matriz',
  'topac-pg': 'TOPAC Praia Grande',
  'topac-gyn': 'TOPAC Goiânia',
  alqui: 'ALQUI',
  lmt: 'LMT',
};

const getCompanyScope = () => {
  if (typeof window === 'undefined') return '';
  const match = window.location.pathname.match(/^\/holerite\/([^/]+)\/?$/i);
  return String(match?.[1] || '').trim().toLowerCase();
};

const callApi = async (url: string, action: string, payload: Record<string, unknown> = {}) => {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({ action, company_scope: getCompanyScope(), ...payload }),
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

const publicCall = (action: string, payload: Record<string, unknown> = {}) =>
  callApi('/api/payroll-public', action, payload);

const archiveCall = (session: string) =>
  callApi('/api/payroll-archive', 'list', { session });

const errorText = (error: any) => {
  const code = error?.payload?.error || error?.message;
  const map: Record<string, string> = {
    identity_not_validated: 'Não foi possível validar o acesso. Confira os dados informados e tente novamente.',
    invalid_company_scope: 'Este link do portal não identifica uma empresa válida. Solicite ao RH o link correto da sua empresa.',
    too_many_attempts: 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.',
    invalid_session: 'Sua sessão segura não é mais válida. Faça a identificação novamente.',
    session_required: 'Faça a identificação novamente para continuar.',
    session_expired: 'Sua sessão segura expirou. Faça a identificação novamente.',
    document_not_available: 'Este documento não está disponível para assinatura.',
    payment_not_confirmed: 'O pagamento do holerite ainda não foi liberado pelo RH.',
    document_integrity_failed: 'O documento não passou na validação de integridade. A assinatura foi bloqueada.',
    document_not_acknowledged: 'Confirme primeiro que leu e conferiu o documento.',
    signature_confirmation_required: 'Confirme a assinatura para continuar.',
    signature_confirmation_pending: 'A assinatura foi enviada, mas a confirmação do servidor ainda não foi carregada. Atualize a visualização segura antes de tentar novamente.',
  };
  return map[code] || 'Não foi possível concluir esta etapa. Tente novamente.';
};

const formatCpf = (value: string) => {
  const d = value.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
};

const competenceLabel = (value: string) => {
  const [year, month] = String(value || '').split('-');
  return year && month ? `${month}/${year}` : value;
};

const brDateTime = (value?: string | null) => value
  ? new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  : '';

const PayrollSignaturePublicPage: React.FC = () => {
  const companyScope = getCompanyScope();
  const companyLabel = COMPANY_SCOPE_LABELS[companyScope] || '';

  const [cpf, setCpf] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [phoneLast4, setPhoneLast4] = useState('');
  const [session, setSession] = useState('');
  const [profile, setProfile] = useState<any>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [archiveDocuments, setArchiveDocuments] = useState<any[]>([]);
  const [archiveFilter, setArchiveFilter] = useState<'todos' | 'pagamento' | 'vr' | 'vt'>('todos');
  const [doc, setDoc] = useState<any>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [signedInfo, setSignedInfo] = useState<any>(null);

  const pendingDocuments = useMemo(
    () => documents.filter((item) => !item.signed),
    [documents],
  );

  const filteredArchive = useMemo(() => archiveDocuments.filter((item) => {
    if (archiveFilter === 'todos') return true;
    if (archiveFilter === 'pagamento') return item.category === 'pagamento';
    if (archiveFilter === 'vr') return Array.isArray(item.benefit_types) && item.benefit_types.includes('VR');
    if (archiveFilter === 'vt') return Array.isArray(item.benefit_types) && item.benefit_types.includes('VT');
    return true;
  }), [archiveDocuments, archiveFilter]);

  const loadArchive = async (activeSession: string) => {
    if (!activeSession) return;
    try {
      const data = await archiveCall(activeSession);
      setArchiveDocuments(data.documents || []);
    } catch (e: any) {
      if (['invalid_session', 'session_expired', 'session_required'].includes(e?.payload?.error)) throw e;
      console.warn('[payroll-archive]', e?.payload?.error || e?.message || e);
    }
  };

  const openDocument = async (documentId: string, forcedSession?: string) => {
    const activeSession = forcedSession || session;
    if (!activeSession) return;
    setBusy(true);
    setError('');
    setSignedInfo(null);
    try {
      const data = await publicCall('document', { session: activeSession, document_id: documentId });
      setDoc(data);
      setAcknowledged(Boolean(data.already_acknowledged));
      if (data.signed) setSignedInfo({ signed_at: data.signed_at });
    } catch (e: any) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const authenticate = async () => {
    setBusy(true);
    setError('');
    setSignedInfo(null);
    try {
      const data = await publicCall('authenticate', {
        cpf: cpf.replace(/\D/g, ''),
        birth_date: birthDate,
        phone_last4: phoneLast4,
      });
      setSession(data.session);
      setProfile({
        employee_name: data.employee_name,
        employee_role: data.employee_role,
        company_name: data.company_name,
      });
      const nextDocuments = data.documents || [];
      setDocuments(nextDocuments);
      setCpf('');
      setBirthDate('');
      setPhoneLast4('');
      await loadArchive(data.session);

      const pending = nextDocuments.filter((item: any) => !item.signed);
      if (pending.length === 1) await openDocument(pending[0].document_id, data.session);
    } catch (e: any) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const refreshList = async () => {
    if (!session) return;
    setBusy(true);
    setError('');
    try {
      const data = await publicCall('list', { session });
      setProfile({
        employee_name: data.employee_name,
        employee_role: data.employee_role,
        company_name: data.company_name,
      });
      setDocuments(data.documents || []);
      await loadArchive(session);
    } catch (e: any) {
      setError(errorText(e));
      if (['invalid_session', 'session_expired', 'session_required'].includes(e?.payload?.error)) resetLocal();
    } finally {
      setBusy(false);
    }
  };

  const acknowledge = async () => {
    if (!doc?.document_id || !session) return;
    setBusy(true);
    setError('');
    try {
      await publicCall('acknowledge', { session, document_id: doc.document_id });
      setAcknowledged(true);
    } catch (e: any) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const sign = async () => {
    if (!doc?.document_id || !session) return;
    setBusy(true);
    setError('');
    try {
      const submitted = await publicCall('sign', { session, document_id: doc.document_id, confirm: true });
      const verified = await publicCall('document', { session, document_id: doc.document_id });
      if (!verified?.signed || !verified?.signed_at) {
        const pending: any = new Error('signature_confirmation_pending');
        pending.payload = { error: 'signature_confirmation_pending' };
        throw pending;
      }

      setConfirmOpen(false);
      setSignedInfo({ signature_id: submitted.signature_id, signed_at: verified.signed_at });
      setDoc(verified);
      setAcknowledged(Boolean(verified.already_acknowledged));
      setDocuments((current) => current.map((item) =>
        item.document_id === doc.document_id
          ? { ...item, signed: true, signed_at: verified.signed_at }
          : item,
      ));
      await loadArchive(session);
    } catch (e: any) {
      setConfirmOpen(false);
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const resetLocal = () => {
    setSession('');
    setProfile(null);
    setDocuments([]);
    setArchiveDocuments([]);
    setDoc(null);
    setAcknowledged(false);
    setSignedInfo(null);
    setConfirmOpen(false);
  };

  const logout = async () => {
    const current = session;
    resetLocal();
    setError('');
    if (current) {
      try {
        await publicCall('logout', { session: current });
      } catch {
        // A sessão local já foi encerrada.
      }
    }
  };

  const canAuthenticate = cpf.replace(/\D/g, '').length === 11 && Boolean(birthDate) && phoneLast4.length === 4;
  const activeLabel = doc?.document_label || 'Documento';

  if (!companyLabel) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <main className="mx-auto flex min-h-screen w-full max-w-xl items-center px-4">
          <section className="w-full rounded-2xl border border-red-500/30 bg-slate-900 p-6 text-center">
            <LockKeyhole className="mx-auto h-9 w-9 text-red-300" />
            <h1 className="mt-4 text-xl font-bold">Link do portal inválido</h1>
            <p className="mt-2 text-sm leading-6 text-slate-400">Este endereço não identifica uma empresa. Solicite ao RH o link específico da sua empresa.</p>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-4 py-6 sm:px-6">
        <header className="mb-5 rounded-2xl border border-cyan-400/20 bg-slate-900 p-4 shadow-xl">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-white/95">
                <img src="/icons/icon-192.png?v=20260524-2" alt="TOPAC" className="h-11 w-11 object-contain" />
              </div>
              <div>
                <p className="text-xs font-bold tracking-widest text-cyan-300">TOPAC RH PRO · {companyLabel}</p>
                <h1 className="text-lg font-bold">Portal de Holerites e Recibos</h1>
              </div>
            </div>
            {session && (
              <Button size="sm" variant="outline" onClick={() => void logout()}>
                <LogOut className="mr-2 h-4 w-4" />Sair
              </Button>
            )}
          </div>
        </header>

        {!session && (
          <section className="mx-auto w-full max-w-xl rounded-2xl border border-slate-700 bg-slate-900 p-5 sm:p-7">
            <LockKeyhole className="mb-3 h-8 w-8 text-cyan-300" />
            <h2 className="text-xl font-bold">Acesso seguro aos seus documentos</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">Informe os mesmos dados cadastrados no RH da {companyLabel}. Nenhum holerite ou recibo é exibido antes da validação.</p>

            <div className="mt-6 space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold">CPF</span>
                <Input inputMode="numeric" autoComplete="off" value={cpf} onChange={(e) => setCpf(formatCpf(e.target.value))} placeholder="000.000.000-00" className="h-12" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold">Data de nascimento</span>
                <Input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} className="h-12" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold">Últimos 4 números do celular cadastrado</span>
                <Input inputMode="numeric" autoComplete="off" maxLength={4} value={phoneLast4} onChange={(e) => setPhoneLast4(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="0000" className="h-12 text-lg tracking-[.25em]" />
              </label>
            </div>

            {error && <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>}
            <Button className="mt-5 h-14 w-full text-base font-bold" disabled={busy || !canAuthenticate} onClick={() => void authenticate()}>
              {busy ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <ShieldCheck className="mr-2 h-5 w-5" />}
              ACESSAR DOCUMENTOS
            </Button>
            <div className="mt-5 rounded-xl border border-slate-700/80 bg-slate-950/40 p-3 text-xs leading-5 text-slate-400">
              <b className="text-slate-300">Segurança:</b> o CPF sozinho não libera nenhum documento. O acesso exige também data de nascimento e conferência dos últimos dígitos do telefone já registrado no RH.
            </div>
          </section>
        )}

        {session && profile && (
          <section className="space-y-4">
            <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4">
              <p className="text-xs uppercase tracking-wide text-cyan-300">Acesso validado</p>
              <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-bold">{profile.employee_name}</h2>
                  <p className="text-sm text-slate-400">{profile.company_name}{profile.employee_role ? ` · ${profile.employee_role}` : ''}</p>
                </div>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void refreshList()}>
                  <RefreshCw className={`mr-2 h-4 w-4 ${busy ? 'animate-spin' : ''}`} />Atualizar
                </Button>
              </div>
            </div>

            <div className="rounded-2xl border border-amber-500/20 bg-slate-900 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-amber-300">Pendentes</p>
                  <h3 className="font-bold">Documentos para conferência e assinatura</h3>
                </div>
                <Badge variant="outline" className="border-amber-500/30 text-amber-200">{pendingDocuments.length}</Badge>
              </div>

              {pendingDocuments.length === 0 ? (
                <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-200">
                  <CheckCircle2 className="h-5 w-5" />Nenhuma assinatura pendente.
                </div>
              ) : (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {pendingDocuments.map((item) => (
                    <button
                      key={item.document_id}
                      onClick={() => void openDocument(item.document_id)}
                      className={`rounded-xl border p-3 text-left transition ${doc?.document_id === item.document_id ? 'border-cyan-400/60 bg-cyan-400/10' : 'border-slate-700 hover:border-slate-500'}`}
                    >
                      <span className="font-bold">{item.document_label || 'Documento'} · {competenceLabel(item.competencia)}</span>
                      <span className="mt-1 block text-xs text-amber-200">Aguardando sua conferência/assinatura</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {busy && !doc && <div className="flex min-h-40 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-cyan-300" /></div>}

            {doc && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4">
                  <p className="text-xs uppercase tracking-wide text-cyan-300">{activeLabel} — {competenceLabel(doc.competencia)}</p>
                  <p className="mt-1 text-sm text-slate-400">Documento individual liberado pelo RH.</p>
                </div>
                <div className="overflow-hidden rounded-2xl border border-slate-700 bg-white">
                  <iframe title={activeLabel} src={doc.document_url} className="h-[62vh] min-h-[520px] w-full bg-white" />
                </div>
                <Button className="w-full" variant="outline" disabled={busy} onClick={() => void openDocument(doc.document_id)}>
                  <RefreshCw className="mr-2 h-4 w-4" />Atualizar visualização segura
                </Button>

                {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>}

                {doc.signed || signedInfo ? (
                  <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-center">
                    <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-300" />
                    <h3 className="mt-3 text-xl font-bold">Documento assinado</h3>
                    <p className="mt-1 text-sm text-emerald-100/80">Assinatura registrada em {brDateTime(signedInfo?.signed_at || doc.signed_at)}.</p>
                    <p className="mt-2 text-xs text-emerald-100/70">Este documento permanece salvo em “Meus documentos” para consultas futuras.</p>
                  </div>
                ) : !acknowledged ? (
                  <Button className="h-14 w-full text-base font-bold" disabled={busy} onClick={() => void acknowledge()}>
                    <FileCheck2 className="mr-2 h-5 w-5" />LI E CONFERI
                  </Button>
                ) : (
                  <>
                    <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
                      <CheckCircle2 className="h-5 w-5" />Leitura e conferência registradas.
                    </div>
                    <Button className="h-14 w-full text-base font-bold" disabled={busy} onClick={() => setConfirmOpen(true)}>
                      <FileSignature className="mr-2 h-5 w-5" />ASSINAR ELETRONICAMENTE
                    </Button>
                  </>
                )}
              </div>
            )}

            <div className="rounded-2xl border border-cyan-400/20 bg-slate-900 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex gap-3">
                  <Archive className="mt-0.5 h-6 w-6 text-cyan-300" />
                  <div>
                    <p className="text-xs uppercase tracking-wide text-cyan-300">Arquivo pessoal</p>
                    <h3 className="text-lg font-bold">Meus documentos</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-400">Holerites assinados e recibos ficam guardados aqui para consulta futura.</p>
                  </div>
                </div>
                <Badge variant="outline" className="border-cyan-400/30 text-cyan-200">{archiveDocuments.length}</Badge>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {([
                  ['todos', 'Todos', FileText],
                  ['pagamento', 'Holerites', FileCheck2],
                  ['vr', 'VR', Utensils],
                  ['vt', 'VT', Bus],
                ] as const).map(([value, label, Icon]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setArchiveFilter(value)}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold ${archiveFilter === value ? 'border-cyan-400/50 bg-cyan-400/10 text-cyan-200' : 'border-slate-700 text-slate-400 hover:border-slate-500'}`}
                  >
                    <Icon className="h-3.5 w-3.5" />{label}
                  </button>
                ))}
              </div>

              {filteredArchive.length === 0 ? (
                <div className="mt-4 rounded-xl border border-slate-700 bg-slate-950/30 p-4 text-center text-sm text-slate-400">
                  Nenhum documento arquivado nesta categoria.
                </div>
              ) : (
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {filteredArchive.map((item) => (
                    <a
                      key={item.id}
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-xl border border-slate-700 bg-slate-950/30 p-3 transition hover:border-cyan-400/40 hover:bg-cyan-400/5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-bold text-slate-100">{item.label}</p>
                          {item.competencia && <p className="mt-0.5 text-xs text-slate-400">Competência {competenceLabel(item.competencia)}</p>}
                          {item.date && <p className="mt-1 text-[11px] text-slate-500">{brDateTime(item.date)}</p>}
                        </div>
                        <ExternalLink className="h-4 w-4 shrink-0 text-cyan-300" />
                      </div>
                      {Array.isArray(item.benefit_types) && item.benefit_types.length > 0 && (
                        <div className="mt-2 flex gap-1">
                          {item.benefit_types.map((type: string) => <Badge key={type} variant="outline" className="text-[10px]">{type}</Badge>)}
                        </div>
                      )}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}
      </main>

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center">
          <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
            <h3 className="text-lg font-bold">Confirmar assinatura eletrônica</h3>
            <p className="mt-3 text-sm leading-6 text-slate-300">Confirmo que me identifiquei com meus dados pessoais, visualizei e conferi este documento e desejo registrar minha assinatura eletrônica.</p>
            <p className="mt-3 text-xs leading-5 text-slate-400">O registro inclui data/hora, evidências técnicas e integridade SHA-256 do documento.</p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <Button variant="outline" disabled={busy} onClick={() => setConfirmOpen(false)}>CANCELAR</Button>
              <Button disabled={busy} onClick={() => void sign()}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}CONFIRMAR ASSINATURA
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PayrollSignaturePublicPage;
