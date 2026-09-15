import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Calculator, KeyRound, Loader2, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

type PortalKind = 'principal' | 'goiania';
type Mode = 'login' | 'first';
type FirstStep = 'identify' | 'verify' | 'pin';

const storageKey = (portal: PortalKind) => `topac_contabilidade_${portal}_session`;

export default function ContabilidadeAcessoPage({ portal }: { portal: PortalKind }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('login');
  const [firstStep, setFirstStep] = useState<FirstStep>('identify');
  const [codigo, setCodigo] = useState('');
  const [email, setEmail] = useState('');
  const [initialCode, setInitialCode] = useState('');
  const [otp, setOtp] = useState('');
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [verificationId, setVerificationId] = useState('');
  const [setupToken, setSetupToken] = useState('');
  const [loading, setLoading] = useState(false);
  const isGoiania = portal === 'goiania';

  const api = async (action: string, payload: Record<string, unknown> = {}) => {
    const response = await fetch('/api/accounting-access', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, portal, ...payload }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result?.ok) {
      const error: any = new Error(result?.message || result?.error || 'Não foi possível validar o acesso.');
      error.code = result?.error;
      throw error;
    }
    return result;
  };

  const saveSession = (result: any) => {
    localStorage.setItem(storageKey(portal), JSON.stringify({
      token: result.token,
      expira_em: result.expira_em,
      usuario: result.usuario,
    }));
    navigate(isGoiania ? '/contabilidade-goiania' : '/contabilidade', { replace: true });
  };

  const entrar = async (event: FormEvent) => {
    event.preventDefault();
    const clean = codigo.replace(/\D/g, '').slice(0, 6);
    if (clean.length !== 6) return toast.error('Digite seu código pessoal com 6 números.');
    setLoading(true);
    try {
      const result = await api('login', { pin: clean });
      saveSession(result);
    } catch (err:any) { toast.error(err?.message || 'Código pessoal não reconhecido.'); }
    finally { setLoading(false); }
  };

  const iniciarPrimeiroAcesso = async (event: FormEvent) => {
    event.preventDefault();
    const code = initialCode.replace(/\D/g, '').slice(0, 6);
    if (!email.trim() || code.length !== 6) return toast.error('Informe seu e-mail e o código inicial de 6 dígitos.');
    setLoading(true);
    try {
      const result = await api('start_first_access', { email: email.trim(), initial_code: code });
      setVerificationId(result.verification_id);
      setFirstStep('verify');
      toast.success('Código de verificação enviado para seu e-mail.');
    } catch (err:any) { toast.error(err?.message || 'Não foi possível iniciar o primeiro acesso.'); }
    finally { setLoading(false); }
  };

  const verificarEmail = async (event: FormEvent) => {
    event.preventDefault();
    const code = otp.replace(/\D/g, '').slice(0, 6);
    if (code.length !== 6) return toast.error('Digite o código recebido por e-mail.');
    setLoading(true);
    try {
      const result = await api('verify_email', { verification_id: verificationId, otp: code });
      setSetupToken(result.setup_token);
      setFirstStep('pin');
      toast.success('E-mail confirmado. Agora crie seu código pessoal.');
    } catch (err:any) { toast.error(err?.message || 'Código de verificação inválido.'); }
    finally { setLoading(false); }
  };

  const criarPin = async (event: FormEvent) => {
    event.preventDefault();
    const first = pin.replace(/\D/g, '').slice(0, 6);
    const second = pinConfirm.replace(/\D/g, '').slice(0, 6);
    if (first.length !== 6) return toast.error('Crie um código pessoal de 6 números.');
    if (first !== second) return toast.error('Os códigos digitados não são iguais.');
    if (/^(\d)\1{5}$/.test(first) || ['123456','654321','000000'].includes(first)) return toast.error('Escolha um código pessoal menos previsível.');
    setLoading(true);
    try {
      const result = await api('set_pin', { verification_id: verificationId, setup_token: setupToken, pin: first });
      toast.success('Acesso individual criado com sucesso.');
      saveSession(result);
    } catch (err:any) { toast.error(err?.message || 'Não foi possível criar seu código pessoal.'); }
    finally { setLoading(false); }
  };

  const resetFirst = () => {
    setFirstStep('identify'); setVerificationId(''); setSetupToken(''); setOtp(''); setPin(''); setPinConfirm('');
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 opacity-40 bg-[radial-gradient(circle_at_top_right,_rgba(99,102,241,.35),_transparent_38%),radial-gradient(circle_at_bottom_left,_rgba(16,185,129,.18),_transparent_34%)]" />
      <div className="relative w-full max-w-md">
        <div className="mb-6 text-center text-white">
          <div className="w-16 h-16 rounded-2xl bg-white/10 border border-white/10 backdrop-blur flex items-center justify-center mx-auto mb-4">
            {isGoiania ? <Building2 className="w-8 h-8" /> : <Calculator className="w-8 h-8" />}
          </div>
          <p className="text-xs uppercase tracking-[.25em] text-slate-400 mb-2">TOPAC RH PRO</p>
          <h1 className="text-2xl font-bold">Portal da Contabilidade</h1>
          <p className="text-sm text-slate-400 mt-2">
            {isGoiania ? 'Acesso exclusivo da contabilidade responsável pela TOPAC Goiânia.' : 'TOPAC Matriz · TOPAC Praia · LMT · ALQUI'}
          </p>
        </div>

        <Card className="border-white/10 bg-white shadow-2xl">
          <CardContent className="p-6">
            {!isGoiania && <div className="mb-5 grid grid-cols-2 rounded-lg bg-slate-100 p-1">
              <button type="button" onClick={() => { setMode('login'); resetFirst(); }} className={`rounded-md px-3 py-2 text-xs font-bold ${mode === 'login' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>Já tenho meu código</button>
              <button type="button" onClick={() => { setMode('first'); resetFirst(); }} className={`rounded-md px-3 py-2 text-xs font-bold ${mode === 'first' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>Primeiro acesso</button>
            </div>}

            {mode === 'login' || isGoiania ? <form onSubmit={entrar} className="space-y-5">
              <div>
                <label className="text-sm font-semibold text-slate-800">Código pessoal</label>
                <p className="text-xs text-muted-foreground mt-1">Use seu código individual de 6 dígitos.</p>
                <div className="relative mt-3">
                  <LockKeyhole className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input value={codigo} onChange={e => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" className="pl-10 h-12 text-center text-xl tracking-[.35em] font-bold" placeholder="••••••" maxLength={6} autoFocus />
                </div>
              </div>
              <Button className="w-full h-12" disabled={loading}>{loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ShieldCheck className="w-4 h-4 mr-2" />}Entrar no dashboard</Button>
              {!isGoiania && <p className="text-center text-[11px] text-slate-500">No primeiro acesso, use a opção <strong>Primeiro acesso</strong> e valide seu e-mail.</p>}
            </form> : firstStep === 'identify' ? <form onSubmit={iniciarPrimeiroAcesso} className="space-y-4">
              <div><label className="text-sm font-semibold text-slate-800">E-mail individual</label><div className="relative mt-2"><Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" /><Input type="email" value={email} onChange={e => setEmail(e.target.value)} className="pl-10 h-11" placeholder="seuemail@empresa.com.br" autoComplete="email" /></div></div>
              <div><label className="text-sm font-semibold text-slate-800">Código inicial enviado pelo RH</label><div className="relative mt-2"><KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" /><Input value={initialCode} onChange={e => setInitialCode(e.target.value.replace(/\D/g,'').slice(0,6))} inputMode="numeric" className="pl-10 h-11 text-center tracking-[.3em] font-bold" placeholder="••••••" maxLength={6} /></div></div>
              <Button className="w-full h-12" disabled={loading}>{loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Mail className="w-4 h-4 mr-2" />}Validar meu e-mail</Button>
              <div className="rounded-lg border bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-500">O código inicial serve somente para criar seu acesso. Depois da validação, você criará um código pessoal que não deve ser compartilhado.</div>
            </form> : firstStep === 'verify' ? <form onSubmit={verificarEmail} className="space-y-4">
              <div className="text-center"><Mail className="mx-auto h-8 w-8 text-indigo-600" /><h2 className="mt-2 text-base font-bold text-slate-900">Confirme seu e-mail</h2><p className="mt-1 text-xs text-slate-500">Digite o código de 6 dígitos que enviamos para <strong>{email}</strong>.</p></div>
              <Input value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g,'').slice(0,6))} inputMode="numeric" autoComplete="one-time-code" className="h-12 text-center text-xl tracking-[.35em] font-bold" placeholder="••••••" maxLength={6} autoFocus />
              <Button className="w-full h-12" disabled={loading}>{loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ShieldCheck className="w-4 h-4 mr-2" />}Confirmar código</Button>
              <button type="button" onClick={resetFirst} className="w-full text-xs font-semibold text-slate-500 hover:text-slate-900">Voltar e reenviar</button>
            </form> : <form onSubmit={criarPin} className="space-y-4">
              <div className="text-center"><KeyRound className="mx-auto h-8 w-8 text-emerald-600" /><h2 className="mt-2 text-base font-bold text-slate-900">Crie seu código pessoal</h2><p className="mt-1 text-xs text-slate-500">Esse código será somente seu. As outras usuárias não terão acesso a ele.</p></div>
              <div><label className="text-xs font-semibold text-slate-700">Novo código de 6 dígitos</label><Input value={pin} onChange={e => setPin(e.target.value.replace(/\D/g,'').slice(0,6))} inputMode="numeric" className="mt-2 h-11 text-center tracking-[.3em] font-bold" placeholder="••••••" maxLength={6} /></div>
              <div><label className="text-xs font-semibold text-slate-700">Confirme o código</label><Input value={pinConfirm} onChange={e => setPinConfirm(e.target.value.replace(/\D/g,'').slice(0,6))} inputMode="numeric" className="mt-2 h-11 text-center tracking-[.3em] font-bold" placeholder="••••••" maxLength={6} /></div>
              <Button className="w-full h-12" disabled={loading}>{loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ShieldCheck className="w-4 h-4 mr-2" />}Criar meu acesso</Button>
            </form>}

            <div className="mt-5 rounded-xl bg-slate-50 border p-3 text-xs text-slate-500 leading-relaxed">Este acesso é restrito à contabilidade. Não libera painel administrativo, cadastros ou edição das informações do RH.</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
