// Edge function: ocr-bomba-combustivel
// Reads fuel-pump displays and vehicle odometers for the mechanic app.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function collectApiKeys(value: unknown, keys: string[]): void {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) keys.push(trimmed);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectApiKeys(item, keys));
    return;
  }
  if (value && typeof value === "object") {
    Object.values(value).forEach((item) => collectApiKeys(item, keys));
  }
}

function configuredApiKeys(): string[] {
  const keys: string[] = [];
  collectApiKeys(Deno.env.get("SUPABASE_PUBLISHABLE_KEY"), keys);
  collectApiKeys(Deno.env.get("SUPABASE_ANON_KEY"), keys);
  const configured = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if (configured) {
    try {
      collectApiKeys(JSON.parse(configured), keys);
    } catch {
      configured.split(",").forEach((value) => collectApiKeys(value, keys));
    }
  }
  return [...new Set(keys)];
}

function hasAllowedApiKey(req: Request): boolean {
  const apiKey = req.headers.get("apikey")?.trim() || "";
  const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const supplied = [apiKey, bearer].filter(Boolean);
  const configured = configuredApiKeys();

  if (configured.length > 0 && supplied.some((value) => configured.includes(value))) return true;

  // Supabase publishable keys are public client credentials. If the project runtime
  // does not expose the publishable key as an env var, still require a valid-shaped
  // Supabase client credential instead of leaving the function completely open.
  return supplied.some((value) => value.startsWith("sb_publishable_") || value.split(".").length === 3);
}

const PUMP_PROMPT = `Voce faz leitura visual de uma FOTO REAL do visor de uma bomba de combustivel em posto brasileiro.
Sua tarefa e extrair os numeros que aparecem nos displays da bomba e devolver SOMENTE JSON valido, sem markdown.

Formato obrigatorio:
{
  "ok": boolean,
  "valor": numero,
  "litros": numero,
  "valor_por_litro": numero,
  "combustivel": "Gasolina" | "Etanol" | "Diesel" | "Diesel S10" | "GNV" | "",
  "confianca": numero entre 0 e 1,
  "motivo": "texto curto"
}

Regras de leitura:
- VALOR = total abastecido em reais (TOTAL, R$, VALOR A PAGAR).
- LITROS = volume abastecido (L, LITROS, VOLUME, QTD).
- VALOR_POR_LITRO = preco unitario (R$/L, PRECO/L, P.UNIT, UNITARIO).
- Priorize os DIGITOS GRANDES dos displays digitais da bomba.
- Preserve corretamente virgula/ponto decimal; nao transforme 25,430 L em 25430 L.
- Se houver tres displays grandes empilhados, normalmente: superior = valor total, meio = litros, inferior = preco por litro. Use as etiquetas ao lado para confirmar.
- Ignore CNPJ, data, hora, numero da bomba, codigo do bico, placa, KM, telefone e textos pequenos.
- Se valor e litros forem claros, voce pode calcular valor_por_litro = valor/litros.
- Se litros e preco forem claros, voce pode calcular valor = litros*preco.
- Nao chute digitos que nao estejam visiveis.
- ok=true quando VALOR e LITROS estiverem legiveis e fizerem sentido juntos.
- Foto cortada, tremida, refletida ou sem os displays principais: ok=false.
- Se nao conseguir ler um campo, use 0 ou string vazia.
Apenas JSON puro.`;

const PANEL_PROMPT = `Voce faz leitura visual de uma FOTO REAL do painel de um veiculo.
Extraia SOMENTE a quilometragem TOTAL atual do hodometro/ODO e devolva SOMENTE JSON valido.

Formato obrigatorio:
{
  "ok": boolean,
  "km": numero,
  "confianca": numero entre 0 e 1,
  "motivo": "texto curto"
}

Regras:
- km = quilometragem total atual do veiculo, sem separador de milhar.
- Procure ODO, ODOMETER, KM total, hodometro ou numero seguido de km.
- Ignore velocidade, hora HH:MM, temperatura, autonomia, consumo, trip A, trip B e marcador parcial.
- Se houver mais de um numero, escolha o que representa a quilometragem acumulada total.
- Nao chute digitos nao visiveis.
- ok=true somente quando o hodometro estiver legivel.
- Foto cortada, tremida, refletida ou sem hodometro legivel: ok=false.
Apenas JSON puro.`;

