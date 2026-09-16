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

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return send(res, { ok: false, error: 'method_not_allowed' }, 405);
  const fileUrl = safeImageUrl(req.body?.fileUrl);
  const tipo = String(req.body?.tipo || 'bomba');
  if (!fileUrl) return send(res, { ok: false, error: 'imagem_invalida' }, 400);
  if (!['bomba', 'painel_km'].includes(tipo)) return send(res, { ok: false, error: 'tipo_invalido' }, 400);

  const token = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || '';
  if (!token) return send(res, { ok: false, error: 'ai_gateway_nao_configurado' }, 503);

  const prompt = tipo === 'painel_km' ? panelPrompt : pumpPrompt;
  try {
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
    if (!response.ok) return send(res, { ok: false, error: 'ai_gateway_error', detail: String(payload?.error?.message || response.status) }, 200);

    const content = payload?.choices?.[0]?.message?.content;
    const parsed = parseJson(content);
    if (!parsed) return send(res, { ok: false, error: 'resposta_visual_invalida' }, 200);

    if (tipo === 'painel_km') {
      const km = kmOrNull(parsed.km ?? parsed.km_atual ?? parsed.odo ?? parsed.hodometro);
      if (!parsed.ok || !km) return send(res, { ok: false, error: 'km_nao_confirmado', motivo: parsed.motivo || '' }, 200);
      return send(res, { ok: true, km, km_atual: km, confianca: Number(parsed.confianca ?? 0.95), motivo: String(parsed.motivo || 'KM identificado visualmente.'), provider: 'vercel-ai-gateway', model: MODEL });
    }

    const valor = numberOrNull(parsed.valor ?? parsed.total ?? parsed.total_a_pagar ?? parsed.valor_total);
    const litros = numberOrNull(parsed.litros ?? parsed.volume ?? parsed.quantidade_litros);
    let preco = numberOrNull(parsed.valor_por_litro ?? parsed.preco_litro ?? parsed.preco_por_litro);
    if (!parsed.ok || !valor || valor < 5 || valor > 10000 || !litros || litros < 0.5 || litros > 500) {
      return send(res, { ok: false, error: 'bomba_nao_confirmada', motivo: parsed.motivo || '' }, 200);
    }
    if (!preco || preco < 1.5 || preco > 30) preco = valor / litros;
    return send(res, { ok: true, valor, litros, valor_por_litro: Number(preco.toFixed(3)), confianca: Number(parsed.confianca ?? 0.95), motivo: String(parsed.motivo || 'Valor e litros identificados visualmente.'), provider: 'vercel-ai-gateway', model: MODEL });
  } catch (error) {
    return send(res, { ok: false, error: 'erro_leitura_visual', detail: error instanceof Error ? error.message : String(error) }, 200);
  }
}
