import { createWorker } from 'tesseract.js';

const MODEL = 'google/gemini-2.5-flash';
const ALLOWED_HOST = 'djfjnxmbvjgweqzjvqtr.supabase.co';
const ALLOWED_PATH = '/storage/v1/object/public/abastecimento-fotos/';

const send = (res: any, body: unknown, status = 200) =>
  res.status(status).setHeader('Cache-Control', 'no-store').json(body);

const numberOrNull = (value: unknown) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value == null) return null;
  let raw = String(value).trim().replace(/\s/g, '').replace(/[^\d.,-]/g, '');
  if (!raw) return null;
  const comma = raw.lastIndexOf(',');
  const dot = raw.lastIndexOf('.');
  if (comma > dot) raw = raw.replace(/\./g, '').replace(',', '.');
  else if (dot > comma) raw = raw.replace(/,/g, '');
  else raw = raw.replace(',', '.');
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
};

const kmOrNull = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value >= 1000 && value <= 9_999_999) return Math.round(value);
    if (value > 1 && value < 1000 && String(value).split('.')[1]?.length === 3) return Math.round(value * 1000);
  }
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) && n >= 1000 && n <= 9_999_999 ? Math.round(n) : null;
};

const safeImageUrl = (raw: unknown) => {
  const value = String(raw || '').trim();
  if (!value) return '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== ALLOWED_HOST || !url.pathname.startsWith(ALLOWED_PATH)) return '';
    return url.toString();
  } catch { return ''; }
};

const parseJson = (value: unknown) => {
  const raw = String(value || '').replace(/```json|```/gi, '').trim();
  if (!raw) return null;
  try { return JSON.parse(raw); } catch {}
  const a = raw.indexOf('{');
  const b = raw.lastIndexOf('}');
  if (a >= 0 && b > a) {
    try { return JSON.parse(raw.slice(a, b + 1)); } catch {}
  }
  return null;
};

const pumpPrompt = `Analise visualmente esta FOTO REAL do visor de uma bomba de combustivel brasileira.
Extraia SOMENTE os numeros associados aos rotulos corretos:
- TOTAL A PAGAR / TOTAL R$ => valor
- LITROS / VOLUME => litros
- PRECO POR LITRO => valor_por_litro
Nao invente digitos. Preserve as casas decimais visiveis. Ignore CNPJ, data, hora, numero da bomba e outros textos.
Retorne SOMENTE JSON: {"ok":true,"valor":257.24,"litros":37.941,"valor_por_litro":6.780,"confianca":0.99,"motivo":"legivel"}.
Se total e litros nao estiverem legiveis, retorne ok=false e os campos como null.`;

const panelPrompt = `Analise visualmente esta FOTO REAL do painel de um veiculo.
Extraia SOMENTE a quilometragem TOTAL atual do hodometro/ODO.
Diferencie hodometro TOTAL de TRIP A/B, hora, autonomia, consumo, temperatura e velocidade.
Nao invente digitos. Exemplo: se aparecer 58.776 km, retorne 58776.
Retorne SOMENTE JSON: {"ok":true,"km":58776,"confianca":0.99,"motivo":"legivel"}.
Se o hodometro total nao estiver legivel, retorne ok=false e km=null.`;

const normalizeOcrText = (value: string) => value
  .toUpperCase()
  .replace(/[OQ]/g, '0')
  .replace(/(?<=\d)[IL](?=\d)/g, '1')
  .replace(/[–—]/g, '-');

const decimalTokens = (text: string) => Array.from(normalizeOcrText(text).matchAll(/\b\d{1,6}[.,]\d{2,3}\b/g))
  .map(m => numberOrNull(m[0]))
  .filter((v): v is number => v != null);

const labeledNumber = (text: string, patterns: RegExp[]) => {
  const normalized = normalizeOcrText(text);
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    const value = numberOrNull(match?.[1]);
    if (value != null) return value;
  }
  return null;
};

const parsePumpText = (text: string) => {
  let valor = labeledNumber(text, [
    /(?:TOTAL\s*A\s*PAGAR|TOTAL\s*R\$|VALOR\s*TOTAL|TOTAL|VALOR|R\$)\D{0,20}(\d{1,6}[.,]\d{2})/,
  ]);
  let litros = labeledNumber(text, [
    /(?:LITROS?|VOLUME|QUANTIDADE|QTD)\D{0,20}(\d{1,5}[.,]\d{2,3})/,
  ]);
  let preco = labeledNumber(text, [
    /(?:PRE[CÇ]O\s*(?:POR\s*)?LITRO|PRE[CÇ]O\s*UNIT|VALOR\s*LITRO|R\$\s*\/\s*L)\D{0,20}(\d{1,3}[.,]\d{2,3})/,
  ]);

  const tokens = decimalTokens(text);
  const totals = tokens.filter(v => v >= 5 && v <= 10000);
  const volumes = tokens.filter(v => v >= 0.5 && v <= 500);
  const prices = tokens.filter(v => v >= 1.5 && v <= 30);
  let best: { total: number; volume: number; price: number; error: number } | null = null;

  for (const total of totals) {
    for (const volume of volumes) {
      if (Math.abs(total - volume) < 0.0001) continue;
      for (const price of prices) {
        const error = Math.abs(total - volume * price) / Math.max(total, 1);
        if (error <= 0.025 && (!best || error < best.error)) best = { total, volume, price, error };
      }
    }
  }

  if (best) {
    valor ??= best.total;
    litros ??= best.volume;
    preco ??= best.price;
  }
  if (valor && litros && (!preco || preco < 1.5 || preco > 30)) preco = valor / litros;

  if (!valor || valor < 5 || valor > 10000 || !litros || litros < 0.5 || litros > 500) return null;
  if (!preco || preco < 1.5 || preco > 30) return null;
  const arithmeticError = Math.abs(valor - litros * preco) / Math.max(valor, 1);
  if (arithmeticError > 0.04) return null;
  return { valor, litros, valor_por_litro: Number(preco.toFixed(3)), confianca: best ? 0.90 : 0.82 };
};

