/**
 * Separação física da impressão: um equipamento por protocolo, duas vias de
 * cada protocolo e seus documentos individuais. O agrupamento Cliente + Local
 * organiza apenas o lote, nunca une dois ativos numa mesma identificação.
 */
export type ProtocolPrintJob<TGroup, TItem> = {
  group: TGroup;
  item: TItem;
  sequence: number;
  count: number;
  copies: readonly [1, 2];
};

export const createProtocolPrintJobs = <TItem, TGroup extends { itens: TItem[] }>(
  groups: TGroup[],
): Array<ProtocolPrintJob<TGroup, TItem>> => {
  const count = groups.reduce((total, group) => total + group.itens.length, 0);
  let sequence = 0;
  return groups.flatMap(group => group.itens.map(item => ({
    group,
    item,
    sequence: ++sequence,
    count,
    copies: [1, 2] as const,
  })));
};
