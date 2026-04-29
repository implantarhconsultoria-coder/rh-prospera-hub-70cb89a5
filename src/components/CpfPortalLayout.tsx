import React, { useEffect, useState } from 'react';
import { Navigate, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { DollarSign, FileText, LogOut, Home, Banknote, Users, Receipt, BarChart3, AlertCircle, Wallet, Activity, ArrowLeftRight } from 'lucide-react';
import ErrorBoundary from '@/components/ErrorBoundary';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface CpfSession {
  modulo: 'financeiro' | 'faturamento';
  unidade: string;
  link_nome: string;
  usuario: { funcionario_id: string; nome: string; cpf: string; empresa?: string; cargo?: string; company_id?: string };
  ts: number;
}

const SESSION_KEY = 'cpf_session';
const SESSION_MAX_MS = 12 * 60 * 60 * 1000; // 12h de sessão isolada

const useCpfSession = (modulo: 'financeiro' | 'faturamento') => {
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
  return { session, ready };
};

const FIN_NAV = [
  { to: '/financeiro-cpf', label: 'Início', icon: Home, end: true },
  { to: '/financeiro-cpf/contas-receber', label: 'Contas a Receber', icon: Receipt },
  { to: '/financeiro-cpf/contas-pagar', label: 'Contas a Pagar', icon: Banknote },
  { to: '/financeiro-cpf/fluxo-caixa', label: 'Fluxo de Caixa', icon: BarChart3 },
  { to: '/financeiro-cpf/inadimplencia', label: 'Inadimplência', icon: AlertCircle },
  { to: '/financeiro-cpf/bancos', label: 'Bancos', icon: Wallet },
  { to: '/financeiro-cpf/conciliacao', label: 'Conciliação', icon: Activity },
];

const FAT_NAV = [
  { to: '/faturamento-cpf', label: 'Início', icon: Home, end: true },
  { to: '/faturamento-cpf/clientes', label: 'Clientes', icon: Users },
  { to: '/faturamento-cpf/contratos', label: 'Contratos', icon: FileText },
  { to: '/faturamento-cpf/faturas', label: 'Faturas', icon: Receipt },
  { to: '/faturamento-cpf/medicoes', label: 'Medições', icon: Activity },
  { to: '/faturamento-cpf/pendencias', label: 'Pendências', icon: AlertCircle },
];

const Layout: React.FC<{ modulo: 'financeiro' | 'faturamento' }> = ({ modulo }) => {
  const { session, ready } = useCpfSession(modulo);
  const navigate = useNavigate();
  if (!ready) return null;
  if (!session) return <Navigate to={`/acesso/${modulo}`} replace />;

  const nav = modulo === 'financeiro' ? FIN_NAV : FAT_NAV;
  const Icon = modulo === 'financeiro' ? DollarSign : FileText;
  const cor = modulo === 'financeiro' ? 'from-cyan-600 to-sky-700' : 'from-indigo-500 to-violet-600';
  const titulo = modulo === 'financeiro' ? 'Portal Financeiro TOPAC' : 'Portal Faturamento TOPAC';

  const sair = () => {
    sessionStorage.removeItem(SESSION_KEY);
    navigate(`/acesso/${modulo}`, { replace: true });
  };

  const outroModulo: 'financeiro' | 'faturamento' = modulo === 'financeiro' ? 'faturamento' : 'financeiro';
  const [podeAlternar, setPodeAlternar] = useState(false);

  useEffect(() => {
    const fid = session?.usuario?.funcionario_id;
    if (!fid) return;
    supabase
      .from('funcionario_modulos')
      .select('status')
      .eq('funcionario_id', fid)
      .eq('modulo', outroModulo)
      .eq('status', 'ativo')
      .maybeSingle()
      .then(({ data }) => setPodeAlternar(!!data));
  }, [session, outroModulo]);

  const alternar = () => {
    if (!session) return;
    const nova: CpfSession = { ...session, modulo: outroModulo, ts: Date.now() };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(nova));
    toast.success(`Acessando ${outroModulo === 'financeiro' ? 'Financeiro' : 'Faturamento'}`);
    navigate(outroModulo === 'financeiro' ? '/financeiro-cpf' : '/faturamento-cpf', { replace: true });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-30 bg-card border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 bg-gradient-to-br ${cor} rounded-xl flex items-center justify-center shadow`}>
            <Icon className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-foreground font-display leading-tight">{titulo}</h1>
            <p className="text-[10px] text-muted-foreground leading-none">
              {session.usuario.nome} · CPF {session.usuario.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {podeAlternar && (
            <button onClick={alternar}
              className="text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted flex items-center gap-1"
              title={`Ir para ${outroModulo}`}>
              <ArrowLeftRight className="w-3.5 h-3.5" />
              Ir para {outroModulo === 'financeiro' ? 'Financeiro' : 'Faturamento'}
            </button>
          )}
          <button onClick={sair} className="p-2 rounded-lg hover:bg-muted text-muted-foreground" title="Sair">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>
      <div className="flex-1 flex">
        <nav className="w-56 bg-card/50 border-r border-border p-3 hidden md:block">
          <ul className="space-y-1">
            {nav.map(({ to, label, icon: I, end }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    `flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                      isActive ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-muted'
                    }`
                  }
                >
                  <I className="w-4 h-4" />
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <main className="flex-1 p-4 md:p-6 max-w-[1200px] mx-auto w-full">
          <ErrorBoundary><Outlet context={{ session }} /></ErrorBoundary>
        </main>
      </div>
      {/* Mobile bottom nav */}
      <nav className="md:hidden sticky bottom-0 bg-card border-t border-border flex overflow-x-auto">
        {nav.map(({ to, label, icon: I, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-0.5 px-3 py-2 text-[10px] flex-1 min-w-[64px] ${
                isActive ? 'text-primary' : 'text-muted-foreground'
              }`
            }
          >
            <I className="w-4 h-4" />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
};

export const FinanceiroCpfLayout: React.FC = () => <Layout modulo="financeiro" />;
export const FaturamentoCpfLayout: React.FC = () => <Layout modulo="faturamento" />;

export default Layout;
