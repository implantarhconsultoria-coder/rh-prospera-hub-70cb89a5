import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, AlertTriangle, LogIn, Home, RefreshCw, Shield } from 'lucide-react';
import { useApp } from '@/hooks/useApp';
import { supabase } from '@/integrations/supabase/client';

const FN_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/tecnico-app`;

interface VeiculoLite {
  id: string;
  placa: string;
  modelo: string;
  identificacao_interna?: string;
}

interface TecnicoLite {
  id: string;
  apelido: string;
  status: string;
  user_id: string | null;
  veiculo_id: string | null;
  funcionarios?: { nome: string; cargo: string; celular: string } | null;
  veiculos?: VeiculoLite | null;
}

interface TecnicoCtxValue {
  token: string;
  tecnico: TecnicoLite | null;
  veiculosDisponiveis: VeiculoLite[];
  veiculoSelecionado: VeiculoLite | null;
  setVeiculoSelecionado: (id: string) => void;
  refresh: () => Promise<void>;
  call: <T = any>(action: string, payload?: any) => Promise<T>;
}

const Ctx = createContext<TecnicoCtxValue | null>(null);

export const useTecnicoApp = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useTecnicoApp must be used inside TecnicoAppProvider');
  return c;
};

const storageKey = (token: string) => `tecnico_veic_sel_${token}`;

const LinkInvalidoScreen: React.FC = () => {
  let isAdmin = false;
  try {
    // useApp pode falhar se provider não estiver presente; tolerar.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { userRole } = useApp();
    isAdmin = userRole === 'admin';
  } catch {
    isAdmin = false;
  }

  const goLogin = () => { window.location.href = '/login'; };
  const goHome = () => { window.location.href = isAdmin ? '/admin' : '/login'; };
  const goAdmin = () => { window.location.href = '/admin'; };
  const limparSessao = async () => {
    try { await supabase.auth.signOut(); } catch { /* noop */ }
    try { localStorage.clear(); } catch { /* noop */ }
    try { sessionStorage.clear(); } catch { /* noop */ }
    window.location.href = '/login';
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white p-6">
      <div className="max-w-sm w-full text-center">
        <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto mb-4" />
        <h1 className="text-xl font-bold mb-2">Acesso não encontrado</h1>
        <p className="text-sm text-white/70 mb-6">
          Acesso não encontrado ou bloqueado pelo administrador.
        </p>
        <div className="space-y-2">
          <button
            onClick={goLogin}
            className="w-full inline-flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl py-2.5 px-4 text-sm font-semibold transition-colors"
          >
            <LogIn className="w-4 h-4" /> Ir para Login
          </button>
          <button
            onClick={goHome}
            className="w-full inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-white/15 border border-white/15 text-white rounded-xl py-2.5 px-4 text-sm font-semibold transition-colors"
          >
            <Home className="w-4 h-4" /> Voltar ao Início
          </button>
          {isAdmin && (
            <button
              onClick={goAdmin}
              className="w-full inline-flex items-center justify-center gap-2 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-200 rounded-xl py-2.5 px-4 text-sm font-semibold transition-colors"
            >
              <Shield className="w-4 h-4" /> Abrir Painel Admin
            </button>
          )}
          <button
            onClick={limparSessao}
            className="w-full inline-flex items-center justify-center gap-2 bg-transparent hover:bg-white/5 border border-white/15 text-white/80 rounded-xl py-2.5 px-4 text-sm font-semibold transition-colors"
          >
            <RefreshCw className="w-4 h-4" /> Limpar sessão e tentar novamente
          </button>
        </div>
      </div>
    </div>
  );
};

export const TecnicoAppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token = '' } = useParams<{ token: string }>();
  const [tecnico, setTecnico] = useState<TecnicoLite | null>(null);
  const [veiculosDisponiveis, setVeiculosDisponiveis] = useState<VeiculoLite[]>([]);
  const [veiculoSelId, setVeiculoSelId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const baseCall = useCallback(
    async <T,>(action: string, payload?: any): Promise<T> => {
      // cache: 'no-store' garante que toda chamada do app dos mecânicos
      // ignore qualquer cache do browser/CDN — sempre versão mais nova.
      const res = await fetch(FN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
        },
        cache: 'no-store',
        body: JSON.stringify({ action, token, payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'erro');
      return data as T;
    },
    [token],
  );

  // Wrapper that automatically injects veiculo_id selecionado em todo payload
  const call = useCallback(
    async <T,>(action: string, payload?: any): Promise<T> => {
      const enriched = { ...(payload || {}) } as any;
      if (veiculoSelId && !enriched.veiculo_id) enriched.veiculo_id = veiculoSelId;
      return baseCall<T>(action, enriched);
    },
    [baseCall, veiculoSelId],
  );

  const refresh = useCallback(async () => {
    try {
      const data = await baseCall<{ tecnico: TecnicoLite; veiculos_disponiveis: VeiculoLite[] }>('perfil');
      setTecnico(data.tecnico);
      const list = data.veiculos_disponiveis || [];
      setVeiculosDisponiveis(list);
      // restaurar seleção previa OU usar veiculo_id padrao
      const stored = typeof window !== 'undefined' ? localStorage.getItem(storageKey(token)) : null;
      const valid = stored && list.find((v) => v.id === stored) ? stored : null;
      const def = valid || data.tecnico?.veiculo_id || list[0]?.id || null;
      setVeiculoSelId(def);
      setError(null);
    } catch (e: any) {
      setError(e.message || 'invalid_token');
    } finally {
      setLoading(false);
    }
  }, [baseCall, token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const setVeiculoSelecionado = useCallback(
    (id: string) => {
      setVeiculoSelId(id);
      if (typeof window !== 'undefined') localStorage.setItem(storageKey(token), id);
    },
    [token],
  );

  const veiculoSelecionado = useMemo(
    () => veiculosDisponiveis.find((v) => v.id === veiculoSelId) || tecnico?.veiculos || null,
    [veiculosDisponiveis, veiculoSelId, tecnico],
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !tecnico) {
    return <LinkInvalidoScreen />;
  }

  return (
    <Ctx.Provider
      value={{
        token,
        tecnico,
        veiculosDisponiveis,
        veiculoSelecionado,
        setVeiculoSelecionado,
        refresh,
        call,
      }}
    >
      {children}
    </Ctx.Provider>
  );
};
