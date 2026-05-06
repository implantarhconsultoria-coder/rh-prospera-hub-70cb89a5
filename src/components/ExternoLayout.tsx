import React, { useEffect, useState } from 'react';
import { Outlet, NavLink, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, LogOut, Building2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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

  useEffect(() => {
    let cancelado = false;
    (async () => {
      if (!acessoId) { setEstado('invalido'); return; }
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
  }, [acessoId, modulo]);

  const sair = () => {
    localStorage.removeItem('acesso_externo');
    nav(`/acesso-${modulo}`, { replace: true });
  };

  if (estado === 'loading') {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  if (estado !== 'ok') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-card border rounded-lg p-6 text-center space-y-3">
          <AlertCircle className="w-10 h-10 text-destructive mx-auto" />
          <h2 className="text-lg font-bold">Acesso não liberado</h2>
          <p className="text-sm text-muted-foreground">Acesso não liberado ou bloqueado pelo administrador.</p>
          <Button onClick={() => nav(`/acesso-${modulo}`, { replace: true })} className="w-full">Voltar</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed left-0 top-0 h-screen w-64 bg-card border-r border-border flex flex-col">
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
          <Button size="sm" variant="outline" className="w-full" onClick={sair}>
            <LogOut className="w-3 h-3 mr-1" /> Sair
          </Button>
        </div>
      </aside>
      <main className="ml-64 min-h-screen">
        <div className="p-6 max-w-[1600px] mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default ExternoLayout;
