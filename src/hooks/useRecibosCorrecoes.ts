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

const LOCAL_KEY = 'topac_recibos_correcoes_v1';

const keyOf = (c: { tipo: string; company_id: string; funcionario_id: string; competencia: string }) =>
  `${c.tipo}|${c.company_id}|${c.funcionario_id}|${c.competencia}`;

const readLocal = (): ReciboCorrecao[] => {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(window.localStorage.getItem(LOCAL_KEY) || '[]');
  } catch {
    return [];
  }
};

const writeLocal = (items: ReciboCorrecao[]) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LOCAL_KEY, JSON.stringify(items));
};

const matchesFilter = (item: ReciboCorrecao, filter?: { tipo?: 'vr' | 'vt'; competencia?: string; company_id?: string }) => {
  if (filter?.tipo && item.tipo !== filter.tipo) return false;
  if (filter?.competencia && item.competencia !== filter.competencia) return false;
  if (filter?.company_id && item.company_id !== filter.company_id) return false;
  return true;
};

export function useRecibosCorrecoes(filter?: { tipo?: 'vr' | 'vt'; competencia?: string; company_id?: string }) {
  const [items, setItems] = useState<ReciboCorrecao[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const localItems = readLocal();
    let q = supabase.from('recibos_correcoes' as any).select('*');
    if (filter?.tipo) q = q.eq('tipo', filter.tipo);
    if (filter?.competencia) q = q.eq('competencia', filter.competencia);
    if (filter?.company_id) q = q.eq('company_id', filter.company_id);
    const { data, error } = await q;
    const remoteItems = !error && data ? (data as any as ReciboCorrecao[]) : [];
    const merged = new Map<string, ReciboCorrecao>();
    [...remoteItems, ...localItems].forEach((item) => {
      if (matchesFilter(item, filter)) merged.set(keyOf(item), item);
    });
    setItems(Array.from(merged.values()));
    setLoading(false);
  }, [filter?.tipo, filter?.competencia, filter?.company_id]);

  useEffect(() => { load(); }, [load]);

  const map = new Map<string, ReciboCorrecao>();
  items.forEach(i => map.set(keyOf(i), i));

  const findFor = (tipo: 'vr' | 'vt', company_id: string, funcionario_id: string, competencia: string) =>
    map.get(`${tipo}|${company_id}|${funcionario_id}|${competencia}`);

  const upsertLocal = (payload: Omit<ReciboCorrecao, 'id' | 'updated_at' | 'corrigido_por_nome'>, nome: string | null = null) => {
    const now = new Date().toISOString();
    const localItems = readLocal();
    const correction: ReciboCorrecao = {
      ...payload,
      id: keyOf(payload),
      corrigido_por_nome: nome,
      updated_at: now,
    };
    const next = new Map<string, ReciboCorrecao>();
    localItems.forEach((item) => next.set(keyOf(item), item));
    next.set(keyOf(correction), correction);
    writeLocal(Array.from(next.values()));
  };

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
    if (error) {
      upsertLocal(payload, nome);
    }
    await load();
  };

  const remove = async (id: string) => {
    const localItems = readLocal().filter((item) => item.id !== id && keyOf(item) !== id);
    writeLocal(localItems);
    const { error } = await supabase.from('recibos_correcoes' as any).delete().eq('id', id);
    if (error) {
      await load();
      return;
    }
    await load();
  };

  return { items, loading, findFor, upsert, remove, reload: load };
}
