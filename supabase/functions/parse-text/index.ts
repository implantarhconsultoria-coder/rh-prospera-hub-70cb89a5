import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
});

const clean = (value: unknown) => String(value || "").replace(/\s+/g, " ").trim();
const digits = (value: unknown) => String(value || "").replace(/\D/g, "");
const flatten = (value: unknown) => String(value || "").replace(/\r/g, "").replace(/\n+/g, " | ").replace(/\s+/g, " ").trim();

const first = (text: string, patterns: RegExp[]) => {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return clean(match[1]);
  }
  return "";
};

const normalizePlate = (value: unknown) => String(value || "")
  .toUpperCase().replace(/[^A-Z0-9]/g, "")
  .match(/[A-Z]{3}[0-9][A-Z0-9][0-9]{2}/)?.[0] || "";
const normalizeRenavam = (value: unknown) => digits(value).match(/\d{9,11}/)?.[0] || "";
const normalizeChassi = (value: unknown) => String(value || "")
  .toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, "")
  .match(/[A-HJ-NPR-Z0-9]{17}/)?.[0] || "";

const normalizeDate = (value: string) => {
  const raw = clean(value);
  const match = raw.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);
  if (match) return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
};

const parseVehicle = (raw: string) => {
  const text = flatten(raw).toUpperCase();
  const yearPair = text.match(/\b((?:19|20)\d{2})\s*\/\s*((?:19|20)\d{2})\b/);
  const model = first(text, [/(?:MARCA\s*\/?\s*MODELO|MARCA\s+MODELO|MODELO\s*\/\s*VERS[AÃ]O)\s*[:\-]?\s*([^|]{2,80})/i])
    .replace(/\s+(?:PLACA|RENAVAM|CHASSI|ANO)\b.*$/i, "").trim();
  return {
    placa: normalizePlate(first(text, [/\bPLACA\s*[:\-]?\s*([A-Z]{3}\s*-?\s*[0-9][A-Z0-9]\s*-?\s*[0-9]{2})/i]) || text),
    renavam: normalizeRenavam(first(text, [/\bRENAVAM\s*[:\-]?\s*(\d{9,11})/i])),
    chassi: normalizeChassi(first(text, [/\b(?:CHASSI|VIN)\s*[:\-]?\s*([A-HJ-NPR-Z0-9]{17})/i]) || text),
    ano_fabricacao: first(text, [/(?:ANO\s+FABRICA[CÇ][AÃ]O|FABRICA[CÇ][AÃ]O|FAB\/MOD)\s*[:\-]?\s*((?:19|20)\d{2})/i]) || yearPair?.[1] || "",
    ano_modelo: first(text, [/(?:ANO\s+MODELO|MODELO|FAB\/MOD)\s*[:\-]?\s*(?:19|20)\d{2}\s*\/\s*((?:19|20)\d{2})/i]) || yearPair?.[2] || "",
    patrimonio: first(text, [/\bPATRIM[OÔ]NIO\s*[:\-]?\s*([A-Z0-9./-]{2,30})/i]),
    marca_modelo: model,
    descricao: model,
    empresa: first(text, [/(?:PROPRIET[AÁ]RIO|EMPRESA)\s*[:\-]?\s*([^|]{3,100})/i]),
    observacao: "",
  };
};

const parseEmployee = (raw: string) => {
  const text = flatten(raw);
  return {
    nome: first(text, [/(?:NOME\s+COMPLETO|NOME\s+DO\s+(?:FUNCION[AÁ]RIO|COLABORADOR)|FUNCION[AÁ]RIO|COLABORADOR|NOME)\s*[:\-]?\s*([^|]{3,120})/i])
      .replace(/\s+(?:CPF|RG|CARGO|FUN[CÇ][AÃ]O|SAL[AÁ]RIO|ADMISS[AÃ]O)\b.*$/i, "").trim(),
    cpf: first(text, [/\bCPF\s*[:\-]?\s*(\d{3}\.?\d{3}\.?\d{3}[-\s]?\d{2}|\d{11})\b/i]),
    rg: first(text, [/\b(?:RG|IDENTIDADE)\s*[:\-]?\s*([0-9A-Z.\-\/]{4,25})/i]),
    cargo: first(text, [/(?:CARGO\s*\/\s*FUN[CÇ][AÃ]O|CARGO|FUN[CÇ][AÃ]O)\s*[:\-]?\s*([^|]{2,100})/i])
      .replace(/\s+(?:SAL[AÁ]RIO|ADMISS[AÃ]O|TELEFONE|CELULAR)\b.*$/i, "").trim(),
    salario_base: first(text, [/(?:SAL[AÁ]RIO\s+BASE|SAL[AÁ]RIO|REMUNERA[CÇ][AÃ]O)\s*[:\-]?\s*(?:R\$\s*)?([0-9.,]+)/i]),
    data_admissao: normalizeDate(first(text, [/(?:DATA\s+DE\s+ADMISS[AÃ]O|ADMISS[AÃ]O|ADMITIDO\s+EM)\s*[:\-]?\s*(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{4}|\d{4}-\d{2}-\d{2})/i])),
    telefone: first(text, [/(?:TELEFONE|FONE)\s*[:\-]?\s*(\+?\d[\d\s()\-.]{8,20})/i]),
    celular: first(text, [/(?:CELULAR|WHATSAPP|WHATS)\s*[:\-]?\s*(\+?\d[\d\s()\-.]{8,20})/i]),
    email: first(text, [/(?:E-?MAIL)\s*[:\-]?\s*([^\s|;,]+@[^\s|;,]+\.[A-Z]{2,})/i]) || text.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i)?.[0] || "",
    endereco: first(text, [/(?:ENDERE[CÇ]O\s+COMPLETO|ENDERE[CÇ]O|RESID[EÊ]NCIA)\s*[:\-]?\s*([^|]{5,180})/i])
      .replace(/\s+(?:BANCO|AG[EÊ]NCIA|CONTA|PIX)\b.*$/i, "").trim(),
  };
};

