/**
 * Interpretacao local de pedidos de retirada. Usa somente o catalogo real carregado
 * do almoxarifado: nenhuma descricao livre cria produto ou altera o saldo.
 */
export type RetiradaStockItem = {
  id: string;
  nome: string;
  codigo_topac?: string | null;
  codigo_alternativo?: string | null;
  aplicacao?: string | null;
  saldo?: number | string | null;
  unidade?: string | null;
};

export type RetiradaCandidate = {
  item: RetiradaStockItem;
  score: number;
};

export type RetiradaSmartLine = {
  raw: string;
  term: string;
  quantidade: number;
  candidates: RetiradaCandidate[];
  suggestedId: string;
  issue: 'quantidade' | 'material' | 'ambiguo' | null;
};

const stopWords = new Set([
  'a', 'o', 'as', 'os', 'de', 'da', 'do', 'das', 'dos', 'para',
  'por', 'um', 'uma', 'uns', 'umas', 'peca', 'pecas', 'un',
  'und', 'unid', 'unidade', 'unidades', 'pcs', 'pc',
]);

export const normalizeRetirada = (input: unknown): string =>
  String(input ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

const significantWords = (value: string) =>
  normalizeRetirada(value).split(' ')
    .filter((word) => word && !stopWords.has(word))
    .map((word) => word.length > 4 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word);

const normalizedMeaning = (value: string) => significantWords(value).join(' ');

const parseLine = (raw: string, stock: RetiradaStockItem[]) => {
  let clean = raw.trim().replace(
    /^(?:entreguei|retirei|entregar|separei|separar|retirada\s+de|sa[ií]da\s+de|preciso\s+de|entregue)\s+/i,
    '',
  ).trim();
  let quantidade = 1;
  const isExactCode = stock.some((item) =>
    clean && [item.codigo_topac, item.codigo_alternativo].some((code) =>
      normalizeRetirada(code) === normalizeRetirada(clean),
    ),
  );
  if (!isExactCode) {
    const leading = clean.match(/^(\d+(?:[.,]\d+)?)\s*(?:[x×]\s*|un(?:idades?|d)?\s*|p(?:c|ç)s?\s*)?(.+)$/i);
    const trailing = clean.match(/^(.+?)\s+[x×]\s*(\d+(?:[.,]\d+)?)$/i);
    if (leading) {
      quantidade = Number(leading[1].replace(',', '.'));
      clean = leading[2].trim();
    } else if (trailing) {
      quantidade = Number(trailing[2].replace(',', '.'));
      clean = trailing[1].trim();
    }
  }
  return { term: clean, quantidade };
};

const matchesFor = (term: string, stock: RetiradaStockItem[]): RetiradaCandidate[] => {
  const normalized = normalizeRetirada(term);
  const meaning = normalizedMeaning(term);
  const words = significantWords(term);
  if (!normalized || !words.length) return [];

  return stock.map((item) => {
    const name = normalizeRetirada(item.nome);
    const itemMeaning = normalizedMeaning(item.nome);
    const itemWords = significantWords(item.nome);
    const codes = [item.codigo_topac, item.codigo_alternativo]
      .map(normalizeRetirada).filter(Boolean);
    let score = 0;
    if (codes.includes(normalized)) score = 1200;
    else if (name === normalized || itemMeaning === meaning) score = 1100;
    else if (words.every((word) => itemWords.includes(word))) {
      score = 770 + Math.min(words.length, 5) * 15
        - Math.max(0, itemWords.length - words.length) * 20;
    } else if (words.length > 1 && words.every((word) => itemWords.some((w) => w.startsWith(word)))) {
      score = 640 - Math.max(0, itemWords.length - words.length) * 15;
    }
    return { item, score };
  }).filter((candidate) => candidate.score >= 570)
    .sort((a, b) =>
      b.score - a.score ||
      Number(b.item.saldo || 0) - Number(a.item.saldo || 0) ||
      a.item.nome.localeCompare(b.item.nome, 'pt-BR'),
    )
    .slice(0, 10);
};

export const interpretRetirada = (text: string, stock: RetiradaStockItem[]): RetiradaSmartLine[] =>
  text.split(/[\n;]+/)
    .flatMap((part) => part.split(/\s+e\s+(?=\d+(?:[.,]\d+)?\b)/i))
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((raw) => {
      const { term, quantidade } = parseLine(raw, stock);
      const candidates = matchesFor(term, stock);
      const winner = candidates[0];
      const runnerUp = candidates[1];
      const words = significantWords(term);
      const safeMatch = winner && (
        (winner.score >= 1100 && (!runnerUp || runnerUp.score < winner.score))
        || (words.length >= 2 && winner.score >= 650 && !runnerUp)
        || (words.length >= 2 && winner.score >= 850 && !!runnerUp && winner.score - runnerUp.score >= 160)
      );
      return {
        raw,
        term,
        quantidade,
        candidates,
        suggestedId: safeMatch ? winner.item.id : '',
        issue: !Number.isFinite(quantidade) || quantidade <= 0
          ? 'quantidade' as const
          : !term || !candidates.length
            ? 'material' as const
            : !safeMatch
              ? 'ambiguo' as const
              : null,
      };
    });
