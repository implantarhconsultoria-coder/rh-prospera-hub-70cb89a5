import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Session } from '@supabase/supabase-js';

export type AppRole = 'admin' | 'diretor_geral' | 'filial_matriz' | 'filial_praia' | 'filial_goiania' | 'almoxarifado' | 'usuario' | 'tecnico_campo' | 'operacional' | 'faturamento' | 'financeiro';

// Prioridade: admin sempre vence (usuÃ¡rio pode ter mÃºltiplas roles, ex: admin + tecnico_campo de teste)
const ROLE_PRIORITY: AppRole[] = ['admin', 'diretor_geral', 'operacional', 'filial_matriz', 'filial_praia', 'filial_goiania', 'almoxarifado', 'faturamento', 'financeiro', 'tecnico_campo', 'usuario'];
const BOOTSTRAP_ADMIN_EMAILS = new Set(['adm.matriz@topac.com.br']);

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
    let ativo = true;

    const fetchRole = async () => {
      try {
        const { data, error } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', session.user.id);

        if (!ativo) return;
        if (error) {
          console.error('Erro ao carregar perfil do usuario:', error);
        }

        const all = (data || []).map((r) => r.role as AppRole);
        if (all.length === 0 && BOOTSTRAP_ADMIN_EMAILS.has(session.user.email?.toLowerCase() || '')) {
          setRoles(['admin']);
          setRole('admin');
          setLoading(false);
          return;
        }

        setRoles(all);

        // Pick highest-priority role
        const primary = ROLE_PRIORITY.find((p) => all.includes(p)) || null;
        setRole(primary);
      } catch (error) {
        if (!ativo) return;
        console.error('Falha inesperada ao carregar perfil do usuario:', error);
        setRoles([]);
        setRole(null);
      } finally {
        if (ativo) setLoading(false);
      }
    };

    fetchRole();
    return () => { ativo = false; };
  }, [session?.user?.id]);

  return { role, roles, roleLoading: loading };
};
