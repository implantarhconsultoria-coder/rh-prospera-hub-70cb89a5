import React from 'react';
import { Navigate, Outlet, useNavigate } from 'react-router-dom';
import { ArrowLeft, ClipboardList, Loader2, LogOut, ShieldCheck } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import AguardandoAcesso from '@/components/AguardandoAcesso';
import ErrorBoundary from '@/components/ErrorBoundary';

const OperacionalLayout: React.FC = () => {
  const { userRole, userRoles, roleLoading, logout } = useApp();
  const navigate = useNavigate();

  if (roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!userRole) return <AguardandoAcesso />;

  const isAdminPreview = userRoles.includes('admin') || userRoles.includes('diretor_geral');
  if (userRole !== 'operacional' && !isAdminPreview) {
    const redirect = userRole === 'tecnico_campo'
      ? '/campo'
      : userRole?.startsWith('filial_')
        ? '/filial'
        : '/';
    return <Navigate to={redirect} replace />;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-30 bg-card border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center">
            <ClipboardList className="w-4 h-4 text-white" />
          </div>
          <h1 className="text-sm font-bold text-foreground font-display">Topac Operacional</h1>
        </div>
        {isAdminPreview ? (
          <button
            type="button"
            onClick={() => navigate('/admin/operacional')}
            className="flex items-center gap-2 rounded-lg border border-orange-500/20 px-3 py-2 text-xs font-bold text-orange-300 hover:bg-orange-500/10"
          >
            <ArrowLeft className="w-4 h-4" /> Voltar ao painel
          </button>
        ) : (
          <button onClick={logout} className="p-2 rounded-lg hover:bg-muted text-muted-foreground">
            <LogOut className="w-4 h-4" />
          </button>
        )}
      </header>

      {isAdminPreview && (
        <div className="border-b border-orange-500/15 bg-orange-500/[.05] px-4 py-2 text-xs text-orange-200">
          <div className="mx-auto flex max-w-[1200px] items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            Visualização administrativa da tela usada pela equipe operacional.
          </div>
        </div>
      )}

      <main className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-[1200px] mx-auto">
          <ErrorBoundary><Outlet /></ErrorBoundary>
        </div>
      </main>
    </div>
  );
};

export default OperacionalLayout;
