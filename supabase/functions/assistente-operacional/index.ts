import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MESES: Record<string, string> = {
  janeiro: "01", fevereiro: "02", marco: "03", "março": "03", abril: "04",
  maio: "05", junho: "06", julho: "07", agosto: "08", setembro: "09",
  outubro: "10", novembro: "11", dezembro: "12",
  jan: "01", fev: "02", mar: "03", abr: "04", mai: "05", jun: "06",
  jul: "07", ago: "08", set: "09", out: "10", nov: "11", dez: "12",
};

function compMesAtual() {
  return new Date().toISOString().slice(0, 7);
}

function anoAtual() {
  return new Date().getFullYear();
}

const SYSTEM_PROMPT = `Você é o Assistente Operacional da plataforma ImplantaRH.
Fala em português do Brasil, de forma natural, curta e profissional.
Hoje é ${new Date().toISOString().slice(0, 10)}. Mês atual: ${compMesAtual()}. Ano atual: ${anoAtual()}.

REGRAS DE FLUXO:
1. Sempre que o usuário citar uma pessoa, chame buscar_funcionario primeiro.
   - Se vier 0 → responda "Não encontrei nenhum funcionário com esse nome".
   - Se vier 1 → use direto.
   - Se vier mais de 1 → liste os candidatos (nome, empresa, cargo) e peça para o usuário escolher. NUNCA escolha sozinho.
2. Para período: entenda meses em português ("abril", "mês de abril", "abr") como ${anoAtual()}-MM.
   Se não houver período, use ${compMesAtual()}.
3. Para CONSULTAS (faltas, horas extras, ponto, abastecimento, EPIs, documentos, almoxarifado):
   - Chame as ferramentas necessárias para buscar dados reais.
   - Resuma em markdown com tabelas curtas, listas e totais.
   - Se a busca retornar zero registros, responda CLARAMENTE:
     "Não encontrei lançamentos para {Nome} na competência {YYYY-MM}."
   - NUNCA diga "erro ao consultar" — diga exatamente o que faltou.
4. Para AÇÕES sensíveis (gerar PDF, registrar retirada, abrir tela, imprimir):
   chame propor_acao com prévia e aguarde a confirmação do usuário.
5. Nunca invente dados.

ESPECÍFICO DE FALTAS / HE / PONTO:
- Use consultar_ponto_mensal(funcionario_id, competencia).
- Responda com: funcionário, empresa, competência, faltas (dias), atrasos (h),
  HE 50% (h), HE 100% (h), total HE, observações.
- Se for "relatório/apuração", entregue um resumo completo no formato acima.`;

