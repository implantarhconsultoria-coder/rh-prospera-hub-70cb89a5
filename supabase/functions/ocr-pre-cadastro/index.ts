// Edge function: ocr-pre-cadastro
// Le documentos pessoais e a Ficha de Solicitacao de Emprego TOPAC (padrao FSE-2026).
// Regra central: extrair somente o que estiver legivel; nunca inventar informacao.

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
  modelo_documento?: string;
  modelo_reconhecido?: boolean;
};

const SYSTEM_PROMPT = `Voce e um conferente de documentos admissionais brasileiros da TOPAC RH PRO.
Recebera texto extraido e/ou imagens de documentos pessoais e, principalmente, da Ficha de Solicitacao de Emprego TOPAC.

PADRAO OFICIAL DA FICHA:
- Nome do modelo: Ficha de Solicitacao de Emprego TOPAC.
- Codigo logico: FSE-2026.
- O papel pode manter o timbre/logotipo TOPAC e o layout pode variar.
- Reconheca o modelo pelos titulos e campos, nao apenas pelo posicionamento visual.

SEQUENCIA LOGICA DO MODELO FSE-2026:
1. Vaga pretendida / Cargo pretendido.
2. Dados pessoais: nome, pai, mae, estado civil, data de nascimento, dependentes, filhos menores, naturalidade, UF e nacionalidade.
3. Documentos: RG/UF, CPF, CTPS/serie, titulo/zona/secao, PIS, reservista, CNH/UF/validade/categoria/primeira habilitacao.
4. Endereco e contato: logradouro, numero, bairro, CEP, cidade, estado, telefone, celular e recados.
5. Formacao escolar.
6. Formacao tecnica.
7. Experiencia profissional das 3 ultimas empresas.
8. Referencias pessoais.
9. Dados para EPI: camisa, calca e bota.
10. Principais atribuicoes.
11. Outras informacoes.
12. Declaracao e assinatura.

REGRAS CRITICAS:
- Nunca invente, complete por contexto ou presuma um valor.
- Se estiver vazio, ilegivel, rasurado, cortado ou duvidoso, devolva valor vazio e inclua a pendencia.
- O logotipo/timbre TOPAC identifica o formulario, mas NAO significa que "empresa" do candidato deva ser preenchida como TOPAC.
- Nunca use rotulos como NOME, PAI, MAE, FILIACAO, DATA DE NASCIMENTO, PAGADOR, BENEFICIARIO ou NOME DO ELEITOR como valor.
- Nunca use URL, site, QR Code, codigo de validacao, assinatura digital ou instrucoes como dado pessoal.
- CPF deve ter 11 digitos e pertencer a pessoa identificada.
- Data de nascimento deve ser da pessoa, nunca emissao, expedicao, vencimento, casamento ou impressao.
- Nome deve ter nome e sobrenome e nao conter numeros, URL ou rotulos.
- Endereco deve ser residencial real.
- Nao confunda "cargo pretendido" com cargo de experiencias anteriores.
- Nao confunda referencias pessoais com filiacao.
- Nao transforme tamanhos de EPI em numeros de documentos.
- Preserve listas (filhos, cursos, experiencias e referencias) em texto compacto e legivel.
- Para cada campo use confianca de 0 a 1.
- Confianca abaixo de 0.75 deve gerar item em "pendencias".
- Se reconhecer a Ficha TOPAC, use modelo_documento = "FSE-2026" e modelo_reconhecido = true.

COMPATIBILIDADE COM O FORMULARIO ATUAL:
Alem dos campos detalhados, preencha estes campos agregados quando houver dados seguros:
- funcao = cargo_pretendido.
- filiacao = "Pai: ... | Mae: ...".
- endereco = endereco residencial completo.
- escolaridade = resumo da formacao escolar + tecnica.
- experiencia = resumo numerado das ate 3 ultimas empresas.
- epi = "Camisa: ... | Calca: ... | Bota: ...".
- responsavel_contato = resumo das referencias pessoais.
- celular = celular do candidato.
- empresa, salario e data_admissao so podem ser preenchidos se estiverem explicitamente indicados como dados da admissao atual; nao use o timbre.

Devolva APENAS JSON valido neste formato:
{
  "ok": true,
  "modelo_documento": "FSE-2026 ou outro/nao identificado",
  "modelo_reconhecido": true,
  "confianca_geral": 0.0,
  "texto_bruto": "resumo do que foi realmente lido, maximo 4000 caracteres",
  "campos": {
    "nome": {"valor": "", "confianca": 0.0, "observacao": ""},
    "cpf": {"valor": "", "confianca": 0.0, "observacao": ""},
    "rg": {"valor": "", "confianca": 0.0, "observacao": ""},
    "rg_uf": {"valor": "", "confianca": 0.0, "observacao": ""},
    "data_nascimento": {"valor": "YYYY-MM-DD ou vazio", "confianca": 0.0, "observacao": ""},
    "cargo_pretendido": {"valor": "", "confianca": 0.0, "observacao": ""},
    "pai": {"valor": "", "confianca": 0.0, "observacao": ""},
    "mae": {"valor": "", "confianca": 0.0, "observacao": ""},
    "estado_civil": {"valor": "", "confianca": 0.0, "observacao": ""},
    "numero_dependentes": {"valor": "", "confianca": 0.0, "observacao": ""},
    "filhos_menores": {"valor": "", "confianca": 0.0, "observacao": "Formato: Nome - DD/MM/AAAA; ..."},
    "naturalidade": {"valor": "", "confianca": 0.0, "observacao": ""},
    "uf_naturalidade": {"valor": "", "confianca": 0.0, "observacao": ""},
    "nacionalidade": {"valor": "", "confianca": 0.0, "observacao": ""},
    "ctps": {"valor": "", "confianca": 0.0, "observacao": ""},
    "ctps_serie": {"valor": "", "confianca": 0.0, "observacao": ""},
    "titulo_eleitor": {"valor": "", "confianca": 0.0, "observacao": ""},
    "zona_eleitoral": {"valor": "", "confianca": 0.0, "observacao": ""},
    "secao_eleitoral": {"valor": "", "confianca": 0.0, "observacao": ""},
    "pis": {"valor": "", "confianca": 0.0, "observacao": ""},
    "reservista": {"valor": "", "confianca": 0.0, "observacao": ""},
    "cnh": {"valor": "", "confianca": 0.0, "observacao": ""},
    "cnh_uf": {"valor": "", "confianca": 0.0, "observacao": ""},
    "cnh_validade": {"valor": "", "confianca": 0.0, "observacao": ""},
    "cnh_categoria": {"valor": "", "confianca": 0.0, "observacao": ""},
    "primeira_habilitacao": {"valor": "", "confianca": 0.0, "observacao": ""},
    "logradouro": {"valor": "", "confianca": 0.0, "observacao": ""},
    "numero_endereco": {"valor": "", "confianca": 0.0, "observacao": ""},
    "bairro": {"valor": "", "confianca": 0.0, "observacao": ""},
    "cep": {"valor": "", "confianca": 0.0, "observacao": ""},
    "cidade": {"valor": "", "confianca": 0.0, "observacao": ""},
    "uf_endereco": {"valor": "", "confianca": 0.0, "observacao": ""},
    "telefone": {"valor": "", "confianca": 0.0, "observacao": ""},
    "celular": {"valor": "", "confianca": 0.0, "observacao": ""},
    "recados": {"valor": "", "confianca": 0.0, "observacao": ""},
    "escolaridade_nivel": {"valor": "", "confianca": 0.0, "observacao": ""},
    "escolaridade_ano": {"valor": "", "confianca": 0.0, "observacao": ""},
    "estuda": {"valor": "", "confianca": 0.0, "observacao": ""},
    "horario_estudo": {"valor": "", "confianca": 0.0, "observacao": ""},
    "formacao_tecnica": {"valor": "", "confianca": 0.0, "observacao": "Curso - ano; ..."},
    "experiencia": {"valor": "", "confianca": 0.0, "observacao": "Empresa | cidade/UF | fone | admissao | demissao | salario | cargo | iniciativa | justificativa"},
    "referencias": {"valor": "", "confianca": 0.0, "observacao": "Nome - fone; ..."},
    "epi_camisa": {"valor": "", "confianca": 0.0, "observacao": ""},
    "epi_calca": {"valor": "", "confianca": 0.0, "observacao": ""},
    "epi_bota": {"valor": "", "confianca": 0.0, "observacao": ""},
    "principais_atribuicoes": {"valor": "", "confianca": 0.0, "observacao": ""},
    "outras_informacoes": {"valor": "", "confianca": 0.0, "observacao": ""},

    "endereco": {"valor": "", "confianca": 0.0, "observacao": ""},
    "funcao": {"valor": "", "confianca": 0.0, "observacao": ""},
    "empresa": {"valor": "", "confianca": 0.0, "observacao": ""},
    "salario": {"valor": "", "confianca": 0.0, "observacao": ""},
    "data_admissao": {"valor": "", "confianca": 0.0, "observacao": ""},
    "vt_endereco": {"valor": "", "confianca": 0.0, "observacao": ""},
    "documentos_anexados": {"valor": "", "confianca": 0.0, "observacao": ""},
    "filiacao": {"valor": "", "confianca": 0.0, "observacao": ""},
    "escolaridade": {"valor": "", "confianca": 0.0, "observacao": ""},
    "epi": {"valor": "", "confianca": 0.0, "observacao": ""},
    "beneficios": {"valor": "", "confianca": 0.0, "observacao": ""},
    "insalubridade": {"valor": "", "confianca": 0.0, "observacao": ""},
    "setor_ghe": {"valor": "", "confianca": 0.0, "observacao": ""},
    "obra_local": {"valor": "", "confianca": 0.0, "observacao": ""},
    "jornada": {"valor": "", "confianca": 0.0, "observacao": ""},
    "responsavel_contato": {"valor": "", "confianca": 0.0, "observacao": ""},
    "email": {"valor": "", "confianca": 0.0, "observacao": ""}
  },
  "pendencias": [],
  "log": []
}
Sem markdown e sem comentarios.`;

