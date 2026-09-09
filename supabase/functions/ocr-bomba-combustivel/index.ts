// Edge function: ocr-bomba-combustivel
// Reads fuel-pump displays and vehicle odometers for the mechanic app.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

const PUMP_PROMPT = `Analise UMA FOTO REAL do visor de uma bomba de combustivel em posto brasileiro.
Leia prioritariamente os DOIS CAMPOS rotulados TOTAL A PAGAR e LITROS. O preco por litro e secundario.
Retorne SOMENTE JSON valido:
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
- valor = numero exibido no display TOTAL A PAGAR / TOTAL R$.
- litros = numero exibido no display LITROS / VOLUME.
- valor_por_litro = display PRECO POR LITRO, quando legivel.
- Preserve rigorosamente a virgula/ponto decimal. Ex.: 277,95 -> 277.95; 40,995 -> 40.995; 6,780 -> 6.780.
- Nao altere TOTAL ou LITROS apenas para fazer a conta fechar com um preco por litro pouco legivel.
- Se TOTAL e LITROS estiverem claros, devolva-os exatamente como vistos e calcule valor_por_litro = valor/litros se necessario.
- Ignore CNPJ, hora, numero da bomba, placa, KM, telefone, navegador e outros textos.
- Nao invente digitos.
Apenas JSON puro.`;

const PUMP_RETRY_PROMPT = `Releia a mesma foto com foco EXCLUSIVO em dois displays:
1) TOTAL A PAGAR / TOTAL R$
2) LITROS / VOLUME
Retorne SOMENTE:
{"ok":boolean,"valor":numero,"litros":numero,"confianca":numero,"motivo":"texto curto"}
Nao leia preco por litro. Preserve exatamente as casas decimais visiveis.`;

const PANEL_PROMPT = `Analise UMA FOTO REAL do painel de um veiculo.
Extraia SOMENTE a quilometragem TOTAL atual do hodometro/ODO.
Retorne SOMENTE JSON valido:
{"ok":boolean,"km":numero,"confianca":numero,"motivo":"texto curto"}
Ignore velocidade, hora, temperatura, autonomia, consumo, Trip A e Trip B.
Se aparecer separador de milhar, devolva inteiro. Ex.: 58.775 km -> 58775.
Nao invente digitos. Apenas JSON puro.`;

function parseJson(content: string): Record<string, unknown> {
  const clean = String(content || "").replace(/```json|```/gi, "").trim();
  try { return JSON.parse(clean); } catch {
    const a = clean.indexOf("{"), b = clean.lastIndexOf("}");
    if (a >= 0 && b > a) {
      try { return JSON.parse(clean.slice(a, b + 1)); } catch { return {}; }
    }
    return {};
  }
}

function parseBr(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  let s = String(value ?? "").trim().replace(/\s/g, "").replace(/[^\d.,-]/g, "");
  if (!s) return 0;
  const c = s.lastIndexOf(","), d = s.lastIndexOf(".");
  if (c > d) s = s.replace(/\./g, "").replace(",", ".");
  else if (d > c) s = s.replace(/,/g, "");
  else s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function round(n: number, digits: number) {
  const f = 10 ** digits;
  return Number.isFinite(n) ? Math.round(n * f) / f : 0;
}

function plausible(n: number, kind: "valor" | "litros" | "preco" | "km") {
  if (!Number.isFinite(n) || n <= 0) return false;
  if (kind === "valor") return n >= 5 && n <= 10000;
  if (kind === "litros") return n >= 0.5 && n <= 500;
  if (kind === "preco") return n >= 1.5 && n <= 30;
  return n >= 1000 && n <= 9999999;
}

function candidates(value: unknown, kind: "valor" | "litros") {
  const base = parseBr(value);
  const digits = Number(String(value ?? "").replace(/\D/g, "")) || 0;
  const out: Array<{ value: number; penalty: number }> = [];
  const add = (v: number, penalty: number) => {
    if (!plausible(v, kind)) return;
    const normalized = round(v, kind === "valor" ? 2 : 3);
    if (!out.some((x) => x.value === normalized)) out.push({ value: normalized, penalty });
  };
  add(base, 0);
  [1, 10, 100, 1000, 10000].forEach((div, i) => {
    add(digits / div, 0.08 + i * 0.04);
    add(base / div, 0.12 + i * 0.04);
  });
  return out;
}

function resolvePump(parsed: Record<string, unknown>) {
  const valorRaw = parsed.valor ?? parsed.valor_total ?? parsed.total ?? parsed.total_pagar ?? parsed.valor_a_pagar;
  const litrosRaw = parsed.litros ?? parsed.quantidade_litros ?? parsed.volume ?? parsed.quantidade ?? parsed.qtd;
  const precoRaw = parsed.valor_por_litro ?? parsed.preco_litro ?? parsed.preco_por_litro ?? parsed.preco_unitario ?? parsed.unitario;

  const directValor = parseBr(valorRaw);
  const directLitros = parseBr(litrosRaw);
  if (plausible(directValor, "valor") && plausible(directLitros, "litros")) {
    const calcPreco = directValor / directLitros;
    if (plausible(calcPreco, "preco")) {
      return { ok: true, valor: round(directValor, 2), litros: round(directLitros, 3), preco: round(calcPreco, 3), source: "direct" };
    }
  }

  const valores = candidates(valorRaw, "valor");
  const litros = candidates(litrosRaw, "litros");
  const readPreco = parseBr(precoRaw);
  let best: { valor: number; litros: number; preco: number; score: number } | null = null;

  for (const v of valores) {
    for (const l of litros) {
      const p = v.value / l.value;
      if (!plausible(p, "preco")) continue;
      let score = v.penalty + l.penalty;
      if (plausible(readPreco, "preco")) {
        const rel = Math.abs(p - readPreco) / Math.max(readPreco, 1);
        score += Math.min(rel, 1) * 0.05;
      }
      if (!best || score < best.score) best = { valor: v.value, litros: l.value, preco: p, score };
    }
  }

  if (!best) return { ok: false, valor: 0, litros: 0, preco: 0, source: "none" };
  return { ok: true, valor: round(best.valor, 2), litros: round(best.litros, 3), preco: round(best.preco, 3), source: "candidates" };
}

function parseKm(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (plausible(value, "km")) return Math.round(value);
    if (value > 1 && value < 1000 && plausible(value * 1000, "km")) return Math.round(value * 1000);
  }
  const digits = String(value ?? "").replace(/\D/g, "");
  const n = Number(digits);
  return plausible(n, "km") ? Math.round(n) : 0;
}

