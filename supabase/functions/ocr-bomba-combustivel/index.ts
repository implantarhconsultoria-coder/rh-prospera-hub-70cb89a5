// Edge function: ocr-bomba-combustivel
// Reads fuel-pump photos and dashboard/odometer photos for the mechanic app.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function collectApiKeys(value: unknown, keys: string[]): void {
  if (typeof value === "string") {
    if (value.startsWith("sb_publishable_") || value.split(".").length === 3) keys.push(value);
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

function configuredPublishableKeys(): string[] {
  const keys: string[] = [];
  collectApiKeys(Deno.env.get("SUPABASE_PUBLISHABLE_KEY"), keys);
  collectApiKeys(Deno.env.get("SUPABASE_ANON_KEY"), keys);
  const configured = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if (configured) {
    try {
      collectApiKeys(JSON.parse(configured), keys);
    } catch {
      configured.split(",").forEach((value) => collectApiKeys(value.trim(), keys));
    }
  }
  return [...new Set(keys)];
}

function hasValidPublishableKey(req: Request): boolean {
  const supplied = req.headers.get("apikey")?.trim();
  return Boolean(supplied && configuredPublishableKeys().includes(supplied));
}

const PUMP_PROMPT = `Voce analisa FOTOS REAIS de bombas de combustivel em postos brasileiros para preencher um recibo de abastecimento.
Devolva SOMENTE um JSON valido, sem markdown, neste formato:
{
  "ok": boolean,
  "valor": numero,
  "litros": numero,
  "valor_por_litro": numero,
  "combustivel": "Gasolina" | "Etanol" | "Diesel" | "Diesel S10" | "GNV" | "",
  "confianca": numero entre 0 e 1,
  "motivo": "texto curto"
}
Regras:
- valor = TOTAL abastecido em reais, sem simbolo. Normalmente e o maior valor monetario da bomba.
- litros = quantidade/volume abastecido. Normalmente aparece como L, LITROS, VOLUME ou QTD.
- valor_por_litro = preco unitario da bomba. Normalmente aparece como PRECO/LITRO, R$/L, P.UNIT, UNITARIO.
- combustivel = tipo do combustivel visivel na bomba/bico/visor: Gasolina, Etanol, Diesel, Diesel S10 ou GNV.
- Priorize os tres numeros grandes do visor e ignore textos pequenos, hora e ruido.
- Quando houver tres numeros grandes empilhados, mapeie pela ordem vertical: superior = valor total, meio = litros, inferior = valor_por_litro.
- Nao confunda CNPJ, data, hora, numero da bomba, codigo do bico, cupom, KM ou placa com valor/litros/preco.
- Se total e litros forem claros, calcule valor_por_litro com precisao. Se litros e preco forem claros, calcule o total.
- ok deve ser true somente se pelo menos valor e litros foram lidos com clareza e a conta valor ~= litros * valor_por_litro fecha.
- Se a foto estiver cortada, tremida, refletida, escura ou algum numero principal nao estiver claro, ok=false e confianca abaixo de 0.70.
- Pode devolver numeros em formato brasileiro; o sistema normaliza depois.
- Se nao conseguir ler um campo, devolva 0 ou "".
- Nao invente. Nao estime. Apenas JSON puro.`;

const PANEL_PROMPT = `Voce analisa FOTO de painel/odometro de veiculo.
Devolva SOMENTE um JSON valido, sem markdown, neste formato:
{
  "ok": boolean,
  "km": numero,
  "confianca": numero entre 0 e 1,
  "motivo": "texto curto"
}
Regras:
- km = quilometragem atual do hodometro, sem pontos de milhar.
- Leia apenas ODO, KM total, hodometro ou quilometragem acumulada.
- Nao use velocidade, temperatura, hora, consumo, autonomia, trip A, trip B ou marcador parcial.
- Priorize o numero grande proximo de "km". Sem rotulo legivel, use o numero grande inferior do painel.
- Ignore textos pequenos, relogio, autonomia, velocidade e TRIP; nao escolha apenas pelo maior valor.
- ok deve ser true somente quando o numero de KM estiver visivel com clareza.
- Se a foto estiver sem foco, cortada, refletida, ou mostrar apenas o velocimetro sem hodometro claro, ok=false e confianca abaixo de 0.70.
- Se nao conseguir ler, devolva 0.
- Nao invente. Nao estime. Apenas JSON puro.`;

function parseBrNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  let raw = String(value ?? "").trim();
  if (!raw) return 0;
  raw = raw.replace(/[^\d.,-]/g, "");
  if (!raw) return 0;

  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");
  let normalized = raw;

  if (lastComma > lastDot) {
    normalized = raw.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > lastComma) {
    const decimalLen = raw.length - lastDot - 1;
    const integerPart = raw.slice(0, lastDot).replace(/\D/g, "");
    normalized = decimalLen === 3 && !raw.includes(",") && integerPart.length > 2 ? raw.replace(/\./g, "") : raw.replace(/,/g, "");
  } else {
    normalized = raw.replace(",", ".");
  }

  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function parseKm(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value) : 0;
  const digits = String(value ?? "").replace(/\D/g, "");
  const n = Number(digits);
  return Number.isFinite(n) ? n : 0;
}

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
  const raw = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (!raw) return "";
  if (raw.includes("s10")) return "Diesel S10";
  if (raw.includes("diesel")) return "Diesel";
  if (raw.includes("gasolina") || raw.includes("gas")) return "Gasolina";
  if (raw.includes("etanol") || raw.includes("alcool") || raw.includes("alcohol")) return "Etanol";
  if (raw.includes("gnv")) return "GNV";
  return "";
}

