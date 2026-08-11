from pathlib import Path
import re


def sub1(pattern, repl, text, *, flags=re.S, label="patch"):
    new, count = re.subn(pattern, lambda _m: repl, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 replacement, got {count}")
    return new


# -----------------------------------------------------------------------------
# Supabase Edge Function: preserve all existing non-vehicle flows, harden vehicle
# vision extraction only.
# -----------------------------------------------------------------------------
p = Path("supabase/functions/parse-text/index.ts")
s = p.read_text(encoding="utf-8")

chassi_marker = '''const normalizeChassi = (value: unknown) => String(value || "")
  .toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, "")
  .match(/[A-HJ-NPR-Z0-9]{17}/)?.[0] || "";
'''
if chassi_marker not in s:
    raise SystemExit("normalizeChassi marker not found")
s = s.replace(chassi_marker, chassi_marker + r'''
const normalizeVehicleYear = (value: unknown) => {
  const match = String(value || "").match(/\b((?:19|20)\d{2})\b/);
  if (!match) return "";
  const year = Number(match[1]);
  return year >= 1900 && year <= 2100 ? match[1] : "";
};

const normalizeVehicleDate = (value: unknown) => {
  const raw = clean(value);
  let match = raw.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);
  if (match) return `${match[1].padStart(2, "0")}/${match[2].padStart(2, "0")}/${match[3]}`;
  match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  return "";
};

const splitBrandModel = (value: unknown) => {
  const full = clean(value).toUpperCase();
  const slashBrand = full.match(/^([A-Z0-9.-]+\/[A-Z0-9.-]+)\s+(.{2,})$/);
  return slashBrand ? { marca: clean(slashBrand[1]), modelo: clean(slashBrand[2]) } : { marca: "", modelo: "" };
};
''', 1)

vehicle_fn = r'''const parseVehicle = (raw: string) => {
  const text = flatten(raw).toUpperCase();
  const yearPair = text.match(/\b((?:19|20)\d{2})\s*\/\s*((?:19|20)\d{2})\b/);
  const fullModel = first(text, [
    /(?:MARCA\s*\/?\s*MODELO\s*\/?\s*VERS[AÃ]O|MARCA\s*\/?\s*MODELO|MODELO\s*\/\s*VERS[AÃ]O)\s*[:\-]?\s*([^|]{2,100})/i,
  ]).replace(/\s+(?:PLACA|RENAVAM|CHASSI|ANO|ESP[EÉ]CIE|TIPO|EXERC[IÍ]CIO|DATA)\b.*$/i, "").trim();
  const split = splitBrandModel(fullModel);
  const tipo = first(text, [
    /(?:ESP[EÉ]CIE\s*\/\s*TIPO|TIPO)\s*[:\-]?\s*([^|]{2,60})/i,
  ]).replace(/\s+(?:PLACA|RENAVAM|CHASSI|ANO|EXERC[IÍ]CIO|DATA)\b.*$/i, "").trim();
  const especie = first(text, [
    /(?:ESP[EÉ]CIE\s*\/\s*TIPO|ESP[EÉ]CIE)\s*[:\-]?\s*([^|]{2,60})/i,
  ]).split(/[\/-]/)[0]?.trim() || "";
  const dateRaw = first(text, [
    /(?:DATA\s+DE\s+EMISS[AÃ]O|DATA\s+DO\s+DOCUMENTO|DATA)\s*[:\-]?\s*(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{4})/i,
  ]);
  return {
    placa: normalizePlate(first(text, [/\bPLACA\s*[:\-]?\s*([A-Z]{3}\s*-?\s*[0-9][A-Z0-9]\s*-?\s*[0-9]{2})/i]) || text),
    renavam: normalizeRenavam(first(text, [/(?:C[OÓ]DIGO\s+)?RENAVAM\s*[:\-]?\s*(\d{9,11})/i])),
    chassi: normalizeChassi(first(text, [/\b(?:CHASSI|VIN)\s*[:\-]?\s*([A-HJ-NPR-Z0-9]{17})/i]) || text),
    marca: split.marca,
    modelo: split.modelo,
    marcaModeloVersao: fullModel,
    tipo,
    especie,
    anoFabricacao: normalizeVehicleYear(first(text, [/(?:ANO\s+FABRICA[CÇ][AÃ]O|FABRICA[CÇ][AÃ]O|FAB\/MOD)\s*[:\-]?\s*((?:19|20)\d{2})/i]) || yearPair?.[1] || ""),
    anoModelo: normalizeVehicleYear(first(text, [/(?:ANO\s+MODELO|FAB\/MOD)\s*[:\-]?\s*(?:19|20)\d{2}\s*\/\s*((?:19|20)\d{2})/i]) || yearPair?.[2] || ""),
    exercicioDocumento: normalizeVehicleYear(first(text, [/(?:EXERC[IÍ]CIO|ANO\s+DO\s+DOCUMENTO)\s*[:\-]?\s*((?:19|20)\d{2})/i])),
    dataDocumento: normalizeVehicleDate(dateRaw),
    patrimonio: first(text, [/\bPATRIM[OÔ]NIO\s*[:\-]?\s*([A-Z0-9./-]{2,30})/i]),
    empresa: first(text, [/(?:PROPRIET[AÁ]RIO|EMPRESA|NOME)\s*[:\-]?\s*([^|]{3,100})/i]),
    observacao: "",
  };
};

const parseBanking'''
s = sub1(r'const parseVehicle = \(raw: string\) => \{.*?\n\};\n\nconst parseBanking', vehicle_fn, s, label="parseVehicle")

old_vehicle_schema = r'''  return {
    placa: { type: "string" }, renavam: { type: "string" }, chassi: { type: "string" },
    ano_fabricacao: { type: "string" }, ano_modelo: { type: "string" }, patrimonio: { type: "string" },
    marca_modelo: { type: "string" }, descricao: { type: "string" }, empresa: { type: "string" }, observacao: { type: "string" },
  };
};'''
new_vehicle_schema = r'''  return {
    placa: { type: "string" }, renavam: { type: "string" }, chassi: { type: "string" },
    marca: { type: "string" }, modelo: { type: "string" }, marcaModeloVersao: { type: "string" },
    tipo: { type: "string" }, especie: { type: "string" },
    anoFabricacao: { type: "string" }, anoModelo: { type: "string" },
    exercicioDocumento: { type: "string" }, dataDocumento: { type: "string" },
    patrimonio: { type: "string" }, empresa: { type: "string" }, observacao: { type: "string" },
  };
};'''
if old_vehicle_schema not in s:
    raise SystemExit("vehicle schema marker not found")
s = s.replace(old_vehicle_schema, new_vehicle_schema, 1)

pipeline_support = r'''
class PipelineError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 500) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const vehicleVisionPrompt = `You are a Brazilian vehicle document extraction specialist.
Analyze the complete image of the Brazilian CRLV/CRLV-e document.
Do not perform simple blind OCR only. Understand the visual relationship between field labels and their respective values.
Extract only information actually visible in the document.
Required fields: license plate, RENAVAM, chassis/VIN, brand, model, full brand/model/version, vehicle type, species, manufacturing year, model year, document exercise year, document issue/date when available.
Important rules:
- Never hallucinate missing information.
- Preserve leading zeros in RENAVAM.
- Plate, RENAVAM and chassis must be strings.
- Read values based on their field labels and page positioning.
- Distinguish manufacturing year from model year.
- Distinguish document exercise year from manufacturing/model year.
- If information cannot be determined confidently, return an empty string.
- Return structured JSON only through the extract_fields tool.`;

const gatewayAttempt = async (key: string, body: unknown) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    return await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
};
'''
if 'const aiExtract = async' not in s:
    raise SystemExit("aiExtract marker not found")
s = s.replace('const aiExtract = async', pipeline_support + '\nconst aiExtract = async', 1)

new_ai = r'''const aiExtract = async (type: string, text: string, images: string[]) => {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) {
    if (type === "documento_veiculo" && images.length) {
      throw new PipelineError("VISION_API_ERROR", "Serviço de visão não configurado.", 503);
    }
    return null;
  }
  if (!text.trim() && !images.length) return null;
  const content = images.length
    ? [
      { type: "text", text: text || "Analyze the complete document image." },
      ...images.slice(0, 3).map((image) => ({ type: "image_url", image_url: { url: image } })),
    ]
    : text;
  const requestBody = {
    model: "google/gemini-2.5-flash",
    messages: [
      { role: "system", content: type === "documento_veiculo" ? vehicleVisionPrompt : "Extraia somente dados explicitamente visíveis. Respeite cada rótulo e não misture campos. Não invente valores." },
      { role: "user", content },
    ],
    tools: [{ type: "function", function: {
      name: "extract_fields",
      description: "Extrair campos estruturados sem inferir informações ausentes",
      parameters: { type: "object", properties: schemaFor(type), required: [] },
    } }],
    tool_choice: { type: "function", function: { name: "extract_fields" } },
  };

  let response: Response | null = null;
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      response = await gatewayAttempt(key, requestBody);
      if (response.ok) break;
      lastError = `HTTP ${response.status}`;
      if (response.status < 500 && response.status !== 429) break;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  if (!response?.ok) throw new PipelineError("VISION_API_ERROR", `Falha na IA de visão: ${lastError || "resposta inválida"}.`, 502);
  const payload = await response.json().catch(() => null);
  const args = payload?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new PipelineError("DOCUMENT_PARSE_ERROR", "A IA de visão não retornou dados estruturados.", 422);
  try {
    return JSON.parse(args);
  } catch {
    throw new PipelineError("DOCUMENT_PARSE_ERROR", "A IA de visão retornou JSON inválido.", 422);
  }
};'''
s = sub1(r'const aiExtract = async \(type: string, text: string, images: string\[\]\) => \{.*?\n\};\n\nconst mergeFillMissing', new_ai + '\n\nconst mergeFillMissing', s, label="aiExtract")

normalize_result = r'''
const valueOrNull = (value: unknown) => clean(value) || null;

const normalizeVehicleResult = (base: Record<string, unknown>, ai: Record<string, unknown> | null) => {
  const pick = (...values: unknown[]) => values.map((value) => clean(value)).find(Boolean) || "";
  const fullModel = pick(ai?.marcaModeloVersao, ai?.marca_modelo_versao, ai?.marca_modelo, base.marcaModeloVersao);
  const split = splitBrandModel(fullModel);
  const placa = normalizePlate(pick(ai?.placa, base.placa));
  const renavam = normalizeRenavam(pick(ai?.renavam, base.renavam));
  const chassi = normalizeChassi(pick(ai?.chassi, base.chassi));
  const anoFabricacao = normalizeVehicleYear(pick(ai?.anoFabricacao, ai?.ano_fabricacao, base.anoFabricacao));
  const anoModelo = normalizeVehicleYear(pick(ai?.anoModelo, ai?.ano_modelo, base.anoModelo));
  const exercicioDocumento = normalizeVehicleYear(pick(ai?.exercicioDocumento, ai?.exercicio_documento, base.exercicioDocumento));
  const dataDocumento = normalizeVehicleDate(pick(ai?.dataDocumento, ai?.data_documento, base.dataDocumento));
  const marca = pick(ai?.marca, base.marca, split.marca);
  const modelo = pick(ai?.modelo, base.modelo, split.modelo);
  const tipo = pick(ai?.tipo, base.tipo);
  const especie = pick(ai?.especie, base.especie);
  const patrimonio = pick(ai?.patrimonio, base.patrimonio);
  const empresa = pick(ai?.empresa, base.empresa);
  const descricao = fullModel || [marca, modelo].filter(Boolean).join(" ") || tipo;
  return {
    placa: valueOrNull(placa), renavam: valueOrNull(renavam), chassi: valueOrNull(chassi),
    marca: valueOrNull(marca), modelo: valueOrNull(modelo),
    marcaModeloVersao: valueOrNull(fullModel), marca_modelo: valueOrNull(fullModel), marca_modelo_versao: valueOrNull(fullModel),
    tipo: valueOrNull(tipo), especie: valueOrNull(especie),
    anoFabricacao: valueOrNull(anoFabricacao), anoModelo: valueOrNull(anoModelo),
    ano_fabricacao: valueOrNull(anoFabricacao), ano_modelo: valueOrNull(anoModelo),
    exercicioDocumento: valueOrNull(exercicioDocumento), exercicio_documento: valueOrNull(exercicioDocumento),
    dataDocumento: valueOrNull(dataDocumento), data_documento: valueOrNull(dataDocumento),
    patrimonio: valueOrNull(patrimonio), empresa: valueOrNull(empresa), descricao: valueOrNull(descricao),
    observacao: valueOrNull(pick(ai?.observacao, base.observacao)),
  };
};
'''
serve_marker = '\nserve(async (req) => {'
if serve_marker not in s:
    raise SystemExit("serve marker not found")
s = s.replace(serve_marker, normalize_result + serve_marker, 1)

processing = r'''let data: Record<string, unknown>;
    let usedAi = false;
    if (type === "documento_veiculo") {
      const core = ["placa", "renavam", "chassi", "anoFabricacao", "anoModelo", "marcaModeloVersao"];
      const missingCore = core.filter((key) => !clean(deterministic[key]));
      const textWeak = text.trim().length < 80 || missingCore.length > 0;
      let ai: Record<string, unknown> | null = null;
      if (images.length && textWeak) {
        ai = await aiExtract(type, text, images);
        usedAi = Boolean(ai);
      }
      data = normalizeVehicleResult(deterministic, ai);
      if (!data.placa && !data.renavam && !data.chassi) {
        throw new PipelineError("DOCUMENT_VALIDATION_ERROR", "Documento processado, mas não foi possível confirmar Placa, RENAVAM ou Chassi.", 422);
      }
    } else {
      const nonEmptyCount = Object.values(deterministic).filter((value) => typeof value === "string" && value.trim()).length;
      const employeeBanking = (deterministic.banking || {}) as Record<string, unknown>;
      const employeeHasBankSignal = type === "funcionario" && /\b(?:banco|ag[eê]ncia|conta|pix)\b/i.test(text);
      const employeeMissing = type === "funcionario" && (
        (!deterministic.nome && !deterministic.cpf) ||
        (employeeHasBankSignal && (!employeeBanking.banco || !employeeBanking.agencia || !employeeBanking.conta))
      );
      const sparse = nonEmptyCount < 3;
      const ai = employeeMissing || sparse ? await aiExtract(type, text, images) : null;
      usedAi = Boolean(ai);
      data = mergeFillMissing(deterministic, ai);
    }

    if (type === "funcionario") {'''
s = sub1(r'const nonEmptyCount = .*?if \(type === "funcionario"\) \{', processing, s, label="processing")

warnings = r'''const warnings = type === "documento_veiculo"
      ? [
        !data.placa ? "Placa não identificada." : "",
        !data.renavam ? "RENAVAM não identificado." : "",
        !data.chassi ? "Chassi não identificado." : "",
        !data.anoFabricacao ? "Ano de fabricação não identificado." : "",
        !data.anoModelo ? "Ano modelo não identificado." : "",
        !data.marcaModeloVersao ? "Marca/Modelo/Versão não identificado." : "",
      ].filter(Boolean)
      : type === "funcionario"
        ? [!data.nome && !data.cpf ? "Identidade do funcionário não confirmada." : ""].filter(Boolean)
        : [];
    return json({ data, warnings, source: usedAi ? "deterministic+vision" : "deterministic", model: usedAi ? "google/gemini-2.5-flash" : null });'''
s = sub1(r'const warnings = type === "documento_veiculo".*?return json\(\{ data, warnings, source: ai \? "deterministic\+ai" : "deterministic" \}\);', warnings, s, label="warnings")

catch_repl = r'''  } catch (error) {
    const code = error instanceof PipelineError ? error.code : "DOCUMENT_PARSE_ERROR";
    const status = error instanceof PipelineError ? error.status : 500;
    const message = error instanceof Error ? error.message : String(error);
    console.error("parse-text error:", { code, message });
    return json({ error: code, message }, status);
  }
});'''
s = sub1(r'  \} catch \(error\) \{\n    console\.error\("parse-text error:", error\);\n    return json\(\{ error: "parse_failed", message: error instanceof Error \? error\.message : String\(error\) \}, 500\);\n  \}\n\}\);', catch_repl, s, label="catch")
p.write_text(s, encoding="utf-8")


# -----------------------------------------------------------------------------
# Existing Frota page: logic only. No JSX/layout/style changes.
# -----------------------------------------------------------------------------
p = Path("src/pages/DocumentosVeiculosPage.tsx")
s = p.read_text(encoding="utf-8")

normalize_block = r'''const normalizeVehicleExtraction = (aiData: any, localData: any, fileName: string) => {
  const pick = (...values: any[]) => values.map((value) => String(value ?? '').trim()).find(Boolean) || '';
  const marcaModeloVersao = cleanModelText(pick(aiData?.marcaModeloVersao, aiData?.marca_modelo_versao, aiData?.marca_modelo, aiData?.modelo, localData?.marca_modelo));
  const marca = pick(aiData?.marca);
  const modelo = pick(aiData?.modelo, marcaModeloVersao);
  const rawDescricao = pick(aiData?.descricao, localData?.descricao, marcaModeloVersao);
  const context = `${rawDescricao} ${marcaModeloVersao} ${aiData?.tipo || ''} ${aiData?.especie || ''} ${localData?.sourceText || ''}`;
  const descricao = inferDescricaoTipo(context, isPlateLike(rawDescricao) ? marcaModeloVersao : rawDescricao || marcaModeloVersao);
  const rawDate = pick(aiData?.dataDocumento, aiData?.data_documento);
  const dateMatch = rawDate.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);
  const dataDocumentoIso = dateMatch ? `${dateMatch[3]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[1].padStart(2, '0')}` : (/^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : '');

  return {
    placa: formatPlaca(pick(aiData?.placa, localData?.placa, fileName)),
    renavam: formatRenavam(pick(aiData?.renavam, localData?.renavam)),
    chassi: formatChassi(pick(aiData?.chassi, localData?.chassi)),
    ano_fabricacao: pick(aiData?.anoFabricacao, aiData?.ano_fabricacao, localData?.ano_fabricacao).replace(/\D/g, '').slice(0, 4),
    ano_modelo: pick(aiData?.anoModelo, aiData?.ano_modelo, localData?.ano_modelo).replace(/\D/g, '').slice(0, 4),
    patrimonio: pick(aiData?.patrimonio, localData?.patrimonio),
    descricao,
    empresa: pick(aiData?.empresa, localData?.empresa, 'TOPAC MATRIZ'),
    observacao: pick(aiData?.observacao, localData?.observacao),
    marca,
    modelo,
    marca_modelo: marcaModeloVersao,
    marca_modelo_versao: marcaModeloVersao,
    tipo_documento_veiculo: pick(aiData?.tipo),
    especie: pick(aiData?.especie),
    exercicio_documento: pick(aiData?.exercicioDocumento, aiData?.exercicio_documento).replace(/\D/g, '').slice(0, 4),
    data_documento: rawDate,
    data_documento_iso: dataDocumentoIso,
    vision_source: pick(aiData?.source),
  };
};

const parseVehicleTextLocally'''
s = sub1(r'const normalizeVehicleExtraction = \(aiData: any, localData: any, fileName: string\) => \{.*?\n\};\n\nconst parseVehicleTextLocally', normalize_block, s, label="frontend normalize")

analyze_block = r'''  const analyzeVehiclePdf = async (source: File | Uint8Array, fileName: string) => {
    const bytes = source instanceof File ? new Uint8Array(await source.arrayBuffer()) : source;
    const extractedText = await extractPdfTextByLines(bytes)
      .catch(() => extractPdfText(bytes))
      .catch(() => '');
    const localData = parseVehicleTextLocally(extractedText, fileName);
    let pageUrls: string[] = [];
    try {
      const rendered = await renderPdfPagesToDataUrls(bytes, 1.8, 2);
      pageUrls = rendered.pageUrls;
    } catch (error: any) {
      throw new Error(`PDF_RENDER_ERROR: ${error?.message || 'Não foi possível renderizar o PDF para leitura visual.'}`);
    }

    const { data, error } = await supabase.functions.invoke('parse-text', {
      body: {
        text: `Arquivo: ${fileName}\n\n${extractedText}`.trim(),
        images: pageUrls,
        type: 'documento_veiculo',
      },
    });

    if (error) {
      let detail = error.message || 'Falha ao consultar a IA de visão.';
      try {
        const payload = await (error as any)?.context?.json?.();
        detail = payload?.message || payload?.error || detail;
      } catch (parseError) {
        console.warn('Não foi possível detalhar resposta da função parse-text.', parseError);
      }
      throw new Error(`VISION_API_ERROR: ${detail}`);
    }
    if (data?.error) throw new Error(`${data.error}: ${data?.message || 'Falha ao interpretar o documento.'}`);
    if (!data?.data) throw new Error('DOCUMENT_PARSE_ERROR: A leitura não retornou dados estruturados.');

    const normalized = normalizeVehicleExtraction({ ...data.data, source: data.source }, localData, fileName);
    if (!normalized.placa && !normalized.renavam && !normalized.chassi) {
      throw new Error('DOCUMENT_VALIDATION_ERROR: Placa, RENAVAM e Chassi não puderam ser confirmados.');
    }
    return normalized;
  };

  const uploadDocumentoVeiculo'''
s = sub1(r'  const analyzeVehiclePdf = async \(source: File \| Uint8Array, fileName: string\) => \{.*?\n  \};\n\n  const uploadDocumentoVeiculo', analyze_block, s, label="frontend analyze")

silent = "      const extracted = await analyzeVehiclePdf(file, file.name).catch(() => ({}));"
if silent not in s:
    raise SystemExit("silent analyze catch not found")
s = s.replace(silent, "      const extracted = await analyzeVehiclePdf(file, file.name);", 1)

direct_marker = "    tipo_veiculo: extracted?.tipo_veiculo || (tipo === 'equipamento' ? 'equipamento' : 'carro'),\n    documento_url: upload.url,"
if direct_marker not in s:
    raise SystemExit("direct cloud record marker not found")
s = s.replace(direct_marker, "    tipo_veiculo: extracted?.tipo_veiculo || (tipo === 'equipamento' ? 'equipamento' : 'carro'),\n    marca_modelo_versao: extracted?.marca_modelo_versao || extracted?.marca_modelo || '',\n    tipo_documento_veiculo: extracted?.tipo_documento_veiculo || '',\n    especie: extracted?.especie || '',\n    exercicio_documento: extracted?.exercicio_documento || '',\n    data_documento: extracted?.data_documento_iso || null,\n    documento_url: upload.url,", 1)
p.write_text(s, encoding="utf-8")


# -----------------------------------------------------------------------------
# Vercel upload handler: retain multipart route and auth, map vision fields and
# return typed stage errors.
# -----------------------------------------------------------------------------
p = Path("api/frota-upload-v2.ts")
s = p.read_text(encoding="utf-8")

year_marker = "const normalizeYear = (value: unknown) => String(value || '').match(/(?:19|20)\\d{2}/)?.[0] || '';"
if year_marker not in s:
    raise SystemExit("api normalizeYear marker not found")
s = s.replace(year_marker, year_marker + "\nconst normalizeDateIso = (value: unknown) => {\n  const raw = String(value || '').trim();\n  const br = raw.match(/^(\\d{1,2})[\\/.\\-](\\d{1,2})[\\/.\\-](\\d{4})$/);\n  if (br) return `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`;\n  return /^\\d{4}-\\d{2}-\\d{2}$/.test(raw) ? raw : '';\n};", 1)

merge_block = r'''const mergeExtraction = (serverData: any, clientData: any, fileName: string) => {
  const placa = normalizePlate(first(clientData?.placa, serverData?.placa, fileName));
  const renavam = normalizeRenavam(first(clientData?.renavam, serverData?.renavam));
  const chassi = normalizeChassi(first(clientData?.chassi, serverData?.chassi));
  const anoFabricacao = normalizeYear(first(clientData?.ano_fabricacao, clientData?.anoFabricacao, serverData?.ano_fabricacao, clientData?.ano));
  const anoModelo = normalizeYear(first(clientData?.ano_modelo, clientData?.anoModelo, serverData?.ano_modelo, clientData?.ano, anoFabricacao));
  const patrimonio = normalizePatrimonio(first(clientData?.patrimonio, serverData?.patrimonio));
  const marcaModeloVersao = first(clientData?.marca_modelo_versao, clientData?.marcaModeloVersao, clientData?.marca_modelo, serverData?.marca_modelo_versao, serverData?.modelo);
  const descricao = first(clientData?.descricao, marcaModeloVersao, serverData?.descricao, clientData?.modelo, serverData?.modelo, patrimonio, placa, 'ATIVO');
  const context = normalizeText(`${descricao} ${serverData?.tipo || ''} ${clientData?.tipo || ''} ${clientData?.tipo_veiculo || ''} ${clientData?.tipo_documento_veiculo || ''}`);
  const equipamento = /\b(COMPRESSOR|GERADOR|EQUIPAMENTO|PLATAFORMA|BOMBA|TORRE|MOTOCOMPRESSOR)\b/.test(context) || serverData?.tipo === 'equipamento';
  return {
    placa, renavam, chassi, ano_fabricacao: anoFabricacao, ano_modelo: anoModelo, patrimonio, descricao,
    empresa: first(clientData?.empresa, serverData?.empresa, 'TOPAC MATRIZ'),
    marca: first(clientData?.marca, serverData?.marca),
    modelo: first(clientData?.modelo, serverData?.modelo),
    marca_modelo_versao: marcaModeloVersao,
    tipo_documento_veiculo: first(clientData?.tipo_documento_veiculo, clientData?.tipoDocumento, serverData?.tipo_documento_veiculo),
    especie: first(clientData?.especie, serverData?.especie),
    exercicio_documento: normalizeYear(first(clientData?.exercicio_documento, clientData?.exercicioDocumento, serverData?.exercicio_documento)),
    data_documento: normalizeDateIso(first(clientData?.data_documento_iso, clientData?.data_documento, clientData?.dataDocumento, serverData?.data_documento)),
    cor: first(clientData?.cor, serverData?.cor),
    categoria_veiculo: first(clientData?.categoria_veiculo, serverData?.categoria_veiculo),
    tipo_veiculo: first(clientData?.tipo_veiculo, serverData?.tipo_veiculo, equipamento ? 'equipamento' : 'carro'),
    observacao: first(clientData?.observacao, serverData?.observacao),
    tipo: equipamento ? 'equipamento' : 'veiculo',
  };
};

const storagePathFromUrl'''
s = sub1(r'const mergeExtraction = \(serverData: any, clientData: any, fileName: string\) => \{.*?\n\};\n\nconst storagePathFromUrl', merge_block, s, label="api merge")

api_record_marker = "    tipo_veiculo: extracted.tipo_veiculo || (extracted.tipo === 'equipamento' ? 'equipamento' : 'carro'),\n  };"
if api_record_marker not in s:
    raise SystemExit("api record marker not found")
s = s.replace(api_record_marker, "    tipo_veiculo: extracted.tipo_veiculo || (extracted.tipo === 'equipamento' ? 'equipamento' : 'carro'),\n    marca_modelo_versao: extracted.marca_modelo_versao || '',\n    tipo_documento_veiculo: extracted.tipo_documento_veiculo || '',\n    especie: extracted.especie || '',\n    exercicio_documento: extracted.exercicio_documento || '',\n    data_documento: extracted.data_documento || null,\n  };", 1)

s = s.replace("return sendJson(res, 400, { ok: false, error: `Upload multipart inválido: ${error?.message || error}` });", "return sendJson(res, 400, { ok: false, code: 'PDF_UPLOAD_ERROR', error: `Upload multipart inválido: ${error?.message || error}` });")
s = s.replace("return sendJson(res, 400, { ok: false, error: 'PDF não recebido.' });", "return sendJson(res, 400, { ok: false, code: 'PDF_UPLOAD_ERROR', error: 'PDF não recebido.' });")
s = s.replace("return sendJson(res, 422, { ok: false, error: 'PDF recebido, mas Placa/Patrimônio não foram identificados. Confira se o documento está legível.' });", "return sendJson(res, 422, { ok: false, code: 'DOCUMENT_VALIDATION_ERROR', error: 'PDF recebido, mas Placa/Patrimônio não foram identificados. Confira se o documento está legível.' });")
s = s.replace("if (uploadError) return sendJson(res, 422, { ok: false, error: `Falha ao salvar PDF no Supabase Storage: ${uploadError.message}` });", "if (uploadError) return sendJson(res, 422, { ok: false, code: 'PDF_UPLOAD_ERROR', error: `Falha ao salvar PDF no Supabase Storage: ${uploadError.message}` });")
s = s.replace("return sendJson(res, 422, { ok: false, error: `PDF lido, mas o ativo não foi gravado: ${result.error?.message || 'erro desconhecido'}`, extracted });", "return sendJson(res, 422, { ok: false, code: 'DATABASE_INSERT_ERROR', error: `PDF lido, mas o ativo não foi gravado: ${result.error?.message || 'erro desconhecido'}`, extracted });")
p.write_text(s, encoding="utf-8")


# -----------------------------------------------------------------------------
# Backward-compatible schema additions (nullable; no UI impact).
# -----------------------------------------------------------------------------
Path("supabase/migrations/20260811155100_add_vehicle_document_vision_fields.sql").write_text(
    """alter table public.ativos\n"
    "  add column if not exists marca_modelo_versao text,\n"
    "  add column if not exists tipo_documento_veiculo text,\n"
    "  add column if not exists especie text,\n"
    "  add column if not exists exercicio_documento text,\n"
    "  add column if not exists data_documento date;\n""",
    encoding="utf-8",
)


# -----------------------------------------------------------------------------
# Regression tests.
# -----------------------------------------------------------------------------
Path("src/lib/__tests__/crlvVisionBackend.test.ts").write_text(r'''import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseVehiclePdfTextV2 } from "../../../api/frota-upload-v2";

describe("CRLV vision backend contract", () => {
  it("preserves RENAVAM leading zero and parses digital CRLV fields", () => {
    const text = `CÓDIGO RENAVAM 01098226981 PLACA FZX8D07 ANO FABRICAÇÃO 2016 ANO MODELO 2016 CHASSI 9A9REBD01G1EH4919 MARCA / MODELO / VERSÃO R/REBOCAR REB D01`;
    const data = parseVehiclePdfTextV2(text, "FZX8007.pdf");
    expect(data.placa).toBe("FZX8D07");
    expect(data.renavam).toBe("01098226981");
    expect(data.chassi).toBe("9A9REBD01G1EH4919");
    expect(data.ano_fabricacao).toBe("2016");
    expect(data.ano_modelo).toBe("2016");
  });

  it("does not reuse values between sequential documents", () => {
    const first = parseVehiclePdfTextV2("PLACA FZX8D07 RENAVAM 01098226981 CHASSI 9A9REBD01G1EH4919", "a.pdf");
    const second = parseVehiclePdfTextV2("PLACA GCO6C26 RENAVAM 12345678901 CHASSI 9BWZZZ377VT004251", "b.pdf");
    expect(first.placa).toBe("FZX8D07");
    expect(second.placa).toBe("GCO6C26");
    expect(second.renavam).toBe("12345678901");
  });

  it("keeps multimodal vision and typed errors in the Edge Function", () => {
    const source = readFileSync("supabase/functions/parse-text/index.ts", "utf8");
    expect(source).toContain("google/gemini-2.5-flash");
    expect(source).toContain("VISION_API_ERROR");
    expect(source).toContain("DOCUMENT_PARSE_ERROR");
    expect(source).toContain("DOCUMENT_VALIDATION_ERROR");
    expect(source).toContain("marcaModeloVersao");
    expect(source).toContain("exercicioDocumento");
    expect(source).toContain("dataDocumento");
  });
});
''', encoding="utf-8")

# Temporary automation cleans itself before committing.
Path("scripts/temp-crlv-vision-patch.py").unlink(missing_ok=True)
Path(".github/workflows/temp-crlv-vision-patch.yml").unlink(missing_ok=True)