const cleanJson = (value: string) => value.replace(/```json/gi, "").replace(/```/g, "").trim();
const digits = (value: unknown) => String(value || "").replace(/\D/g, "");
const compact = (value: unknown) => String(value || "").replace(/\s+/g, " ").trim();
const stripDiacritics = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const fieldValue = (campos: Record<string, Campo>, key: string) => compact(campos[key]?.valor);
const fieldConfidence = (campos: Record<string, Campo>, key: string) => Number(campos[key]?.confianca || 0);

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
  if (endereco.length < 8) return false;
  if (/HTTP|WWW|VALIDA|AUTENTICIDADE|QR.?CODE|CODIGO DE VALIDACAO|ASSINADO DIGITALMENTE|ORIENTACOES|TSE\.JUS|SERPRO|ICP BRASIL/.test(normal)) return false;
  const temLogradouro = /\b(RUA|R\.|AVENIDA|AV\.|ALAMEDA|TRAVESSA|ESTRADA|RODOVIA|PRACA|VIELA|LARGO)\b/.test(normal);
  const temCep = /\b\d{5}-?\d{3}\b/.test(endereco);
  return temLogradouro || temCep;
};

const modelDetectedFromText = (text: string) => {
  const normal = stripDiacritics(text).toUpperCase();
  const checks = [
    /FICHA DE SOLICITACAO DE EMPREGO/.test(normal),
    /CARGO PRETENDIDO/.test(normal),
    /FORMACAO ESCOLAR/.test(normal),
    /DADOS PARA EPI/.test(normal),
    /EXPERIENCIA PROFISSIONAL/.test(normal),
  ];
  return checks.filter(Boolean).length >= 2;
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

    if (!nome && /(NOME DO ELEITOR|NOME COMPLETO|NOME DO TITULAR|^NOME:)/.test(n)) {
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

  if (!nome) nome = linhas.find((linha) => nomeValido(linha) && linha === linha.toUpperCase()) || "";
  if (!dataNascimento) {
    const datas = text.match(/\b\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{4}\b/g) || [];
    dataNascimento = datas.map(dataNascimentoValida).find(Boolean) || "";
  }
  if (!endereco) endereco = linhas.find((linha) => enderecoValido(linha)) || "";

  return { nome, cpf, data_nascimento: dataNascimento, endereco };
};

const joinSafe = (parts: Array<string | undefined | null>, separator = " | ") =>
  parts.map((item) => compact(item)).filter(Boolean).join(separator);

const aggregateFseFields = (campos: Record<string, Campo>) => {
  const cargo = fieldValue(campos, "cargo_pretendido");
  if (!fieldValue(campos, "funcao") && cargo) {
    campos.funcao = { valor: cargo, confianca: fieldConfidence(campos, "cargo_pretendido"), observacao: "Cargo pretendido da ficha FSE-2026" };
  }

  if (!fieldValue(campos, "filiacao")) {
    const pai = fieldValue(campos, "pai");
    const mae = fieldValue(campos, "mae");
    const valor = joinSafe([pai ? `Pai: ${pai}` : "", mae ? `Mae: ${mae}` : ""]);
    if (valor) {
      const confs = [fieldConfidence(campos, "pai"), fieldConfidence(campos, "mae")].filter((n) => n > 0);
      campos.filiacao = { valor, confianca: confs.length ? Math.min(...confs) : 0.7, observacao: "Filiacao consolidada da ficha" };
    }
  }

  if (!fieldValue(campos, "endereco")) {
    const logradouro = fieldValue(campos, "logradouro");
    const numero = fieldValue(campos, "numero_endereco");
    const bairro = fieldValue(campos, "bairro");
    const cep = fieldValue(campos, "cep");
    const cidade = fieldValue(campos, "cidade");
    const uf = fieldValue(campos, "uf_endereco");
    const valor = joinSafe([
      joinSafe([logradouro, numero], ", "),
      bairro,
      joinSafe([cidade, uf], "/"),
      cep ? `CEP ${cep}` : "",
    ]);
    if (enderecoValido(valor)) campos.endereco = { valor, confianca: 0.8, observacao: "Endereco consolidado da ficha" };
  }

  if (!fieldValue(campos, "escolaridade")) {
    const nivel = fieldValue(campos, "escolaridade_nivel");
    const ano = fieldValue(campos, "escolaridade_ano");
    const tecnica = fieldValue(campos, "formacao_tecnica");
    const estuda = fieldValue(campos, "estuda");
    const horario = fieldValue(campos, "horario_estudo");
    const valor = joinSafe([
      joinSafe([nivel, ano ? `Ano: ${ano}` : ""]),
      tecnica ? `Tecnica: ${tecnica}` : "",
      estuda ? `Estuda: ${estuda}${horario ? ` - ${horario}` : ""}` : "",
    ]);
    if (valor) campos.escolaridade = { valor, confianca: 0.78, observacao: "Formacao consolidada da ficha" };
  }

  if (!fieldValue(campos, "epi")) {
    const camisa = fieldValue(campos, "epi_camisa");
    const calca = fieldValue(campos, "epi_calca");
    const bota = fieldValue(campos, "epi_bota");
    const valor = joinSafe([camisa ? `Camisa: ${camisa}` : "", calca ? `Calca: ${calca}` : "", bota ? `Bota: ${bota}` : ""]);
    if (valor) campos.epi = { valor, confianca: 0.8, observacao: "Tamanhos de EPI consolidados da ficha" };
  }

  if (!fieldValue(campos, "responsavel_contato")) {
    const referencias = fieldValue(campos, "referencias");
    if (referencias) campos.responsavel_contato = { valor: referencias, confianca: fieldConfidence(campos, "referencias"), observacao: "Referencias pessoais da ficha" };
  }

  return campos;
};

const sanitizeResult = (result: Resultado, text: string): Resultado => {
  const campos = aggregateFseFields({ ...(result.campos || {}) });
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

  for (const [key, campo] of Object.entries(campos)) {
    const valor = compact(campo?.valor);
    const confianca = Number(campo?.confianca || 0);
    if (valor && confianca > 0 && confianca < 0.75) pendencias.push(`${key} precisa de conferencia`);
  }

  const fsePorTexto = modelDetectedFromText(text);
  const fsePorAi = result.modelo_reconhecido === true || String(result.modelo_documento || "").toUpperCase().includes("FSE-2026");
  const modeloReconhecido = fsePorTexto || fsePorAi;

  return {
    ...result,
    ok: true,
    modelo_documento: modeloReconhecido ? "FSE-2026" : (result.modelo_documento || "nao identificado"),
    modelo_reconhecido: modeloReconhecido,
    campos,
    pendencias: [...new Set(pendencias)],
    log: [
      ...(result.log || []),
      modeloReconhecido ? "Ficha TOPAC reconhecida no padrao FSE-2026." : "Documento processado sem confirmacao do padrao FSE-2026.",
      "Campos principais passaram por validacao local; valores de baixa confianca foram marcados para conferencia.",
    ],
  };
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const text = String(body.text || "").slice(0, 24000);
    const images = Array.isArray(body.images) ? body.images.filter((img: unknown) => typeof img === "string").slice(0, 4) : [];
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
          "Se for a Ficha de Solicitacao de Emprego TOPAC, reconheca como FSE-2026 mesmo que o layout tenha sido reorganizado, desde que timbre/titulo/campos sejam compativeis.",
          "Extraia somente dados realmente preenchidos. Campo vazio ou duvidoso deve permanecer vazio e ser marcado em pendencias.",
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
    const messageContent = payload?.choices?.[0]?.message?.content;
    const rawContent = typeof messageContent === "string" ? messageContent : JSON.stringify(messageContent || {});
    const cleaned = cleanJson(rawContent);
    let parsed: Resultado;

    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return new Response(JSON.stringify({ error: "json_invalido", raw: cleaned.slice(0, 4000) }), {
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
