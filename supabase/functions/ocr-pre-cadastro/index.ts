const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Campo = { valor: string; confianca: number; observacao?: string };
type AiCampo = { valor?: string | number | null; confianca?: number; observacao?: string };
type AiResultado = {
  modelo_documento?: string;
  modelo_reconhecido?: boolean;
  confianca_geral?: number;
  campos?: Record<string, AiCampo>;
  pendencias?: string[];
  log?: string[];
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

const clean = (v: unknown) => String(v || "").replace(/\r/g, "\n").replace(/[\t ]+/g, " ").trim();
const line = (v: unknown) => clean(v).replace(/\n+/g, " ").trim();
const norm = (v: unknown) => line(v).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
const onlyDigits = (v: unknown) => String(v || "").replace(/\D/g, "");
const cleanJson = (v: string) => v.replace(/```json/gi, "").replace(/```/g, "").trim();
const valueOf = (campos: Record<string, AiCampo>, key: string) => line(campos[key]?.valor);
const confOf = (campos: Record<string, AiCampo>, key: string) => Math.max(0, Math.min(1, Number(campos[key]?.confianca || 0)));
const safeJoin = (parts: Array<string | null | undefined>, sep = " | ") => parts.map(line).filter(Boolean).join(sep);

const validCpf = (value: unknown) => {
  const cpf = onlyDigits(value);
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const digit = (length: number) => {
    let sum = 0;
    for (let i = 0; i < length; i += 1) sum += Number(cpf[i]) * (length + 1 - i);
    const result = (sum * 10) % 11;
    return result === 10 ? 0 : result;
  };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
};

const formatCpf = (value: unknown) => {
  const cpf = onlyDigits(value);
  return validCpf(cpf) ? cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : "";
};

const isoDate = (value: unknown) => {
  const raw = line(value);
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const br = raw.match(/(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})/);
  const year = Number(iso?.[1] || br?.[3]);
  const month = Number(iso?.[2] || br?.[2]);
  const day = Number(iso?.[3] || br?.[1]);
  if (!year || !month || !day) return "";
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "";
  const age = new Date().getUTCFullYear() - year;
  if (age < 14 || age > 100) return "";
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

const nameIsValid = (value: string) => {
  const n = norm(value);
  if (value.length < 7 || value.split(/\s+/).filter(Boolean).length < 2 || /\d/.test(value)) return false;
  if (/REPUBLICA|FEDERATIVA|BRASIL|SECRETARIA|MINISTERIO|DEPARTAMENTO|TRANSITO|CARTEIRA|HABILITACAO|REGISTRO|VALIDADE|EMISSAO|NASCIMENTO|FILIACAO|ELEITOR|CERTIDAO|ASSINATURA|DOCUMENTO|PAGADOR|BENEFICIARIO|TELECOM|NOME DO|DATA DE/.test(n)) return false;
  return /^[A-Za-zÀ-ÖØ-öø-ÿ' -]+$/.test(value);
};

const addressIsValid = (value: unknown) => {
  const v = line(value);
  const n = norm(v);
  if (v.length < 8 || /HTTP|WWW|QR.?CODE|VALIDA|AUTENTICIDADE|ASSINADO DIGITALMENTE|BENEFICIARIO|TELECOM LTDA/.test(n)) return false;
  return /\b(RUA|R\.|AVENIDA|AV\.|TRAVESSA|ALAMEDA|ESTRADA|RODOVIA|PRACA|VIELA|LARGO)\b/i.test(v) || /\b\d{5}-?\d{3}\b/.test(v);
};

const extractDeterministic = (raw: string) => {
  const text = clean(raw);
  const lines = text.split(/\n+/).map(line).filter(Boolean);
  let nome = "";
  let cpf = "";
  let rg = "";
  let dataNascimento = "";
  let endereco = "";

  const cpfCandidates = text.match(/\b\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2}\b/g) || [];
  cpf = cpfCandidates.map(formatCpf).find(Boolean) || "";

  const namePatterns = [
    /(?:NOME(?: COMPLETO| DO CONDUTOR| DO TITULAR| DO ELEITOR)?|NAME)\s*[:\-]?\s*(?:\n\s*)?([A-ZÀ-ÖØ-Ý][A-ZÀ-ÖØ-Ý' ]{6,})/i,
    /(?:CONDUTOR|TITULAR)\s*[:\-]?\s*(?:\n\s*)?([A-ZÀ-ÖØ-Ý][A-ZÀ-ÖØ-Ý' ]{6,})/i,
  ];
  for (const pattern of namePatterns) {
    const candidate = line(text.match(pattern)?.[1]);
    if (nameIsValid(candidate)) { nome = candidate; break; }
  }
  if (!nome) {
    nome = lines.filter(nameIsValid).sort((a, b) => {
      const score = (v: string) => (v === v.toUpperCase() ? 3 : 0) + Math.min(v.split(/\s+/).length, 6) - (/LTDA|S\.A\./i.test(v) ? 10 : 0);
      return score(b) - score(a);
    })[0] || "";
  }

  const birthPatterns = [
    /(?:DATA\s+DE\s+NASCIMENTO|DT\.?\s*NASC(?:IMENTO)?|NASCIMENTO|DATE OF BIRTH)[^\d]{0,50}(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{4})/i,
    /(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{4})[^\n]{0,40}(?:NASCIMENTO|NASC)/i,
  ];
  for (const pattern of birthPatterns) {
    dataNascimento = isoDate(text.match(pattern)?.[1] || "");
    if (dataNascimento) break;
  }
  if (!dataNascimento) {
    const dates = (text.match(/\b\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{4}\b/g) || [])
      .map((v) => ({ raw: v, iso: isoDate(v) }))
      .filter((v) => v.iso)
      .sort((a, b) => a.iso.localeCompare(b.iso));
    dataNascimento = dates[0]?.iso || "";
  }

  const rgPatterns = [
    /(?:RG|REGISTRO\s+GERAL|IDENTIDADE|DOC(?:UMENTO)?\s+DE\s+IDENTIDADE)\s*[:\-]?\s*([0-9]{1,2}[.\s]?[0-9]{3}[.\s]?[0-9]{3}[-\s]?[0-9Xx])/i,
    /([0-9]{2}[.]?[0-9]{3}[.]?[0-9]{3}[-]?[0-9Xx])\s*(?:SSP|SSP\/SP|SP)/i,
  ];
  for (const pattern of rgPatterns) {
    const candidate = line(text.match(pattern)?.[1]);
    if (candidate && onlyDigits(candidate).length >= 7 && onlyDigits(candidate).length <= 10 && onlyDigits(candidate) !== onlyDigits(cpf)) { rg = candidate; break; }
  }

  const addressIndex = lines.findIndex((item) => addressIsValid(item));
  if (addressIndex >= 0) {
    const parts = [lines[addressIndex]];
    for (let i = 1; i <= 2; i += 1) {
      const next = lines[addressIndex + i] || "";
      if (!next || /BENEFICIARIO|VENCIMENTO|VALOR|NOSSO NUMERO|CODIGO DE BARRAS/i.test(next)) break;
      parts.push(next);
    }
    const candidate = line(parts.join(", "));
    if (addressIsValid(candidate)) endereco = candidate;
  }

  return { nome, cpf, rg, data_nascimento: dataNascimento, endereco };
};

const fseDetectedFromText = (text: string) => {
  const n = norm(text);
  const hits = [
    /FICHA DE SOLICITACAO DE EMPREGO/.test(n),
    /CARGO PRETENDIDO/.test(n),
    /FORMACAO ESCOLAR/.test(n),
    /FORMACAO TECNICA/.test(n),
    /EXPERIENCIA PROFISSIONAL/.test(n),
    /DADOS PARA EPI/.test(n),
  ];
  return hits.filter(Boolean).length >= 2;
};

const FSE_SYSTEM = `Voce le documentos admissionais brasileiros da TOPAC RH PRO.
Sua prioridade e reconhecer e extrair a Ficha de Solicitacao de Emprego TOPAC, padrao FSE-2026.

O layout pode mudar, mas o papel timbrado/logotipo TOPAC deve ser tratado apenas como identificacao do formulario. NUNCA use o timbre para preencher a empresa do candidato.

Sequencia do FSE-2026:
1 cargo pretendido;
2 dados pessoais: nome, pai, mae, estado civil, nascimento, dependentes, filhos, naturalidade, UF, nacionalidade;
3 documentos: RG/UF, CPF, CTPS/serie, titulo/zona/secao, PIS, reservista, CNH/UF/validade/categoria/primeira habilitacao;
4 endereco/contato: logradouro, numero, bairro, CEP, cidade, UF, telefone, celular, recados;
5 formacao escolar;
6 formacao tecnica;
7 ate 3 experiencias profissionais;
8 ate 3 referencias pessoais;
9 EPI: camisa, calca, bota;
10 principais atribuicoes;
11 outras informacoes;
12 declaracao/assinatura.

Regras:
- Nunca invente ou complete por contexto.
- Campo vazio, ilegivel, rasurado ou duvidoso = valor vazio e pendencia.
- Nao confunda cargo pretendido com cargo antigo.
- Nao confunda filiacao com referencias.
- Nao confunda EPI com documentos.
- CPF, nascimento e nome devem pertencer a mesma pessoa.
- Confianca de 0 a 1; abaixo de 0.75 inclua em pendencias.
- Se for a ficha TOPAC, modelo_documento="FSE-2026" e modelo_reconhecido=true.
- Se nao for a ficha, modelo_reconhecido=false, mas ainda pode extrair nome, CPF, RG, nascimento e endereco se estiverem claros.

Retorne APENAS JSON:
{
 "modelo_documento":"",
 "modelo_reconhecido":false,
 "confianca_geral":0,
 "campos":{
  "nome":{"valor":"","confianca":0},"cpf":{"valor":"","confianca":0},"rg":{"valor":"","confianca":0},"rg_uf":{"valor":"","confianca":0},
  "data_nascimento":{"valor":"","confianca":0},"cargo_pretendido":{"valor":"","confianca":0},
  "pai":{"valor":"","confianca":0},"mae":{"valor":"","confianca":0},"estado_civil":{"valor":"","confianca":0},
  "numero_dependentes":{"valor":"","confianca":0},"filhos_menores":{"valor":"","confianca":0},
  "naturalidade":{"valor":"","confianca":0},"uf_naturalidade":{"valor":"","confianca":0},"nacionalidade":{"valor":"","confianca":0},
  "ctps":{"valor":"","confianca":0},"ctps_serie":{"valor":"","confianca":0},"titulo_eleitor":{"valor":"","confianca":0},
  "zona_eleitoral":{"valor":"","confianca":0},"secao_eleitoral":{"valor":"","confianca":0},"pis":{"valor":"","confianca":0},
  "reservista":{"valor":"","confianca":0},"cnh":{"valor":"","confianca":0},"cnh_uf":{"valor":"","confianca":0},
  "cnh_validade":{"valor":"","confianca":0},"cnh_categoria":{"valor":"","confianca":0},"primeira_habilitacao":{"valor":"","confianca":0},
  "logradouro":{"valor":"","confianca":0},"numero_endereco":{"valor":"","confianca":0},"bairro":{"valor":"","confianca":0},
  "cep":{"valor":"","confianca":0},"cidade":{"valor":"","confianca":0},"uf_endereco":{"valor":"","confianca":0},
  "telefone":{"valor":"","confianca":0},"celular":{"valor":"","confianca":0},"recados":{"valor":"","confianca":0},
  "escolaridade_nivel":{"valor":"","confianca":0},"escolaridade_ano":{"valor":"","confianca":0},
  "estuda":{"valor":"","confianca":0},"horario_estudo":{"valor":"","confianca":0},"formacao_tecnica":{"valor":"","confianca":0},
  "experiencia":{"valor":"","confianca":0},"referencias":{"valor":"","confianca":0},
  "epi_camisa":{"valor":"","confianca":0},"epi_calca":{"valor":"","confianca":0},"epi_bota":{"valor":"","confianca":0},
  "principais_atribuicoes":{"valor":"","confianca":0},"outras_informacoes":{"valor":"","confianca":0},
  "funcao":{"valor":"","confianca":0},"filiacao":{"valor":"","confianca":0},"endereco":{"valor":"","confianca":0},
  "escolaridade":{"valor":"","confianca":0},"epi":{"valor":"","confianca":0},"responsavel_contato":{"valor":"","confianca":0},
  "empresa":{"valor":"","confianca":0},"salario":{"valor":"","confianca":0},"data_admissao":{"valor":"","confianca":0},
  "beneficios":{"valor":"","confianca":0},"insalubridade":{"valor":"","confianca":0},"setor_ghe":{"valor":"","confianca":0},
  "obra_local":{"valor":"","confianca":0},"jornada":{"valor":"","confianca":0},"email":{"valor":"","confianca":0}
 },
 "pendencias":[],
 "log":[]
}`;

const callVisualAi = async (fileName: string, text: string, images: string[]): Promise<AiResultado | null> => {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) return null;
  const userContent = [
    {
      type: "text",
      text: [
        `Arquivo: ${fileName}`,
        "Texto extraido:",
        text || "(sem camada de texto; leia visualmente)",
        "",
        "Leia os campos realmente preenchidos. Se for a ficha TOPAC, reconheca FSE-2026 mesmo com layout reorganizado e papel timbrado mantido.",
      ].join("\n"),
    },
    ...images.map((url: string) => ({ type: "image_url", image_url: { url } })),
  ];
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [{ role: "system", content: FSE_SYSTEM }, { role: "user", content: userContent }],
      temperature: 0,
      response_format: { type: "json_object" },
    }),
  });
  if (!resp.ok) throw new Error(`ai_error_${resp.status}: ${await resp.text()}`);
  const payload = await resp.json();
  const raw = payload?.choices?.[0]?.message?.content;
  const parsed = JSON.parse(cleanJson(typeof raw === "string" ? raw : JSON.stringify(raw || {})));
  return parsed as AiResultado;
};

