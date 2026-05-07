import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type ReciboCorrecao = {
  id: string;
  tipo: 'vr' | 'vt';
  company_id: string;
  funcionario_id: string;
  competencia: string;
  valor_diario_original: number | null;
  dias_finais_original: number | null;
  valor_total_original: number | null;
  valor_diario_corrigido: number | null;
  dias_finais_corrigido: number | null;
  valor_total_corrigido: number | null;
  observacao: string | null;
  motivo: string;
  data_pagamento: string | null;
  corrigido_por_nome: string | null;
  updated_at: string;
};

const keyOf = (c: { tipo: string; company_id: string; funcionario_id: string; competencia: string }) =>
  `${c.tipo}|${c.company_id}|${c.funcionario_id}|${c.competencia}`;

export function useRecibosCorrecoes(filter?: { tipo?: 'vr' | 'vt'; competencia?: string; company_id?: string }) {
  const [items, setItems] = useState<ReciboCorrecao[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase.from('recibos_correcoes' as any).select('*');
    if (filter?.tipo) q = q.eq('tipo', filter.tipo);
    if (filter?.competencia) q = q.eq('competencia', filter.competencia);
    if (filter?.company_id) q = q.eq('company_id', filter.company_id);
    const { data, error } = await q;
    if (!error && data) setItems(data as any);
    setLoading(false);
  }, [filter?.tipo, filter?.competencia, filter?.company_id]);

  useEffect(() => { load(); }, [load]);

  const map = new Map<string, ReciboCorrecao>();
  items.forEach(i => map.set(keyOf(i), i));

  const findFor = (tipo: 'vr' | 'vt', company_id: string, funcionario_id: string, competencia: string) =>
    map.get(`${tipo}|${company_id}|${funcionario_id}|${competencia}`);

  const upsert = async (payload: Omit<ReciboCorrecao, 'id' | 'updated_at' | 'corrigido_por_nome'>) => {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    let nome: string | null = null;
    if (uid) {
      const { data: prof } = await supabase.from('profiles').select('nome_completo,email').eq('user_id', uid).maybeSingle();
      nome = (prof as any)?.nome_completo || (prof as any)?.email || null;
    }
    const { error } = await supabase.from('recibos_correcoes' as any).upsert(
      { ...payload, corrigido_por_user_id: uid, corrigido_por_nome: nome },
      { onConflict: 'tipo,company_id,funcionario_id,competencia' },
    );
    if (error) throw error;
    await load();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from('recibos_correcoes' as any).delete().eq('id', id);
    if (error) throw error;
    await load();
  };

  return { items, loading, findFor, upsert, remove, reload: load };
}
