import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { text = "", type, images = [] } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    let systemPrompt = "";
    if (type === "protocolo") {
      systemPrompt = `Você é um assistente que extrai dados de textos de WhatsApp/email sobre liberação de documentos de veículos/equipamentos.
Extraia os seguintes campos do texto fornecido. Se não encontrar, retorne string vazia.
Retorne APENAS um JSON com estes campos:
- empresa_destinataria
- local_canteiro
- responsavel_recebimento
- placa
- patrimonio
- renavam
- chassi
- ano_fabricacao
- ano_modelo
- empresa
- descricao_ativo
- observacoes`;
    } else if (type === "documento_veiculo") {
      systemPrompt = `Você é um assistente que extrai dados de documentos de veículos.
Extraia os seguintes campos do texto fornecido. Se não encontrar, retorne string vazia.
Retorne APENAS um JSON com estes campos:
- placa
- renavam
- chassi
- ano_fabricacao
- ano_modelo
- patrimonio
- descricao
- empresa
- observacao`;
    }

    const userContent = [
      {
        type: "text",
        text: text || "Extraia os dados do documento enviado.",
      },
      ...Array.isArray(images)
        ? images
            .filter((image) => typeof image === "string" && image.startsWith("data:image/"))
            .slice(0, 3)
            .map((image) => ({
              type: "image_url",
              image_url: { url: image },
            }))
        : [],
    ];

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_fields",
              description: "Extract structured fields from text",
              parameters: {
                type: "object",
                properties: type === "protocolo" ? {
                  empresa_destinataria: { type: "string" },
                  local_canteiro: { type: "string" },
                  responsavel_recebimento: { type: "string" },
                  placa: { type: "string" },
                  patrimonio: { type: "string" },
                  renavam: { type: "string" },
                  chassi: { type: "string" },
                  ano_fabricacao: { type: "string" },
                  ano_modelo: { type: "string" },
                  empresa: { type: "string" },
                  descricao_ativo: { type: "string" },
                  observacoes: { type: "string" },
                } : {
                  placa: { type: "string" },
                  renavam: { type: "string" },
                  chassi: { type: "string" },
                  ano_fabricacao: { type: "string" },
                  ano_modelo: { type: "string" },
                  patrimonio: { type: "string" },
                  descricao: { type: "string" },
                  empresa: { type: "string" },
                  observacao: { type: "string" },
                },
                required: [],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_fields" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em instantes." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI error:", response.status, t);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    let extracted = {};
    if (toolCall?.function?.arguments) {
      try {
        extracted = JSON.parse(toolCall.function.arguments);
      } catch {
        extracted = {};
      }
    }

    return new Response(JSON.stringify({ data: extracted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("parse-text error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
