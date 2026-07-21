// Edge function: ocr-pre-cadastro
// Le documentos pessoais e fichas admissionais sem confundir rotulos, QR codes e textos de validacao com dados do colaborador.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Campo = { valor?: string | number | null; confianca?: number; observacao?: string };
type Resultado = {
  ok?: boolean;
  confianca_geral?: number;
  texto_bruto?: string;
  campos?: Record<string, Campo>;
  pendencias?: string[];
  log?: string[];
};

const SYSTEM_PROMPT = `Voce e um conferente de documentos admissionais brasileiros.
Recebera texto extraido e imagens de RG, CNH, CPF, titulo eleitoral, certidao, comprovante de endereco, boleto, ficha cadastral ou outros documentos pessoais.

OBJETIVO PRINCIPAL:
Preencher somente dados reais da pessoa: nome completo, CPF, RG, data de nascimento e endereco residencial.

REGRAS CRITICAS:
- Nunca use rotulos como NOME DO ELEITOR, DO ELEITOR, PAGADOR, BENEFICIARIO, FILIACAO ou DATA DE NASCIMENTO como valor.
- Nunca use URL, site, codigo de validacao, texto de autenticidade, QR Code, assinatura digital ou orientacoes do documento como endereco.
- Endereco so pode ser preenchido quando houver logradouro residencial real, preferencialmente com numero, bairro, cidade, UF ou CEP.
- CPF deve ter 11 digitos e pertencer a pessoa identificada no documento.
- Data de nascimento deve ser uma data real da pessoa, nunca data de emissao, expedicao, vencimento, casamento ou impressao.
- Nome precisa ter pelo menos nome e sobrenome e nao pode conter numeros, URL ou rotulos documentais.
- Se o dado nao estiver claramente legivel, deixe vazio. Nao invente.
- Quando o documento for comprovante de endereco, extraia o endereco do pagador/titular, nao o endereco do beneficiario/empresa.

Devolva APENAS JSON valido neste formato:
{
  "ok": true,
  "confianca_geral": 0.0,
  "texto_bruto": "resumo do que foi realmente lido, maximo 4000 caracteres",
  "campos": {
    "nome": {"valor": "", "confianca": 0.0, "observacao": ""},
    "cpf": {"valor": "", "confianca": 0.0, "observacao": ""},
    "rg": {"valor": "", "confianca": 0.0, "observacao": ""},
    "data_nascimento": {"valor": "YYYY-MM-DD ou vazio", "confianca": 0.0, "observacao": ""},
    "endereco": {"valor": "", "confianca": 0.0, "observacao": ""},
    "telefone": {"valor": "", "confianca": 0.0, "observacao": ""},
    "funcao": {"valor": "", "confianca": 0.0, "observacao": ""},
    "empresa": {"valor": "", "confianca": 0.0, "observacao": ""},
    "salario": {"valor": "", "confianca": 0.0, "observacao": ""},
    "data_admissao": {"valor": "", "confianca": 0.0, "observacao": ""},
    "vt_endereco": {"valor": "", "confianca": 0.0, "observacao": ""},
    "documentos_anexados": {"valor": "", "confianca": 0.0, "observacao": ""},
    "filiacao": {"valor": "", "confianca": 0.0, "observacao": ""},
    "escolaridade": {"valor": "", "confianca": 0.0, "observacao": ""},
    "experiencia": {"valor": "", "confianca": 0.0, "observacao": ""},
    "epi": {"valor": "", "confianca": 0.0, "observacao": ""},
    "beneficios": {"valor": "", "confianca": 0.0, "observacao": ""},
    "insalubridade": {"valor": "", "confianca": 0.0, "observacao": ""},
    "setor_ghe": {"valor": "", "confianca": 0.0, "observacao": ""},
    "obra_local": {"valor": "", "confianca": 0.0, "observacao": ""},
    "jornada": {"valor": "", "confianca": 0.0, "observacao": ""},
    "responsavel_contato": {"valor": "", "confianca": 0.0, "observacao": ""}
  },
  "pendencias": [],
  "log": []
}
Sem markdown e sem comentarios.`;

