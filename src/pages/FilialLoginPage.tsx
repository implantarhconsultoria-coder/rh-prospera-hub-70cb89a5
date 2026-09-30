import React, { useMemo, useState } from 'react';
import { ArrowRight, BriefcaseBusiness, Building2, Fingerprint, KeyRound, Loader2, LockKeyhole, Mail, UserRound } from 'lucide-react';
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
    if (modulo === 'filial') return 'Praia Grande e Goiânia • a unidade é definida pelo cadastro.';
    if (modulo === 'todos') return 'Um login para os módulos liberados ao seu perfil.';
    return 'Acesso individual para colaboradores autorizados.';
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
    <main className="flex min-h-screen items-center justify-center bg-[#05070c] p-4 text-white">
      <section className="w-full max-w-md rounded-2xl border border-[#373044] bg-[#0e1119] p-7 shadow-2xl">
        <div className="mb-6 flex items-center gap-3 border-b border-[#30283a] pb-5">
          <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 p-3">
            <Building2 className="h-7 w-7 text-[#ffc400]" />
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-violet-400">TOPAC RH PRO</div>
            <h1 className="text-xl font-black">{titulo}</h1>
            <p className="mt-1 text-xs text-zinc-400">{descricao}</p>
          </div>
        </div>

        {cadastroMensagem ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">
              {cadastroMensagem}
            </div>
            <p className="text-xs leading-relaxed text-zinc-400">
              A senha inicial é enviada por e-mail e corresponde aos quatro últimos números do CPF.
            </p>
            <button type="button" onClick={voltarLogin} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#ffc400] font-bold text-black hover:bg-[#ffda58]">
              <ArrowRight className="h-4 w-4" /> Ir para o login
            </button>
          </div>
        ) : modo === 'login' ? (
          <form onSubmit={entrar} className="space-y-4">
            <label className="block text-sm text-zinc-300">
              E-mail corporativo
              <span className="relative mt-1 block">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-zinc-500" />
                <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="nome@topac.com.br"
                  className="h-11 w-full rounded-lg border border-[#41334f] bg-[#090b12] pl-10 pr-3 text-white outline-none focus:border-violet-400" />
              </span>
            </label>

            <label className="block text-sm text-zinc-300">
              Senha
              <span className="relative mt-1 block">
                <KeyRound className="absolute left-3 top-3 h-4 w-4 text-zinc-500" />
                <input type="password" inputMode="numeric" maxLength={4} autoComplete="current-password" required
                  value={senha} onChange={(e) => setSenha(onlyDigits(e.target.value).slice(0, 4))}
                  placeholder="4 números"
                  className="h-11 w-full rounded-lg border border-[#41334f] bg-[#090b12] pl-10 pr-3 text-white outline-none focus:border-violet-400" />
              </span>
            </label>

            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[#30283a] bg-[#090b12] p-3">
              <input type="checkbox" checked={lembrar} onChange={(e) => setLembrar(e.target.checked)} className="mt-0.5 h-4 w-4" />
              <span>
                <span className="block text-sm font-semibold text-zinc-200">Manter acesso neste dispositivo</span>
                <span className="mt-1 block text-xs leading-relaxed text-zinc-500">
                  Somente durante o período atual. No almoço e no fim do expediente o acesso é encerrado automaticamente.
                </span>
              </span>
            </label>

            <button type="submit" disabled={loading} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#ffc400] font-bold text-black hover:bg-[#ffda58] disabled:opacity-50">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />} Entrar
            </button>

            <button type="button" onClick={() => setModo('cadastro')} className="w-full text-sm font-semibold text-violet-300 hover:underline">
              Primeiro acesso / fazer cadastro
            </button>
          </form>
        ) : (
          <form onSubmit={cadastrar} className="space-y-4">
            <label className="block text-sm text-zinc-300">E-mail corporativo
              <span className="relative mt-1 block"><Mail className="absolute left-3 top-3 h-4 w-4 text-zinc-500" />
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                  className="h-11 w-full rounded-lg border border-[#41334f] bg-[#090b12] pl-10 pr-3 text-white outline-none focus:border-violet-400" />
              </span>
            </label>

            <label className="block text-sm text-zinc-300">Nome completo
              <span className="relative mt-1 block"><UserRound className="absolute left-3 top-3 h-4 w-4 text-zinc-500" />
                <input required value={nome} onChange={(e) => setNome(e.target.value)}
                  className="h-11 w-full rounded-lg border border-[#41334f] bg-[#090b12] pl-10 pr-3 text-white outline-none focus:border-violet-400" />
              </span>
            </label>

            <label className="block text-sm text-zinc-300">CPF
              <span className="relative mt-1 block"><Fingerprint className="absolute left-3 top-3 h-4 w-4 text-zinc-500" />
                <input inputMode="numeric" maxLength={11} required value={cpf} onChange={(e) => setCpf(onlyDigits(e.target.value).slice(0, 11))}
                  className="h-11 w-full rounded-lg border border-[#41334f] bg-[#090b12] pl-10 pr-3 text-white outline-none focus:border-violet-400" />
              </span>
            </label>

            <label className="block text-sm text-zinc-300">Função
              <span className="relative mt-1 block"><BriefcaseBusiness className="absolute left-3 top-3 h-4 w-4 text-zinc-500" />
                <input required value={funcao} onChange={(e) => setFuncao(e.target.value)} placeholder="Ex.: Auxiliar Administrativo"
                  className="h-11 w-full rounded-lg border border-[#41334f] bg-[#090b12] pl-10 pr-3 text-white outline-none focus:border-violet-400" />
              </span>
            </label>

            <button type="submit" disabled={loading} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#ffc400] font-bold text-black hover:bg-[#ffda58] disabled:opacity-50">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />} Enviar cadastro
            </button>

            <button type="button" onClick={voltarLogin} className="w-full text-sm font-semibold text-zinc-400 hover:underline">Já tenho acesso</button>
          </form>
        )}

        <p className="mt-6 flex items-start gap-2 border-t border-[#30283a] pt-4 text-xs leading-relaxed text-zinc-500">
          <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />
          Entradas, saídas automáticas, extensões e motivos ficam registrados para auditoria.
        </p>
      </section>
    </main>
  );
}
