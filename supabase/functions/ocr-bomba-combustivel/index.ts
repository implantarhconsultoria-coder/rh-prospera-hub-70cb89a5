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
- Se nao conseguir ler, devolva 0.
- Nao invente. Apenas JSON puro.`;

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
        km: Number(parsed.km ?? parsed.km_atual) || 0,
        confianca: Number(parsed.confianca) || 0,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({
      ok: true,
      valor: Number(parsed.valor) || 0,
      litros: Number(parsed.litros) || 0,
      valor_por_litro: Number(parsed.valor_por_litro) || 0,
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