const aggregateFse = (campos: Record<string, AiCampo>) => {
  if (!valueOf(campos, "funcao") && valueOf(campos, "cargo_pretendido")) {
    campos.funcao = { valor: valueOf(campos, "cargo_pretendido"), confianca: confOf(campos, "cargo_pretendido"), observacao: "Cargo pretendido FSE-2026" };
  }
  if (!valueOf(campos, "filiacao")) {
    const pai = valueOf(campos, "pai");
    const mae = valueOf(campos, "mae");
    const v = safeJoin([pai ? `Pai: ${pai}` : "", mae ? `Mae: ${mae}` : ""]);
    if (v) campos.filiacao = { valor: v, confianca: Math.min(...[confOf(campos, "pai"), confOf(campos, "mae")].filter((x) => x > 0), 0.8), observacao: "Filiacao consolidada" };
  }
  if (!valueOf(campos, "endereco")) {
    const v = safeJoin([
      safeJoin([valueOf(campos, "logradouro"), valueOf(campos, "numero_endereco")], ", "),
      valueOf(campos, "bairro"),
      safeJoin([valueOf(campos, "cidade"), valueOf(campos, "uf_endereco")], "/"),
      valueOf(campos, "cep") ? `CEP ${valueOf(campos, "cep")}` : "",
    ]);
    if (addressIsValid(v)) campos.endereco = { valor: v, confianca: 0.8, observacao: "Endereco consolidado" };
  }
  if (!valueOf(campos, "escolaridade")) {
    const v = safeJoin([
      safeJoin([valueOf(campos, "escolaridade_nivel"), valueOf(campos, "escolaridade_ano") ? `Ano: ${valueOf(campos, "escolaridade_ano")}` : ""]),
      valueOf(campos, "formacao_tecnica") ? `Tecnica: ${valueOf(campos, "formacao_tecnica")}` : "",
      valueOf(campos, "estuda") ? `Estuda: ${valueOf(campos, "estuda")}${valueOf(campos, "horario_estudo") ? ` - ${valueOf(campos, "horario_estudo")}` : ""}` : "",
    ]);
    if (v) campos.escolaridade = { valor: v, confianca: 0.78, observacao: "Formacao consolidada" };
  }
  if (!valueOf(campos, "epi")) {
    const v = safeJoin([
      valueOf(campos, "epi_camisa") ? `Camisa: ${valueOf(campos, "epi_camisa")}` : "",
      valueOf(campos, "epi_calca") ? `Calca: ${valueOf(campos, "epi_calca")}` : "",
      valueOf(campos, "epi_bota") ? `Bota: ${valueOf(campos, "epi_bota")}` : "",
    ]);
    if (v) campos.epi = { valor: v, confianca: 0.8, observacao: "EPI consolidado" };
  }
  if (!valueOf(campos, "responsavel_contato") && valueOf(campos, "referencias")) {
    campos.responsavel_contato = { valor: valueOf(campos, "referencias"), confianca: confOf(campos, "referencias"), observacao: "Referencias pessoais" };
  }
  return campos;
};

