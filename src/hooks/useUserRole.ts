import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Session } from '@supabase/supabase-js';

export type AppRole = 'admin' | 'filial_praia' | 'filial_goiania' | 'almoxarifado' | 'usuario' | 'tecnico_campo' | 'operacional' | 'faturamento' | 'financeiro';

// Prioridade: admin sempre vence (usuário pode ter múltiplas roles, ex: admin + tecnico_campo de teste)
const ROLE_PRIORITY: AppRole[] = ['admin', 'operacional', 'filial_praia', 'filial_goiania', 'almoxarifado', 'faturamento', 'financeiro', 'tecnico_campo', 'usuario'];

export const useUserRole = (session: Session | null) => {
  const [role, setRole] = useState<AppRole | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session?.user?.id) {
      setRole(null);
      setRoles([]);
      setLoading(false);
      return;
    }

    setRole(null);
    setRoles([]);
    setLoading(true);

    const fetchRole = async () => {
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', session.user.id);

      const all = (data || []).map((r) => r.role as AppRole);
      setRoles(all);

      // Pick highest-priority role
      const primary = ROLE_PRIORITY.find((p) => all.includes(p)) || null;
      setRole(primary);
      setLoading(false);
    };

    fetchRole();
  }, [session?.user?.id]);

  return { role, roles, roleLoading: loading };
};
