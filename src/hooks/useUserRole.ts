import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Session } from '@supabase/supabase-js';

export type AppRole = 'admin' | 'filial_praia' | 'filial_goiania' | 'almoxarifado' | 'usuario' | 'tecnico_campo' | 'operacional';

export const useUserRole = (session: Session | null) => {
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session?.user?.id) {
      setRole(null);
      setLoading(false);
      return;
    }

    const fetchRole = async () => {
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', session.user.id)
        .limit(1)
        .maybeSingle();

      setRole((data?.role as AppRole) || null);
      setLoading(false);
    };

    fetchRole();
  }, [session?.user?.id]);

  return { role, roleLoading: loading };
};
