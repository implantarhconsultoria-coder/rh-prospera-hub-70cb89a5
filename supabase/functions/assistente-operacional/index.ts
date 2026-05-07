import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Você é o Assistente Operacional da plataforma de RH/Operações ImplantaRH.
Fala em português do Brasil, de forma natural, curta e profissional.

REGRAS:
- Use as ferramentas disponíveis para buscar dados reais antes de responder.
- Se o usuário citar uma pessoa, use buscar_funcionario para resolver o ID.
- Para período, se não informado, use o mês atual (formato YYYY-MM em "competencia").
- Para AÇÕES sensíveis (gerar PDF, registrar retirada, lançar dado, baixar documento, alterar dados): SEMPRE chame propor_acao primeiro com a prévia para o usuário confirmar — nunca execute direto.
- Para CONSULTAS: gere um RESUMO claro e organizado em markdown (tabelas curtas, listas, totais). Não abra telas, apenas resuma.
- Se faltar informação obrigatória (ex.: empresa quando há dois funcionários com mesmo nome), pergunte de forma curta.
- Nunca invente dados. Se a busca não retornar nada, diga claramente.
- Hoje é ${new Date().toISOString().slice(0, 10)}. Mês atual: ${new Date().toISOString().slice(0, 7)}.`;

const tools = [
  {
    type: "function",
    function: {
      name: "buscar_funcionario",
      description: "Busca funcionário por nome (parcial), CPF ou matrícula. Retorna até 5 candidatos.",
      parameters: {
        type: "object",
        properties: {
          termo: { type: "string", description: "Nome, CPF ou matrícula" },
          empresa: { type: "string", description: "Nome ou código da empresa/filial (opcional, para desambiguar)" },
        },
        required: ["termo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_ponto_mensal",
      description: "Atrasos, faltas, HE e demais lançamentos do funcionário em uma competência (YYYY-MM).",
      parameters: {
        type: "object",
        properties: {
          funcionario_id: { type: "string" },
          competencia: { type: "string", description: "YYYY-MM. Default: mês atual" },
        },
        required: ["funcionario_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_abastecimentos",
      description: "Lista abastecimentos (combustivel_galoes) de um funcionário/motorista em um período.",
      parameters: {
        type: "object",
        properties: {
          funcionario_id: { type: "string", description: "Opcional se passar nome" },
          nome: { type: "string", description: "Nome do motorista (busca parcial em motorista_nome)" },
          data_ini: { type: "string", description: "YYYY-MM-DD" },
          data_fim: { type: "string", description: "YYYY-MM-DD" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_documentos",
      description: "Lista documentos gerados (EPI, Uniforme, VR, VT, recibos, etc.) por funcionário e categoria.",
      parameters: {
        type: "object",
        properties: {
          funcionario_id: { type: "string" },
          categoria: { type: "string", description: "epi, uniforme, vr, vt, ferias, recibo, outros (opcional)" },
          competencia: { type: "string", description: "YYYY-MM (opcional)" },
          limite: { type: "number", description: "Default 20" },
        },
        required: ["funcionario_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_almoxarifado",
      description: "Histórico de cargas/retiradas do almoxarifado por funcionário.",
      parameters: {
        type: "object",
        properties: {
          funcionario_id: { type: "string" },
          data_ini: { type: "string" },
          data_fim: { type: "string" },
        },
        required: ["funcionario_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "buscar_item_almoxarifado",
      description: "Busca itens cadastrados no almoxarifado por nome.",
      parameters: {
        type: "object",
        properties: { termo: { type: "string" } },
        required: ["termo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propor_acao",
      description:
        "Apresenta uma prévia de AÇÃO sensível para o usuário CONFIRMAR antes de executar. Use para: gerar/imprimir documento, registrar retirada de almoxarifado, lançar dado, etc. NÃO executa nada — apenas mostra a prévia.",
      parameters: {
        type: "object",
        properties: {
          tipo: {
            type: "string",
            enum: [
              "registrar_retirada_almoxarifado",
              "gerar_documento",
              "imprimir_documento",
              "abrir_tela",
            ],
          },
          titulo: { type: "string" },
          descricao: { type: "string", description: "Resumo em markdown da prévia" },
          payload: { type: "object", description: "Dados que serão usados ao confirmar" },
        },
        required: ["tipo", "titulo", "descricao", "payload"],
      },
    },
  },
];

function compMesAtual() {
  return new Date().toISOString().slice(0, 7);
}

async function execTool(
  name: string,
  args: any,
  supabase: ReturnType<typeof createClient>,
) {
  try {
    switch (name) {
      case "buscar_funcionario": {
        const termo = String(args.termo || "").trim();
        let q = supabase
          .from("funcionarios")
          .select("id, nome, cpf, matricula_esocial, cargo, setor, status, company_id, empresas:company_id(nome,codigo)")
          .limit(5);
        if (/^\d{11}$/.test(termo.replace(/\D/g, ""))) {
          q = q.eq("cpf", termo.replace(/\D/g, ""));
        } else {
          q = q.ilike("nome", `%${termo}%`);
        }
        const { data, error } = await q;
        if (error) throw error;
        let res = data ?? [];
        if (args.empresa && res.length > 1) {
          const e = String(args.empresa).toLowerCase();
          res = res.filter(
            (f: any) =>
              f.empresas?.nome?.toLowerCase().includes(e) ||
              f.empresas?.codigo?.toLowerCase().includes(e),
          );
        }
        return { ok: true, funcionarios: res };
      }
      case "consultar_ponto_mensal": {
        const comp = args.competencia || compMesAtual();
        const { data, error } = await supabase
          .from("lancamentos_mensais")
          .select("*")
          .eq("funcionario_id", args.funcionario_id)
          .eq("competencia", comp)
          .maybeSingle();
        if (error) throw error;
        return { ok: true, competencia: comp, lancamento: data };
      }
      case "consultar_abastecimentos": {
        let q = supabase
          .from("combustivel_galoes")
          .select("data, hora, motorista_nome, placa, modelo, tipo_combustivel, quantidade_litros, observacao")
          .order("data", { ascending: false })
          .limit(100);
        if (args.funcionario_id) q = q.eq("tecnico_id", args.funcionario_id);
        else if (args.nome) q = q.ilike("motorista_nome", `%${args.nome}%`);
        if (args.data_ini) q = q.gte("data", args.data_ini);
        if (args.data_fim) q = q.lte("data", args.data_fim);
        const { data, error } = await q;
        if (error) throw error;
        const total = (data ?? []).reduce((s: number, r: any) => s + Number(r.quantidade_litros || 0), 0);
        return { ok: true, abastecimentos: data, total_litros: total, qtd: data?.length ?? 0 };
      }
      case "consultar_documentos": {
        let q = supabase
          .from("documentos_funcionario")
          .select("id, tipo_documento, categoria, competencia, descricao, status, status_envio, created_at, arquivo_url")
          .eq("funcionario_id", args.funcionario_id)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(args.limite || 20);
        if (args.categoria) q = q.eq("categoria", args.categoria);
        if (args.competencia) q = q.eq("competencia", args.competencia);
        const { data, error } = await q;
        if (error) throw error;
        return { ok: true, documentos: data, qtd: data?.length ?? 0 };
      }
      case "consultar_almoxarifado": {
        let q = supabase
          .from("almoxarifado_carga")
          .select("id, data_carga, tipo, status, itens_json, observacao, veiculo, responsavel_nome")
          .eq("funcionario_id", args.funcionario_id)
          .order("data_carga", { ascending: false })
          .limit(50);
        if (args.data_ini) q = q.gte("data_carga", args.data_ini);
        if (args.data_fim) q = q.lte("data_carga", args.data_fim);
        const { data, error } = await q;
        if (error) throw error;
        return { ok: true, movimentacoes: data, qtd: data?.length ?? 0 };
      }
      case "buscar_item_almoxarifado": {
        const { data, error } = await supabase
          .from("almoxarifado_itens")
          .select("id, nome, codigo, unidade, saldo_atual")
          .ilike("nome", `%${args.termo}%`)
          .limit(10);
        if (error) throw error;
        return { ok: true, itens: data };
      }
      case "propor_acao":
        return { ok: true, _proposta: args };
      default:
        return { ok: false, error: `Ferramenta desconhecida: ${name}` };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub;

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const isAdmin = (roleData || []).some((r: any) => r.role === "admin");
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Acesso restrito a administradores" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const messages = Array.isArray(body.messages) ? body.messages : [];

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurado");

    const convo: any[] = [{ role: "system", content: SYSTEM_PROMPT }, ...messages];
    let proposta: any = null;

    // Loop de tool-calling (máx 6 voltas)
    for (let i = 0; i < 6; i++) {
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: convo,
          tools,
        }),
      });

      if (!r.ok) {
        const t = await r.text();
        if (r.status === 429)
          return new Response(JSON.stringify({ error: "Limite atingido, tente em instantes." }), {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        if (r.status === 402)
          return new Response(JSON.stringify({ error: "Créditos da IA esgotados." }), {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        console.error("AI gateway error", r.status, t);
        return new Response(JSON.stringify({ error: "Erro no gateway de IA" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const j = await r.json();
      const msg = j.choices?.[0]?.message;
      if (!msg) break;

      const calls = msg.tool_calls;
      if (!calls || calls.length === 0) {
        return new Response(
          JSON.stringify({ reply: msg.content || "", proposta }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      convo.push(msg);
      for (const c of calls) {
        let parsed: any = {};
        try { parsed = JSON.parse(c.function.arguments || "{}"); } catch {}
        const result = await execTool(c.function.name, parsed, supabase);
        if (c.function.name === "propor_acao" && result.ok) {
          proposta = result._proposta;
        }
        convo.push({
          role: "tool",
          tool_call_id: c.id,
          content: JSON.stringify(result).slice(0, 8000),
        });
      }
    }

    return new Response(
      JSON.stringify({ reply: "Não consegui finalizar a resposta. Tente reformular.", proposta }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("assistente-operacional error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
