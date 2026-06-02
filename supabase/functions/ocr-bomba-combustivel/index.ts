// Edge function: ocr-bomba-combustivel
// Reads fuel-pump photos and dashboard/odometer photos for the mechanic app.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PUMP_PROMPT = `Voce analisa FOTOS REAIS de bombas de combustivel em postos brasileiros.
Devolva SOMENTE um JSON valido, sem markdown, neste formato:
{
  "valor": numero,
  "litros": numero,
  "valor_por_litro": numero,
  "combustivel": "Gasolina" | "Etanol" | "Diesel" | "Diesel S10" | "GNV" | "",
  "confianca": numero entre 0 e 1
}
Regras:
- valor = TOTAL abastecido em reais, sem simbolo. Normalmente e o maior valor monetario da bomba.
- litros = quantidade/volume abastecido. Normalmente aparece como L, LITROS, VOLUME ou QTD.
- valor_por_litro = preco unitario da bomba. Normalmente aparece como PRECO/LITRO, R$/L, P.UNIT, UNITARIO.
- combustivel = tipo do combustivel visivel na bomba/bico/visor: Gasolina, Etanol, Diesel, Diesel S10 ou GNV.
- Leia os tres campos principais mesmo que estejam em ordem vertical: TOTAL R$, LITROS/VOLUME e PRECO POR LITRO.
- Nao confunda CNPJ, data, hora, numero da bomba, codigo do bico, cupom, KM ou placa com valor/litros/preco.
- Se dois campos forem claros e o terceiro puder ser calculado com seguranca, calcule.
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
- Leia apenas ODO, KM total, hodometro ou quilometragem acumulada.
- Nao use velocidade, temperatura, hora, consumo, autonomia, trip A, trip B ou marcador parcial.
- Se houver mais de um numero, escolha o que representa a quilometragem total do veiculo.
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
    const parsed = parseJsonContent(content);

    if (isPanel) {
      return new Response(JSON.stringify({
        ok: true,
        km: parseKm(parsed.km ?? parsed.km_atual ?? parsed.odometro ?? parsed.hodometro),
        confianca: Number(parsed.confianca) || 0,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const valor = parseBrNumber(parsed.valor ?? parsed.valor_total ?? parsed.total ?? parsed.total_pagar ?? parsed.valor_a_pagar);
    const litros = parseBrNumber(parsed.litros ?? parsed.quantidade_litros ?? parsed.volume ?? parsed.quantidade ?? parsed.qtd);
    const valorPorLitro = parseBrNumber(parsed.valor_por_litro ?? parsed.preco_litro ?? parsed.preco_por_litro ?? parsed.preco_unitario ?? parsed.unitario ?? parsed.r_l);
    const reconciled = reconcilePumpNumbers({ valor, litros, valorPorLitro });

    return new Response(JSON.stringify({
      ok: true,
      valor: reconciled.valor,
      litros: reconciled.litros,
      valor_por_litro: reconciled.valorPorLitro,
      combustivel: normalizeFuel(parsed.combustivel ?? parsed.tipo_combustivel ?? parsed.produto),
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