const mergeResults = (
  deterministic: ReturnType<typeof extractDeterministic>,
  ai: AiResultado | null,
  text: string,
) => {
  const campos: Record<string, AiCampo> = aggregateFse({ ...(ai?.campos || {}) });

  const aiNome = valueOf(campos, "nome");
  const aiCpf = formatCpf(valueOf(campos, "cpf"));
  const aiRg = valueOf(campos, "rg");
  const aiNascimento = isoDate(valueOf(campos, "data_nascimento"));
  const aiEndereco = valueOf(campos, "endereco");

  const nome = deterministic.nome || (nameIsValid(aiNome) ? aiNome : "");
  const cpf = deterministic.cpf || aiCpf;
  const rg = deterministic.rg || (/[\d]/.test(aiRg) && onlyDigits(aiRg).length >= 7 ? aiRg : "");
  const dataNascimento = deterministic.data_nascimento || aiNascimento;
  const endereco = deterministic.endereco || (addressIsValid(aiEndereco) ? aiEndereco : "");

  campos.nome = { valor: nome, confianca: nome ? Math.max(confOf(campos, "nome"), deterministic.nome ? 0.9 : 0.82) : 0, observacao: nome ? "Nome validado" : "Nao localizado" };
  campos.cpf = { valor: cpf, confianca: cpf ? Math.max(confOf(campos, "cpf"), 0.98) : 0, observacao: cpf ? "CPF validado" : "Nao localizado" };
  campos.rg = { valor: rg, confianca: rg ? Math.max(confOf(campos, "rg"), deterministic.rg ? 0.9 : 0.8) : 0, observacao: rg ? "RG validado" : "Nao localizado" };
  campos.data_nascimento = { valor: dataNascimento, confianca: dataNascimento ? Math.max(confOf(campos, "data_nascimento"), 0.9) : 0, observacao: dataNascimento ? "Nascimento validado" : "Nao localizado" };
  campos.endereco = { valor: endereco, confianca: endereco ? Math.max(confOf(campos, "endereco"), 0.85) : 0, observacao: endereco ? "Endereco validado" : "Nao localizado" };

  const pendencias = [...(ai?.pendencias || [])];
  for (const key of ["nome", "cpf", "rg", "data_nascimento", "endereco"]) if (!valueOf(campos, key)) pendencias.push(`${key} nao localizado`);
  for (const [key, field] of Object.entries(campos)) {
    const value = line(field?.valor);
    const confidence = Number(field?.confianca || 0);
    if (value && confidence > 0 && confidence < 0.75) pendencias.push(`${key} precisa de conferencia`);
  }

  const fseText = fseDetectedFromText(text);
  const fseAi = ai?.modelo_reconhecido === true || norm(ai?.modelo_documento).includes("FSE-2026");
  const modeloReconhecido = fseText || fseAi;

  return {
    ok: true,
    modelo_documento: modeloReconhecido ? "FSE-2026" : (ai?.modelo_documento || "nao identificado"),
    modelo_reconhecido: modeloReconhecido,
    confianca_geral: Number(ai?.confianca_geral || (nome || cpf ? 0.9 : 0)),
    texto_bruto: text.slice(0, 4000),
    campos,
    pendencias: [...new Set(pendencias)],
    log: [
      "Leitura deterministica dos dados principais concluida.",
      ...(ai?.log || []),
      modeloReconhecido ? "Ficha TOPAC reconhecida no padrao FSE-2026." : "Padrao FSE-2026 nao confirmado.",
      "Valores duvidosos permanecem vazios ou marcados para conferencia.",
    ],
  };
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const text = String(body.text || "").slice(0, 30000);
    const images = Array.isArray(body.images) ? body.images.filter((x: unknown) => typeof x === "string").slice(0, 5) : [];
    const fileName = String(body.fileName || "");
    if (!text && !images.length) return json({ error: "Envie texto e/ou imagens." }, 400);

    const deterministic = extractDeterministic(text);
    const fseText = fseDetectedFromText(text);
    const likelyFicha = fseText || /FICHA|SOLICITACAO|EMPREGO|FSE/i.test(fileName);
    const shouldUseAi = images.length > 0 && (likelyFicha || !text.trim() || !deterministic.nome || !deterministic.cpf);

    let ai: AiResultado | null = null;
    let aiError = "";
    if (shouldUseAi) {
      try {
        ai = await callVisualAi(fileName, text, images);
      } catch (error) {
        aiError = error instanceof Error ? error.message : String(error);
      }
    } else if (fseText) {
      try {
        ai = await callVisualAi(fileName, text, images);
      } catch (error) {
        aiError = error instanceof Error ? error.message : String(error);
      }
    }

    const data = mergeResults(deterministic, ai, text);
    if (aiError) data.log.push(`OCR visual indisponivel nesta leitura: ${aiError.slice(0, 250)}`);
    return json({ ok: true, data });
  } catch (error) {
    return json({
      ok: true,
      data: {
        ok: false,
        confianca_geral: 0,
        campos: {},
        pendencias: ["Falha na leitura"],
        log: [error instanceof Error ? error.message : String(error)],
      },
    });
  }
});