function reconcilePumpNumbers(input: { valor: number; litros: number; valorPorLitro: number }) {
  let valor = input.valor;
  let litros = input.litros;
  let valorPorLitro = input.valorPorLitro;

  if (valor > 0 && valor < 20 && valorPorLitro > 20) {
    const originalValor = valor;
    valor = valorPorLitro;
    valorPorLitro = originalValor;
  }

  if (valor > 0 && litros > valor && valorPorLitro > 0) {
    const precoCalculado = valor / litros;
    const precoSeTrocar = litros / valor;
    if (precoCalculado < 2 && precoSeTrocar >= 2 && precoSeTrocar <= 20) {
      const originalValor = valor;
      valor = litros;
      litros = originalValor;
    }
  }

  if (!valorPorLitro && valor > 0 && litros > 0) valorPorLitro = round(valor / litros, 3);
  if (!valor && litros > 0 && valorPorLitro > 0) valor = round(litros * valorPorLitro, 2);
  if (!litros && valor > 0 && valorPorLitro > 0) litros = round(valor / valorPorLitro, 3);

  if (valor > 0 && litros > 0 && valorPorLitro > 0) {
    const calculado = round(litros * valorPorLitro, 2);
    const diferenca = Math.abs(calculado - valor);
    if (diferenca > Math.max(2, valor * 0.08)) {
      const precoPorTotal = round(valor / litros, 3);
      if (precoPorTotal >= 2 && precoPorTotal <= 20) {
        valorPorLitro = precoPorTotal;
      }
    }
  }

  return {
    valor: round(valor, 2),
    litros: round(litros, 3),
    valorPorLitro: round(valorPorLitro, 3),
  };
}

function isPlausible(value: number, kind: "valor" | "litros" | "preco" | "km"): boolean {
  if (!Number.isFinite(value) || value <= 0) return false;
  if (kind === "valor") return value >= 5 && value <= 10000;
  if (kind === "litros") return value >= 1 && value <= 500;
  if (kind === "preco") return value >= 1.5 && value <= 30;
  return value >= 1000 && value <= 9999999;
}

function validatePumpResult(input: { valor: number; litros: number; valorPorLitro: number; confidence: number; aiOk: boolean }) {
  let { valor, valorPorLitro } = input;
  const { litros } = input;
  if (isPlausible(valor, "valor") && isPlausible(litros, "litros") && !isPlausible(valorPorLitro, "preco")) {
    valorPorLitro = round(valor / litros, 3);
  }
  if (isPlausible(litros, "litros") && isPlausible(valorPorLitro, "preco") && !isPlausible(valor, "valor")) {
    valor = round(litros * valorPorLitro, 2);
  }

  const hasRequiredNumbers = isPlausible(valor, "valor") && isPlausible(litros, "litros") && isPlausible(valorPorLitro, "preco");
  const calculated = round(litros * valorPorLitro, 2);
  const diff = Math.abs(calculated - valor);
  const consistent = hasRequiredNumbers && diff <= Math.max(0.25, valor * 0.025);
  const ok = Boolean(input.aiOk) && input.confidence >= 0.7 && consistent;

  return {
    ok,
    valor: isPlausible(valor, "valor") ? round(valor, 2) : 0,
    litros: isPlausible(litros, "litros") ? round(litros, 3) : 0,
    valorPorLitro: isPlausible(valorPorLitro, "preco") ? round(valorPorLitro, 3) : 0,
    motivo: ok ? "" : "Nao foi possivel confirmar valor, litros e preco com seguranca.",
  };
}

