// Edge function: ocr-bomba-combustivel
// Reads fuel-pump photos and dashboard/odometer photos for the mechanic app.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PUMP_PROMPT = `Voce analisa FOTOS de bombas de combustivel em postos brasileiros.
Devolva SOMENTE um JSON valido, sem markdown, neste formato:
{
  "valor": numero,
  "litros": numero,
  "valor_por_litro": numero,
  "combustivel": "Gasolina" | "Etanol" | "Diesel" | "Diesel S10" | "GNV" | "",
  "confianca": numero entre 0 e 1
}
Regras:
- valor = total abastecido em reais, sem simbolo.
- litros = quantidade abastecida.
- valor_por_litro = preco unitario da bomba.
- Procure principalmente campos como TOTAL, VALOR A PAGAR, LITROS, VOLUME, PRECO/LITRO, R$/L.
- Nao confunda CNPJ, data, hora, numero da bomba ou codigo do bico com valor/litros/KM.
- Pode devolver numeros em formato brasileiro; o sistema normaliza depois.
- Se nao conseguir ler um campo, devolva 0 ou "".
- Nao invente. Apenas JSON puro.`;

const PANEL_PROMPT = `Voce analisa FOTO de painel/odometro de veiculo.
Devolva SOMENTE um JSON valido, sem markdown, neste formato:
{
  "km": numero,
  "confianca": numero entre 0 e 1
}
Regras:
- km = quilometragem atual do hodometro, sem pontos de milhar.
- Leia apenas odometro/quilometragem. Nao use temperatura, velocidade, hora ou autonomia.
- Se nao conseguir ler, devolva 0.
- Nao invente. Apenas JSON puro.`;

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
    normalized = decimalLen === 3 && !raw.includes(",") ? raw.replace(/\./g, "") : raw.replace(/,/g, "");
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

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

    const key = Deno.env.get("LOVABLE_API_KEY");
    if (!key) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY ausente" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const imageUrl = dataUrl || fileUrl!;
    const isPanel = tipo === "painel_km";

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: isPanel ? PANEL_PROMPT : PUMP_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: isPanel ? "Extraia o KM atual do hodometro/painel." : "Extraia os dados desta bomba." },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!resp.ok) {
      const detail = await resp.text();
      return new Response(JSON.stringify({ error: "ai_error", detail }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await resp.json();
    const content = result?.choices?.[0]?.message?.content || "{}";
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = {};
    }

    if (isPanel) {
      return new Response(JSON.stringify({
        ok: true,
        km: parseKm(parsed.km ?? parsed.km_atual ?? parsed.odometro ?? parsed.hodometro),
        confianca: Number(parsed.confianca) || 0,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const valor = parseBrNumber(parsed.valor ?? parsed.valor_total ?? parsed.total ?? parsed.total_pagar);
    const litros = parseBrNumber(parsed.litros ?? parsed.quantidade_litros ?? parsed.volume);
    let valorPorLitro = parseBrNumber(parsed.valor_por_litro ?? parsed.preco_litro ?? parsed.preco_por_litro ?? parsed.unitario);
    let valorFinal = valor;

    if (!valorPorLitro && valorFinal > 0 && litros > 0) valorPorLitro = round(valorFinal / litros, 3);
    if (!valorFinal && litros > 0 && valorPorLitro > 0) valorFinal = round(litros * valorPorLitro, 2);

    return new Response(JSON.stringify({
      ok: true,
      valor: valorFinal,
      litros,
      valor_por_litro: valorPorLitro,
      combustivel: String(parsed.combustivel || ""),
      confianca: Number(parsed.confianca) || 0,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: "erro", detail: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
