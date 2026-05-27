import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import {
  createExternalSession,
  saveExternalSession,
  saveLastExternalUser,
  type PortalExterno,
} from '@/lib/acessoExternoAuth';
import { MODULO_REDIRECT } from '@/pages/AcessoExternoPage';

type DirectResponse = {
  ok?: boolean;
  redirect?: string;
  titulo?: string;
  nome?: string;
  cpf_clean?: string;
  portais?: PortalExterno[];
  error?: string;
};

const AcessoDiretoPage = () => {
  const { slug = '' } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [erro, setErro] = useState('');

  useEffect(() => {
    let cancelado = false;

    const abrir = async () => {
      const { data, error } = await supabase.rpc('topac_acesso_direto_link' as any, {
        p_slug: slug,
      });

      if (cancelado) return;

      if (error) {
        setErro('Nao foi possivel abrir este link de acesso.');
        return;
      }

      const res = (data || {}) as DirectResponse;
      if (res.redirect) {
        navigate(res.redirect, { replace: true });
        return;
      }

      const portais = Array.isArray(res.portais) ? res.portais : [];
      if (!res.ok || portais.length === 0) {
        setErro('Link de acesso nao encontrado ou sem modulo liberado.');
        return;
      }

      const nome = res.nome || res.titulo || 'TOPAC';
      const sessao = createExternalSession({
        cpf_clean: res.cpf_clean || `link:${slug}`,
        nome,
        portais,
      });
      saveExternalSession(sessao);
      saveLastExternalUser({ nome, cpf_clean: res.cpf_clean || `link:${slug}` });

      if (portais.length === 1) {
        const portal = portais[0];
        const goto = MODULO_REDIRECT[portal.modulo];
        if (!goto) {
          setErro('Modulo sem rota liberada.');
          return;
        }
        localStorage.setItem('acesso_externo', JSON.stringify({
          id: portal.acesso_id,
          nome,
          modulo: portal.modulo,
          perfil_acesso: portal.perfil_acesso,
          empresa: portal.empresa,
          filial: portal.filial,
          funcao: portal.funcao,
          ts: Date.now(),
        }));
        navigate(goto(portal.acesso_id), { replace: true });
        return;
      }

      navigate('/portais', { replace: true });
    };

    abrir();
    return () => { cancelado = true; };
  }, [navigate, slug]);

  if (erro) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="max-w-md w-full bg-card border rounded-lg p-6 text-center space-y-3">
          <AlertCircle className="w-10 h-10 text-destructive mx-auto" />
          <h1 className="text-lg font-bold">Acesso nao liberado</h1>
          <p className="text-sm text-muted-foreground">{erro}</p>
          <Button onClick={() => navigate('/modulos', { replace: true })} className="w-full">Voltar</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
        Abrindo acesso TOPAC...
      </div>
    </div>
  );
};

export default AcessoDiretoPage;
