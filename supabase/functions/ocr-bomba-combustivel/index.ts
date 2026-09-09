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
  return supplied.some((value) => value.startsWith("sb_publishable_") || value.split(".").length === 3);
}

const PUMP_PROMPT = `Analise UMA FOTO REAL do visor de uma bomba de combustivel em posto brasileiro.
Leia os tres displays principais e devolva SOMENTE JSON valido, sem markdown:
{
  "ok": boolean,
  "valor": numero,
  "litros": numero,
  "valor_por_litro": numero,
  "combustivel": "Gasolina" | "Etanol" | "Diesel" | "Diesel S10" | "GNV" | "",
  "confianca": numero entre 0 e 1,
  "motivo": "texto curto"
}
REGRAS:
- VALOR = TOTAL A PAGAR em reais.
- LITROS = quantidade abastecida.
- VALOR_POR_LITRO = PRECO POR LITRO.
- Em bombas brasileiras os displays costumam estar empilhados: em cima TOTAL A PAGAR, no meio LITROS, embaixo PRECO POR LITRO.
- Preserve casas decimais. Exemplos: 277,95 = 277.95; 40,995 = 40.995; 6,780 = 6.780.
- Se a pontuacao decimal estiver pouco visivel, use a relacao TOTAL = LITROS x PRECO/L para confirmar a posicao correta da virgula.
- Ignore hora, CNPJ, numero da bomba, placa, KM, telefone e textos pequenos.
- Nao invente digitos. Se dois dos tres numeros estiverem muito claros, o terceiro pode ser calculado.
- ok=true quando valor e litros puderem ser determinados de forma coerente.
Apenas JSON puro.`;

const PUMP_RETRY = `RELEIA A FOTO COM FOCO SOMENTE NOS TRES DISPLAYS GRANDES.
Identifique explicitamente: 1) TOTAL A PAGAR, 2) LITROS, 3) PRECO POR LITRO.
Confira matematicamente TOTAL = LITROS x PRECO/L e corrija virgula/ponto decimal quando necessario.
Retorne o mesmo JSON, sem explicacao.`;

const PANEL_PROMPT = `Analise UMA FOTO REAL do painel de um veiculo.
Extraia SOMENTE a quilometragem TOTAL atual do hodometro/ODO e devolva SOMENTE JSON valido:
{
  "ok": boolean,
  "km": numero,
  "confianca": numero entre 0 e 1,
  "motivo": "texto curto"
}
REGRAS:
- Leia ODO, KM total, hodometro ou quilometragem acumulada.
- Ignore velocidade, hora, temperatura, autonomia, consumo, Trip A e Trip B.
- Se aparecer separador de milhar, devolva o KM como inteiro. Ex.: 58.775 km = 58775.
- Nao invente digitos.
Apenas JSON puro.`;

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Number.isFinite(value) ? Math.round(value * factor) / factor : 0;
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

function baseNumber(value: unknown): number {
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

function numberCandidates(value: unknown, kind: "valor" | "litros" | "preco"): number[] {
  const base = baseNumber(value);
  if (!base) return [];
  const rawDigits = Number(String(value ?? "").replace(/\D/g, "")) || 0;
  const seeds = [base, rawDigits];
  const divisors = kind === "valor" ? [1, 10, 100, 1000] : [1, 10, 100, 1000, 10000];
  const out = new Set<number>();
  for (const seed of seeds) {
    if (!seed) continue;
    for (const divisor of divisors) {
      const candidate = seed / divisor;
      if (plausible(candidate, kind)) out.add(round(candidate, kind === "valor" ? 2 : 3));
    }
  }
  return [...out];
}

function choosePump(valorRaw: unknown, litrosRaw: unknown, precoRaw: unknown) {
  let valores = numberCandidates(valorRaw, "valor");
  let litros = numberCandidates(litrosRaw, "litros");
  let precos = numberCandidates(precoRaw, "preco");

  // If OCR missed one field, derive it from the other two.
  if (!valores.length && litros.length && precos.length) {
    valores = litros.flatMap((l) => precos.map((p) => round(l * p, 2))).filter((v) => plausible(v, "valor"));
  }
  if (!litros.length && valores.length && precos.length) {
    litros = valores.flatMap((v) => precos.map((p) => round(v / p, 3))).filter((l) => plausible(l, "litros"));
  }
  if (!precos.length && valores.length && litros.length) {
    precos = valores.flatMap((v) => litros.map((l) => round(v / l, 3))).filter((p) => plausible(p, "preco"));
  }

  let best: { valor: number; litros: number; preco: number; score: number } | null = null;
  for (const valor of valores) {
    for (const litro of litros) {
      for (const preco of precos) {
        const calc = litro * preco;
        const rel = Math.abs(calc - valor) / Math.max(valor, 1);
        // Prefer realistic Brazilian pump values and exact mathematical agreement.
        const pricePenalty = preco < 3 || preco > 12 ? 0.03 : 0;
        const score = rel + pricePenalty;
        if (!best || score < best.score) best = { valor, litros: litro, preco, score };
      }
    }
  }

  if (!best) return { ok: false, valor: 0, litros: 0, preco: 0 };
  const consistent = best.score <= 0.08;
  return {
    ok: consistent,
    valor: round(best.valor, 2),
    litros: round(best.litros, 3),
    preco: round(best.preco, 3),
  };
}

function parseKm(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (plausible(value, "km")) return Math.round(value);
    if (value > 1 && value < 1000) {
      const scaled = Math.round(value * 1000);
      if (plausible(scaled, "km")) return scaled;
    }
  }
  const digits = String(value ?? "").replace(/\D/g, "");
  const parsed = Number(digits);
  return plausible(parsed, "km") ? Math.round(parsed) : 0;
}

