// Edge function: valida CPF + token e retorna sessão vinculada ao funcionário oficial.
// Regra única: TODO acesso por CPF deve casar com um registro em public.funcionarios.
// - Operacional: também resolve o token do tecnicos_campo (vinculado ao funcionario_id).
// - Demais módulos (financeiro, faturamento, ...): valida via funcionario_modulos.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const sb = () =>
  createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

const onlyDigits = (s: string) => String(s || "").replace(/\D/g, "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const action = String((body as any).action || "");
    const slug = String((body as any).slug || "").toLowerCase();
    const cpfClean = onlyDigits(String((body as any).cpf || ""));

    if (action !== "entrar") return json({ error: "invalid_action" }, 400);
    if (!slug) return json({ error: "slug_obrigatorio" }, 400);
    if (cpfClean.length !== 11) return json({ error: "cpf_invalido" }, 400);

    const client = sb();

    // 1. Link válido e ativo?
    const { data: link, error: lerr } = await client
      .from("links_acesso_publico")
      .select("token, modulo, unidade, nome, status, empresas_permitidas")
      .eq("slug", slug)
      .maybeSingle();
    if (lerr) return json({ error: "db_error", detalhe: lerr.message }, 500);
    if (!link) return json({ error: "link_invalido" }, 404);
    if (link.status !== "ativo") return json({ error: "link_bloqueado" }, 403);

    // 2. SEMPRE busca o funcionário na BASE OFICIAL.
    // Filtro por CPF normalizado (remove pontos/traços).
    const { data: funcs, error: ferr } = await client
      .from("funcionarios")
      .select("id, nome, cpf, cargo, status, acesso_status, setor, company_id");
    if (ferr) return json({ error: "db_error", detalhe: ferr.message }, 500);
    const func = (funcs || []).find(
      (f) => onlyDigits(String(f.cpf || "")) === cpfClean,
    );
    if (!func) {
      await client.from("acesso_cpf_logs").insert({
        cpf: cpfClean, modulo: link.modulo, unidade: link.unidade,
        resultado: "negado", motivo: "cpf_nao_encontrado_funcionarios",
      });
      return json({ error: "cpf_nao_encontrado_funcionarios" }, 403);
    }

    // 3. Status de acesso (ativo / bloqueado / ferias / desligado)
    const acessoStatus = String((func as any).acesso_status || func.status || "ativo").toLowerCase();
    const statusErrMap: Record<string, string> = {
      desligado: "funcionario_desligado",
      ferias:    "funcionario_ferias",
      "férias":  "funcionario_ferias",
      bloqueado: "funcionario_bloqueado",
      inativo:   "funcionario_inativo",
    };
    if (statusErrMap[acessoStatus]) {
      await client.from("acesso_cpf_logs").insert({
        cpf: cpfClean, modulo: link.modulo, unidade: link.unidade,
        resultado: "negado", motivo: statusErrMap[acessoStatus],
        funcionario_id: func.id,
      });
      return json({ error: statusErrMap[acessoStatus] }, 403);
    }

    // 4. Empresa do funcionário
    let empresaNome = "";
    if (func.company_id) {
      const { data: emp } = await client
        .from("empresas").select("nome").eq("id", func.company_id).maybeSingle();
      empresaNome = emp?.nome || "";
    }

    // 5. Validar empresa contra a unidade do link
    const empresasOk = (link.empresas_permitidas || []) as string[];
    if (empresasOk.length > 0 && empresaNome && !empresasOk.includes(empresaNome)) {
      await client.from("acesso_cpf_logs").insert({
        cpf: cpfClean, modulo: link.modulo, unidade: link.unidade,
        resultado: "negado", motivo: "unidade_incorreta",
        funcionario_id: func.id,
      });
      return json({ error: "unidade_incorreta" }, 403);
    }

    // 6a. Operacional: precisa estar em tecnicos_campo (vínculo direto com funcionario_id).
    if (link.modulo === "operacional") {
      const { data: tec } = await client
        .from("tecnicos_campo")
        .select("access_token, link_status, link_bloqueado")
        .eq("funcionario_id", func.id)
        .maybeSingle();
      if (!tec) {
        await client.from("acesso_cpf_logs").insert({
          cpf: cpfClean, modulo: link.modulo, unidade: link.unidade,
          resultado: "negado", motivo: "tecnico_nao_encontrado",
          funcionario_id: func.id,
        });
        return json({ error: "tecnico_nao_encontrado" }, 403);
      }
      if (tec.link_status === "revogado") return json({ error: "revoked_link" }, 403);
      if (tec.link_status === "bloqueado" || tec.link_bloqueado)
        return json({ error: "blocked_link" }, 403);
      if (!tec.access_token) return json({ error: "invalid_token" }, 403);

      await client
        .from("links_acesso_publico")
        .update({ ultimo_acesso_em: new Date().toISOString() })
        .eq("token", link.token);
      await client.from("acesso_cpf_logs").insert({
        cpf: cpfClean, modulo: link.modulo, unidade: link.unidade,
        resultado: "autorizado", motivo: "", funcionario_id: func.id,
      });

      return json({
        ok: true,
        modulo: "operacional",
        unidade: link.unidade,
        link_nome: link.nome,
        usuario: {
          funcionario_id: func.id,
          cpf: cpfClean,
          nome: func.nome,
          empresa: empresaNome,
          cargo: func.cargo,
          setor: (func as any).setor || "",
          company_id: func.company_id,
        },
        tecnico_token: tec.access_token,
      });
    }

    // 6b. Demais módulos: validar permissão em funcionario_modulos
    const { data: perm } = await client
      .from("funcionario_modulos")
      .select("id, status")
      .eq("funcionario_id", func.id)
      .eq("modulo", link.modulo)
      .maybeSingle();
    if (!perm) {
      await client.from("acesso_cpf_logs").insert({
        cpf: cpfClean, modulo: link.modulo, unidade: link.unidade,
        resultado: "negado", motivo: "sem_permissao_modulo",
        funcionario_id: func.id,
      });
      return json({ error: "sem_permissao_modulo" }, 403);
    }
    if (perm.status !== "ativo") {
      await client.from("acesso_cpf_logs").insert({
        cpf: cpfClean, modulo: link.modulo, unidade: link.unidade,
        resultado: "negado", motivo: "modulo_bloqueado",
        funcionario_id: func.id,
      });
      return json({ error: "modulo_bloqueado" }, 403);
    }

    // Atualiza contadores
    await client
      .from("funcionario_modulos")
      .update({ ultimo_acesso_em: new Date().toISOString(), total_acessos: (await client.from("funcionario_modulos").select("total_acessos").eq("id", perm.id).maybeSingle()).data?.total_acessos! + 1 || 1 })
      .eq("id", perm.id);
    await client
      .from("links_acesso_publico")
      .update({ ultimo_acesso_em: new Date().toISOString() })
      .eq("token", link.token);
    await client.from("acesso_cpf_logs").insert({
      cpf: cpfClean, modulo: link.modulo, unidade: link.unidade,
      resultado: "autorizado", motivo: "", funcionario_id: func.id,
    });

    return json({
      ok: true,
      modulo: link.modulo,
      unidade: link.unidade,
      link_nome: link.nome,
      usuario: {
        funcionario_id: func.id,
        cpf: cpfClean,
        nome: func.nome,
        empresa: empresaNome,
        cargo: func.cargo,
        setor: (func as any).setor || "",
        company_id: func.company_id,
      },
    });
  } catch (e) {
    return json({ error: "internal", detalhe: String((e as Error).message || e) }, 500);
  }
});