const tools = [
  {
    type: "function",
    function: {
      name: "buscar_funcionario",
      description: "Busca funcionário por nome (parcial, fuzzy), CPF ou matrícula. Retorna até 8 candidatos.",
      parameters: {
        type: "object",
        properties: {
          termo: { type: "string", description: "Nome, CPF ou matrícula" },
          empresa: { type: "string", description: "Nome ou código da empresa/filial (opcional)" },
        },
        required: ["termo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_ponto_mensal",
      description: "Lançamentos mensais (faltas, atrasos, HE 50/100, etc) de um funcionário em uma competência YYYY-MM.",
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
      description: "Lista abastecimentos de um motorista em um período.",
      parameters: {
        type: "object",
        properties: {
          funcionario_id: { type: "string" },
          nome: { type: "string" },
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
      description: "Lista documentos do funcionário (EPI, Uniforme, VR, VT, recibos, etc).",
      parameters: {
        type: "object",
        properties: {
          funcionario_id: { type: "string" },
          categoria: { type: "string" },
          competencia: { type: "string" },
          limite: { type: "number" },
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
        "Mostra prévia de uma ação sensível para o usuário CONFIRMAR antes de executar.",
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
          descricao: { type: "string" },
          payload: { type: "object" },
        },
        required: ["tipo", "titulo", "descricao", "payload"],
      },
    },
  },
];

async function execTool(
  name: string,
  args: any,
  supabase: ReturnType<typeof createClient>,
) {
  try {
    switch (name) {
      case "buscar_funcionario": {
        const termoRaw = String(args.termo || "").trim();
        const cpfDigits = termoRaw.replace(/\D/g, "");
        let q = supabase
          .from("funcionarios")
          .select("id, nome, cpf, matricula_esocial, cargo, setor, status, company_id, empresas:company_id(nome,codigo)")
          .limit(8);
        if (cpfDigits.length === 11) {
          q = q.eq("cpf", cpfDigits);
        } else {
          // busca por cada token do termo (fuzzy: "rodrigo medrado")
          const tokens = termoRaw.split(/\s+/).filter(t => t.length >= 2);
          if (tokens.length === 0) return { ok: false, error: "termo_vazio" };
          for (const t of tokens) q = q.ilike("nome", `%${t}%`);
        }
        const { data, error } = await q;
        if (error) throw error;
        let res = data ?? [];
        if (args.empresa && res.length > 1) {
          const e = String(args.empresa).toLowerCase();
          const filtered = res.filter(
            (f: any) =>
              f.empresas?.nome?.toLowerCase().includes(e) ||
              f.empresas?.codigo?.toLowerCase().includes(e),
          );
          if (filtered.length > 0) res = filtered;
        }
        return {
          ok: true,
          qtd: res.length,
          funcionarios: res.map((f: any) => ({
            id: f.id, nome: f.nome, cargo: f.cargo, setor: f.setor,
            status: f.status, empresa: f.empresas?.nome,
          })),
        };
      }
      case "consultar_ponto_mensal": {
        const comp = args.competencia || compMesAtual();
        const { data: lanc, error } = await supabase
          .from("lancamentos_mensais")
          .select("*")
          .eq("funcionario_id", args.funcionario_id)
          .eq("competencia", comp)
          .is("apagado_em", null)
          .maybeSingle();
        if (error) throw error;
        const { data: func } = await supabase
          .from("funcionarios")
          .select("nome, cargo, empresas:company_id(nome)")
          .eq("id", args.funcionario_id)
          .maybeSingle();
        if (!lanc) {
          return {
            ok: true,
            encontrado: false,
            funcionario: func,
            competencia: comp,
            mensagem: `Não há lançamentos para ${func?.nome ?? "este funcionário"} na competência ${comp}.`,
          };
        }
        return {
          ok: true,
          encontrado: true,
          funcionario: func,
          competencia: comp,
          faltas_dias: lanc.faltas_dias,
          atrasos_horas: lanc.atrasos,
          he50_horas: lanc.he50,
          he100_horas: lanc.he100,
          total_he: Number(lanc.he50 || 0) + Number(lanc.he100 || 0),
          adicionais: lanc.adicionais,
          descontos_diversos: lanc.descontos_diversos,
          adiantamento: lanc.adiantamento,
          vr_aplicado: lanc.vr_aplicado,
          vt_aplicado: lanc.vt_aplicado,
          observacoes: lanc.observacoes,
          status: lanc.status_conferencia,
        };
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
          .select("id, nome, codigo_sku, unidade, quantidade")
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
    console.error(`execTool[${name}] erro:`, e, "args:", args);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function reply200(reply: string, proposta: any = null) {
  return new Response(JSON.stringify({ reply, proposta }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let payloadDebug: any = null;
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return reply200("⚠️ Sessão expirada. Faça login novamente.");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData } = await supabase.auth.getClaims(token);
    const userId = claimsData?.claims?.sub;
    if (!userId) return reply200("⚠️ Não consegui validar sua sessão.");

    const { data: roleData } = await supabase
      .from("user_roles").select("role").eq("user_id", userId);
    const isAdmin = (roleData || []).some((r: any) => r.role === "admin");
    if (!isAdmin) return reply200("⚠️ Acesso restrito a administradores.");

    const body = await req.json();
    payloadDebug = body;
    const messages = Array.isArray(body.messages) ? body.messages : [];

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return reply200("⚠️ IA não configurada (LOVABLE_API_KEY ausente).");

    const convo: any[] = [{ role: "system", content: SYSTEM_PROMPT }, ...messages];
    let proposta: any = null;

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
        console.error("AI gateway error", r.status, t);
        if (r.status === 429) return reply200("⏳ Muitas requisições à IA agora. Tente em alguns segundos.");
        if (r.status === 402) return reply200("💳 Créditos da IA esgotados. Avise o administrador.");
        return reply200(`⚠️ Falha na IA (${r.status}). Tente novamente.`);
      }

      const j = await r.json();
      const msg = j.choices?.[0]?.message;
      if (!msg) return reply200("⚠️ Sem resposta da IA. Tente reformular.");

      const calls = msg.tool_calls;
      if (!calls || calls.length === 0) {
        return reply200(msg.content || "Não consegui formular a resposta.", proposta);
      }

      convo.push(msg);
      for (const c of calls) {
        let parsed: any = {};
        try { parsed = JSON.parse(c.function.arguments || "{}"); } catch (e) {
          console.error("parse args error", c.function.name, e);
        }
        const result = await execTool(c.function.name, parsed, supabase);
        if (c.function.name === "propor_acao" && (result as any).ok) {
          proposta = (result as any)._proposta;
        }
        convo.push({
          role: "tool",
          tool_call_id: c.id,
          content: JSON.stringify(result).slice(0, 8000),
        });
      }
    }

    return reply200("Não consegui finalizar a resposta após várias tentativas. Tente reformular.", proposta);
  } catch (e) {
    console.error("assistente-operacional fatal:", e, "payload:", payloadDebug);
    const msg = e instanceof Error ? e.message : String(e);
    return reply200(`⚠️ Erro interno: ${msg}`);
  }
});
