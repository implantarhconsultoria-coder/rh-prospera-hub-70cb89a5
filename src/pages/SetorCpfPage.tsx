import React, { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { LogOut, Users, Package, Cog, Building2, ShieldCheck, Info } from 'lucide-react';

interface CpfSession {
  modulo: string;
  unidade: string;
  link_nome: string;
  usuario: { funcionario_id: string; nome: string; cpf: string; empresa?: string; cargo?: string; setor?: string; company_id?: string };
  ts: number;
}

const SESSION_KEY = 'cpf_session';
const SESSION_MAX_MS = 12 * 60 * 60 * 1000;

const ICONS: Record<string, React.ReactNode> = {
  rh:           <Users className="w-5 h-5 text-white" />,
  almoxarifado: <Package className="w-5 h-5 text-white" />,
  mecanicos:    <Cog className="w-5 h-5 text-white" />,
  filial:       <Building2 className="w-5 h-5 text-white" />,
};

const TITULOS: Record<string, string> = {
  rh:           'Portal RH',
  almoxarifado: 'Portal Almoxarifado',
  mecanicos:    'Portal Mecânicos',
  filial:       'Portal Filial',
};

const fmtCpf = (cpf: string) => (cpf || '').replace(/\D/g, '').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');

/**
 * Portal genérico, restrito e isolado, para os setores que ainda não possuem painel próprio dedicado.
 * Mostra os dados do funcionário autorizado + módulo liberado, sem acesso ao painel administrativo.
 * Sessão CPF é independente do login admin (sessionStorage, expira em 12h).
 */
const SetorCpfPage: React.FC = () => {
  const { modulo = '' } = useParams<{ modulo: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<CpfSession | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (raw) {
        const s = JSON.parse(raw) as CpfSession;
        if (s?.modulo === modulo && Date.now() - (s.ts || 0) < SESSION_MAX_MS) {
          setSession(s);
        }
      }
    } catch { /* noop */ }
    setReady(true);
  }, [modulo]);

  if (!ready) return null;
  if (!session) {
    // Tenta inferir o slug do link de origem para retornar à tela correta
    const slug = modulo === 'filial' ? 'matriz' : modulo;
    return <Navigate to={`/acesso/${slug}`} replace />;
  }

  const sair = () => {
    sessionStorage.removeItem(SESSION_KEY);
    navigate(`/acesso/${modulo === 'filial' ? 'matriz' : modulo}`, { replace: true });
  };

  const titulo = TITULOS[modulo] || `Portal ${modulo}`;
  const icon = ICONS[modulo] || <ShieldCheck className="w-5 h-5 text-white" />;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
      <header className="border-b border-white/10 bg-black/30 backdrop-blur sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center shadow-lg shadow-primary/30">
              {icon}
            </div>
            <div>
              <p className="text-[10px] text-white/50 uppercase tracking-wider leading-none">Acesso por CPF · sessão isolada</p>
              <h1 className="text-base font-bold font-display leading-tight">{titulo}</h1>
            </div>
          </div>
          <button onClick={sair} className="text-xs px-3 py-2 rounded-lg border border-white/15 hover:bg-white/5 flex items-center gap-1.5">
            <LogOut className="w-3.5 h-3.5" /> Sair
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        <section className="bg-white/5 border border-white/10 rounded-2xl p-5">
          <h2 className="text-sm font-semibold mb-3">Funcionário autenticado</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div>
              <dt className="text-[10px] uppercase tracking-wider text-white/50">Nome</dt>
              <dd className="font-medium">{session.usuario.nome}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wider text-white/50">CPF</dt>
              <dd className="font-mono text-sm">{fmtCpf(session.usuario.cpf)}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wider text-white/50">Empresa / Filial</dt>
              <dd>{session.usuario.empresa || session.unidade || '—'}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wider text-white/50">Cargo</dt>
              <dd>{session.usuario.cargo || '—'}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wider text-white/50">Setor</dt>
              <dd>{session.usuario.setor || modulo}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wider text-white/50">Setor liberado</dt>
              <dd className="capitalize">{modulo}</dd>
            </div>
          </dl>
        </section>

        <section className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-emerald-400 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-emerald-100">
            <p className="font-semibold mb-1">Acesso autorizado</p>
            <p className="text-emerald-200/80">
              Você está conectado(a) ao setor <strong className="capitalize">{modulo}</strong>.
              Suas permissões são controladas pelo administrador. Em caso de bloqueio, férias ou desligamento,
              o acesso é encerrado automaticamente.
            </p>
          </div>
        </section>

        <section className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-300 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-white/70">
            <p className="font-semibold text-white mb-1">Funções do setor em breve</p>
            <p>
              Esta área é restrita aos funcionários autorizados ao setor <strong className="capitalize">{modulo}</strong>.
              Ferramentas específicas (consultas, lançamentos, registros) serão liberadas conforme aprovação do administrador.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
};

export default SetorCpfPage;
