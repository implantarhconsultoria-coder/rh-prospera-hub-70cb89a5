import React from 'react';
import { Navigate, Outlet, useNavigate } from 'react-router-dom';
import { Building2, LogOut, Package } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { useActivityTracker } from '@/hooks/useActivityTracker';
import StableLoading from '@/components/StableLoading';
import ModuleSwitcher from '@/components/ModuleSwitcher';

const AlmoxarifadoLayout: React.FC = () => {
  const { session, userRoles, roleLoading, logout } = useApp();
  const navigate = useNavigate();
  useActivityTracker(session);

  if (roleLoading) return <StableLoading label="Carregando permissão do Almoxarifado..." />;
  if (!userRoles.includes('almoxarifado') && !userRoles.includes('admin') && !userRoles.includes('diretor_geral')) return <Navigate to="/" replace />;

  return <div className="min-h-screen bg-[#F7F8FC]">
    <header className="sticky top-0 z-40 border-b border-violet-100 bg-white/95 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-[1840px] items-center gap-4 px-5 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-violet-700 to-fuchsia-500 text-white shadow-sm"><Package className="h-5 w-5"/></span>
          <div className="min-w-0"><div className="truncate text-sm font-black text-slate-950">Dashboard • Almoxarifado</div><div className="truncate text-xs text-slate-500">{session?.user?.email || 'TOPAC RH PRO'}</div></div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <ModuleSwitcher />
          <button type="button" onClick={async()=>{await logout();navigate('/');}} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50" title="Sair"><LogOut className="h-4 w-4"/></button>
        </div>
      </div>
    </header>
    <main><Outlet /></main>
  </div>;
};

export default AlmoxarifadoLayout;
