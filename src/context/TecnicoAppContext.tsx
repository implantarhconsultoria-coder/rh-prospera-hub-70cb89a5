import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, AlertTriangle } from 'lucide-react';

const FN_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/tecnico-app`;

interface TecnicoLite {
  id: string;
  apelido: string;
  status: string;
  user_id: string | null;
  veiculo_id: string | null;
  funcionarios?: { nome: string; cargo: string; celular: string } | null;
  veiculos?: { placa: string; modelo: string; identificacao_interna: string } | null;
}

interface TecnicoCtxValue {
  token: string;
  tecnico: TecnicoLite | null;
  refresh: () => Promise<void>;
  call: <T = any>(action: string, payload?: any) => Promise<T>;
}

const Ctx = createContext<TecnicoCtxValue | null>(null);

export const useTecnicoApp = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useTecnicoApp must be used inside TecnicoAppProvider');
  return c;
};

export const TecnicoAppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token = '' } = useParams<{ token: string }>();
  const [tecnico, setTecnico] = useState<TecnicoLite | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const call = useCallback(
    async <T,>(action: string, payload?: any): Promise<T> => {
      const res = await fetch(FN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, token, payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'erro');
      return data as T;
    },
    [token],
  );

  const refresh = useCallback(async () => {
    try {
      const data = await call<{ tecnico: TecnicoLite }>('perfil');
      setTecnico(data.tecnico);
      setError(null);
    } catch (e: any) {
      setError(e.message || 'invalid_token');
    } finally {
      setLoading(false);
    }
  }, [call]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !tecnico) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white p-6 text-center">
        <div className="max-w-sm">
          <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto mb-4" />
          <h1 className="text-xl font-bold mb-2">Link inválido ou expirado</h1>
          <p className="text-sm text-white/70">
            Solicite ao administrador um novo link de acesso ao app.
          </p>
        </div>
      </div>
    );
  }

  return <Ctx.Provider value={{ token, tecnico, refresh, call }}>{children}</Ctx.Provider>;
};
