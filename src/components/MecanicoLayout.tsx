import React from 'react';
import { Outlet, NavLink, useLocation, useParams } from 'react-router-dom';
import { Home, Clock, ClipboardList, Package, Gauge, Car } from 'lucide-react';
import { TecnicoAppProvider, useTecnicoApp } from '@/context/TecnicoAppContext';
import { cn } from '@/lib/utils';

const tabs = [
  { label: 'Início', icon: Home, sub: '' },
  { label: 'Ponto', icon: Clock, sub: 'ponto' },
  { label: 'Chamados', icon: ClipboardList, sub: 'chamados' },
  { label: 'Estoque', icon: Package, sub: 'estoque' },
  { label: 'KM', icon: Gauge, sub: 'km' },
];

const HeaderInner: React.FC = () => {
  const { tecnico } = useTecnicoApp();
  const v = tecnico.veiculos;
  return (
    <header className="sticky top-0 z-30 bg-slate-900/80 backdrop-blur-lg border-b border-white/5 px-4 py-3">
      <div className="flex items-center justify-between">
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
        {v?.placa && (
          <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-full px-3 py-1.5">
            <Car className="w-3.5 h-3.5 text-primary" />
            <span className="text-[11px] text-white font-semibold">{v.placa}</span>
          </div>
        )}
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
      <div className="flex justify-around items-center max-w-lg mx-auto px-2 py-1.5">
        {tabs.map((tab) => {
          const path = tab.sub ? `${base}/${tab.sub}` : base;
          const active = location.pathname === path || (tab.sub === '' && location.pathname === base);
          return (
            <NavLink
              key={tab.label}
              to={path}
              end={tab.sub === ''}
              className={cn(
                'flex flex-col items-center py-2 px-3 text-[10px] font-medium transition-all min-w-0 rounded-xl',
                active ? 'text-primary' : 'text-white/50',
              )}
            >
              <div
                className={cn(
                  'w-9 h-9 rounded-xl flex items-center justify-center mb-0.5 transition-all',
                  active && 'bg-primary/15',
                )}
              >
                <tab.icon className={cn('w-5 h-5', active ? 'text-primary' : 'text-white/60')} />
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