function clamp01(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(1, parsed));
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Number.isFinite(value) ? Math.round(value * factor) / factor : 0;
}

function parseBrNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  let raw = String(value ?? "").trim().replace(/\s/g, "");
  if (!raw) return 0;
  raw = raw.replace(/[^\d.,-]/g, "");
  if (!raw) return 0;

  const comma = raw.lastIndexOf(",");
  const dot = raw.lastIndexOf(".");
  let normalized = raw;

  if (comma > dot) normalized = raw.replace(/\./g, "").replace(",", ".");
  else if (dot > comma) normalized = raw.replace(/,/g, "");
  else normalized = raw.replace(",", ".");

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseKm(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value) && Number.isInteger(value)) return value;
  const digits = String(value ?? "").replace(/\D/g, "");
  const parsed = Number(digits);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseJsonContent(content: string): Record<string, unknown> {
  const cleaned = String(content || "").replace(/```json|```/gi, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        return {};
      }
    }
    return {};
  }
}

function normalizeFuel(value: unknown): string {
  const raw = String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (!raw) return "";
  if (raw.includes("s10")) return "Diesel S10";
  if (raw.includes("diesel")) return "Diesel";
  if (raw.includes("etanol") || raw.includes("alcool") || raw.includes("alcohol")) return "Etanol";
  if (raw.includes("gnv")) return "GNV";
  if (raw.includes("gasolina") || raw === "gas") return "Gasolina";
  return "";
}

function plausible(value: number, kind: "valor" | "litros" | "preco" | "km"): boolean {
  if (!Number.isFinite(value) || value <= 0) return false;
  if (kind === "valor") return value >= 5 && value <= 10000;
  if (kind === "litros") return value >= 0.5 && value <= 500;
  if (kind === "preco") return value >= 1.5 && value <= 30;
  return value >= 1000 && value <= 9999999;
}

function reconcilePump(valorInput: number, litrosInput: number, precoInput: number) {
  let valor = valorInput;
  let litros = litrosInput;
  let preco = precoInput;

  // Common OCR swap: unit price lands in total and total lands in unit price.
  if (plausible(valor, "preco") && plausible(preco, "valor")) {
    const tmp = valor;
    valor = preco;
    preco = tmp;
  }

  // Common OCR swap between total and liters.
  if (valor > 0 && litros > 0 && litros > valor) {
    const normalPrice = valor / litros;
    const swappedPrice = litros / valor;
    if (normalPrice < 1.5 && swappedPrice >= 1.5 && swappedPrice <= 30) {
      const tmp = valor;
      valor = litros;
      litros = tmp;
    }
  }

  if (!plausible(preco, "preco") && plausible(valor, "valor") && plausible(litros, "litros")) {
    preco = valor / litros;
  }
  if (!plausible(valor, "valor") && plausible(litros, "litros") && plausible(preco, "preco")) {
    valor = litros * preco;
  }
  if (!plausible(litros, "litros") && plausible(valor, "valor") && plausible(preco, "preco")) {
    litros = valor / preco;
  }

  return {
    valor: plausible(valor, "valor") ? round(valor, 2) : 0,
    litros: plausible(litros, "litros") ? round(litros, 3) : 0,
    preco: plausible(preco, "preco") ? round(preco, 3) : 0,
  };
}

