import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import { Loader2, Building2, DollarSign, FileText, LogOut, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import FooterSobre from '@/components/FooterSobre';

type AppRole = 'admin' | 'filial_praia' | 'filial_goiania' | 'financeiro' | 'faturamento' | 'tecnico_campo';

interface ModuloInfo { label: string; desc: string; path: string; icon: React.ReactNode; cor: string; }

const MODULO: Record<Exclude<AppRole,'admin'>, ModuloInfo> = {
  filial_praia:   { label: 'RH Praia Grande', desc: 'TOPAC PRAIA GRANDE',  path: '/filial',      icon: <Building2 className="w-6 h-6" />, cor: 'from-blue-500 to-blue-700' },
  filial_goiania: { label: 'RH Goiânia',      desc: 'TOPAC GOIÂNIA',       path: '/filial',      icon: <Building2 className="w-6 h-6" />, cor: 'from-emerald-500 to-emerald-700' },
  financeiro:     { label: 'Financeiro',      desc: 'Módulo financeiro',   path: '/financeiro',  icon: <DollarSign className="w-6 h-6" />, cor: 'from-cyan-500 to-cyan-700' },
  faturamento:    { label: 'Faturamento',     desc: 'Módulo faturamento',  path: '/faturamento', icon: <FileText className="w-6 h-6" />,   cor: 'from-indigo-500 to-indigo-700' },
  tecnico_campo:  { label: 'App Mecânicos',   desc: 'Topac Campo',         path: '/campo',       icon: <Wrench className="w-6 h-6" />,    cor: 'from-amber-500 to-orange-700' },
};

const EscolherModuloPage: React.FC = () => {
  const { userRoles, roleLoading, logout, session } = useApp();
  const navigate = useNavigate();

  if (roleLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  const disponiveis = userRoles.filter((r): r is Exclude<AppRole,'admin'> => r in MODULO);

  // Se admin, vai direto pra /admin
  if (userRoles.includes('admin')) { navigate('/admin', { replace: true }); return null; }

  // Se só tem 1, redireciona direto
  if (disponiveis.length === 1) { navigate(MODULO[disponiveis[0]].path, { replace: true }); return null; }

  if (disponiveis.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-6">
        <p className="text-lg font-bold">Nenhum módulo liberado</p>
        <p className="text-sm text-muted-foreground">Procure o administrador.</p>
        <Button variant="outline" onClick={logout}><LogOut className="w-4 h-4 mr-1" /> Sair</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 p-6">
      <div className="w-full max-w-2xl bg-card border rounded-2xl p-8 shadow-xl">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold">Escolha um módulo</h1>
          <p className="text-sm text-muted-foreground mt-1">Olá {session?.user?.email} — você tem acesso a múltiplos módulos.</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          {disponiveis.map(r => {
            const m = MODULO[r];
            return (
              <button
                key={r}
                onClick={() => navigate(m.path)}
                className={`text-left p-5 rounded-xl bg-gradient-to-br ${m.cor} text-white shadow-lg hover:opacity-90 transition`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-11 h-11 rounded-lg bg-white/20 flex items-center justify-center">{m.icon}</div>
                  <div>
                    <div className="font-bold text-lg">{m.label}</div>
                    <div className="text-xs opacity-80">{m.desc}</div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        <div className="mt-6 text-center">
          <Button variant="ghost" size="sm" onClick={logout}><LogOut className="w-4 h-4 mr-1" /> Sair</Button>
        </div>
        <div className="mt-4 border-t pt-2"><FooterSobre /></div>
      </div>
    </div>
  );
};

export default EscolherModuloPage;
