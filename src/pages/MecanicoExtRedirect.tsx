import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';

/**
 * Redireciona acesso externo do App Mecânico para a rota oficial /m/:token,
 * que monta o TecnicoAppProvider necessário. Garante que cada acesso PIN
 * abra apenas o app do mecânico vinculado.
 */
const MecanicoExtRedirect = () => {
  const { acessoId } = useParams<{ acessoId: string }>();
  const navigate = useNavigate();
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      if (!acessoId) { setErro('acesso_invalido'); return; }
      const { data, error } = await supabase.rpc('acesso_externo_obter' as any, {
        p_id: acessoId, p_modulo: 'mecanico',
      });
      if (cancel) return;
      if (error || !(data as any)?.ok) { setErro('bloqueado'); return; }
      const acesso = (data as any).acesso;
      if (!acesso?.funcionario_id) { setErro('sem_vinculo'); return; }
      const { data: tc } = await supabase
        .from('tecnicos_campo')
        .select('access_token, link_status')
        .eq('funcionario_id', acesso.funcionario_id)
        .eq('link_status', 'ativo')
        .maybeSingle();
      if (cancel) return;
      if (!tc?.access_token) { setErro('sem_link'); return; }
      navigate(`/m/${tc.access_token}`, { replace: true });
    })();
    return () => { cancel = true; };
  }, [acessoId, navigate]);

  if (erro) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-950 text-white">
        <div className="max-w-sm w-full text-center space-y-3">
          <AlertCircle className="w-10 h-10 text-amber-400 mx-auto" />
          <h2 className="text-lg font-bold">Acesso não disponível</h2>
          <p className="text-sm text-white/70">
            {erro === 'sem_link'
              ? 'Este mecânico ainda não tem link ativo. Procure o administrador.'
              : 'Acesso não autorizado ou bloqueado pelo administrador.'}
          </p>
          <Button onClick={() => navigate('/acesso-mecanico', { replace: true })} className="w-full">
            Voltar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );
};

export default MecanicoExtRedirect;
