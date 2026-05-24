import React, { useEffect, useMemo, useState } from 'react';
import { Outlet, NavLink, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, LogOut, Building2, AlertCircle, Layers, Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { clearExternalSession, isExternalSessionExpired, readExternalSession } from '@/lib/acessoExternoAuth';

export type ExternoNavItem = { to: string; label: string; icon: React.ComponentType<{ className?: string }>; end?: boolean };

interface ExternoLayoutProps {
  modulo: string;            // 'financeiro' | 'faturamento' | 'almoxarifado' | 'operacional' | 'filial' | 'campo'
  titulo: string;
  cor?: string;              // tailwind bg color class
  items: ExternoNavItem[];   // sidebar items, paths já com /:acessoId
}

const ExternoLayout: React.FC<ExternoLayoutProps> = ({ modulo, titulo, cor = 'bg-primary', items }) => {
  const { acessoId } = useParams<{ acessoId: string }>();
  const nav = useNavigate();
  const [estado, setEstado] = useState<'loading' | 'ok' | 'bloqueado' | 'invalido'>('loading');
  const [acesso, setAcesso] = useState<any>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const externalSession = useMemo(() => readExternalSession(), []);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      if (!acessoId) { setEstado('invalido'); return; }
      if (!externalSession || isExternalSessionExpired(externalSession)) {
        clearExternalSession();
        nav('/modulos', { replace: true });
        return;
      }
      // 1) Confere localStorage
      let local: any = null;
      try { local = JSON.parse(localStorage.getItem('acesso_externo') || 'null'); } catch { /* ignore */ }
      // 2) Valida no banco (fonte da verdade)
      const { data, error } = await supabase.rpc('acesso_externo_obter' as any, {
        p_id: acessoId, p_modulo: modulo,
      });
      if (cancelado) return;
      if (error || !(data as any)?.ok) {
        setEstado('bloqueado');
        return;
      }
      const a = (data as any).acesso;
      setAcesso(a);
      // Atualiza localStorage caso desatualizado
      if (!local || local.id !== a.id) {
        localStorage.setItem('acesso_externo', JSON.stringify({ ...a, ts: Date.now() }));
      }
      setEstado('ok');
    })();
    return () => { cancelado = true; };
  }, [acessoId, externalSession, modulo, nav]);

  const sair = () => {
    clearExternalSession();
    nav(`/modulos`, { replace: true });
  };

  const trocarPortal = () => {
    // Não limpa sessão — apenas volta para a tela de escolha
    const sess = readExternalSession();
    if (sess && !isExternalSessionExpired(sess)) {
      nav('/portais');
    } else {
      // Sem sessão multi-portal, manda para login PIN
      nav('/modulos');
    }
  };

  // Mostra "Trocar portal" só se houver mais de um portal na sessão
  const temMultiplosPortais = !!(externalSession?.portais && externalSession.portais.length > 1);

  if (estado === 'loading') {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  // Bloqueio de celular removido — Portal externo é responsivo e funciona em mobile.

  if (estado !== 'ok') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-card border rounded-lg p-6 text-center space-y-3">
          <AlertCircle className="w-10 h-10 text-destructive mx-auto" />
          <h2 className="text-lg font-bold">Acesso não liberado</h2>
          <p className="text-sm text-muted-foreground">Acesso não liberado ou bloqueado pelo administrador.</p>
          <Button onClick={() => nav(`/modulos`, { replace: true })} className="w-full">Voltar</Button>
        </div>
      </div>
    );
  }


  return (
    <div className="min-h-screen bg-background">
      {/* Topbar mobile */}
      <header className="lg:hidden sticky top-0 z-40 flex items-center gap-2 px-3 py-2 bg-card border-b border-border">
        <Button size="icon" variant="ghost" onClick={() => setMenuOpen(true)} aria-label="Abrir menu">
          <Menu className="w-5 h-5" />
        </Button>
        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', cor)}>
          <Building2 className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm truncate">{titulo}</div>
          <div className="text-[10px] text-muted-foreground truncate">{acesso?.nome}</div>
        </div>
        <Button size="icon" variant="ghost" onClick={sair} aria-label="Sair">
          <LogOut className="w-4 h-4" />
        </Button>
      </header>

      {/* Drawer mobile */}
      {menuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMenuOpen(false)} />
          <aside className="relative w-72 max-w-[85%] h-full bg-card border-r border-border flex flex-col">
            <div className="p-4 border-b border-border flex items-center gap-2">
              <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center', cor)}>
                <Building2 className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <div className="font-bold text-sm">{titulo}</div>
                <div className="text-[10px] text-muted-foreground">Acesso externo</div>
              </div>
              <Button size="icon" variant="ghost" onClick={() => setMenuOpen(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            <nav className="flex-1 overflow-y-auto p-2 space-y-1">
              {items.map((it) => (
                <NavLink key={it.to} to={it.to} end={it.end} onClick={() => setMenuOpen(false)}
                  className={({ isActive }) => cn(
                    'flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition',
                    isActive ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted',
                  )}>
                  <it.icon className="w-4 h-4" /> {it.label}
                </NavLink>
              ))}
            </nav>
            <div className="p-3 border-t border-border space-y-2">
              <div className="text-xs text-muted-foreground truncate">{acesso?.nome}</div>
              <div className="text-[10px] text-muted-foreground truncate">{[acesso?.empresa, acesso?.filial].filter(Boolean).join(' · ')}</div>
              {temMultiplosPortais && (
                <Button size="sm" variant="secondary" className="w-full" onClick={trocarPortal}>
                  <Layers className="w-3 h-3 mr-1" /> Trocar portal
                </Button>
              )}
              <Button size="sm" variant="outline" className="w-full" onClick={sair}>
                <LogOut className="w-3 h-3 mr-1" /> Sair
              </Button>
            </div>
          </aside>
        </div>
      )}

      {/* Sidebar desktop */}
      <aside className="hidden lg:flex fixed left-0 top-0 h-screen w-64 bg-card border-r border-border flex-col">
        <div className="p-4 border-b border-border flex items-center gap-2">
          <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center', cor)}>
            <Building2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="font-bold text-sm">{titulo}</div>
            <div className="text-[10px] text-muted-foreground">Acesso externo</div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto p-2 space-y-1">
          {items.map((it) => (
            <NavLink key={it.to} to={it.to} end={it.end}
              className={({ isActive }) => cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition',
                isActive ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted',
              )}>
              <it.icon className="w-4 h-4" /> {it.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-border space-y-2">
          <div className="text-xs text-muted-foreground truncate">{acesso?.nome}</div>
          <div className="text-[10px] text-muted-foreground truncate">{[acesso?.empresa, acesso?.filial].filter(Boolean).join(' · ')}</div>
          {temMultiplosPortais && (
            <Button size="sm" variant="secondary" className="w-full" onClick={trocarPortal}>
              <Layers className="w-3 h-3 mr-1" /> Trocar portal
            </Button>
          )}
          <Button size="sm" variant="outline" className="w-full" onClick={sair}>
            <LogOut className="w-3 h-3 mr-1" /> Sair
          </Button>
        </div>
      </aside>
      <main className="lg:ml-64 min-h-screen">
        <div className="p-3 sm:p-4 lg:p-6 max-w-[1600px] mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default ExternoLayout;
