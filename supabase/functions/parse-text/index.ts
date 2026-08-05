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
const sanitize = (value: unknown) => String(value || "")
  .replace(/\r/g, "")
  .replace(/[*_`]/g, "")
  .replace(/^[\s•●▪◦►▶➤➜✓✔-]+/gm, "")
  .trim();
const flatten = (value: unknown) => sanitize(value).replace(/\n+/g, " | ").replace(/\s+/g, " ").trim();

const first = (text: string, patterns: RegExp[]) => {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return clean(match[1]);
  }
  return "";
};

const trimAtNextLabel = (value: string) => clean(value)
  .replace(/\s+(?:cpf|rg|identidade|cargo|fun[cç][aã]o|sal[aá]rio|remunera[cç][aã]o|admiss[aã]o|telefone|fone|celular|whatsapp|e-?mail|endere[cç]o|banco|ag[eê]ncia|conta|pix|chave\s+pix|titular)\s*[:=\-].*$/i, "")
  .replace(/[|;,]+$/g, "")
  .trim();

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

const normalizeCpf = (value: unknown) => {
  const number = digits(value);
  return number.length === 11
    ? `${number.slice(0, 3)}.${number.slice(3, 6)}.${number.slice(6, 9)}-${number.slice(9)}`
    : clean(value);
};

const normalizeMoney = (value: unknown) => {
  const raw = clean(value).replace(/R\$/gi, "").replace(/\s/g, "");
  if (!raw) return "";
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const amount = Number(normalized.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(amount) ? String(amount) : "";
};

const splitAccount = (value: unknown) => {
  const raw = clean(value).replace(/\s/g, "");
  const match = raw.match(/^(.+?)[-/]([0-9A-Za-z])$/);
  return { conta: clean(match?.[1] || raw), digito: clean(match?.[2] || "") };
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

const parseBanking = (raw: string) => {
  const text = flatten(raw);
  const bank = trimAtNextLabel(first(text, [
    /\bbanco\s*[:=\-]?\s*(.+?)(?=\s+(?:ag[eê]ncia|conta|pix|chave\s+pix|cpf|titular)\s*[:=\-]|\s*[|;]|$)/i,
    /\binstitui[cç][aã]o\s*[:=\-]?\s*(.+?)(?=\s+(?:ag[eê]ncia|conta|pix|cpf|titular)\s*[:=\-]|\s*[|;]|$)/i,
  ]));
  const accountRaw = trimAtNextLabel(first(text, [
    /(?:n[uú]mero\s+da\s+conta|conta\s+(?:corrente|poupan[cç]a|sal[aá]rio|pagamento)|c\/c)\s*[:=\-]?\s*([0-9A-Za-z.]+(?:\s*[-/]\s*[0-9A-Za-z])?)/i,
    /\bconta\s*[:=\-]\s*([0-9A-Za-z.]+(?:\s*[-/]\s*[0-9A-Za-z])?)/i,
  ]));
  const account = splitAccount(accountRaw);
  const pix = trimAtNextLabel(first(text, [
    /(?:chave\s+pix|pix)\s*[:=\-]?\s*(.+?)(?=\s+(?:tipo\s+(?:da\s+chave\s+)?pix|banco|ag[eê]ncia|conta|cpf|titular)\s*[:=\-]|\s*[|;]|$)/i,
  ]));
  return {
    banco: bank,
    bancoCodigo: first(text, [/(?:c[oó]digo\s+do\s+banco|c[oó]d\.?\s*banco|banco\s+c[oó]digo)\s*[:=\-]?\s*(\d{3})/i]),
    agencia: first(text, [/(?:ag[eê]ncia|ag\.)\s*[:=\-]?\s*([0-9A-Za-z.-]{1,15})/i]),
    conta: account.conta,
    digito: account.digito || first(text, [/(?:d[ií]gito|d[ií]g\.?|dv)\s*[:=\-]?\s*([0-9A-Za-z])/i]),
    tipoConta: first(text, [/(?:tipo\s+de\s+conta|conta)\s*[:=\-]?\s*(corrente|poupan[cç]a|sal[aá]rio|pagamento)/i]),
    titular: trimAtNextLabel(first(text, [/(?:nome\s+do\s+titular|titular|favorecido|benefici[aá]rio)\s*[:=\-]?\s*(.+?)(?=\s+(?:cpf|pix|ag[eê]ncia|conta)\s*[:=\-]|\s*[|;]|$)/i])),
    cpfTitular: normalizeCpf(first(text, [/(?:cpf(?:\s+do\s+titular)?)\s*[:=\-]?\s*(\d{3}\.?\d{3}\.?\d{3}[-\s]?\d{2}|\d{11})/i])),
    chavePix: pix,
    tipoChavePix: first(text, [/(?:tipo\s+da\s+chave\s+pix|tipo\s+pix)\s*[:=\-]?\s*(cpf|cnpj|telefone|celular|e-?mail|aleat[oó]ria|chave\s+aleat[oó]ria)/i]),
  };
};

const parseEmployee = (raw: string) => {
  const text = flatten(raw);
  return {
    nome: trimAtNextLabel(first(text, [/(?:NOME\s+COMPLETO|NOME\s+DO\s+(?:FUNCION[AÁ]RIO|COLABORADOR)|FUNCION[AÁ]RIO|COLABORADOR|NOME)\s*[:=\-]?\s*(.+?)(?=\s+(?:CPF|RG|CARGO|FUN[CÇ][AÃ]O|SAL[AÁ]RIO|ADMISS[AÃ]O|TELEFONE|CELULAR|E-?MAIL|ENDERE[CÇ]O|BANCO)\s*[:=\-]|\s*[|;]|$)/i])),
    cpf: normalizeCpf(first(text, [/\bCPF\s*[:=\-]?\s*(\d{3}\.?\d{3}\.?\d{3}[-\s]?\d{2}|\d{11})\b/i])),
    rg: first(text, [/\b(?:RG|IDENTIDADE)\s*[:=\-]?\s*([0-9A-Z.\-\/]{4,25})/i]),
    cargo: trimAtNextLabel(first(text, [/(?:CARGO\s*\/\s*FUN[CÇ][AÃ]O|CARGO|FUN[CÇ][AÃ]O)\s*[:=\-]?\s*(.+?)(?=\s+(?:SAL[AÁ]RIO|ADMISS[AÃ]O|TELEFONE|CELULAR|E-?MAIL|ENDERE[CÇ]O|BANCO)\s*[:=\-]|\s*[|;]|$)/i])),
    salario_base: normalizeMoney(first(text, [/(?:SAL[AÁ]RIO\s+BASE|SAL[AÁ]RIO|REMUNERA[CÇ][AÃ]O)\s*[:=\-]?\s*(?:R\$\s*)?([0-9.,]+)/i])),
    data_admissao: normalizeDate(first(text, [/(?:DATA\s+DE\s+ADMISS[AÃ]O|ADMISS[AÃ]O|ADMITIDO\s+EM)\s*[:=\-]?\s*(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{4}|\d{4}-\d{2}-\d{2})/i])),
    telefone: first(text, [/(?:TELEFONE|FONE)\s*[:=\-]?\s*(\+?\d[\d\s()\-.]{8,20})/i]),
    celular: first(text, [/(?:CELULAR|WHATSAPP|WHATS)\s*[:=\-]?\s*(\+?\d[\d\s()\-.]{8,20})/i]),
    email: first(text, [/(?:E-?MAIL)\s*[:=\-]?\s*([^\s|;,]+@[^\s|;,]+\.[A-Z]{2,})/i]) || text.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i)?.[0] || "",
    endereco: trimAtNextLabel(first(text, [/(?:ENDERE[CÇ]O\s+COMPLETO|ENDERE[CÇ]O|RESID[EÊ]NCIA)\s*[:=\-]?\s*(.+?)(?=\s+(?:BANCO|AG[EÊ]NCIA|CONTA|PIX)\s*[:=\-]|\s*[|;]|$)/i])),
    banking: parseBanking(raw),
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

const bankingSchema = {
  type: "object",
  properties: {
    banco: { type: "string" }, bancoCodigo: { type: "string" }, agencia: { type: "string" },
    conta: { type: "string" }, digito: { type: "string" }, tipoConta: { type: "string" },
    titular: { type: "string" }, cpfTitular: { type: "string" }, chavePix: { type: "string" }, tipoChavePix: { type: "string" },
  },
};

const schemaFor = (type: string) => {
  if (type === "funcionario") return {
    nome: { type: "string" }, cpf: { type: "string" }, rg: { type: "string" }, cargo: { type: "string" },
    salario_base: { type: "string" }, data_admissao: { type: "string" }, telefone: { type: "string" },
    celular: { type: "string" }, email: { type: "string" }, endereco: { type: "string" }, banking: bankingSchema,
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
  if (!key || (!text.trim() && !images.length)) return null;
  const content = images.length
    ? [
      { type: "text", text: text || "Leia o documento." },
      ...images.slice(0, 3).map((image) => ({ type: "image_url", image_url: { url: image } })),
    ]
    : text;
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: "Extraia somente dados explicitamente visíveis. Respeite cada rótulo e não misture campos. Não invente valores. Retorne string vazia quando não localizar. Para funcionário, separe rigorosamente identidade, contato e dados bancários." },
        { role: "user", content },
      ],
      tools: [{ type: "function", function: {
        name: "extract_fields",
        description: "Extrair campos estruturados sem inferir informações ausentes",
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

const mergeFillMissing = (base: Record<string, unknown>, extra: Record<string, unknown> | null): Record<string, unknown> => {
  if (!extra) return base;
  const output: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(extra)) {
    const current = output[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      output[key] = mergeFillMissing((current && typeof current === "object" ? current : {}) as Record<string, unknown>, value as Record<string, unknown>);
    } else if ((!current || !String(current).trim()) && typeof value === "string" && value.trim()) {
      output[key] = value.trim();
    }
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

    const nonEmptyCount = Object.values(deterministic).filter((value) => typeof value === "string" && value.trim()).length;
    const vehicleMissing = type === "documento_veiculo" && (!deterministic.renavam || !deterministic.chassi);
    const employeeBanking = (deterministic.banking || {}) as Record<string, unknown>;
    const employeeHasBankSignal = type === "funcionario" && /\b(?:banco|ag[eê]ncia|conta|pix)\b/i.test(text);
    const employeeMissing = type === "funcionario" && (
      (!deterministic.nome && !deterministic.cpf) ||
      (employeeHasBankSignal && (!employeeBanking.banco || !employeeBanking.agencia || !employeeBanking.conta))
    );
    const sparse = nonEmptyCount < 3;
    const ai = vehicleMissing || employeeMissing || sparse ? await aiExtract(type, text, images) : null;
    const data = mergeFillMissing(deterministic, ai);

    if (type === "documento_veiculo") {
      data.placa = normalizePlate(data.placa);
      data.renavam = normalizeRenavam(data.renavam);
      data.chassi = normalizeChassi(data.chassi);
    }
    if (type === "funcionario") {
      data.cpf = normalizeCpf(data.cpf);
      const banking = (data.banking || {}) as Record<string, unknown>;
      banking.cpfTitular = normalizeCpf(banking.cpfTitular);
      data.banking = banking;
    }

    const warnings = type === "documento_veiculo"
      ? [!data.renavam ? "RENAVAM não identificado." : "", !data.chassi ? "Chassi não identificado." : ""].filter(Boolean)
      : type === "funcionario"
        ? [!data.nome && !data.cpf ? "Identidade do funcionário não confirmada." : ""].filter(Boolean)
        : [];
    return json({ data, warnings, source: ai ? "deterministic+ai" : "deterministic" });
  } catch (error) {
    console.error("parse-text error:", error);
    return json({ error: "parse_failed", message: error instanceof Error ? error.message : String(error) }, 500);
  }
});
