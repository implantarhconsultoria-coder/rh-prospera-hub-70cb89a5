import React from 'react';
import { Outlet, NavLink, useLocation, useParams } from 'react-router-dom';
import { Home, Clock, ClipboardList, Package, Gauge, Car, Fuel, History } from 'lucide-react';
import { TecnicoAppProvider, useTecnicoApp } from '@/context/TecnicoAppContext';
import { cn } from '@/lib/utils';

const tabs = [
  { label: 'Início', icon: Home, sub: '' },
  { label: 'Ponto', icon: Clock, sub: 'ponto' },
  { label: 'Chamados', icon: ClipboardList, sub: 'chamados' },
  { label: 'Estoque', icon: Package, sub: 'estoque' },
  { label: 'KM', icon: Gauge, sub: 'km' },
  { label: 'Abast.', icon: Fuel, sub: 'abastecimento' },
  { label: 'Hist.', icon: History, sub: 'historico' },
];

const HeaderInner: React.FC = () => {
  const { tecnico, veiculosDisponiveis, veiculoSelecionado, setVeiculoSelecionado } = useTecnicoApp();
  const multi = veiculosDisponiveis.length > 1;
  return (
    <header className="sticky top-0 z-30 bg-slate-900/80 backdrop-blur-lg border-b border-white/5 px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center shadow-lg shadow-primary/30 flex-shrink-0">
            <span className="text-white font-bold text-xs">
              {tecnico.apelido.split(' ').map((s) => s[0]).join('').slice(0, 2).toUpperCase()}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-[10px] text-white/50 uppercase tracking-wider leading-none">Topac Campo</p>
            <h1 className="text-sm font-bold text-white font-display leading-tight truncate">
              {tecnico.apelido}
            </h1>
          </div>
        </div>
        {multi ? (
          <select
            value={veiculoSelecionado?.id || ''}
            onChange={(e) => setVeiculoSelecionado(e.target.value)}
            className="bg-white/10 border border-white/15 rounded-full px-3 py-1.5 text-[11px] text-white font-semibold focus:outline-none focus:ring-2 focus:ring-primary/50"
            aria-label="Trocar veículo"
          >
            {veiculosDisponiveis.map((v) => (
              <option key={v.id} value={v.id} className="bg-slate-900">
                {v.placa} · {v.modelo}
              </option>
            ))}
          </select>
        ) : veiculoSelecionado?.placa ? (
          <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-full px-3 py-1.5">
            <Car className="w-3.5 h-3.5 text-primary" />
            <span className="text-[11px] text-white font-semibold">{veiculoSelecionado.placa}</span>
          </div>
        ) : null}
      </div>
    </header>
  );
};

const TabBar: React.FC = () => {
  const { token = '' } = useParams<{ token: string }>();
  const location = useLocation();
  const base = `/m/${token}`;
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 bg-slate-900/95 backdrop-blur-xl border-t border-white/5 shadow-2xl">
      <div className="flex justify-around items-center max-w-lg mx-auto px-1 py-1.5 overflow-x-auto">
        {tabs.map((tab) => {
          const path = tab.sub ? `${base}/${tab.sub}` : base;
          const active = location.pathname === path || (tab.sub === '' && location.pathname === base);
          return (
            <NavLink
              key={tab.label}
              to={path}
              end={tab.sub === ''}
              className={cn(
                'flex flex-col items-center py-1.5 px-2 text-[9px] font-medium transition-all min-w-0 rounded-xl flex-shrink-0',
                active ? 'text-primary' : 'text-white/50',
              )}
            >
              <div
                className={cn(
                  'w-8 h-8 rounded-xl flex items-center justify-center mb-0.5 transition-all',
                  active && 'bg-primary/15',
                )}
              >
                <tab.icon className={cn('w-4 h-4', active ? 'text-primary' : 'text-white/60')} />
              </div>
              {tab.label}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
};

const MecanicoLayoutInner: React.FC = () => (
  <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex flex-col">
    <HeaderInner />
    <main className="flex-1 overflow-y-auto pb-24">
      <div className="p-4 max-w-lg mx-auto text-white">
        <Outlet />
      </div>
    </main>
    <TabBar />
  </div>
);

const MecanicoLayout: React.FC = () => (
  <TecnicoAppProvider>
    <MecanicoLayoutInner />
  </TecnicoAppProvider>
);

export default MecanicoLayout;
