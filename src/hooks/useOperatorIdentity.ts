import { useEffect, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/integrations/supabase/client';

/** Identidade documental do operador autenticado; nunca aceita nome/CPF digitados livremente. */
export type OperatorIdentity = { nome: string; cpf: string };
export const useOperatorIdentity = () => {
  const { session } = useApp();
  const userId = session?.user?.id || '';
  const [identity, setIdentity] = useState<OperatorIdentity>({ nome: '', cpf: '' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setIdentity({ nome: '', cpf: '' });
    if (!userId) {
      setLoading(false);
      return;
    }
    void (async () => {
      const { data, error } = await supabase.from('profiles')
        .select('nome_completo,cpf').eq('user_id', userId).maybeSingle();
      if (cancelled) return;
      if (error) console.error('Falha ao carregar identidade documental do operador:', error.code);
      setIdentity({
        nome: String(data?.nome_completo || '').trim(),
        cpf: String(data?.cpf || '').replace(/\D/g, ''),
      });
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  return { ...identity, userId, loading, completo: Boolean(identity.nome && identity.cpf.length === 11) };
};
