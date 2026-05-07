// Interpreta comandos de voz do admin via Lovable AI Gateway.
// deno-lint-ignore-file no-explicit-any

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SYSTEM = `Você é um interpretador de comandos de voz em PT-BR para um ERP de RH.
Receba a fala e devolva UMA ação estruturada via tool call.

Tipos (action.type):
- "navigate" -> abrir módulo. Campos: route.
- "open_employee" -> abrir funcionário. Campos: query.
- "open_company"  -> abrir empresa. Campos: query.
- "print_epi" -> ficha EPI. Campos: employee_query, company_query?.
- "print_uniforme" -> ficha uniforme. Campos: employee_query, company_query?.
- "print_recibo_vr" -> recibo VR INDIVIDUAL pronto em PDF. Campos: employee_query, company_query?, mes? (1-12), ano?.
- "print_recibo_vt" -> recibo VT INDIVIDUAL pronto em PDF. Campos: employee_query, company_query?, mes?, ano?.
- "print_recibo_vrvt" -> recibo VR+VT INDIVIDUAL. Campos: employee_query, company_query?, mes?, ano?.
- "print_relatorio_vr" -> relatório consolidado VR (empresa). Campos: company_query?, mes?, ano?.
- "print_relatorio_vt" -> relatório consolidado VT (empresa). Campos: company_query?, mes?, ano?.
- "print_protocolo_veiculo" -> protocolo veículo. Campos: placa.
- "print_documento_veiculo" -> abrir PDF/documento anexado do veículo. Campos: placa.
- "unknown" -> não entendi. Campo: reason.

Rotas para "navigate":
/admin, /admin/funcionarios, /admin/empresas, /admin/lancamentos, /admin/fechamento,
/admin/relatorio, /admin/epi, /admin/uniformes, /admin/relatorio-vr, /admin/relatorio-vt,
/admin/almoxarifado, /admin/faturamento, /admin/financeiro, /admin/galoes-combustivel,
/admin/documentos-ativos, /admin/protocolo, /admin/historico, /admin/aso,
/admin/conferencia-ponto, /admin/app-mecanico, /admin/assistente.

Sempre devolva "label" curto em PT-BR para confirmação.
Meses por nome: janeiro=1, fevereiro=2, março=3, abril=4, maio=5, junho=6, julho=7, agosto=8, setembro=9, outubro=10, novembro=11, dezembro=12.
Se ano não for dito, deixe ausente (frontend usa o ano atual).
Se o usuário disser "imprimir/abrir/gerar PDF/recibo de VR ou VT" com nome de pessoa, prefira "print_recibo_vr" ou "print_recibo_vt" (individual). Use "print_relatorio_vr/vt" só quando o foco for empresa/consolidado.
Se "documento do veículo placa X" -> print_documento_veiculo. Se "protocolo de veículo" -> print_protocolo_veiculo.
Nunca invente. Se incerto, "unknown".`;

const tool = {
  type: "function",
  function: {
    name: "emit_action",
    description: "Emite a ação interpretada do comando de voz",
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: [
            "navigate", "open_employee", "open_company",
            "print_epi", "print_uniforme",
            "print_recibo_vr", "print_recibo_vt", "print_recibo_vrvt",
            "print_relatorio_vr", "print_relatorio_vt",
            "print_protocolo_veiculo", "print_documento_veiculo",
            "unknown",
          ],
        },
        label: { type: "string" },
        route: { type: "string" },
        query: { type: "string" },
        employee_query: { type: "string" },
        company_query: { type: "string" },
        mes: { type: "number" },
        ano: { type: "number" },
        placa: { type: "string" },
        reason: { type: "string" },
      },
      required: ["type", "label"],
      additionalProperties: false,
    },
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { text } = await req.json();
    if (!text || typeof text !== "string") {
      return new Response(JSON.stringify({ error: "text obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY ausente");

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: text },
        ],
        tools: [tool],
        tool_choice: { type: "function", function: { name: "emit_action" } },
      }),
    });

    if (resp.status === 429) {
      return new Response(JSON.stringify({ error: "Limite de uso excedido." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (resp.status === 402) {
      return new Response(JSON.stringify({ error: "Créditos esgotados." }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!resp.ok) {
      const t = await resp.text();
      console.error("AI error", resp.status, t);
      return new Response(JSON.stringify({ error: "Falha no interpretador" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const call = data?.choices?.[0]?.message?.tool_calls?.[0];
    let action: any = { type: "unknown", label: "Não entendi o comando." };
    if (call?.function?.arguments) {
      try { action = JSON.parse(call.function.arguments); } catch { /* keep */ }
    }

    return new Response(JSON.stringify({ action }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("voice-command error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
