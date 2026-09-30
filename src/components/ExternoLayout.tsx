import React, { useEffect, useState } from 'react';
import { Outlet, NavLink, Navigate, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, LogOut, Building2, AlertCircle, Layers, Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { clearExternalSession, isExternalSessionExpired, readExternalSession, saveExternalSession, type SessaoAcessoExterno } from '@/lib/acessoExternoAuth';

export type ExternoNavItem = { to: string; label: string; icon: React.ComponentType<{ className?: string }>; end?: boolean };

interface ExternoLayoutProps {
  modulo: string;
  titulo: string;
  cor?: string;
  items: ExternoNavItem[];
}

const REMOVED_MODULES = new Set(['financeiro', 'faturamento']);

const ExternoLayout: React.FC<ExternoLayoutProps> = ({ modulo, titulo, cor = 'bg-primary', items }) => {
  const { acessoId } = useParams<{ acessoId: string }>();
  const nav = useNavigate();
  const [estado, setEstado] = useState<'loading' | 'ok' | 'bloqueado' | 'invalido'>('loading');
  const [acesso, setAcesso] = useState<any>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [externalSession, setExternalSession] = useState<SessaoAcessoExterno | null>(() => readExternalSession());
  const [showExpiryWarning, setShowExpiryWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(30);
  const [motivoExtensao, setMotivoExtensao] = useState('');
  const [extending, setExtending] = useState(false);
  const moduloRemovido = REMOVED_MODULES.has(String(modulo || '').toLowerCase());
  const filialTheme = String(modulo || '').toLowerCase() === 'filial';

  useEffect(() => {
    if (moduloRemovido) return;
    let cancelado = false;
    (async () => {
      if (!acessoId) { setEstado('invalido'); return; }
      if (!externalSession || isExternalSessionExpired(externalSession) || !externalSession.session_token) {
        clearExternalSession();
        nav('/modulos', { replace: true });
        return;
      }

      const validation = await fetch('/api/portal-access', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'validate', token: externalSession.session_token }),
      });
      const validationPayload = await validation.json().catch(() => ({}));
      if (!validation.ok || !validationPayload?.ok) {
        clearExternalSession();
        nav('/modulos', { replace: true });
        return;
      }

      let local: any = null;
      try { local = JSON.parse(localStorage.getItem('acesso_externo') || 'null'); } catch { /* ignore */ }
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
      if (!local || local.id !== a.id) {
        localStorage.setItem('acesso_externo', JSON.stringify({ ...a, ts: Date.now() }));
      }
      setEstado('ok');

      void fetch('/api/portal-access', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'event',
          token: externalSession.session_token,
          evento: 'portal_aberto',
          modulo,
          acessoId,
        }),
      });
    })();
    return () => { cancelado = true; };
  }, [acessoId, externalSession?.session_token, modulo, moduloRemovido, nav]);

  if (moduloRemovido) return <Navigate to="/modulos" replace />;

  const encerrarSessao = async (motivo: string) => {
    const token = externalSession?.session_token;
    if (token) {
      await fetch('/api/portal-access', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'logout', token, motivo }),
      }).catch(() => null);
    }
    clearExternalSession();
    setExternalSession(null);
    nav('/modulos', { replace: true });
  };

  const sair = () => {
    void encerrarSessao('manual');
  };

  const continuarSessao = async () => {
    const motivo = motivoExtensao.trim();
    if (motivo.length < 5 || !externalSession?.session_token) return;
    setExtending(true);
    try {
      const response = await fetch('/api/portal-access', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'extend', token: externalSession.session_token, motivo }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) return;
      const next = { ...externalSession, expira_em: new Date(payload.expira_em).getTime() };
      saveExternalSession(next, Boolean(next.lembrar));
      setExternalSession(next);
      setMotivoExtensao('');
      setShowExpiryWarning(false);
    } finally {
      setExtending(false);
    }
  };

  useEffect(() => {
    if (!externalSession?.session_token || !externalSession.expira_em) return;
    const tick = () => {
      const remaining = externalSession.expira_em - Date.now();
      if (remaining <= 0) {
        setShowExpiryWarning(false);
        void encerrarSessao('automatico_periodo');
        return;
      }
      if (remaining <= 30000) {
        setSecondsLeft(Math.max(0, Math.ceil(remaining / 1000)));
        setShowExpiryWarning(true);
      } else {
        setShowExpiryWarning(false);
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [externalSession?.session_token, externalSession?.expira_em]);

  const trocarPortal = () => {
    const sess = readExternalSession();
    if (sess && !isExternalSessionExpired(sess)) nav('/portais');
    else nav('/modulos');
  };

  const temMultiplosPortais = !!(externalSession?.portais && externalSession.portais.length > 1);

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
          <Button onClick={() => nav('/modulos', { replace: true })} className="w-full">Voltar</Button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('min-h-screen', filialTheme ? 'bg-[#020507] text-[#f2eef7]' : 'bg-background')}>
      <header className={cn('lg:hidden sticky top-0 z-40 flex items-center gap-2 px-3 py-2 border-b', filialTheme ? 'bg-[#030609] border-[#24202c]' : 'bg-card border-border')}>
        <Button size="icon" variant="ghost" onClick={() => setMenuOpen(true)} aria-label="Abrir menu"><Menu className="w-5 h-5" /></Button>
        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', cor)}><Building2 className="w-4 h-4 text-white" /></div>
        <div className="flex-1 min-w-0"><div className="font-bold text-sm truncate">{titulo}</div><div className="text-[10px] text-muted-foreground truncate">{acesso?.nome}</div></div>
        <Button size="icon" variant="ghost" onClick={sair} aria-label="Sair"><LogOut className="w-4 h-4" /></Button>
      </header>

      {menuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMenuOpen(false)} />
          <aside className={cn('relative w-72 max-w-[85%] h-full border-r flex flex-col', filialTheme ? 'bg-[#030609] border-[#24202c]' : 'bg-card border-border')}>
            <div className={cn('p-4 border-b flex items-center gap-2', filialTheme ? 'border-[#24202c]' : 'border-border')}>
              <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center', cor)}><Building2 className="w-5 h-5 text-white" /></div>
              <div className="flex-1"><div className="font-bold text-sm">{titulo}</div><div className="text-[10px] text-muted-foreground">Acesso externo</div></div>
              <Button size="icon" variant="ghost" onClick={() => setMenuOpen(false)}><X className="w-4 h-4" /></Button>
            </div>
            <nav className="flex-1 overflow-y-auto p-2 space-y-1">
              {items.map((it) => (
                <NavLink key={it.to} to={it.to} end={it.end} onClick={() => setMenuOpen(false)} className={({ isActive }) => cn('flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition', filialTheme ? (isActive ? 'bg-gradient-to-r from-[#251548] via-[#211339] to-[#181023] text-white border-r-2 border-[#ffc400]' : 'text-zinc-400 hover:bg-white/[0.035] hover:text-white') : (isActive ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted'))}>
                  <it.icon className="w-4 h-4" /> {it.label}
                </NavLink>
              ))}
            </nav>
            <div className="p-3 border-t border-border space-y-2">
              <div className="text-xs text-muted-foreground truncate">{acesso?.nome}</div>
              <div className="text-[10px] text-muted-foreground truncate">{[acesso?.empresa, acesso?.filial].filter(Boolean).join(' · ')}</div>
              {temMultiplosPortais && <Button size="sm" variant="secondary" className="w-full" onClick={trocarPortal}><Layers className="w-3 h-3 mr-1" /> Trocar portal</Button>}
              <Button size="sm" variant="outline" className="w-full" onClick={sair}><LogOut className="w-3 h-3 mr-1" /> Sair</Button>
            </div>
          </aside>
        </div>
      )}

      <aside className={cn('hidden lg:flex fixed left-0 top-0 h-screen w-64 border-r flex-col', filialTheme ? 'bg-[#030609] border-[#24202c] shadow-[18px_0_50px_rgba(0,0,0,.34)]' : 'bg-card border-border')}>
        <div className="p-4 border-b border-border flex items-center gap-2">
          <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center', cor)}><Building2 className="w-5 h-5 text-white" /></div>
          <div><div className="font-bold text-sm">{titulo}</div><div className="text-[10px] text-muted-foreground">Acesso externo</div></div>
        </div>
        <nav className="flex-1 overflow-y-auto p-2 space-y-1">
          {items.map((it) => (
            <NavLink key={it.to} to={it.to} end={it.end} className={({ isActive }) => cn('flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition', isActive ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted')}>
              <it.icon className="w-4 h-4" /> {it.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-border space-y-2">
          <div className="text-xs text-muted-foreground truncate">{acesso?.nome}</div>
          <div className="text-[10px] text-muted-foreground truncate">{[acesso?.empresa, acesso?.filial].filter(Boolean).join(' · ')}</div>
          {temMultiplosPortais && <Button size="sm" variant="secondary" className="w-full" onClick={trocarPortal}><Layers className="w-3 h-3 mr-1" /> Trocar portal</Button>}
          <Button size="sm" variant="outline" className="w-full" onClick={sair}><LogOut className="w-3 h-3 mr-1" /> Sair</Button>
        </div>
      </aside>
      <main className={cn('lg:ml-64 min-h-screen', filialTheme && 'bg-[#020507]')}><div className="p-3 sm:p-4 lg:p-6 max-w-[1600px] mx-auto"><Outlet /></div></main>

      {showExpiryWarning && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-amber-400/30 bg-[#0e1119] p-6 text-white shadow-2xl">
            <div className="text-xs font-bold uppercase tracking-[0.22em] text-amber-300">Sessão encerrando</div>
            <h2 className="mt-2 text-xl font-black">Você será desconectado em {secondsLeft}s</h2>
            <p className="mt-2 text-sm text-zinc-400">
              O período atual terminou. Se houver uma urgência, informe o motivo para continuar por mais 1 hora. A extensão ficará registrada.
            </p>
            <textarea
              value={motivoExtensao}
              onChange={(e) => setMotivoExtensao(e.target.value)}
              placeholder="Motivo para continuar conectado"
              className="mt-4 min-h-24 w-full rounded-lg border border-[#41334f] bg-[#090b12] p-3 text-sm text-white outline-none focus:border-amber-400"
            />
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Button variant="outline" onClick={() => void encerrarSessao('manual_aviso_periodo')}>Sair agora</Button>
              <Button
                onClick={() => void continuarSessao()}
                disabled={motivoExtensao.trim().length < 5 || extending}
                className="bg-[#ffc400] font-bold text-black hover:bg-[#ffda58]"
              >
                {extending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Continuar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExternoLayout;
