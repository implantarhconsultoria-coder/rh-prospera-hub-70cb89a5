import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  Clock3,
  Fingerprint,
  KeyRound,
  Loader2,
  LockKeyhole,
  Mail,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { saveExternalSession, type SessaoAcessoExterno } from '@/lib/acessoExternoAuth';

const PATH_MODULE: Record<string, string> = {
  '/acesso-filial': 'filial',
  '/acesso-operacional': 'operacional',
  '/acesso-almoxarifado': 'almoxarifado',
  '/acesso-campo': 'campo',
};

const MODULE_TITLE: Record<string, string> = {
  filial: 'Portal das Filiais',
  operacional: 'Portal Operacional',
  almoxarifado: 'Portal Almoxarifado',
  campo: 'Portal de Campo',
  todos: 'Acesso aos Módulos',
};

const MODULE_REDIRECT: Record<string, (id: string) => string> = {
  filial: (id) => `/filial-ext/${id}`,
  almoxarifado: (id) => `/almoxarifado-ext/${id}`,
  operacional: (id) => `/operacional-ext/${id}`,
  campo: (id) => `/campo-ext/${id}`,
};

const onlyDigits = (value: string) => String(value || '').replace(/\D/g, '');

const inputClass =
  'portal-access-input h-12 w-full rounded-xl border border-white/10 bg-[#080c14] pl-11 pr-4 text-[15px] text-white shadow-inner outline-none transition placeholder:text-slate-600 focus:border-[#f7c900]/65 focus:ring-2 focus:ring-[#f7c900]/10';

