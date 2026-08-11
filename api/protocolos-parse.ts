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

const normalizePlate = (value: unknown) =>
  normalize(value).replace(/[^A-Z0-9]/g, '').match(/[A-Z]{3}[0-9][A-Z0-9][0-9]{2}/)?.[0] || '';

type Context = { cliente: string; local: string; responsavel: string };
type Item = { placa: string; patrimonio: string; descricao: string } & Context;

const getSupabase = (accessToken: string) => {
  const url = env('SUPABASE_URL') || env('VITE_SUPABASE_URL') || FALLBACK_SUPABASE_URL;
  const key = env('SUPABASE_PUBLISHABLE_KEY') || env('VITE_SUPABASE_PUBLISHABLE_KEY') || env('VITE_SUPABASE_ANON_KEY') || FALLBACK_SUPABASE_PUBLISHABLE_KEY;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
};

const parseContext = (line: string): Partial<Context> => {
  const compact = line.replace(/\s+/g, ' ').trim();
  const cliente =
    compact.match(/(?:\bempresa\b|\bcliente\b)\s*[:\-]?\s*([A-ZÀ-ÿ0-9][^,;.\n]+?)(?=\s+(?:canteiro|local|obra|aos?\s+cuidados?|a\/c|respons[aá]vel)\b|[,;.]|$)/i)?.[1]?.trim() || '';
  const local =
    compact.match(/(?:\bcanteiro\b(?:\s+(?:da|de|do))?|\blocal\b|\bobra\b)\s*[:\-]?\s*([A-ZÀ-ÿ0-9][^,;.\n]+?)(?=\s+(?:aos?\s+cuidados?|a\/c|respons[aá]vel)\b|[,;.]|$)/i)?.[1]?.trim() || '';
  const responsavel =
    compact.match(/(?:aos?\s+cuidados?\s+(?:do|da|de)|a\/c|respons[aá]vel(?:\s+pelo\s+recebimento)?)\s*[:\-]?\s*([A-ZÀ-ÿ][^,;.\n]*)/i)?.[1]?.trim() || '';
  return { ...(cliente ? { cliente } : {}), ...(local ? { local } : {}), ...(responsavel ? { responsavel } : {}) };
};

const parseItem = (line: string): Omit<Item, keyof Context> | null => {
  const plate = normalizePlate(
    line.match(/\b(?:placa\s*[:\-]?\s*)?([A-Z]{3}[-\s]?[0-9][A-Z0-9][0-9]{2})\b/i)?.[1] || '',
  );
  const patrimonio =
    line.match(/\b(?:patrim[oô]nio(?:s)?\s*(?:n[ºo.]*\s*)?[:\-]?\s*)?([A-Z]\d{1,3}\.\d{1,5})\b/i)?.[1]?.trim() ||
    line.match(/\bpatrim[oô]nio(?:s)?\s*(?:n[ºo.]*\s*)?[:\-]?\s*([A-Z0-9][A-Z0-9./-]{1,29})\b/i)?.[1]?.trim() ||
    '';
  if (!plate && !patrimonio) return null;
  const descricao = line
    .replace(/\bplaca\s*[:\-]?\s*[A-Z]{3}[-\s]?[0-9][A-Z0-9][0-9]{2}\b/i, '')
    .replace(/\b(?:patrim[oô]nio(?:s)?\s*(?:n[ºo.]*\s*)?[:\-]?\s*)?[A-Z]\d{1,3}\.\d{1,5}\b/i, '')
    .replace(/^[\s\-–—:]+|[\s\-–—:]+$/g, '')
    .trim();
  return { placa: plate, patrimonio, descricao };
};

const parseMessage = (rawText: string) => {
  const lines = String(rawText || '')
    .replace(/\r/g, '')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  let current: Context = { cliente: '', local: '', responsavel: '' };
  const items: Item[] = [];
  let pending: number[] = [];

  for (const line of lines) {
    const foundContext = parseContext(line);
    const hasContext = Boolean(foundContext.cliente || foundContext.local || foundContext.responsavel);
    const item = parseItem(line);

    if (item) {
      const next: Item = { ...item, ...current };
      items.push(next);
      if (!next.cliente || !next.local) pending.push(items.length - 1);
    }

    if (hasContext) {
      current = {
        cliente: foundContext.cliente || current.cliente,
        local: foundContext.local || current.local,
        responsavel: foundContext.responsavel || current.responsavel,
      };
      if (pending.length && (foundContext.cliente || foundContext.local)) {
        for (const index of pending) {
          items[index] = {
            ...items[index],
            cliente: foundContext.cliente || items[index].cliente || current.cliente,
            local: foundContext.local || items[index].local || current.local,
            responsavel: foundContext.responsavel || items[index].responsavel || current.responsavel,
          };
        }
        pending = [];
      }
    }
  }

  if (pending.length) {
    for (const index of pending) {
      items[index] = {
        ...items[index],
        cliente: items[index].cliente || current.cliente,
        local: items[index].local || current.local,
        responsavel: items[index].responsavel || current.responsavel,
      };
    }
  }

  if (!items.length) {
    const compact = String(rawText || '').replace(/\s+/g, ' ');
    const globalContext = parseContext(compact);
    const plateMatches = [...compact.matchAll(/\b([A-Z]{3}[-\s]?[0-9][A-Z0-9][0-9]{2})\b/gi)];
    for (const match of plateMatches) {
      items.push({
        placa: normalizePlate(match[1]),
        patrimonio: '',
        descricao: '',
        cliente: globalContext.cliente || '',
        local: globalContext.local || '',
        responsavel: globalContext.responsavel || '',
      });
    }
  }

  const groups = new Map<string, { cliente: string; local: string; responsavel: string; itens: Array<{ placa: string; patrimonio: string; descricao: string }> }>();
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
      (item.placa && candidate.placa === item.placa) ||
      (item.patrimonio && normalize(candidate.patrimonio) === normalize(item.patrimonio)),
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

  const groups = parseMessage(text);
  if (!groups.length) return json({ error: 'Nenhuma placa ou patrimônio foi identificado na mensagem.' }, 422);

  return json({ ok: true, groups, originalText: text, groupingRule: 'cliente+local' });
}
