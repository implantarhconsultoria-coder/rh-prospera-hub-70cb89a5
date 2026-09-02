const sendJson = (res: any, status: number, body: unknown) => {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(body);
};

const bearer = (req: any) =>
  String(req?.headers?.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1] || '';

const normalize = (value: unknown) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();

export const normalizeProtocolPlate = (value: unknown) =>
  normalize(value).replace(/[^A-Z0-9]/g, '').match(/[A-Z]{3}[0-9][A-Z0-9][0-9]{2}/)?.[0] || '';

export const normalizeProtocolPatrimonio = (value: unknown) =>
  normalize(value).replace(/[^A-Z0-9./-]/g, '').replace(/^[-./]+|[-./]+$/g, '');

const cleanEntity = (value: unknown) =>
  String(value || '')
    .replace(/^[\s:;,.-]+|[\s:;,.-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const cleanLocal = (value: unknown) =>
  cleanEntity(value).replace(/^(?:DA|DE|DO)\s+/i, '').trim();

type Context = { cliente: string; local: string; responsavel: string };
export type ProtocolParsedItem = { placa: string; patrimonio: string; descricao: string };
export type ProtocolParsedGroup = Context & { itens: ProtocolParsedItem[] };
type Item = ProtocolParsedItem & Context;

export const parseProtocolContext = (line: string): Partial<Context> => {
  const compact = String(line || '').replace(/\s+/g, ' ').trim();

  const cliente = cleanEntity(
    compact.match(
      /(?:\b(?:a|para)\s+empresa\b|\bempresa\b|\bcliente\b)\s*[:\-]?\s*([A-ZÀ-ÿ0-9][^,;.\n]+?)(?=\s+(?:canteiro|local|obra|destino|aos?\s+cuidados?|a\/c|respons[aá]vel|recebedor)\b|[,;.]|$)/i,
    )?.[1] || '',
  );

  const local = cleanLocal(
    compact.match(
      /(?:\bcanteiro\b(?:\s+(?:da|de|do))?|\blocal\b(?:\s+(?:da|de|do))?|\bobra\b(?:\s+(?:da|de|do))?|\bdestino\b)\s*[:\-]?\s*([A-ZÀ-ÿ0-9][^,;.\n]+?)(?=\s+(?:aos?\s+cuidados?|a\/c|respons[aá]vel|recebedor)\b|[,;.]|$)/i,
    )?.[1] || '',
  );

  const responsavel = cleanEntity(
    compact.match(
      /(?:aos?\s+cuidados?\s*(?:do|da|de)?|cuidados?\s*(?:do|da|de)?|a\/c|respons[aá]vel(?:\s+pelo\s+recebimento)?|recebedor)\s*[:\-]?\s*([A-ZÀ-ÿ][^,;.\n]*?)(?=\s+(?:atenciosamente|atenciosamente,|att\.?|obrigad[oa])\b|[,;.]|$)/i,
    )?.[1] || '',
  );

  return {
    ...(cliente ? { cliente } : {}),
    ...(local ? { local } : {}),
    ...(responsavel ? { responsavel } : {}),
  };
};

export const parseProtocolItem = (line: string): ProtocolParsedItem | null => {
  const raw = String(line || '').trim();
  const placa = normalizeProtocolPlate(
    raw.match(/\b(?:placa\s*[:\-]?\s*)?([A-Z]{3}\s*-?\s*[0-9][A-Z0-9]\s*-?\s*[0-9]{2})\b/i)?.[1] || '',
  );
  const patrimonio = normalizeProtocolPatrimonio(
    raw.match(/\b(?:patrim[oô]nio(?:s)?\s*(?:n[ºo.]*\s*)?[:\-]?\s*)?([A-Z]\d{1,3}\.\d{1,5})\b/i)?.[1] ||
      raw.match(/\bpatrim[oô]nio(?:s)?\s*(?:n[ºo.]*\s*)?[:\-]?\s*([A-Z0-9][A-Z0-9./-]{1,29})\b/i)?.[1] ||
      '',
  );

  if (!placa && !patrimonio) return null;

  const descricao = cleanEntity(
    raw
      .replace(/\bplaca\s*[:\-]?\s*[A-Z]{3}\s*-?\s*[0-9][A-Z0-9]\s*-?\s*[0-9]{2}\b/i, '')
      .replace(/\b(?:patrim[oô]nio(?:s)?\s*(?:n[ºo.]*\s*)?[:\-]?\s*)?[A-Z]\d{1,3}\.\d{1,5}\b/i, '')
      .replace(/^[\s\-–—:]+|[\s\-–—:]+$/g, ''),
  );

  return { placa, patrimonio, descricao };
};

const applyContext = (items: Item[], indexes: number[], context: Context) => {
  for (const index of indexes) {
    items[index] = {
      ...items[index],
      cliente: items[index].cliente || context.cliente,
      local: items[index].local || context.local,
      responsavel: items[index].responsavel || context.responsavel,
    };
  }
};

const incompleteIndexes = (items: Item[]) =>
  items
    .map((item, index) => (!item.cliente || !item.local || !item.responsavel ? index : -1))
    .filter((index) => index >= 0);

export const parseProtocolMessage = (rawText: string): ProtocolParsedGroup[] => {
  const text = String(rawText || '').replace(/\r/g, '').trim();
  if (!text) return [];

  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  let current: Context = { cliente: '', local: '', responsavel: '' };
  const items: Item[] = [];
  let pending: number[] = [];

  for (const line of lines) {
    const foundContext = parseProtocolContext(line);
    const item = parseProtocolItem(line);

    if (item) {
      const next: Item = { ...item, ...current };
      items.push(next);
      if (!next.cliente || !next.local || !next.responsavel) pending.push(items.length - 1);
    }

    if (foundContext.cliente || foundContext.local || foundContext.responsavel) {
      current = {
        cliente: foundContext.cliente || current.cliente,
        local: foundContext.local || current.local,
        responsavel: foundContext.responsavel || current.responsavel,
      };
      if (pending.length) {
        applyContext(items, pending, current);
        pending = incompleteIndexes(items);
      }
    }
  }

  const compact = text.replace(/\s+/g, ' ');
  const globalContext = parseProtocolContext(compact);
  current = {
    cliente: globalContext.cliente || current.cliente,
    local: globalContext.local || current.local,
    responsavel: globalContext.responsavel || current.responsavel,
  };

  if (items.length && pending.length) applyContext(items, pending, current);

  if (!items.length) {
    const pairRegex = /\b([A-Z]\d{1,3}\.\d{1,5})\b\s*[-–—]?\s*(?:placa\s*[:\-]?\s*)?([A-Z]{3}\s*-?\s*[0-9][A-Z0-9]\s*-?\s*[0-9]{2})\b/gi;
    for (const match of compact.matchAll(pairRegex)) {
      items.push({
        patrimonio: normalizeProtocolPatrimonio(match[1]),
        placa: normalizeProtocolPlate(match[2]),
        descricao: '',
        ...current,
      });
    }
  }

  if (!items.length) {
    for (const match of compact.matchAll(/\b([A-Z]{3}\s*-?\s*[0-9][A-Z0-9]\s*-?\s*[0-9]{2})\b/gi)) {
      items.push({ placa: normalizeProtocolPlate(match[1]), patrimonio: '', descricao: '', ...current });
    }
  }

  const groups = new Map<string, ProtocolParsedGroup>();
  for (const item of items) {
    const key = `${normalize(item.cliente)}|${normalize(item.local)}`;
    const group = groups.get(key) || {
      cliente: item.cliente,
      local: item.local,
      responsavel: item.responsavel,
      itens: [],
    };

    if (!group.responsavel && item.responsavel) group.responsavel = item.responsavel;
    const duplicate = group.itens.some((candidate) =>
      (item.placa && normalizeProtocolPlate(candidate.placa) === item.placa) ||
      (item.patrimonio && normalizeProtocolPatrimonio(candidate.patrimonio) === item.patrimonio),
    );
    if (!duplicate) group.itens.push({ placa: item.placa, patrimonio: item.patrimonio, descricao: item.descricao });
    groups.set(key, group);
  }

  return [...groups.values()];
};

const parseBody = (req: any) => {
  if (req?.body == null) return {};
  if (Buffer.isBuffer(req.body)) return JSON.parse(req.body.toString('utf8') || '{}');
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  if (typeof req.body === 'object') return req.body;
  return {};
};

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'Método não permitido.' });
    if (!bearer(req)) return sendJson(res, 401, { ok: false, error: 'Sessão não informada. Faça login novamente.' });

    let body: any;
    try {
      body = parseBody(req);
    } catch (error: any) {
      console.error('[protocolos-parse] JSON inválido:', error?.message || error);
      return sendJson(res, 400, { ok: false, error: 'A mensagem não pôde ser lida porque o corpo JSON é inválido.' });
    }

    const text = String(body?.text || '').trim();
    if (!text) return sendJson(res, 400, { ok: false, error: 'Cole a mensagem para gerar os protocolos.' });
    if (text.length > 60_000) return sendJson(res, 413, { ok: false, error: 'A mensagem é muito grande para processamento.' });

    const groups = parseProtocolMessage(text);
    if (!groups.length) {
      return sendJson(res, 422, {
        ok: false,
        error: 'Nenhuma placa ou patrimônio foi identificado. Use formatos como A10.245 - placa GCO-6C26.',
      });
    }

    console.log('[protocolos-parse] processado', JSON.stringify({ groups: groups.length, items: groups.reduce((sum, group) => sum + group.itens.length, 0) }));
    return sendJson(res, 200, { ok: true, groups, originalText: text, groupingRule: 'cliente+local' });
  } catch (error: any) {
    console.error('[protocolos-parse] erro inesperado:', error?.stack || error?.message || error);
    return sendJson(res, 500, {
      ok: false,
      error: `Falha interna ao interpretar a mensagem: ${error?.message || 'erro desconhecido'}`,
    });
  }
}