const parseProtocol = (raw: string) => {
  const text = flatten(raw);
  return {
    placa: normalizePlate(first(text, [/\bPLACA\s*[:\-]?\s*([A-Z]{3}[-\s]?\d[A-Z0-9]\d{2}|[A-Z]{3}[-\s]?\d{4})\b/i])),
    patrimonio: first(text, [/\bPATRIM[OÔ]NIO\s*(?:N[ºO.]*)?\s*[:\-]?\s*([A-Z0-9./-]{2,30})\b/i]),
    empresa_destinataria: first(text, [/(?:EMPRESA\s+DESTINAT[AÁ]RIA|EMPRESA)\s*[:\-]?\s*([^|]{2,80})/i]),
    local_canteiro: first(text, [/(?:LOCAL|CANTEIRO|OBRA)\s*[:\-]?\s*([^|]{2,80})/i]),
    responsavel_recebimento: first(text, [/(?:RESPONS[AÁ]VEL(?:\s+PELO\s+RECEBIMENTO)?|RECEBIMENTO|A\/C)\s*[:\-]?\s*([^|]{2,60})/i]),
    observacoes: String(raw || "").trim(),
  };
};

const schemaFor = (type: string) => {
  if (type === "funcionario") return {
    nome: { type: "string" }, cpf: { type: "string" }, rg: { type: "string" }, cargo: { type: "string" },
    salario_base: { type: "string" }, data_admissao: { type: "string" }, telefone: { type: "string" },
    celular: { type: "string" }, email: { type: "string" }, endereco: { type: "string" },
  };
  if (type === "protocolo") return {
    empresa_destinataria: { type: "string" }, local_canteiro: { type: "string" }, responsavel_recebimento: { type: "string" },
    placa: { type: "string" }, patrimonio: { type: "string" }, renavam: { type: "string" }, chassi: { type: "string" },
    ano_fabricacao: { type: "string" }, ano_modelo: { type: "string" }, empresa: { type: "string" },
    descricao_ativo: { type: "string" }, observacoes: { type: "string" },
  };
  return {
    placa: { type: "string" }, renavam: { type: "string" }, chassi: { type: "string" },
    ano_fabricacao: { type: "string" }, ano_modelo: { type: "string" }, patrimonio: { type: "string" },
    marca_modelo: { type: "string" }, descricao: { type: "string" }, empresa: { type: "string" }, observacao: { type: "string" },
  };
};

const aiExtract = async (type: string, text: string, images: string[]) => {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key || !images.length) return null;
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: "Extraia somente dados visíveis. Não invente valores. Retorne strings vazias quando não localizar." },
        { role: "user", content: [
          { type: "text", text: text || "Leia o documento." },
          ...images.slice(0, 3).map((image) => ({ type: "image_url", image_url: { url: image } })),
        ] },
      ],
      tools: [{ type: "function", function: {
        name: "extract_fields",
        description: "Extrair campos estruturados do documento",
        parameters: { type: "object", properties: schemaFor(type), required: [] },
      } }],
      tool_choice: { type: "function", function: { name: "extract_fields" } },
    }),
  });
  if (!response.ok) return null;
  const payload = await response.json();
  const args = payload.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) return null;
  try { return JSON.parse(args); } catch { return null; }
};

const mergeNonEmpty = (base: Record<string, unknown>, extra: Record<string, unknown> | null) => {
  if (!extra) return base;
  const output = { ...base };
  for (const [key, value] of Object.entries(extra)) {
    if (typeof value === "string" && value.trim()) output[key] = value.trim();
  }
  return output;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const body = await req.json();
    const type = clean(body?.type).toLowerCase();
    const text = String(body?.text || "");
    const images = Array.isArray(body?.images)
      ? body.images.filter((image: unknown) => typeof image === "string" && image.startsWith("data:image/"))
      : [];
    if (!text.trim() && !images.length) return json({ error: "text_or_image_required" }, 400);

    let deterministic: Record<string, unknown>;
    if (type === "documento_veiculo") deterministic = parseVehicle(text);
    else if (type === "funcionario") deterministic = parseEmployee(text);
    else if (type === "protocolo") deterministic = parseProtocol(text);
    else return json({ error: "unsupported_type" }, 400);

    const vehicleMissing = type === "documento_veiculo" && (!deterministic.renavam || !deterministic.chassi);
    const sparse = Object.values(deterministic).filter((value) => typeof value === "string" && value.trim()).length < 3;
    const ai = vehicleMissing || sparse ? await aiExtract(type, text, images) : null;
    const data = mergeNonEmpty(deterministic, ai);

    if (type === "documento_veiculo") {
      data.placa = normalizePlate(data.placa);
      data.renavam = normalizeRenavam(data.renavam);
      data.chassi = normalizeChassi(data.chassi);
    }

    const warnings = type === "documento_veiculo"
      ? [!data.renavam ? "RENAVAM não identificado." : "", !data.chassi ? "Chassi não identificado." : ""].filter(Boolean)
      : [];
    return json({ data, warnings, source: ai ? "deterministic+vision" : "deterministic" });
  } catch (error) {
    console.error("parse-text error:", error);
    return json({ error: "parse_failed", message: error instanceof Error ? error.message : String(error) }, 500);
  }
});