const cleanJson = (value: string) => value.replace(/```json/gi, "").replace(/```/g, "").trim();
const digits = (value: unknown) => String(value || "").replace(/\D/g, "");
const compact = (value: unknown) => String(value || "").replace(/\s+/g, " ").trim();
const stripDiacritics = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const cpfValido = (value: unknown) => {
  const cpf = digits(value);
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const calc = (base: number) => {
    let soma = 0;
    for (let i = 0; i < base; i += 1) soma += Number(cpf[i]) * (base + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return calc(9) === Number(cpf[9]) && calc(10) === Number(cpf[10]);
};

const formatCpf = (value: unknown) => {
  const cpf = digits(value);
  return cpfValido(cpf) ? cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : "";
};

const nomeValido = (value: unknown) => {
  const nome = compact(value);
  const normal = stripDiacritics(nome).toUpperCase();
  if (nome.length < 6 || nome.split(" ").filter(Boolean).length < 2) return false;
  if (/\d|HTTP|WWW|VALIDA|QR.?CODE|CODIGO|DOCUMENTO|ASSINATURA|AUTENTICIDADE|NOME DO|DO ELEITOR|PAGADOR|BENEFICIARIO|FILIACAO|REPUBLICA|SECRETARIA|MINISTERIO/.test(normal)) return false;
  return /^[A-Za-zÀ-ÖØ-öø-ÿ' -]+$/.test(nome);
};

const dataNascimentoValida = (value: unknown) => {
  const raw = compact(value);
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const br = raw.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);
  const y = Number(iso?.[1] || br?.[3]);
  const m = Number(iso?.[2] || br?.[2]);
  const d = Number(iso?.[3] || br?.[1]);
  if (!y || !m || !d) return "";
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return "";
  const hoje = new Date();
  const idade = hoje.getUTCFullYear() - y;
  if (idade < 14 || idade > 100) return "";
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
};

const enderecoValido = (value: unknown) => {
  const endereco = compact(value);
  const normal = stripDiacritics(endereco).toUpperCase();
  if (endereco.length < 10) return false;
  if (/HTTP|WWW|VALIDA|AUTENTICIDADE|QR.?CODE|CODIGO DE VALIDACAO|ASSINADO DIGITALMENTE|ORIENTACOES|TSE\.JUS|SERPRO|ICP BRASIL/.test(normal)) return false;
  const temLogradouro = /\b(RUA|R\.|AVENIDA|AV\.|ALAMEDA|TRAVESSA|ESTRADA|RODOVIA|PRACA|VIELA|LARGO)\b/.test(normal);
  const temCep = /\b\d{5}-?\d{3}\b/.test(endereco);
  return temLogradouro || temCep;
};

const extractFromText = (text: string) => {
  const linhas = text.split(/\r?\n/).map(compact).filter(Boolean);
  const normal = linhas.map((l) => stripDiacritics(l).toUpperCase());
  let nome = "";
  let cpf = "";
  let dataNascimento = "";
  let endereco = "";

  for (let i = 0; i < linhas.length; i += 1) {
    const linha = linhas[i];
    const n = normal[i];

    if (!cpf) {
      const candidatos = linha.match(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/g) || [];
      cpf = candidatos.map(formatCpf).find(Boolean) || "";
    }

    if (!nome && /(NOME DO ELEITOR|NOME COMPLETO|NOME DO TITULAR|NOME:)/.test(n)) {
      const apos = compact(linha.replace(/^.*?(NOME DO ELEITOR|NOME COMPLETO|NOME DO TITULAR|NOME:)\s*/i, ""));
      const candidato = nomeValido(apos) ? apos : linhas[i + 1];
      if (nomeValido(candidato)) nome = compact(candidato);
    }

    if (!dataNascimento && /DATA DE NASCIMENTO|NASCIMENTO/.test(n)) {
      const bloco = `${linha} ${linhas[i + 1] || ""}`;
      const data = bloco.match(/\b\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{4}\b/)?.[0] || "";
      dataNascimento = dataNascimentoValida(data);
    }

    if (!endereco && /^(END|ENDERECO|ENDEREÇO)\s*:/i.test(linha)) {
      const partes = [linha.replace(/^(END|ENDERECO|ENDEREÇO)\s*:/i, "").trim()];
      for (let j = 1; j <= 2; j += 1) {
        const proxima = linhas[i + j] || "";
        const proxNormal = normal[i + j] || "";
        if (/BENEFICIARIO|VENCIMENTO|CPF\/CNPJ|NOSSO NUMERO|PERIODO|VALOR/.test(proxNormal)) break;
        partes.push(proxima);
      }
      const candidato = compact(partes.join(", "));
      if (enderecoValido(candidato)) endereco = candidato;
    }
  }

  if (!nome) {
    nome = linhas.find((linha) => nomeValido(linha) && linha === linha.toUpperCase()) || "";
  }
  if (!dataNascimento) {
    const datas = text.match(/\b\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{4}\b/g) || [];
    dataNascimento = datas.map(dataNascimentoValida).find(Boolean) || "";
  }
  if (!endereco) {
    const candidato = linhas.find((linha) => enderecoValido(linha)) || "";
    endereco = candidato;
  }

  return { nome, cpf, data_nascimento: dataNascimento, endereco };
};

const sanitizeResult = (result: Resultado, text: string): Resultado => {
  const campos = { ...(result.campos || {}) };
  const deterministicos = extractFromText(text);

  const nomeAi = compact(campos.nome?.valor);
  const cpfAi = formatCpf(campos.cpf?.valor);
  const dataAi = dataNascimentoValida(campos.data_nascimento?.valor);
  const enderecoAi = compact(campos.endereco?.valor);

  const nome = nomeValido(nomeAi) ? nomeAi : deterministicos.nome;
  const cpf = cpfAi || deterministicos.cpf;
  const dataNascimento = dataAi || deterministicos.data_nascimento;
  const endereco = enderecoValido(enderecoAi) ? enderecoAi : deterministicos.endereco;

  campos.nome = { valor: nome || "", confianca: nome ? Math.max(Number(campos.nome?.confianca || 0), 0.82) : 0, observacao: nome ? "Nome validado" : "Nome nao confirmado" };
  campos.cpf = { valor: cpf || "", confianca: cpf ? Math.max(Number(campos.cpf?.confianca || 0), 0.9) : 0, observacao: cpf ? "CPF validado pelo digito verificador" : "CPF nao confirmado" };
  campos.data_nascimento = { valor: dataNascimento || "", confianca: dataNascimento ? Math.max(Number(campos.data_nascimento?.confianca || 0), 0.82) : 0, observacao: dataNascimento ? "Data de nascimento validada" : "Data de nascimento nao confirmada" };
  campos.endereco = { valor: endereco || "", confianca: endereco ? Math.max(Number(campos.endereco?.confianca || 0), 0.8) : 0, observacao: endereco ? "Endereco residencial validado" : "Endereco residencial nao confirmado" };

  const pendencias = [...(result.pendencias || [])];
  if (!nome) pendencias.push("Nome completo precisa de conferencia");
  if (!cpf) pendencias.push("CPF precisa de conferencia");
  if (!dataNascimento) pendencias.push("Data de nascimento precisa de conferencia");
  if (!endereco) pendencias.push("Endereco residencial precisa de conferencia");

  return {
    ...result,
    ok: true,
    campos,
    pendencias: [...new Set(pendencias)],
    log: [...(result.log || []), "Campos principais passaram por validacao local para bloquear rotulos, URLs e textos de QR Code."],
  };
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const text = String(body.text || "").slice(0, 16000);
    const images = Array.isArray(body.images) ? body.images.filter((img: unknown) => typeof img === "string").slice(0, 3) : [];
    const fileName = String(body.fileName || "");

    if (!text && images.length === 0) {
      return new Response(JSON.stringify({ error: "Envie texto extraido e/ou imagens do documento." }), {
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

    const userContent = [
      {
        type: "text",
        text: [
          `Arquivo: ${fileName}`,
          "Texto extraido do documento:",
          text || "(sem texto extraido; use OCR visual)",
          "",
          "Identifique o tipo do documento e extraia somente dados pessoais reais. Nao copie rotulos, URLs, QR codes ou instrucoes de validacao.",
        ].join("\n"),
      },
      ...images.map((url: string) => ({ type: "image_url", image_url: { url } })),
    ];

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        temperature: 0,
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

    const payload = await resp.json();
    const content = cleanJson(payload?.choices?.[0]?.message?.content || "{}");
    let parsed: Resultado;
    try {
      parsed = JSON.parse(content);
    } catch {
      return new Response(JSON.stringify({ error: "json_invalido", raw: content }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sanitized = sanitizeResult(parsed, text);
    return new Response(JSON.stringify({ ok: true, data: sanitized }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: "erro", detail }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});