function normalizeFuel(value: unknown): string {
  const s = String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (s.includes("s10")) return "Diesel S10";
  if (s.includes("diesel")) return "Diesel";
  if (s.includes("etanol") || s.includes("alcool")) return "Etanol";
  if (s.includes("gnv")) return "GNV";
  if (s.includes("gasolina") || s === "gas") return "Gasolina";
  return "";
}

async function callProvider(imageUrl: string, prompt: string, instruction: string) {
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

async function read(imageUrl: string, prompt: string, instruction: string) {
  const { provider, resp } = await callProvider(imageUrl, prompt, instruction);
  if (!resp) return { provider, parsed: {}, error: "OCR_PROVIDER_ENV_AUSENTE" };
  if (!resp.ok) return { provider, parsed: {}, error: `ai_error_${resp.status}` };
  const payload = await resp.json();
  return { provider, parsed: parseJson(payload?.choices?.[0]?.message?.content || "{}"), error: "" };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ ok: false, error: "method_not_allowed" }), { status: 405, headers: jsonHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const imageUrl = typeof body.dataUrl === "string" && body.dataUrl ? body.dataUrl : String(body.fileUrl || "");
    const tipo = String(body.tipo || "bomba");
    if (!imageUrl) return new Response(JSON.stringify({ ok: false, error: "imagem_obrigatoria" }), { status: 400, headers: jsonHeaders });

    if (tipo === "painel_km") {
      const first = await read(imageUrl, PANEL_PROMPT, "Leia somente o hodometro/ODO total.");
      if (first.error) return new Response(JSON.stringify({ ok: false, error: first.error, provider: first.provider }), { status: 502, headers: jsonHeaders });
      const p = first.parsed;
      const km = parseKm(p.km ?? p.km_atual ?? p.odometro ?? p.hodometro ?? p.odo);
      return new Response(JSON.stringify({
        ok: plausible(km, "km"),
        km,
        km_atual: km,
        confianca: Number(p.confianca ?? p.confidence ?? (km ? 0.8 : 0.3)),
        motivo: km ? "KM identificado." : String(p.motivo || "Nao foi possivel confirmar o KM."),
        provider: first.provider,
      }), { headers: jsonHeaders });
    }

    let first = await read(imageUrl, PUMP_PROMPT, "Leia TOTAL A PAGAR e LITROS exatamente como aparecem. Preco por litro e secundario.");
    if (first.error) return new Response(JSON.stringify({ ok: false, error: first.error, provider: first.provider }), { status: 502, headers: jsonHeaders });
    let parsed = first.parsed;
    let fields = resolvePump(parsed);

    if (!fields.ok) {
      const retry = await read(imageUrl, PUMP_RETRY_PROMPT, "Ignore todo o resto da imagem e leia apenas TOTAL A PAGAR e LITROS.");
      if (!retry.error) {
        first = retry;
        parsed = retry.parsed;
        fields = resolvePump(parsed);
      }
    }

    return new Response(JSON.stringify({
      ok: fields.ok,
      valor: fields.valor,
      litros: fields.litros,
      valor_por_litro: fields.preco,
      combustivel: normalizeFuel(parsed.combustivel ?? parsed.tipo_combustivel ?? parsed.produto),
      confianca: Number(parsed.confianca ?? parsed.confidence ?? (fields.ok ? 0.8 : 0.3)),
      motivo: fields.ok ? "Valor e litros identificados." : String(parsed.motivo || "Nao foi possivel confirmar valor e litros."),
      provider: first.provider,
      leitura: fields.source,
    }), { headers: jsonHeaders });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ ok: false, error: "erro_ocr", detail }), { status: 500, headers: jsonHeaders });
  }
});
