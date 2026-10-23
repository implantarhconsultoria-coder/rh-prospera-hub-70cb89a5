/**
 * Leitura conservadora de metadados de atestados e declarações.
 * Nunca usa a data de upload para determinar o dia de afastamento e
 * nunca autoriza desconto sem período confirmado na tabela atestados.
 */
export type UnidadeAtestado = 'horas' | 'dias' | 'indefinido';
export type IndicioAtestado = { unidade: UnidadeAtestado; quantidade: number | null; requerConferencia: boolean };

export const detectarDuracaoAtestado = (texto: unknown): IndicioAtestado => {
  const normalizado = String(texto ?? '').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').toLowerCase();
  // A palavra explicitamente ligada ao número evita interpretar datas, CRMs ou horários como duração.
  const horas = normalizado.match(/\b(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:horas?|hrs?)\b/);
  const dias = normalizado.match(/\b(\d{1,3})\s*dias?\b/);
  if (horas && dias) return { unidade: 'indefinido', quantidade: null, requerConferencia: true };
  if (horas) return { unidade: 'horas', quantidade: Number(horas[1].replace(',', '.')), requerConferencia: true };
  if (dias) return { unidade: 'dias', quantidade: Number(dias[1]), requerConferencia: true };
  return { unidade: 'indefinido', quantidade: null, requerConferencia: true };
};
