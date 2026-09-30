const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

const OPENAI_MODELS = ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"];
const LOVABLE_MODEL = "google/gemini-2.5-flash";
const VERCEL_OCR_FALLBACK = "https://rh-prospera-hub-70cb89a5.vercel.app/api/abastecimento-ocr";

const pumpSchema = {
  type: "object",
  additionalProperties: false,
  required: ["ok", "valor", "litros", "valor_por_litro", "confianca", "motivo"],
  properties: {
    ok: { type: "boolean" },
    valor: { type: ["number", "null"] },
    litros: { type: ["number", "null"] },
    valor_por_litro: { type: ["number", "null"] },
    confianca: { type: "number", minimum: 0, maximum: 1 },
    motivo: { type: "string" },
  },
};

const panelSchema = {
  type: "object",
  additionalProperties: false,
  required: ["ok", "km", "confianca", "motivo"],
  properties: {
    ok: { type: "boolean" },
    km: { type: ["number", "null"] },
    confianca: { type: "number", minimum: 0, maximum: 1 },
    motivo: { type: "string" },
  },
};

const pumpPrompt = `Analise visualmente esta FOTO REAL do visor de uma bomba de combustivel brasileira como uma pessoa olhando a imagem inteira.
Associe cada numero ao ROTULO impresso correto.

Extraia somente:
- TOTAL A PAGAR / TOTAL R$ => valor
- LITROS / VOLUME => litros
- PRECO POR LITRO => valor_por_litro

REGRAS:
- Nao leia como texto corrido. Entenda o contexto visual do visor.
- Displays de sete segmentos podem confundir 1/7, 3/9, 5/6/8; confira cada digito no contexto.
- Preserve exatamente as casas decimais visiveis. Ex.: 257,24 => 257.24; 37,941 => 37.941; 6,780 => 6.780.
- Nao altere TOTAL ou LITROS apenas para a matematica fechar.
- Se TOTAL e LITROS estiverem legiveis, ok=true, mesmo que PRECO POR LITRO esteja menos claro.
- Se o preco por litro nao estiver legivel, valor_por_litro pode ser null.
- Ignore CNPJ, numero da bomba, placa, telefone, data, hora e outros textos.
- Nao invente digitos.`;

const panelPrompt = `Analise visualmente esta FOTO REAL do painel de um veiculo como uma pessoa olhando o painel inteiro.
Extraia SOMENTE a quilometragem TOTAL atual do hodometro/ODO.

REGRAS:
- Diferencie hodometro TOTAL de TRIP A/B, hora, autonomia, consumo, temperatura e velocidade.
- Ignore todos os demais numeros.
- Se aparecer 58.776 km no hodometro total, devolva 58776.
- Nao invente digitos.
- Se o hodometro total estiver claramente legivel, ok=true.`;

function extractOutputText(payload: any): string {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) return payload.output_text.trim();
  for (const item of payload?.output || []) {
    for (const part of item?.content || []) {
      if ((part?.type === "output_text" || part?.type === "text") && typeof part?.text === "string" && part.text.trim()) return part.text.trim();
    }
  }
  return "";
}

function parseStructured(text: string): Record<string, any> | null {
  const clean = String(text || "").replace(/```json|```/gi, "").trim();
  if (!clean) return null;
  try { return JSON.parse(clean); } catch {}
  const a = clean.indexOf("{");
  const b = clean.lastIndexOf("}");
  if (a >= 0 && b > a) {
    try { return JSON.parse(clean.slice(a, b + 1)); } catch {}
  }
  return null;
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value == null) return null;
  let raw = String(value).trim().replace(/\s/g, "").replace(/[^\d.,-]/g, "");
  if (!raw) return null;
  const comma = raw.lastIndexOf(",");
  const dot = raw.lastIndexOf(".");
  if (comma > dot) raw = raw.replace(/\./g, "").replace(",", ".");
  else if (dot > comma) raw = raw.replace(/,/g, "");
  else raw = raw.replace(",", ".");
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function kmOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value >= 1000) return Math.round(value);
    if (value > 1 && value < 1000) {
      const decimals = String(value).split(".")[1]?.length || 0;
      if (decimals === 3) return Math.round(value * 1000);
    }
  }
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) && n >= 1000 ? Math.round(n) : null;
}

function normalizeResult(parsed: Record<string, any>, isPanel: boolean) {
  if (isPanel) {
    const km = kmOrNull(parsed.km ?? parsed.km_atual ?? parsed.odo ?? parsed.hodometro);
    if (!km || km > 9999999) return null;
    return {
      ok: true,
      km,
      km_atual: km,
      confianca: Number(parsed.confianca ?? parsed.confidence ?? 0.95),
      motivo: String(parsed.motivo || "KM identificado visualmente."),
    };
  }
  const valor = numberOrNull(parsed.valor ?? parsed.total ?? parsed.total_a_pagar ?? parsed.valor_total);
  const litros = numberOrNull(parsed.litros ?? parsed.volume ?? parsed.quantidade_litros);
  let preco = numberOrNull(parsed.valor_por_litro ?? parsed.preco_litro ?? parsed.preco_por_litro);
  if (!valor || valor < 5 || valor > 10000 || !litros || litros < 0.5 || litros > 500) return null;
  if (!preco || preco < 1.5 || preco > 30) preco = valor / litros;
  return {
    ok: true,
    valor,
    litros,
    valor_por_litro: preco,
    confianca: Number(parsed.confianca ?? parsed.confidence ?? 0.95),
    motivo: String(parsed.motivo || "Valor e litros identificados visualmente."),
  };
}