function validatePanelResult(input: { km: number; confidence: number; aiOk: boolean }) {
  const ok = Boolean(input.aiOk) && input.confidence >= 0.7 && isPlausible(input.km, "km");
  return {
    ok,
    km: isPlausible(input.km, "km") ? Math.round(input.km) : 0,
    motivo: ok ? "" : "Nao foi possivel confirmar o KM com seguranca.",
  };
}

async function callVisionProvider(args: { imageUrl: string; isPanel: boolean }) {
  const openAiKey = Deno.env.get("OPENAI_API_KEY");
  if (openAiKey) {
    const model = Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini";
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${openAiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: args.isPanel ? PANEL_PROMPT : PUMP_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: args.isPanel ? "Leia o hodometro/KM total do painel." : "Leia os campos TOTAL, LITROS e PRECO/L da bomba." },
              { type: "image_url", image_url: { url: args.imageUrl } },
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
          { role: "system", content: args.isPanel ? PANEL_PROMPT : PUMP_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: args.isPanel ? "Leia o hodometro/KM total do painel." : "Leia os campos TOTAL, LITROS e PRECO/L da bomba." },
              { type: "image_url", image_url: { url: args.imageUrl } },
            ],
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0,
      }),
    });
    return { provider: "lovable", resp };
  }

  return { provider: "none", resp: null };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!hasValidPublishableKey(req)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const dataUrl: string | undefined = body.dataUrl;
    const fileUrl: string | undefined = body.fileUrl;
    const tipo = String(body.tipo || "bomba");

    if (!dataUrl && !fileUrl) {
      return new Response(JSON.stringify({ error: "Envie dataUrl ou fileUrl" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const imageUrl = dataUrl || fileUrl!;
    const isPanel = tipo === "painel_km";
    const { provider, resp } = await callVisionProvider({ imageUrl, isPanel });

    if (!resp) {
      return new Response(JSON.stringify({ ok: false, error: "OCR_PROVIDER_ENV_AUSENTE", motivo: "Configure OPENAI_API_KEY ou LOVABLE_API_KEY na Supabase Edge Function." }), {
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

    const result = await resp.json();
    const content = result?.choices?.[0]?.message?.content || "{}";
    const parsed = parseJsonContent(content);

    if (isPanel) {
      const confidence = Math.max(0, Math.min(1, Number(parsed.confianca) || Number(parsed.confidence) || 0));
      const validated = validatePanelResult({
        km: parseKm(parsed.km ?? parsed.km_atual ?? parsed.odometro ?? parsed.hodometro),
        confidence,
        aiOk: parsed.ok !== false,
      });
      return new Response(JSON.stringify({
        ok: validated.ok,
        km: validated.km,
        confianca: confidence,
        motivo: String(parsed.motivo || validated.motivo || ""),
        provider,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const valor = parseBrNumber(parsed.valor ?? parsed.valor_total ?? parsed.total ?? parsed.total_pagar ?? parsed.valor_a_pagar);
    const litros = parseBrNumber(parsed.litros ?? parsed.quantidade_litros ?? parsed.volume ?? parsed.quantidade ?? parsed.qtd);
    const valorPorLitro = parseBrNumber(parsed.valor_por_litro ?? parsed.preco_litro ?? parsed.preco_por_litro ?? parsed.preco_unitario ?? parsed.unitario ?? parsed.r_l);
    const reconciled = reconcilePumpNumbers({ valor, litros, valorPorLitro });
    const confidence = Math.max(0, Math.min(1, Number(parsed.confianca) || Number(parsed.confidence) || 0));
    const validated = validatePumpResult({
      valor: reconciled.valor,
      litros: reconciled.litros,
      valorPorLitro: reconciled.valorPorLitro,
      confidence,
      aiOk: parsed.ok !== false,
    });

    return new Response(JSON.stringify({
      ok: validated.ok,
      valor: validated.valor,
      litros: validated.litros,
      valor_por_litro: validated.valorPorLitro,
      combustivel: normalizeFuel(parsed.combustivel ?? parsed.tipo_combustivel ?? parsed.produto),
      confianca: confidence,
      motivo: String(parsed.motivo || validated.motivo || ""),
      provider,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: "erro", detail: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
