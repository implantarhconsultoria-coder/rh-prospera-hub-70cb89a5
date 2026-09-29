import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useApp } from '@/context/AppContext';

const rpc = supabase as unknown as {
  rpc: (name: string, args?: Record<string, unknown>) => Promise<{ data: any; error: { message?: string } | null }>;
};

export const usePrivateModuleAccess = (chave: string) => {
  const { session } = useApp();
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(Boolean(session?.user?.id));

  useEffect(() => {
    let active = true;

    const check = async () => {
      if (!session?.user?.id) {
        if (active) {
          setAllowed(false);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      const { data, error } = await rpc.rpc('topac_tem_acesso_privado', { p_chave: chave });
      if (!active) return;
      setAllowed(!error && data === true);
      setLoading(false);
    };

    void check();
    return () => { active = false; };
  }, [chave, session?.user?.id]);

  return { allowed, loading };
};
