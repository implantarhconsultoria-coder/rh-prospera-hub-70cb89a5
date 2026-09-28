import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useApp } from '@/context/AppContext';

type ModuloOperador = 'operacional' | 'almoxarifado';

export type OperadorResumo = {
  id: string;
  nome: string;
  email?: string | null;
  cargo?: string | null;
  filial?: string | null;
  modulos?: string[];
  ativo: boolean;
  codigo_emitido: boolean;
  codigo_hint?: string | null;
};

const rpcClient = supabase as unknown as {
  rpc: (name: string, args?: Record<string, unknown>) => Promise<{ data: any; error: { message?: string } | null }>;
};

export const useOperatorBootstrap = (modulo: ModuloOperador, enabled = true) => {
  const { session } = useApp();
  const [operador, setOperador] = useState<OperadorResumo | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const issuingRef = useRef(false);

  const enviarCodigo = useCallback(async (operadorId: string) => {
    const token = session?.access_token;
    if (!token) throw new Error('Sessão sem token de acesso.');

    const response = await fetch('/api/operator-code', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ operador_id: operadorId }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.ok) throw new Error(payload?.error || 'Não foi possível emitir o código do operador.');
    return payload;
  }, [session?.access_token]);

  const carregar = useCallback(async () => {
    if (!enabled || !session?.user?.id) {
      setLoading(false);
      return null;
    }

    setLoading(true);
    setError(null);
    const { data, error: rpcError } = await rpcClient.rpc('operador_operacao_garantir_self', { p_modulo: modulo });
    if (rpcError || !data?.ok) {
      const message = data?.error || rpcError?.message || 'Não foi possível preparar o operador.';
      setError(message);
      setLoading(false);
      return null;
    }

    const atual = data.operador as OperadorResumo;
    setOperador(atual);
    setLoading(false);

    if (!atual.codigo_emitido && !issuingRef.current) {
      issuingRef.current = true;
      try {
        await enviarCodigo(atual.id);
        setOperador((current) => current ? { ...current, codigo_emitido: true } : current);
      } catch (issueError: any) {
        console.warn('[operador] código ainda não emitido:', issueError?.message || issueError);
      } finally {
        issuingRef.current = false;
      }
    }

    return atual;
  }, [enabled, enviarCodigo, modulo, session?.user?.id]);

  const reenviarCodigo = useCallback(async () => {
    if (!operador?.id) throw new Error('Operador ainda não preparado.');
    const payload = await enviarCodigo(operador.id);
    await carregar();
    return payload;
  }, [carregar, enviarCodigo, operador?.id]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return { operador, loading, error, refresh: carregar, reenviarCodigo };
};
