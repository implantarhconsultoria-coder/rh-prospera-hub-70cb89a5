import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2, AlertTriangle, Wrench, DollarSign, FileText } from 'lucide-react';

const FN_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/acesso-cpf`;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const formatCpf = (raw: string) => {
  const d = raw.replace(/\D/g, '').slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2');
};

const SLUG_LABEL: Record<string, { titulo: string; subtitulo: string; icon: React.ReactNode; cor: string }> = {
  'op-sp':       { titulo: 'App Operacional · SP',         subtitulo: 'Topac Matriz · São Paulo',        icon: <Wrench className="w-5 h-5 text-white" />,      cor: 'from-primary to-blue-600' },
  'op-pg':       { titulo: 'App Operacional · Praia Grande', subtitulo: 'Topac Filial Praia Grande',     icon: <Wrench className="w-5 h-5 text-white" />,      cor: 'from-cyan-500 to-blue-600' },
  'op-go':       { titulo: 'App Operacional · Goiânia',    subtitulo: 'Topac Filial Goiânia',            icon: <Wrench className="w-5 h-5 text-white" />,      cor: 'from-emerald-500 to-teal-600' },
  'financeiro':  { titulo: 'Portal Financeiro TOPAC',      subtitulo: 'Acesso por CPF',                  icon: <DollarSign className="w-5 h-5 text-white" />,  cor: 'from-cyan-600 to-sky-700' },
  'faturamento': { titulo: 'Portal Faturamento TOPAC',     subtitulo: 'Acesso por CPF',                  icon: <FileText className="w-5 h-5 text-white" />,    cor: 'from-indigo-500 to-violet-600' },
};

const ERRO_LABEL: Record<string, string> = {
  cpf_invalido:                     'CPF inválido. Confira os 11 dígitos.',
  cpf_nao_encontrado:               'CPF não encontrado na base de funcionários. Solicite o cadastro ao administrador.',
  cpf_nao_encontrado_funcionarios:  'CPF não encontrado na base de funcionários. Solicite o cadastro ao administrador.',
  funcionario_inativo:              'Funcionário inativo. Fale com o administrador.',
  sem_permissao_modulo:             'CPF encontrado, mas sem permissão para este módulo.',
  modulo_bloqueado:                 'Acesso a este módulo está bloqueado. Fale com o administrador.',
  cpf_bloqueado:                    'CPF sem permissão para este acesso (bloqueado).',
  unidade_incorreta:                'Este CPF pertence a outra unidade. Use o link da unidade correta.',
  link_invalido:                    'Link inválido. Solicite um novo link ao administrador.',
  link_bloqueado:                   'Link temporariamente bloqueado. Fale com o administrador.',
  tecnico_nao_encontrado:           'Este CPF ainda não está vinculado ao app operacional.',
  blocked_link:                     'Acesso bloqueado pelo administrador.',
  revoked_link:                     'Acesso revogado. Solicite um novo link.',
  invalid_token:                    'Token de acesso inválido.',
  db_error:                         'Falha temporária ao consultar o banco. Tente novamente em instantes.',
};

const AcessoModuloCpfPage: React.FC = () => {
  const { slug = '' } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const meta = SLUG_LABEL[slug] || { titulo: 'Acesso por CPF', subtitulo: '', icon: <Wrench className="w-5 h-5 text-white" />, cor: 'from-primary to-blue-600' };
  const [cpf, setCpf] = useState('');
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => { setErro(null); }, [slug]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    const digits = cpf.replace(/\D/g, '');
    if (digits.length !== 11) {
      setErro(ERRO_LABEL.cpf_invalido);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(FN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
          apikey: ANON,
          Authorization: `Bearer ${ANON}`,
        },
        cache: 'no-store',
        body: JSON.stringify({ action: 'entrar', slug, cpf: digits }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        const code = data?.error || 'db_error';
        setErro(ERRO_LABEL[code] || `Acesso negado (${code}).`);
        setLoading(false);
        return;
      }

      // Sessão isolada para módulos administrativos (financeiro/faturamento)
      if (data.modulo === 'operacional' && data.tecnico_token) {
        navigate(`/m/${data.tecnico_token}`, { replace: true });
        return;
      }

      // Para financeiro/faturamento: armazena sessão CPF e abre portal restrito
      const sessao = {
        modulo: data.modulo,
        unidade: data.unidade,
        link_nome: data.link_nome,
        usuario: data.usuario,
        ts: Date.now(),
      };
      sessionStorage.setItem('cpf_session', JSON.stringify(sessao));
      navigate(`/${data.modulo}-cpf`, { replace: true });
    } catch (err) {
      setErro('Falha ao conectar com o servidor. Verifique sua internet e tente novamente.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
      <div className="w-full max-w-sm bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-sm text-white">
        <div className="flex items-center gap-3 mb-5">
          <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${meta.cor} flex items-center justify-center shadow-lg shadow-primary/30`}>
            {meta.icon}
          </div>
          <div>
            <p className="text-[10px] text-white/50 uppercase tracking-wider leading-none">Acesso por CPF · link permanente</p>
            <h1 className="text-lg font-bold font-display leading-tight">{meta.titulo}</h1>
            {meta.subtitulo && <p className="text-[11px] text-white/60 leading-tight">{meta.subtitulo}</p>}
          </div>
        </div>
        <p className="text-xs text-white/60 mb-4">
          Informe seu CPF para entrar. Cada CPF abre uma sessão isolada e segura.
        </p>
        <form onSubmit={submit} className="space-y-3">
          <input
            type="tel"
            inputMode="numeric"
            autoComplete="off"
            value={cpf}
            onChange={(e) => setCpf(formatCpf(e.target.value))}
            placeholder="000.000.000-00"
            className="w-full bg-white/10 border border-white/15 rounded-xl px-4 py-3 text-base text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          {erro && (
            <div className="flex items-start gap-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{erro}</span>
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            className={`w-full bg-gradient-to-r ${meta.cor} hover:opacity-90 disabled:opacity-60 text-white font-bold py-3 rounded-xl shadow-lg shadow-primary/30 transition-opacity flex items-center justify-center gap-2`}
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Entrar
          </button>
        </form>
        <p className="text-center text-[10px] text-white/30 mt-5">
          Topac · link permanente · acesso por CPF
        </p>
      </div>
    </div>
  );
};

export default AcessoModuloCpfPage;
