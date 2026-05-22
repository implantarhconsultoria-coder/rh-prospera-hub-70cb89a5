// Edge function: ocr-pre-cadastro
// Le ficha de solicitacao de emprego/admissional a partir de texto extraido e/ou imagens renderizadas do PDF.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `Voce e um OCR/conferente de ficha cadastral admissional brasileira.
Recebera texto extraido de PDF e/ou imagens de uma "Ficha de Solicitacao de Emprego" preenchida a mao ou escaneada.
Extraia SOMENTE o que estiver legivel. Nao invente dados.

Devolva APENAS JSON valido neste formato:
{
  "ok": true,
  "confianca_geral": 0.0,
  "texto_bruto": "texto lido resumido, max 4000 caracteres",
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
    "data_admissao": {"valor": "YYYY-MM-DD ou vazio", "confianca": 0.0, "observacao": ""},
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
  "pendencias": ["campos que precisam revisao humana"],
  "log": ["decisoes importantes do processamento"]
}

Regras:
- CPF deve vir formatado se estiver legivel; se incerto, deixe vazio e crie pendencia.
- Datas sempre em ISO quando possivel.
- Campo ilegivel: valor vazio e confianca 0.
- Campo parcial/incerto: preencha o que conseguir e confianca abaixo de 0.75.
- A ficha deve ficar para conferencia; nunca trate como cadastro oficial.
- Sem markdown, sem comentarios, sem blocos de codigo.`;

const cleanJson = (value: string) => value.replace(/```json/gi, "").replace(/```/g, "").trim();

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const text = String(body.text || "").slice(0, 12000);
    const images = Array.isArray(body.images) ? body.images.filter((img: unknown) => typeof img === "string").slice(0, 3) : [];
    const fileName = String(body.fileName || "");

    if (!text && images.length === 0) {
      return new Response(JSON.stringify({ error: "Envie texto extraido e/ou imagens renderizadas da ficha." }), {
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
          "Texto extraido do PDF, se houver:",
          text || "(sem texto extraido; usar OCR visual nas imagens)",
          "",
          "Extraia os campos da ficha e devolva somente JSON.",
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
        temperature: 0.05,
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
    const content = cleanJson(result?.choices?.[0]?.message?.content || "{}");
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(content);
    } catch {
      return new Response(JSON.stringify({ error: "json_invalido", raw: content }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, data: parsed }), {
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
