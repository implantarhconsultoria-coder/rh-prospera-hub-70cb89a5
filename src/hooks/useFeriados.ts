import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type Feriado = { data: string; nome: string; tipo?: string };

/**
 * Busca feriados (nacional + por empresa) para a competência YYYY-MM.
 * Retorna lista + array de datas ISO para uso em getWorkingDays.
 */
export function useFeriados(competencia: string, companyId?: string) {
  const [feriados, setFeriados] = useState<Feriado[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!competencia) return;
    const [y, m] = competencia.split('-').map(Number);
    if (!y || !m) return;
    const inicio = `${y}-${String(m).padStart(2,'0')}-01`;
    const fimDate = new Date(y, m, 0);
    const fim = `${y}-${String(m).padStart(2,'0')}-${String(fimDate.getDate()).padStart(2,'0')}`;

    setLoading(true);
    let q = supabase.from('feriados' as any).select('data,nome,tipo,empresa_id,ativo')
      .gte('data', inicio).lte('data', fim);
    q.then(({ data }: any) => {
      const list = (data || [])
        .filter((f: any) => f.ativo !== false)
        .filter((f: any) => !f.empresa_id || (companyId && f.empresa_id === companyId))
        .map((f: any) => ({ data: f.data, nome: f.nome, tipo: f.tipo }));
      // dedupe by data
      const seen = new Map<string, Feriado>();
      list.forEach((f: Feriado) => { if (!seen.has(f.data)) seen.set(f.data, f); });
      setFeriados(Array.from(seen.values()).sort((a,b) => a.data.localeCompare(b.data)));
      setLoading(false);
    });
  }, [competencia, companyId]);

  const datas = feriados.map(f => f.data);
  return { feriados, datas, loading };
}
