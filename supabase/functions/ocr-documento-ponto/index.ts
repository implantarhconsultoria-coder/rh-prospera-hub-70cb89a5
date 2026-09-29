const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

const OPENAI_MODELS = ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"];
const LOVABLE_MODEL = "google/gemini-2.5-flash";

const schema = {
  type: "object",
  additionalProperties: false,
  required: [
    "ok","tipo_documento","funcionario_nome","cpf","data_documento","data_inicio","data_fim",
    "dias_cobertos","hora_inicio","hora_fim","horas_justificadas","cid","medico","crm",
    "motivo","acao_ponto","parecer","texto_bruto","confianca"
  ],
  properties: {
    ok: { type: "boolean" },
    tipo_documento: { type: "string", enum: [
      "atestado_medico",
      "declaracao_comparecimento",
      "comparecimento_judicial",
      "documento_identidade",
      "recibo",
      "receita_medica",
      "outro"
    ] },
    funcionario_nome: { type: "string" },
    cpf: { type: "string" },
    data_documento: { type: "string" },
    data_inicio: { type: "string" },
    data_fim: { type: "string" },
    dias_cobertos: { type: "number" },
    hora_inicio: { type: "string" },
    hora_fim: { type: "string" },
    horas_justificadas: { type: "number" },
    cid: { type: "string" },
    medico: { type: "string" },
    crm: { type: "string" },
    motivo: { type: "string" },
    acao_ponto: { type: "string", enum: ["abonar_dia","abonar_intervalo","nao_abonar","revisar"] },
    parecer: { type: "string" },
    texto_bruto: { type: "string" },
    confianca: { type: "number", minimum: 0, maximum: 1 },
  },
};

const SYSTEM = `Você analisa documentos brasileiros enviados ao RH para apontamento de ponto.

Sua função é LER o documento, CLASSIFICAR e devolver dados objetivos. Não invente informação ilegível.

Classificações:
- atestado_medico: atestado emitido por profissional de saúde com afastamento/repouso.
- declaracao_comparecimento: declaração/comprovante de comparecimento com data e, quando houver, horário.
- comparecimento_judicial: certidão, declaração ou comprovante de comparecimento a juízo/audiência/foro/tribunal.
- documento_identidade: RG, CIN, CNH, protocolo ou atendimento para emissão/retirada de documento pessoal.
- recibo, receita_medica ou outro.

Regras operacionais de ponto:
1. RG/CIN/CNH, protocolo ou ida para emitir/retirar documento pessoal NÃO gera abono automático. acao_ponto="nao_abonar".
2. Comparecimento judicial: se o documento traz intervalo de horas legível, acao_ponto="abonar_intervalo" e calcule somente esse intervalo. Se não houver horas suficientes para calcular, acao_ponto="revisar".
3. Atestado médico com afastamento em dia(s): acao_ponto="abonar_dia". Se for somente um intervalo explícito, use "abonar_intervalo".
4. Declaração de comparecimento: só use "abonar_intervalo" quando início e fim estiverem explícitos e legíveis; caso contrário "revisar".
5. Nunca transforme documento comum em abono por suposição.
6. data_documento/data_inicio/data_fim em YYYY-MM-DD quando legíveis; hora_inicio/hora_fim em HH:MM.
7. horas_justificadas deve ser a diferença entre hora_inicio e hora_fim, sem incluir tempo fora do documento.
8. parecer deve ser curto e factual, por exemplo: "Comparecimento judicial de 09:10 a 11:25; 2,25h justificadas. Demais horas do dia não abrangidas pelo documento."
9. texto_bruto: transcrição resumida do que for relevante, até 1800 caracteres.
10. confiança de 0 a 1. Se classificação, pessoa, data ou horário forem duvidosos, reduza a confiança e use acao_ponto="revisar".

Retorne SOMENTE JSON válido conforme o schema.`;

function extractOutputText(payload: any): string {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) return payload.output_text.trim();
  for (const item of payload?.output || []) {
    for (const part of item?.content || []) {
      if ((part?.type === "output_text" || part?.type === "text") && typeof part?.text === "string" && part.text.trim()) return part.text.trim();
    }
  }
  return "";
}

function parseJson(value: unknown): any {
  const raw = String(value || "").replace(/```json|```/gi, "").trim();
  if (!raw) return null;
  try { return JSON.parse(raw); } catch {}
  const a = raw.indexOf("{"), b = raw.lastIndexOf("}");
  if (a >= 0 && b > a) {
    try { return JSON.parse(raw.slice(a, b + 1)); } catch {}
  }
  return null;
}

function hoursBetween(start: unknown, end: unknown): number {
  const parse = (v: unknown) => {
    const m = String(v || "").match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const h = Number(m[1]), min = Number(m[2]);
    if (h > 23 || min > 59) return null;
    return h + min / 60;
  };
  const a = parse(start), b = parse(end);
  if (a == null || b == null) return 0;
  const diff = b >= a ? b - a : (24 - a) + b;
  return Math.round(diff * 100) / 100;
}

