import React, { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Loader2, AlertTriangle, Wrench, ChevronRight } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/integrations/supabase/client';

/**
 * Link único do App Mecânico: /mecanico
 * - Exige login (e-mail + senha).
 * - Mecânico real: redireciona para /m/:token.
 * - Admin sem vínculo: mostra lista de mecânicos pra entrar em modo teste.
 * - Operacional sem vínculo: mostra mesma lista (modo teste).
 */
interface TecnicoOpt {
  id: string;
  apelido: string;
  access_token: string | null;
  funcionarios?: { nome: string } | null;
}

const MecanicoRedirectPage: React.FC = () => {
  const { session, isAuthenticated, loading, userRoles, roleLoading } = useApp();
  const navigate = useNavigate();
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [opts, setOpts] = useState<TecnicoOpt[] | null>(null);

  const isAdmin = userRoles.includes('admin');
  const isOperacional = userRoles.includes('operacional');

  useEffect(() => {
    if (!session?.user?.id || roleLoading) return;
    (async () => {
      // 1) Tenta achar token vinculado ao usuário
      const { data } = await supabase
        .from('tecnicos_campo')
        .select('access_token')
        .eq('user_id', session.user.id)
        .maybeSingle();
      const tk = (data as any)?.access_token || null;
      if (tk) {
        setToken(tk);
        return;
      }
      setToken(null);
      // 2) Se admin/operacional, carrega lista de mecânicos para escolher
      if (isAdmin || isOperacional) {
        const { data: list } = await supabase
          .from('tecnicos_campo')
          .select('id, apelido, access_token, funcionarios(nome)')
          .not('access_token', 'is', null)
          .eq('link_status', 'ativo')
          .order('apelido');
        setOpts((list as any) || []);
      }
    })();
  }, [session?.user?.id, roleLoading, isAdmin, isOperacional]);

  if (loading || roleLoading || (isAuthenticated && token === undefined)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace state={{ from: '/mecanico' }} />;
  }

  // Mecânico vinculado — entra direto
  if (token) {
    return <Navigate to={`/m/${token}`} replace />;
  }

  // Admin/Operacional sem vínculo: modo seleção assistida
  if (isAdmin || isOperacional) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white p-4">
        <div className="max-w-md mx-auto pt-8">
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/15 text-amber-300 text-[10px] font-bold uppercase tracking-wider mb-3">
              <Wrench className="w-3 h-3" /> Modo teste · Admin
            </div>
            <h1 className="text-2xl font-bold">Selecione um mecânico</h1>
            <p className="text-sm text-white/60 mt-1">Você entrará no app no perfil escolhido.</p>
          </div>

          {opts === null ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : opts.length === 0 ? (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-center text-white/60">
              Nenhum mecânico cadastrado com link ativo.
            </div>
          ) : (
            <div className="space-y-2">
              {opts.map((t) => (
                <button
                  key={t.id}
                  onClick={() => t.access_token && navigate(`/m/${t.access_token}`)}
                  disabled={!t.access_token}
                  className="w-full bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl p-4 flex items-center gap-3 transition-colors disabled:opacity-40"
                >
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center font-bold text-sm">
                    {(t.apelido || t.funcionarios?.nome || '?').slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 text-left">
                    <p className="font-semibold text-sm">{t.apelido || t.funcionarios?.nome}</p>
                    {t.funcionarios?.nome && t.apelido !== t.funcionarios.nome && (
                      <p className="text-[11px] text-white/50">{t.funcionarios.nome}</p>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-white/40" />
                </button>
              ))}
            </div>
          )}

          {isAdmin && (
            <button
              onClick={() => navigate('/admin')}
              className="mt-6 w-full text-center text-xs text-white/50 hover:text-white/80 py-2"
            >
              ← Voltar para a Central
            </button>
          )}
        </div>
      </div>
    );
  }

  // Outros usuários sem vínculo
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
};

export default MecanicoRedirectPage;