async function callVisionProvider(imageUrl: string, isPanel: boolean, retry = false) {
  const prompt = isPanel ? PANEL_PROMPT : PUMP_PROMPT;
  const instruction = isPanel
    ? "Leia o ODO/hodometro total desta foto e retorne o KM atual."
    : retry
      ? PUMP_RETRY
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
          { role: "user", content: [
            { type: "text", text: instruction },
            { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
          ] },
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
          { role: "user", content: [
            { type: "text", text: instruction },
            { type: "image_url", image_url: { url: imageUrl } },
          ] },
        ],
        response_format: { type: "json_object" },
        temperature: 0,
      }),
    });
    return { provider: "lovable", resp };
  }

  return { provider: "none", resp: null as Response | null };
}

async function readAi(imageUrl: string, isPanel: boolean, retry = false) {
  const { provider, resp } = await callVisionProvider(imageUrl, isPanel, retry);
  if (!resp) return { provider, parsed: {}, error: "OCR_PROVIDER_ENV_AUSENTE" };
  if (!resp.ok) return { provider, parsed: {}, error: `ai_error_${resp.status}` };
  const aiResponse = await resp.json();
  const content = aiResponse?.choices?.[0]?.message?.content || "{}";
  return { provider, parsed: parseJsonContent(content), error: "" };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ ok: false, error: "method_not_allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (!hasAllowedApiKey(req)) return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const body = await req.json().catch(() => ({}));
    const dataUrl = typeof body.dataUrl === "string" ? body.dataUrl : "";
    const fileUrl = typeof body.fileUrl === "string" ? body.fileUrl : "";
    const tipo = String(body.tipo || "bomba");
    const isPanel = tipo === "painel_km";
    const imageUrl = dataUrl || fileUrl;

    if (!imageUrl) return new Response(JSON.stringify({ ok: false, error: "imagem_obrigatoria" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    let first = await readAi(imageUrl, isPanel, false);
    if (first.error) return new Response(JSON.stringify({ ok: false, error: first.error, provider: first.provider }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    if (isPanel) {
      const parsed = first.parsed;
      const km = parseKm(parsed.km ?? parsed.km_atual ?? parsed.odometro ?? parsed.hodometro ?? parsed.odo);
      const ok = plausible(km, "km");
      return new Response(JSON.stringify({
        ok,
        km,
        km_atual: km,
        confianca: Number(parsed.confianca ?? parsed.confidence ?? (ok ? 0.8 : 0.3)),
        motivo: ok ? "KM identificado automaticamente." : String(parsed.motivo || "Nao foi possivel confirmar o KM."),
        provider: first.provider,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let parsed = first.parsed;
    let fields = choosePump(
      parsed.valor ?? parsed.valor_total ?? parsed.total ?? parsed.total_pagar ?? parsed.valor_a_pagar,
      parsed.litros ?? parsed.quantidade_litros ?? parsed.volume ?? parsed.quantidade ?? parsed.qtd,
      parsed.valor_por_litro ?? parsed.preco_litro ?? parsed.preco_por_litro ?? parsed.preco_unitario ?? parsed.unitario ?? parsed.r_l,
    );

    // A second visual read is much cheaper than forcing the mechanic to repeat the whole flow.
    if (!fields.ok) {
      const second = await readAi(imageUrl, false, true);
      if (!second.error) {
        parsed = second.parsed;
        first = second;
        fields = choosePump(
          parsed.valor ?? parsed.valor_total ?? parsed.total ?? parsed.total_pagar ?? parsed.valor_a_pagar,
          parsed.litros ?? parsed.quantidade_litros ?? parsed.volume ?? parsed.quantidade ?? parsed.qtd,
          parsed.valor_por_litro ?? parsed.preco_litro ?? parsed.preco_por_litro ?? parsed.preco_unitario ?? parsed.unitario ?? parsed.r_l,
        );
      }
    }

    return new Response(JSON.stringify({
      ok: fields.ok,
      valor: fields.valor,
      litros: fields.litros,
      valor_por_litro: fields.preco,
      combustivel: normalizeFuel(parsed.combustivel ?? parsed.tipo_combustivel ?? parsed.produto),
      confianca: Number(parsed.confianca ?? parsed.confidence ?? (fields.ok ? 0.8 : 0.3)),
      motivo: fields.ok ? "Valor e litros identificados automaticamente." : String(parsed.motivo || "Nao foi possivel confirmar valor e litros."),
      provider: first.provider,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ ok: false, error: "erro_ocr", detail }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
