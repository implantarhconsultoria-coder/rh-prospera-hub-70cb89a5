import { supabase } from '@/integrations/supabase/client';

export interface Feriado {
  id?: string;
  data: string; // YYYY-MM-DD
  nome: string;
  tipo: 'nacional' | 'estadual' | 'municipal' | 'empresa';
  cidade?: string | null;
  uf?: string | null;
  empresa_id?: string | null;
  filial_id?: string | null;
  ativo?: boolean;
}

export interface DiasUteisBeneficio {
  diasUteisBrutos: number;
  feriadosConsiderados: number;
  diasUteisFinais: number;
  listaFeriados: Feriado[];
}

/** Mapa simples empresa → {uf, cidade}. Mantido aqui pois cidades/UFs não estão no schema atual. */
const EMPRESA_LOCALIDADE: Record<string, { uf: string; cidade: string }> = {
  // por nome (case-insensitive contém)
};

const inferLocalidade = (empresaNome: string): { uf: string; cidade: string } => {
  const n = (empresaNome || '').toLowerCase();
  if (n.includes('goi')) return { uf: 'GO', cidade: 'Goiânia' };
  if (n.includes('praia grande')) return { uf: 'SP', cidade: 'Praia Grande' };
  // matriz, alqui, lmt → SP / São Paulo
  return { uf: 'SP', cidade: 'São Paulo' };
};

/** Brutos: segunda a sexta no mês YYYY-MM */
export const diasUteisBrutos = (competencia: string): number => {
  const [y, m] = competencia.split('-').map(Number);
  if (!y || !m) return 22;
  const last = new Date(y, m, 0).getDate();
  let c = 0;
  for (let d = 1; d <= last; d++) {
    const dow = new Date(y, m - 1, d).getDay();
    if (dow !== 0 && dow !== 6) c++;
  }
  return c;
};

/**
 * Calcula dias úteis de uma competência considerando feriados nacionais +
 * estaduais (UF) + municipais (cidade) + empresa-específicos.
 */
export const calcularDiasUteisBeneficio = async (
  empresaNome: string,
  competencia: string,
  empresaId?: string,
): Promise<DiasUteisBeneficio> => {
  const brutos = diasUteisBrutos(competencia);
  const { uf, cidade } = inferLocalidade(empresaNome);
  const [y, m] = competencia.split('-').map(Number);
  const inicio = `${competencia}-01`;
  const fim = `${y}-${String(m).padStart(2, '0')}-${new Date(y, m, 0).getDate()}`;

  const { data, error } = await supabase
    .from('feriados' as any)
    .select('*')
    .gte('data', inicio)
    .lte('data', fim)
    .eq('ativo', true);

  if (error || !data) {
    return { diasUteisBrutos: brutos, feriadosConsiderados: 0, diasUteisFinais: brutos, listaFeriados: [] };
  }

  const aplicaveis: Feriado[] = (data as any[]).filter((f) => {
    if (f.tipo === 'nacional') return true;
    if (f.tipo === 'estadual') return (f.uf || '').toUpperCase() === uf;
    if (f.tipo === 'municipal')
      return (f.uf || '').toUpperCase() === uf && (f.cidade || '').toLowerCase() === cidade.toLowerCase();
    if (f.tipo === 'empresa') return empresaId ? f.empresa_id === empresaId : false;
    return false;
  });

  // dedup por data, contando apenas feriados em dia útil (seg-sex)
  const datasSet = new Set<string>();
  const lista: Feriado[] = [];
  for (const f of aplicaveis) {
    const dt = new Date(f.data + 'T00:00:00');
    const dow = dt.getDay();
    if (dow === 0 || dow === 6) continue;
    if (datasSet.has(f.data)) continue;
    datasSet.add(f.data);
    lista.push(f);
  }

  const finais = Math.max(0, brutos - lista.length);
  return {
    diasUteisBrutos: brutos,
    feriadosConsiderados: lista.length,
    diasUteisFinais: finais,
    listaFeriados: lista.sort((a, b) => a.data.localeCompare(b.data)),
  };
};

export const formatFeriadoData = (data: string) => {
  const [y, m, d] = data.split('-');
  return `${d}/${m}/${y}`;
};
