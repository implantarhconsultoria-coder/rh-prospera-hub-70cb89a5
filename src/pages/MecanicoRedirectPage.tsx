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
  link_status: string | null;
  funcionarios?: { nome: string } | null;
}

const MecanicoRedirectPage: React.FC = () => {
  const { session, isAuthenticated, loading, userRoles, roleLoading } = useApp();
  const navigate = useNavigate();
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [opts, setOpts] = useState<TecnicoOpt[] | null>(null);

  const isAdmin = userRoles.includes('admin');
  const isOperacional = userRoles.includes('operacional');
  const isTecnico = userRoles.includes('tecnico_campo');

  useEffect(() => {
    if (!session?.user?.id || roleLoading) return;
    (async () => {
      // 1) Vínculo direto por user_id (qualquer link_status, exceto bloqueado)
      const { data: vinculos } = await supabase
        .from('tecnicos_campo')
        .select('access_token, link_status')
        .eq('user_id', session.user.id);
      let vinculo = (vinculos || []).find((v: any) => v.access_token && v.link_status !== 'bloqueado')
        || (vinculos || []).find((v: any) => v.access_token);
      let tk: string | null = (vinculo as any)?.access_token || null;

      // 2) Se não achou, tenta via email/CPF do profile -> funcionarios -> tecnicos_campo
      if (!tk) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('email, cpf_clean')
          .eq('user_id', session.user.id)
          .maybeSingle();
        const email = (prof as any)?.email || session.user.email || null;
        const cpf = (prof as any)?.cpf_clean || null;
        if (email || cpf) {
          let funcQ = supabase.from('funcionarios').select('id, email, cpf');
          if (email && cpf) funcQ = funcQ.or(`email.eq.${email},cpf.eq.${cpf}`);
          else if (email) funcQ = funcQ.eq('email', email);
          else if (cpf) funcQ = funcQ.eq('cpf', cpf);
          const { data: funcs } = await funcQ;
          const funcIds = (funcs || []).map((f: any) => f.id);
          if (funcIds.length) {
            const { data: tcs } = await supabase
              .from('tecnicos_campo')
              .select('access_token, link_status')
              .in('funcionario_id', funcIds)
              .not('access_token', 'is', null);
            const okTc = (tcs || []).find((v: any) => v.link_status !== 'bloqueado') || (tcs || [])[0];
            tk = (okTc as any)?.access_token || null;
          }
        }
      }

      if (tk) {
        setToken(tk);
        return;
      }
      setToken(null);
      // 3) Se admin/operacional/tecnico_campo sem vínculo, carrega seletor
      if (isAdmin || isOperacional || isTecnico) {
        const { data: list } = await supabase
          .from('tecnicos_campo')
          .select('id, apelido, access_token, link_status, funcionarios(nome)')
          .not('access_token', 'is', null)
          .order('apelido');
        setOpts((list as any) || []);
      }
    })();
  }, [session?.user?.id, roleLoading, isAdmin, isOperacional, isTecnico]);

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

  // Admin/Operacional/Tecnico sem vínculo: modo seleção assistida
  if (isAdmin || isOperacional || isTecnico) {
    const badgeLabel = isAdmin ? 'Modo teste · Admin' : isOperacional ? 'Operacional' : 'Técnico de Campo';
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white p-4">
        <div className="max-w-md mx-auto pt-8">
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/15 text-amber-300 text-[10px] font-bold uppercase tracking-wider mb-3">
              <Wrench className="w-3 h-3" /> {badgeLabel}
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
              {opts.map((t) => {
                const inativo = t.link_status && t.link_status !== 'ativo';
                return (
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
                      <p className="font-semibold text-sm">{t.apelido || t.funcionarios?.nome || '(sem apelido)'}</p>
                      {t.funcionarios?.nome && t.apelido !== t.funcionarios.nome && (
                        <p className="text-[11px] text-white/50">{t.funcionarios.nome}</p>
                      )}
                    </div>
                    {inativo && (
                      <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 uppercase font-bold tracking-wider">
                        {t.link_status}
                      </span>
                    )}
                    <ChevronRight className="w-4 h-4 text-white/40" />
                  </button>
                );
              })}
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

  // Outros usuários sem vínculo — mensagem limpa
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white p-6 text-center">
      <div className="max-w-sm">
        <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto mb-4" />
        <h1 className="text-xl font-bold mb-2">Acesso não liberado</h1>
        <p className="text-sm text-white/70">
          Solicite ao administrador a liberação do App Mecânico.
        </p>
      </div>
    </div>
  );
};

export default MecanicoRedirectPage;
