import { createClient } from '@supabase/supabase-js';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const FALLBACK_SUPABASE_URL = 'https://djfjnxmbvjgweqzjvqtr.supabase.co';
const FALLBACK_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_DHu9U7RSOV8uPwW2XXtH8A_ek7QfU_Z';
const env = (name: string) => String(process.env[name] || '').trim();
const bearer = (request: Request) =>
  String(request.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i)?.[1] || '';

const normalize = (value: unknown) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();

export const normalizeProtocolPlate = (value: unknown) =>
  normalize(value).replace(/[^A-Z0-9]/g, '').match(/[A-Z]{3}[0-9][A-Z0-9][0-9]{2}/)?.[0] || '';

const normalizePatrimonio = (value: unknown) =>
  normalize(value).replace(/[^A-Z0-9./-]/g, '').replace(/^[-./]+|[-./]+$/g, '');

const cleanEntity = (value: unknown) =>
  String(value || '')
    .replace(/^[\s:;,.-]+|[\s:;,.-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const cleanLocal = (value: unknown) =>
  cleanEntity(value)
    .replace(/^(?:DA|DE|DO)\s+/i, '')
    .trim();

type Context = { cliente: string; local: string; responsavel: string };
export type ProtocolParsedItem = { placa: string; patrimonio: string; descricao: string };
export type ProtocolParsedGroup = Context & { itens: ProtocolParsedItem[] };
type Item = ProtocolParsedItem & Context;

const getSupabase = (accessToken: string) => {
  const url = env('SUPABASE_URL') || env('VITE_SUPABASE_URL') || FALLBACK_SUPABASE_URL;
  const key = env('SUPABASE_PUBLISHABLE_KEY') || env('VITE_SUPABASE_PUBLISHABLE_KEY') || env('VITE_SUPABASE_ANON_KEY') || FALLBACK_SUPABASE_PUBLISHABLE_KEY;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
};

export const parseProtocolContext = (line: string): Partial<Context> => {
  const compact = String(line || '').replace(/\s+/g, ' ').trim();

  const cliente = cleanEntity(
    compact.match(
      /(?:\bempresa\b|\bcliente\b|\bdestinat[aá]ri[oa]\b)\s*[:\-]?\s*([A-ZÀ-ÿ0-9][^,;.\n]+?)(?=\s+(?:canteiro|local|obra|aos?\s+cuidados?|a\/c|respons[aá]vel|destinat[aá]ri[oa]|recebedor)\b|[,;.]|$)/i,
    )?.[1] || '',
  );

  const local = cleanLocal(
    compact.match(
      /(?:\bcanteiro\b(?:\s+(?:da|de|do))?|\blocal\b(?:\s+(?:da|de|do))?|\bobra\b(?:\s+(?:da|de|do))?|\bdestino\b)\s*[:\-]?\s*([A-ZÀ-ÿ0-9][^,;.\n]+?)(?=\s+(?:aos?\s+cuidados?|a\/c|respons[aá]vel|destinat[aá]ri[oa]|recebedor)\b|[,;.]|$)/i,
    )?.[1] || '',
  );

  const responsavel = cleanEntity(
    compact.match(
      /(?:aos?\s+cuidados?\s*(?:do|da|de)?|cuidados?\s*(?:do|da|de)|a\/c|respons[aá]vel(?:\s+pelo\s+recebimento)?|recebedor|destinat[aá]ri[oa])\s*[:\-]?\s*([A-ZÀ-ÿ][^,;.\n]*?)(?=\s+(?:atenciosamente|att\.?|obrigad[oa])\b|[,;.]|$)/i,
    )?.[1] || '',
  );

  return {
    ...(cliente ? { cliente } : {}),
    ...(local ? { local } : {}),
    ...(responsavel ? { responsavel } : {}),
  };
};

export const parseProtocolItem = (line: string): ProtocolParsedItem | null => {
  const plate = normalizeProtocolPlate(
    line.match(/\b(?:placa\s*[:\-]?\s*)?([A-Z]{3}[-\s]?[0-9][A-Z0-9][0-9]{2})\b/i)?.[1] || '',
  );

  const patrimonio = normalizePatrimonio(
    line.match(/\b(?:patrim[oô]nio(?:s)?\s*(?:n[ºo.]*\s*)?[:\-]?\s*)?([A-Z]\d{1,3}\.\d{1,5})\b/i)?.[1] ||
    line.match(/\bpatrim[oô]nio(?:s)?\s*(?:n[ºo.]*\s*)?[:\-]?\s*([A-Z0-9][A-Z0-9./-]{1,29})\b/i)?.[1] ||
    '',
  );

  if (!plate && !patrimonio) return null;

  const descricao = cleanEntity(
    line
      .replace(/\bplaca\s*[:\-]?\s*[A-Z]{3}[-\s]?[0-9][A-Z0-9][0-9]{2}\b/i, '')
      .replace(/\b(?:patrim[oô]nio(?:s)?\s*(?:n[ºo.]*\s*)?[:\-]?\s*)?[A-Z]\d{1,3}\.\d{1,5}\b/i, '')
      .replace(/^[\s\-–—:]+|[\s\-–—:]+$/g, ''),
  );

  return { placa: plate, patrimonio, descricao };
};

const applyContextToPending = (items: Item[], pending: number[], context: Context) => {
  for (const index of pending) {
    items[index] = {
      ...items[index],
      cliente: items[index].cliente || context.cliente,
      local: items[index].local || context.local,
      responsavel: items[index].responsavel || context.responsavel,
    };
  }
};

export const parseProtocolMessage = (rawText: string): ProtocolParsedGroup[] => {
  const text = String(rawText || '').replace(/\r/g, '').trim();
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  let current: Context = { cliente: '', local: '', responsavel: '' };
  const items: Item[] = [];
  let pending: number[] = [];

  for (const line of lines) {
    const foundContext = parseProtocolContext(line);
    const hasContext = Boolean(foundContext.cliente || foundContext.local || foundContext.responsavel);
    const item = parseProtocolItem(line);

    if (item) {
      const next: Item = { ...item, ...current };
      items.push(next);
      if (!next.cliente || !next.local || !next.responsavel) pending.push(items.length - 1);
    }

    if (hasContext) {
      current = {
        cliente: foundContext.cliente || current.cliente,
        local: foundContext.local || current.local,
        responsavel: foundContext.responsavel || current.responsavel,
      };

      // Mensagens operacionais normalmente trazem a lista de patrimônios primeiro
      // e o destino no fim. Repassamos o contexto encontrado para esses itens.
      if (pending.length) {
        applyContextToPending(items, pending, current);
        pending = items
          .map((candidate, index) => (!candidate.cliente || !candidate.local || !candidate.responsavel ? index : -1))
          .filter((index) => index >= 0);
      }
    }
  }

  if (pending.length) applyContextToPending(items, pending, current);

  // Fallback para mensagem em uma única linha ou texto sem quebras previsíveis.
  if (!items.length) {
    const compact = text.replace(/\s+/g, ' ');
    const globalContext = parseProtocolContext(compact);
    const context: Context = {
      cliente: globalContext.cliente || '',
      local: globalContext.local || '',
      responsavel: globalContext.responsavel || '',
    };

    const pairRegex = /\b([A-Z]\d{1,3}\.\d{1,5})\b\s*[-–—]?\s*(?:placa\s*[:\-]?\s*)?([A-Z]{3}[-\s]?[0-9][A-Z0-9][0-9]{2})\b/gi;
    for (const match of compact.matchAll(pairRegex)) {
      items.push({
        patrimonio: normalizePatrimonio(match[1]),
        placa: normalizeProtocolPlate(match[2]),
        descricao: '',
        ...context,
      });
    }

    if (!items.length) {
      const plateMatches = [...compact.matchAll(/\b([A-Z]{3}[-\s]?[0-9][A-Z0-9][0-9]{2})\b/gi)];
      for (const match of plateMatches) {
        items.push({ placa: normalizeProtocolPlate(match[1]), patrimonio: '', descricao: '', ...context });
      }
    }
  }

  const groups = new Map<string, ProtocolParsedGroup>();
  for (const item of items) {
    const key = `${normalize(item.cliente)}|${normalize(item.local)}`;
    const existing = groups.get(key) || {
      cliente: item.cliente,
      local: item.local,
      responsavel: item.responsavel,
      itens: [],
    };

    if (!existing.responsavel && item.responsavel) existing.responsavel = item.responsavel;
    const duplicate = existing.itens.some((candidate) =>
      (item.placa && normalizeProtocolPlate(candidate.placa) === item.placa) ||
      (item.patrimonio && normalizePatrimonio(candidate.patrimonio) === item.patrimonio),
    );
    if (!duplicate) existing.itens.push({ placa: item.placa, patrimonio: item.patrimonio, descricao: item.descricao });
    groups.set(key, existing);
  }

  return [...groups.values()];
};

export default async function handler(request: Request) {
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  const token = bearer(request);
  if (!token) return json({ error: 'Sessão não informada.' }, 401);

  const supabase = getSupabase(token);
  const { data: auth, error: authError } = await supabase.auth.getUser(token);
  if (authError || !auth?.user) return json({ error: 'Sessão inválida ou expirada.' }, 401);

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Corpo JSON inválido.' }, 400);
  }

  const text = String(body?.text || '').trim();
  if (!text) return json({ error: 'Cole a mensagem para gerar os protocolos.' }, 400);

  const groups = parseProtocolMessage(text);
  if (!groups.length) return json({ error: 'Nenhuma placa ou patrimônio foi identificado na mensagem.' }, 422);

  return json({ ok: true, groups, originalText: text, groupingRule: 'cliente+local' });
}
