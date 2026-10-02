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

    const email = session.user.email?.toLowerCase() || '';
    const isBootstrapAdmin = BOOTSTRAP_ADMIN_EMAILS.has(email);

    // A conta administrativa principal nao precisa esperar a sincronizacao
    // remota para abrir o painel. Mantemos a sincronizacao em segundo plano.
    if (isBootstrapAdmin) {
      setRole('admin');
      setRoles(['admin']);
      setLoading(false);
    } else {
      setRole(null);
      setRoles([]);
      setLoading(true);
    }

    const fetchRole = async () => {
      try {
        const { error: syncError } = await (supabase as any).rpc('topac_aplicar_acesso_usuario', {
          p_user_id: session.user.id,
        });

        if (syncError) {
          console.warn('Nao foi possivel sincronizar acesso por CPF:', syncError.message);
        }

        const { data, error } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', session.user.id);

        if (error) throw error;

        const all = (data || []).map((r) => r.role as AppRole);
        if (isBootstrapAdmin && !all.includes('admin')) {
          all.unshift('admin');
        }

        setRoles(all);

        const primary = ROLE_PRIORITY.find((p) => all.includes(p)) || null;
        setRole(primary);
      } catch (error) {
        console.error('Erro ao carregar perfil do usuario:', error);
        if (!isBootstrapAdmin) {
          setRoles([]);
          setRole(null);
        }
      } finally {
        if (!isBootstrapAdmin) setLoading(false);
      }
    };

    fetchRole();
  }, [session?.user?.id]);

  return { role, roles, roleLoading: loading };
};
