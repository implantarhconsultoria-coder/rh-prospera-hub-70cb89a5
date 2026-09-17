import React from 'react';
import { Navigate, Outlet, useNavigate } from 'react-router-dom';
import { ArrowLeft, LogOut, Package, ShieldCheck } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { useActivityTracker } from '@/hooks/useActivityTracker';
import StableLoading from '@/components/StableLoading';
import ModuleSwitcher from '@/components/ModuleSwitcher';

const AlmoxarifadoLayout: React.FC = () => {
  const { session, userRoles, roleLoading, logout } = useApp();
  const navigate = useNavigate();
  useActivityTracker(session);

  if (roleLoading) return <StableLoading label="Carregando permissão do Almoxarifado..." />;

  const isAdminPreview = userRoles.includes('admin') || userRoles.includes('diretor_geral');
  const hasAccess = userRoles.includes('almoxarifado') || isAdminPreview;

  if (!hasAccess) return <Navigate to="/" replace />;

  return <div className="min-h-screen bg-[#F7F8FC]">
    <header className="sticky top-0 z-40 border-b border-violet-100 bg-white/95 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-[1840px] items-center gap-4 px-5 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-violet-700 to-fuchsia-500 text-white shadow-sm"><Package className="h-5 w-5"/></span>
          <div className="min-w-0"><div className="truncate text-sm font-black text-slate-950">Dashboard • Almoxarifado</div><div className="truncate text-xs text-slate-500">{session?.user?.email || 'TOPAC RH PRO'}</div></div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <ModuleSwitcher />
          {!isAdminPreview && (
            <button type="button" onClick={async()=>{await logout();navigate('/');}} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50" title="Sair"><LogOut className="h-4 w-4"/></button>
          )}
        </div>
      </div>
    </header>

    {isAdminPreview && (
      <div className="border-b border-violet-200 bg-violet-50">
        <div className="mx-auto flex w-full max-w-[1840px] items-center justify-between gap-4 px-5 py-3 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-violet-700 text-white"><ShieldCheck className="h-4 w-4" /></span>
            <div className="min-w-0">
              <div className="text-sm font-black text-slate-950">Visualização administrativa do Portal do Usuário</div>
              <div className="text-xs text-slate-600">Você está vendo exatamente a área operacional, mantendo sua identidade de administrador.</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate('/admin/almoxarifado')}
            className="flex shrink-0 items-center gap-2 rounded-lg border border-violet-300 bg-white px-4 py-2 text-xs font-bold text-violet-800 shadow-sm transition hover:bg-violet-100"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar ao painel administrativo
          </button>
        </div>
      </div>
    )}

    <main><Outlet /></main>
  </div>;
};

export default AlmoxarifadoLayout;