export default function FilialLoginPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const modulo = PATH_MODULE[location.pathname] || 'todos';
  const titulo = MODULE_TITLE[modulo] || MODULE_TITLE.todos;

  const [modo, setModo] = useState<'login' | 'cadastro'>('login');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [lembrar, setLembrar] = useState(false);
  const [nome, setNome] = useState('');
  const [cpf, setCpf] = useState('');
  const [funcao, setFuncao] = useState('');
  const [loading, setLoading] = useState(false);
  const [cadastroMensagem, setCadastroMensagem] = useState('');

  const descricao = useMemo(() => {
    if (modulo === 'filial') return 'Praia Grande e Goiânia. A unidade é identificada automaticamente pelo cadastro.';
    if (modulo === 'todos') return 'Um único acesso para os módulos liberados ao seu perfil.';
    return 'Acesso individual e rastreável para colaboradores autorizados.';
  }, [modulo]);

  const entrar = async (event: React.FormEvent) => {
    event.preventDefault();
    const emailNormalizado = email.trim().toLowerCase();
    const pin = onlyDigits(senha);

    if (!emailNormalizado.includes('@') || pin.length !== 4) {
      toast.error('Informe o e-mail corporativo e a senha de 4 números.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/portal-access', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'login', email: emailNormalizado, senha: pin, lembrar, modulo }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) {
        toast.error(payload?.message || 'Não foi possível entrar.');
        return;
      }

      const sessao: SessaoAcessoExterno = {
        cpf_clean: payload.cpf_clean,
        nome: payload.nome,
        email: payload.email,
        portais: payload.portais || [],
        ts: Date.now(),
        expira_em: new Date(payload.expira_em).getTime(),
        session_token: payload.session_token,
        sessao_id: payload.sessao_id,
        lembrar: Boolean(payload.lembrar),
      };

      saveExternalSession(sessao, Boolean(payload.lembrar));

      if (sessao.portais.length === 1) {
        const portal = sessao.portais[0];
        const goto = MODULE_REDIRECT[portal.modulo];
        if (goto) {
          navigate(goto(portal.acesso_id), { replace: true });
          return;
        }
      }

      navigate('/portais', { replace: true });
    } finally {
      setLoading(false);
    }
  };

  const cadastrar = async (event: React.FormEvent) => {
    event.preventDefault();
    const emailNormalizado = email.trim().toLowerCase();
    const cpfLimpo = onlyDigits(cpf);

    if (!emailNormalizado.includes('@') || nome.trim().length < 3 || cpfLimpo.length !== 11 || funcao.trim().length < 2) {
      toast.error('Preencha e-mail corporativo, nome completo, CPF e função.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/portal-access', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'register',
          email: emailNormalizado,
          nome: nome.trim(),
          cpf: cpfLimpo,
          funcao: funcao.trim(),
          accessPath: location.pathname === '/' ? '/modulos' : location.pathname,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) {
        toast.error(payload?.message || 'Não foi possível concluir o cadastro.');
        return;
      }

      setCadastroMensagem(payload?.message || 'Cadastro concluído.');
      toast.success(payload?.email_enviado ? 'E-mail de boas-vindas enviado.' : 'Cadastro concluído.');
    } finally {
      setLoading(false);
    }
  };

  const voltarLogin = () => {
    setModo('login');
    setCadastroMensagem('');
    setSenha('');
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#03060b] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 top-[-10rem] h-[34rem] w-[34rem] rounded-full bg-violet-700/12 blur-3xl" />
        <div className="absolute -right-20 bottom-[-11rem] h-[32rem] w-[32rem] rounded-full bg-cyan-500/8 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.018)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.018)_1px,transparent_1px)] bg-[size:36px_36px]" />
      </div>

      <div className="relative mx-auto grid min-h-screen w-full max-w-6xl items-center gap-10 px-5 py-8 lg:grid-cols-[1.08fr_0.92fr] lg:px-10">
        <section className="hidden lg:block">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#f7c900]/20 bg-[#f7c900]/7 px-4 py-2 text-[11px] font-black uppercase tracking-[0.22em] text-[#f7c900]">
            <ShieldCheck className="h-4 w-4" />
            Acesso corporativo seguro
          </div>

          <div className="mt-8 flex items-center gap-4">
            <div className="grid h-16 w-16 place-items-center rounded-2xl border border-violet-400/20 bg-gradient-to-br from-violet-600/25 to-slate-950 shadow-[0_15px_60px_rgba(90,43,150,0.18)]">
              <Building2 className="h-8 w-8 text-[#f7c900]" />
            </div>
            <div>
              <p className="text-sm font-black uppercase tracking-[0.28em] text-violet-300">TOPAC RH PRO</p>
              <h1 className="mt-1 text-4xl font-black tracking-tight">{titulo}</h1>
            </div>
          </div>

          <p className="mt-7 max-w-xl text-lg leading-8 text-slate-400">{descricao}</p>

          <div className="mt-10 grid max-w-xl gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/7 bg-white/[0.025] p-5">
              <div className="flex items-center gap-3 text-sm font-bold">
                <Clock3 className="h-5 w-5 text-[#f7c900]" />
                Sessão por período
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                O acesso encerra automaticamente no almoço e no fim do expediente.
              </p>
            </div>
            <div className="rounded-2xl border border-white/7 bg-white/[0.025] p-5">
              <div className="flex items-center gap-3 text-sm font-bold">
                <LockKeyhole className="h-5 w-5 text-violet-300" />
                Acesso rastreável
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Entradas, saídas e extensões ficam registradas para auditoria.
              </p>
            </div>
          </div>

          <div className="mt-7 flex max-w-xl items-center gap-3 rounded-2xl border border-emerald-400/10 bg-emerald-400/[0.035] px-5 py-4 text-sm text-slate-400">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
            O login identifica automaticamente a unidade e libera apenas o que pertence ao seu perfil.
          </div>
        </section>

        <section className="mx-auto w-full max-w-[480px]">
          <div className="rounded-[28px] border border-white/10 bg-[#0b1019]/95 p-5 shadow-[0_28px_90px_rgba(0,0,0,0.5)] backdrop-blur-xl sm:p-7">
            <div className="flex items-center justify-between gap-4 border-b border-white/7 pb-5">
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-xl border border-violet-400/20 bg-violet-500/10 lg:hidden">
                  <Building2 className="h-5 w-5 text-[#f7c900]" />
                </div>
                <div>
                  <div className="text-[11px] font-black uppercase tracking-[0.2em] text-violet-300">TOPAC RH PRO</div>
                  <h2 className="mt-1 text-xl font-black">{titulo}</h2>
                </div>
              </div>
              <div className="hidden rounded-full border border-emerald-400/15 bg-emerald-400/5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300 sm:block">
                Seguro
              </div>
            </div>

            {!cadastroMensagem && (
              <div className="mt-6 grid grid-cols-2 rounded-xl border border-white/7 bg-[#060a11] p-1">
                <button
                  type="button"
                  onClick={() => setModo('login')}
                  className={`rounded-lg px-3 py-2.5 text-sm font-bold transition ${modo === 'login' ? 'bg-[#171d29] text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  Entrar
                </button>
                <button
                  type="button"
                  onClick={() => setModo('cadastro')}
                  className={`rounded-lg px-3 py-2.5 text-sm font-bold transition ${modo === 'cadastro' ? 'bg-[#171d29] text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  Primeiro acesso
                </button>
              </div>
            )}

            {cadastroMensagem ? (
              <div className="mt-6 space-y-5">
                <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.06] p-5">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
                    <div>
                      <p className="font-bold text-emerald-100">Cadastro concluído</p>
                      <p className="mt-1 text-sm leading-6 text-emerald-100/70">{cadastroMensagem}</p>
                    </div>
                  </div>
                </div>
                <p className="text-sm leading-6 text-slate-500">
                  A senha inicial corresponde aos quatro últimos números do CPF e é enviada para o e-mail corporativo.
                </p>
                <button type="button" onClick={voltarLogin} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#f7c900] font-black text-[#101010] transition hover:bg-[#ffda35]">
                  Ir para o login <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            ) : modo === 'login' ? (
              <form onSubmit={entrar} className="mt-6 space-y-5">
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-slate-300">E-mail corporativo</span>
                  <span className="relative block">
                    <Mail className="absolute left-3.5 top-3.5 h-5 w-5 text-slate-600" />
                    <input
                      type="email"
                      autoComplete="username"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="nome@topac.com.br"
                      className={inputClass}
                    />
                  </span>
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-slate-300">Senha</span>
                  <span className="relative block">
                    <KeyRound className="absolute left-3.5 top-3.5 h-5 w-5 text-slate-600" />
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      autoComplete="current-password"
                      required
                      value={senha}
                      onChange={(e) => setSenha(onlyDigits(e.target.value).slice(0, 4))}
                      placeholder="4 números"
                      className={inputClass}
                    />
                  </span>
                </label>

                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/7 bg-[#070b12] p-4">
                  <input
                    type="checkbox"
                    checked={lembrar}
                    onChange={(e) => setLembrar(e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-[#f7c900]"
                  />
                  <span>
                    <span className="block text-sm font-bold text-slate-200">Manter acesso neste dispositivo</span>
                    <span className="mt-1 block text-xs leading-5 text-slate-500">
                      Somente durante o período atual. O acesso será encerrado no almoço e no fim do expediente.
                    </span>
                  </span>
                </label>

                <button type="submit" disabled={loading} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#f7c900] font-black text-[#101010] transition hover:bg-[#ffda35] disabled:cursor-not-allowed disabled:opacity-60">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                  Entrar no portal
                </button>
              </form>
            ) : (
              <form onSubmit={cadastrar} className="mt-6 space-y-4">
                <div className="rounded-xl border border-violet-400/10 bg-violet-400/[0.035] px-4 py-3 text-xs leading-5 text-slate-400">
                  Informe os dados abaixo. O sistema cruza o CPF com o cadastro interno antes de liberar o acesso.
                </div>

                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-slate-300">E-mail corporativo</span>
                  <span className="relative block">
                    <Mail className="absolute left-3.5 top-3.5 h-5 w-5 text-slate-600" />
                    <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@topac.com.br" className={inputClass} />
                  </span>
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-slate-300">Nome completo</span>
                  <span className="relative block">
                    <UserRound className="absolute left-3.5 top-3.5 h-5 w-5 text-slate-600" />
                    <input required value={nome} onChange={(e) => setNome(e.target.value)} className={inputClass} />
                  </span>
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-slate-300">CPF</span>
                  <span className="relative block">
                    <Fingerprint className="absolute left-3.5 top-3.5 h-5 w-5 text-slate-600" />
                    <input
                      inputMode="numeric"
                      maxLength={11}
                      required
                      value={cpf}
                      onChange={(e) => setCpf(onlyDigits(e.target.value).slice(0, 11))}
                      placeholder="Somente números"
                      className={inputClass}
                    />
                  </span>
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-slate-300">Função</span>
                  <span className="relative block">
                    <BriefcaseBusiness className="absolute left-3.5 top-3.5 h-5 w-5 text-slate-600" />
                    <input required value={funcao} onChange={(e) => setFuncao(e.target.value)} placeholder="Ex.: Auxiliar Administrativo" className={inputClass} />
                  </span>
                </label>

                <button type="submit" disabled={loading} className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#f7c900] font-black text-[#101010] transition hover:bg-[#ffda35] disabled:cursor-not-allowed disabled:opacity-60">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                  Enviar cadastro
                </button>
              </form>
            )}

            <div className="mt-6 flex items-start gap-2 border-t border-white/7 pt-5 text-xs leading-5 text-slate-600">
              <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />
              Acesso individual. Entradas, saídas automáticas e extensões ficam registradas para auditoria.
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