const parsePanelText = (text: string) => {
  const normalized = normalizeOcrText(text).replace(/(?<=\d)[. ](?=\d{3}\b)/g, '');
  const labeled = normalized.match(/(?:ODO(?:METRO)?|HOD(?:OMETRO)?|KM)\D{0,24}(\d[\d .]{3,10})/i);
  const byLabel = kmOrNull(labeled?.[1]);
  if (byLabel) return { km: byLabel, confianca: 0.90 };

  const candidates = Array.from(normalized.matchAll(/\b\d{4,7}\b/g))
    .map(m => Number(m[0]))
    .filter(v => v >= 1000 && v <= 9_999_999)
    .filter(v => v < 20_000 || v > 20_999);
  if (!candidates.length) return null;
  const km = Math.max(...candidates);
  return { km, confianca: candidates.length === 1 ? 0.82 : 0.72 };
};

const localOcr = async (fileUrl: string, tipo: string) => {
  const image = await fetch(fileUrl, { headers: { 'User-Agent': 'TOPAC-RH-PRO/1.0' } });
  if (!image.ok) throw new Error(`imagem_http_${image.status}`);
  const bytes = Buffer.from(await image.arrayBuffer());
  if (!bytes.length || bytes.length > 12_000_000) throw new Error('imagem_invalida');

  const worker = await createWorker('eng', 1, { cachePath: '/tmp/tesseract-cache' });
  try {
    await worker.setParameters({
      preserve_interword_spaces: '1',
      tessedit_pageseg_mode: '6',
    } as any);
    const result = await worker.recognize(bytes);
    const text = String(result?.data?.text || '');
    if (tipo === 'painel_km') {
      const parsed = parsePanelText(text);
      return parsed ? { ok: true, km: parsed.km, km_atual: parsed.km, confianca: parsed.confianca, motivo: 'Leitura OCR local do hodômetro.', provider: 'tesseract-local' } : { ok: false, error: 'km_nao_confirmado', motivo: 'Não foi possível confirmar o hodômetro na foto.', provider: 'tesseract-local' };
    }
    const parsed = parsePumpText(text);
    return parsed ? { ok: true, ...parsed, motivo: 'Leitura OCR local da bomba validada pela relação valor x litros x preço.', provider: 'tesseract-local' } : { ok: false, error: 'bomba_nao_confirmada', motivo: 'Não foi possível confirmar total, litros e preço na foto.', provider: 'tesseract-local' };
  } finally {
    await worker.terminate();
  }
};

const gatewayOcr = async (fileUrl: string, tipo: string, token: string) => {
  const prompt = tipo === 'painel_km' ? panelPrompt : pumpPrompt;
  const response = await fetch('https://ai-gateway.vercel.sh/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: fileUrl } },
      ] }],
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return null;
  const parsed = parseJson(payload?.choices?.[0]?.message?.content);
  if (!parsed) return null;

  if (tipo === 'painel_km') {
    const km = kmOrNull(parsed.km ?? parsed.km_atual ?? parsed.odo ?? parsed.hodometro);
    if (!parsed.ok || !km) return null;
    return { ok: true, km, km_atual: km, confianca: Number(parsed.confianca ?? 0.95), motivo: String(parsed.motivo || 'KM identificado visualmente.'), provider: 'vercel-ai-gateway', model: MODEL };
  }

  const valor = numberOrNull(parsed.valor ?? parsed.total ?? parsed.total_a_pagar ?? parsed.valor_total);
  const litros = numberOrNull(parsed.litros ?? parsed.volume ?? parsed.quantidade_litros);
  let preco = numberOrNull(parsed.valor_por_litro ?? parsed.preco_litro ?? parsed.preco_por_litro);
  if (!parsed.ok || !valor || valor < 5 || valor > 10000 || !litros || litros < 0.5 || litros > 500) return null;
  if (!preco || preco < 1.5 || preco > 30) preco = valor / litros;
  const arithmeticError = Math.abs(valor - litros * preco) / Math.max(valor, 1);
  if (arithmeticError > 0.04) return null;
  return { ok: true, valor, litros, valor_por_litro: Number(preco.toFixed(3)), confianca: Number(parsed.confianca ?? 0.95), motivo: String(parsed.motivo || 'Valor e litros identificados visualmente.'), provider: 'vercel-ai-gateway', model: MODEL };
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return send(res, { ok: false, error: 'method_not_allowed' }, 405);
  const fileUrl = safeImageUrl(req.body?.fileUrl);
  const tipo = String(req.body?.tipo || 'bomba');
  if (!fileUrl) return send(res, { ok: false, error: 'imagem_invalida' }, 400);
  if (!['bomba', 'painel_km'].includes(tipo)) return send(res, { ok: false, error: 'tipo_invalido' }, 400);

  try {
    const token = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || '';
    if (token) {
      const gateway = await gatewayOcr(fileUrl, tipo, token).catch(() => null);
      if (gateway?.ok) return send(res, gateway);
    }

    const local = await localOcr(fileUrl, tipo);
    return send(res, local);
  } catch (error) {
    return send(res, { ok: false, error: 'erro_leitura_visual', detail: error instanceof Error ? error.message : String(error) }, 200);
  }
}