async function imageToDataUrl(source: string): Promise<string> {
  if (source.startsWith("data:image/")) return source;
  const response = await fetch(source, { headers: { "User-Agent": "TOPAC-RH-PRO/1.0" } });
  if (!response.ok) throw new Error(`imagem_http_${response.status}`);
  const contentType = response.headers.get("content-type") || "image/jpeg";
  if (!contentType.startsWith("image/")) throw new Error("arquivo_nao_e_imagem");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length) throw new Error("imagem_vazia");
  if (bytes.length > 12_000_000) throw new Error("imagem_muito_grande");
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return `data:${contentType};base64,${btoa(binary)}`;
}

async function callOpenAI(apiKey: string, model: string, image: string, prompt: string, schema: any, formatName: string) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      reasoning: { effort: "low" },
      input: [{ role: "user", content: [
        { type: "input_text", text: prompt },
        { type: "input_image", image_url: image, detail: "high" },
      ] }],
      text: { format: { type: "json_schema", name: formatName, strict: true, schema } },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return { error: String(payload?.error?.message || payload?.error?.code || `openai_${response.status}`), parsed: null };
  return { error: "", parsed: parseStructured(extractOutputText(payload)) };
}

async function callLovable(apiKey: string, image: string, prompt: string, isPanel: boolean) {
  const shape = isPanel
    ? '{"ok":true,"km":58776,"confianca":0.99,"motivo":"legivel"}'
    : '{"ok":true,"valor":257.24,"litros":37.941,"valor_por_litro":6.780,"confianca":0.99,"motivo":"legivel"}';
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: LOVABLE_MODEL,
      messages: [
        { role: "system", content: `${prompt}\nRetorne SOMENTE JSON valido no formato ${shape}` },
        { role: "user", content: [
          { type: "text", text: "Olhe a foto inteira e leia os dados solicitados visualmente." },
          { type: "image_url", image_url: { url: image } },
        ] },
      ],
      response_format: { type: "json_object" },
      temperature: 0,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return { error: String(payload?.error?.message || payload?.error?.code || `lovable_${response.status}`), parsed: null };
  return { error: "", parsed: parseStructured(payload?.choices?.[0]?.message?.content || "") };
}

async function callVercelFallback(source: string, tipo: string) {
  if (!source.startsWith("https://djfjnxmbvjgweqzjvqtr.supabase.co/storage/v1/object/public/")) return null;
  try {
    const response = await fetch(VERCEL_OCR_FALLBACK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileUrl: source, tipo }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.ok) return null;
    return { ...payload, modo: "backend_topac_fallback" };
  } catch {
    return null;
  }
}

async function analyzeImage(source: string, tipo: string) {
  const openaiKey = Deno.env.get("OPENAI_API_KEY") || "";
  const lovableKey = Deno.env.get("LOVABLE_API_KEY") || "";
  if (!openaiKey && !lovableKey) {
    const fallback = await callVercelFallback(source, tipo);
    if (fallback) return fallback;
    throw new Error("PROVEDOR_VISUAL_NAO_CONFIGURADO");
  }

  const image = await imageToDataUrl(source);
  const isPanel = tipo === "painel_km";
  const prompt = isPanel ? panelPrompt : pumpPrompt;
  const schema = isPanel ? panelSchema : pumpSchema;
  const formatName = isPanel ? "leitura_hodometro" : "leitura_bomba_combustivel";
  const attempts: Array<Record<string, any>> = [];

  if (openaiKey) {
    for (const model of OPENAI_MODELS) {
      const result = await callOpenAI(openaiKey, model, image, prompt, schema, formatName);
      const normalized = result.parsed ? normalizeResult(result.parsed, isPanel) : null;
      attempts.push({ provider: "openai", model, ok: !!normalized, error: result.error || null });
      if (normalized) return { ...normalized, provider: "openai", model, modo: "visao_multimodal_direta_base64", attempts };
    }
  }

  if (lovableKey) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const result = await callLovable(lovableKey, image, prompt, isPanel);
      const normalized = result.parsed ? normalizeResult(result.parsed, isPanel) : null;
      attempts.push({ provider: "lovable", model: LOVABLE_MODEL, attempt, ok: !!normalized, error: result.error || null });
      if (normalized) return { ...normalized, provider: "lovable", model: LOVABLE_MODEL, modo: "visao_multimodal_direta_base64", attempts };
    }
  }

  const fallback = await callVercelFallback(source, tipo);
  if (fallback) return fallback;

  return {
    ok: false,
    error: "nao_foi_possivel_confirmar_imagem",
    motivo: isPanel ? "Nao foi possivel confirmar o hodometro total." : "Nao foi possivel confirmar total e litros.",
    provider: openaiKey ? "openai" : "lovable",
    model: openaiKey ? OPENAI_MODELS[0] : LOVABLE_MODEL,
    modo: "visao_multimodal_direta_base64",
    attempts,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ ok: false, error: "method_not_allowed" }), { status: 405, headers: jsonHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const imageUrl = typeof body?.dataUrl === "string" && body.dataUrl ? body.dataUrl : String(body?.fileUrl || "");
    const tipo = String(body?.tipo || "bomba");
    if (!imageUrl) return new Response(JSON.stringify({ ok: false, error: "imagem_obrigatoria" }), { status: 400, headers: jsonHeaders });
    const result = await analyzeImage(imageUrl, tipo);
    return new Response(JSON.stringify(result), { status: 200, headers: jsonHeaders });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("Falha na leitura visual TOPAC:", detail);
    return new Response(JSON.stringify({ ok: false, error: "erro_leitura_visual", detail }), { status: 200, headers: jsonHeaders });
  }
});