async function callVisionProvider(imageUrl: string, isPanel: boolean) {
  const prompt = isPanel ? PANEL_PROMPT : PUMP_PROMPT;
  const instruction = isPanel
    ? "Leia o ODO/hodometro total desta foto e retorne o KM atual."
    : "Leia os displays digitais da bomba: valor total, litros e preco por litro.";

  const openAiKey = Deno.env.get("OPENAI_API_KEY");
  if (openAiKey) {
    const model = Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini";
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${openAiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: prompt },
          {
            role: "user",
            content: [
              { type: "text", text: instruction },
              { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
            ],
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0,
      }),
    });
    return { provider: "openai", resp };
  }

  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  if (lovableKey) {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${lovableKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: prompt },
          {
            role: "user",
            content: [
              { type: "text", text: instruction },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0,
      }),
    });
    return { provider: "lovable", resp };
  }

  return { provider: "none", resp: null as Response | null };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!hasAllowedApiKey(req)) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const dataUrl = typeof body.dataUrl === "string" ? body.dataUrl : "";
    const fileUrl = typeof body.fileUrl === "string" ? body.fileUrl : "";
    const tipo = String(body.tipo || "bomba");
    const isPanel = tipo === "painel_km";
    const imageUrl = dataUrl || fileUrl;

    if (!imageUrl) {
      return new Response(JSON.stringify({ ok: false, error: "imagem_obrigatoria" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { provider, resp } = await callVisionProvider(imageUrl, isPanel);
    if (!resp) {
      return new Response(JSON.stringify({ ok: false, error: "OCR_PROVIDER_ENV_AUSENTE" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!resp.ok) {
      const detail = await resp.text();
      return new Response(JSON.stringify({ ok: false, error: "ai_error", provider, detail }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResponse = await resp.json();
    const content = aiResponse?.choices?.[0]?.message?.content || "{}";
    const parsed = parseJsonContent(content);
    const explicitConfidence = parsed.confianca ?? parsed.confidence;
    const confidence = explicitConfidence == null
      ? (parsed.ok === false ? 0.35 : 0.75)
      : clamp01(explicitConfidence, 0);

    if (isPanel) {
      const km = parseKm(parsed.km ?? parsed.km_atual ?? parsed.odometro ?? parsed.hodometro ?? parsed.odo);
      const ok = plausible(km, "km") && confidence >= 0.5;
      return new Response(JSON.stringify({
        ok,
        km: plausible(km, "km") ? Math.round(km) : 0,
        km_atual: plausible(km, "km") ? Math.round(km) : 0,
        confianca: confidence,
        motivo: ok ? "KM identificado automaticamente." : String(parsed.motivo || "Nao foi possivel confirmar o KM com seguranca."),
        provider,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const rawValor = parseBrNumber(parsed.valor ?? parsed.valor_total ?? parsed.total ?? parsed.total_pagar ?? parsed.valor_a_pagar);
    const rawLitros = parseBrNumber(parsed.litros ?? parsed.quantidade_litros ?? parsed.volume ?? parsed.quantidade ?? parsed.qtd);
    const rawPreco = parseBrNumber(parsed.valor_por_litro ?? parsed.preco_litro ?? parsed.preco_por_litro ?? parsed.preco_unitario ?? parsed.unitario ?? parsed.r_l);
    const fields = reconcilePump(rawValor, rawLitros, rawPreco);

    const calc = fields.litros > 0 && fields.preco > 0 ? round(fields.litros * fields.preco, 2) : 0;
    const diff = calc > 0 && fields.valor > 0 ? Math.abs(calc - fields.valor) : 0;
    const consistent = fields.valor > 0 && fields.litros > 0 && fields.preco > 0 && diff <= Math.max(0.35, fields.valor * 0.035);
    const ok = consistent && confidence >= 0.5;

    return new Response(JSON.stringify({
      ok,
      valor: fields.valor,
      litros: fields.litros,
      valor_por_litro: fields.preco,
      combustivel: normalizeFuel(parsed.combustivel ?? parsed.tipo_combustivel ?? parsed.produto),
      confianca: confidence,
      motivo: ok ? "Valor e litros identificados automaticamente." : String(parsed.motivo || "Nao foi possivel confirmar valor e litros com seguranca."),
      provider,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ ok: false, error: "erro_ocr", detail }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
