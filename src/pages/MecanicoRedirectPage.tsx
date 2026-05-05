import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2, AlertTriangle } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/integrations/supabase/client';

/**
 * Link único do App Mecânico: /mecanico
 * - Exige login (e-mail + senha).
 * - Identifica o usuário logado, busca seu token na tabela tecnicos_campo
 *   e redireciona para /m/:token, onde o app real roda.
 * - Não usa CPF, não gera link individual; o mesmo /mecanico serve a todos.
 */
const MecanicoRedirectPage: React.FC = () => {
  const { session, isAuthenticated, loading } = useApp();
  const [token, setToken] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!session?.user?.id) return;
    (async () => {
      const { data } = await supabase
        .from('tecnicos_campo')
        .select('access_token')
        .eq('user_id', session.user.id)
        .maybeSingle();
      setToken((data as any)?.access_token || null);
    })();
  }, [session?.user?.id]);

  if (loading || (isAuthenticated && token === undefined)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace state={{ from: '/mecanico' }} />;
  }

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white p-6 text-center">
        <div className="max-w-sm">
          <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto mb-4" />
          <h1 className="text-xl font-bold mb-2">Acesso de mecânico não habilitado</h1>
          <p className="text-sm text-white/70">
            Seu usuário não está vinculado a um cadastro de mecânico. Solicite ao
            administrador a liberação do App Mecânico.
          </p>
        </div>
      </div>
    );
  }

  return <Navigate to={`/m/${token}`} replace />;
};

export default MecanicoRedirectPage;