function normalize(parsed: any) {
  const tipo = String(parsed?.tipo_documento || "outro");
  const allowed = new Set(["atestado_medico","declaracao_comparecimento","comparecimento_judicial","documento_identidade","recibo","receita_medica","outro"]);
  const tipoDocumento = allowed.has(tipo) ? tipo : "outro";
  const horasCalculadas = hoursBetween(parsed?.hora_inicio, parsed?.hora_fim);
  let horas = horasCalculadas || Math.max(0, Number(parsed?.horas_justificadas) || 0);
  let dias = Math.max(0, Math.round(Number(parsed?.dias_cobertos) || 0));
  let acao = String(parsed?.acao_ponto || "revisar");

  if (tipoDocumento === "documento_identidade" || tipoDocumento === "recibo" || tipoDocumento === "receita_medica") {
    acao = "nao_abonar";
    horas = 0;
    dias = 0;
  } else if (tipoDocumento === "comparecimento_judicial") {
    acao = horas > 0 ? "abonar_intervalo" : "revisar";
  } else if (tipoDocumento === "atestado_medico") {
    if (dias > 0) acao = "abonar_dia";
    else if (horas > 0) acao = "abonar_intervalo";
    else acao = "revisar";
  } else if (tipoDocumento === "declaracao_comparecimento") {
    acao = horas > 0 ? "abonar_intervalo" : "revisar";
  } else if (!["abonar_dia","abonar_intervalo","nao_abonar","revisar"].includes(acao)) {
    acao = "revisar";
  }

  const confianca = Math.max(0, Math.min(1, Number(parsed?.confianca) || 0));
  if (confianca < 0.72 && acao.startsWith("abonar")) acao = "revisar";

  return {
    ok: Boolean(parsed?.ok ?? true),
    tipo_documento: tipoDocumento,
    funcionario_nome: String(parsed?.funcionario_nome || "").trim(),
    cpf: String(parsed?.cpf || "").replace(/\D/g, ""),
    data_documento: String(parsed?.data_documento || "").trim(),
    data_inicio: String(parsed?.data_inicio || parsed?.data_documento || "").trim(),
    data_fim: String(parsed?.data_fim || parsed?.data_inicio || parsed?.data_documento || "").trim(),
    dias_cobertos: dias,
    hora_inicio: String(parsed?.hora_inicio || "").trim(),
    hora_fim: String(parsed?.hora_fim || "").trim(),
    horas_justificadas: Math.round(horas * 100) / 100,
    cid: String(parsed?.cid || "").trim(),
    medico: String(parsed?.medico || "").trim(),
    crm: String(parsed?.crm || "").trim(),
    motivo: String(parsed?.motivo || "").trim(),
    acao_ponto: acao,
    parecer: String(parsed?.parecer || "").trim(),
    texto_bruto: String(parsed?.texto_bruto || "").slice(0, 1800).trim(),
    confianca,
  };
}

async function callOpenAI(apiKey: string, model: string, image: string) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      reasoning: { effort: "low" },
      input: [{ role: "user", content: [
        { type: "input_text", text: SYSTEM },
        { type: "input_image", image_url: image, detail: "high" },
      ] }],
      text: { format: { type: "json_schema", name: "documento_ponto_rh", strict: true, schema } },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return { error: String(payload?.error?.message || `openai_${response.status}`), data: null };
  return { error: "", data: parseJson(extractOutputText(payload)) };
}

async function callLovable(apiKey: string, image: string) {
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: LOVABLE_MODEL,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: [
          { type: "text", text: "Leia o documento inteiro e devolva somente JSON." },
          { type: "image_url", image_url: { url: image } },
        ] },
      ],
      response_format: { type: "json_object" },
      temperature: 0,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return { error: String(payload?.error?.message || `lovable_${response.status}`), data: null };
  return { error: "", data: parseJson(payload?.choices?.[0]?.message?.content) };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ ok: false, error: "method_not_allowed" }), { status: 405, headers: jsonHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const image = String(body?.dataUrl || body?.fileUrl || "");
    if (!image) return new Response(JSON.stringify({ ok: false, error: "imagem_obrigatoria" }), { status: 400, headers: jsonHeaders });

    const openaiKey = Deno.env.get("OPENAI_API_KEY") || "";
    const lovableKey = Deno.env.get("LOVABLE_API_KEY") || "";
    if (!openaiKey && !lovableKey) {
      return new Response(JSON.stringify({ ok: false, error: "provedor_visual_nao_configurado" }), { status: 200, headers: jsonHeaders });
    }

    const attempts: any[] = [];
    if (openaiKey) {
      for (const model of OPENAI_MODELS) {
        const result = await callOpenAI(openaiKey, model, image);
        const normalized = result.data ? normalize(result.data) : null;
        attempts.push({ provider: "openai", model, ok: !!normalized, error: result.error || null });
        if (normalized) return new Response(JSON.stringify({ ok: true, data: normalized, provider: "openai", model }), { headers: jsonHeaders });
      }
    }

    if (lovableKey) {
      const result = await callLovable(lovableKey, image);
      const normalized = result.data ? normalize(result.data) : null;
      attempts.push({ provider: "lovable", model: LOVABLE_MODEL, ok: !!normalized, error: result.error || null });
      if (normalized) return new Response(JSON.stringify({ ok: true, data: normalized, provider: "lovable", model: LOVABLE_MODEL }), { headers: jsonHeaders });
    }

    return new Response(JSON.stringify({ ok: false, error: "nao_foi_possivel_ler_documento", attempts }), { status: 200, headers: jsonHeaders });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: "erro_leitura_documento", detail: error instanceof Error ? error.message : String(error) }), { status: 200, headers: jsonHeaders });
  }
});
