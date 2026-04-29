// Public edge function: validates CPF + link token and returns module session info.
// Operacional: também resolve token do tecnico_campo (se existir) para abrir o app.
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const action = String((body as any).action || "");
    const slug = String((body as any).slug || "").toLowerCase();
    const cpfRaw = String((body as any).cpf || "");

    if (action !== "entrar") return json({ error: "invalid_action" }, 400);
    if (!slug) return json({ error: "slug_obrigatorio" }, 400);
    const cpfClean = cpfRaw.replace(/\D/g, "");
    if (cpfClean.length !== 11) return json({ error: "cpf_invalido" }, 400);

    const client = sb();

    // Pega o token do link a partir do slug
    const { data: link, error: lerr } = await client
      .from("links_acesso_publico")
      .select("token, modulo, unidade, nome, status, empresas_permitidas")
      .eq("slug", slug)
      .maybeSingle();
    if (lerr) return json({ error: "db_error", detalhe: lerr.message }, 500);
    if (!link) return json({ error: "link_invalido" }, 404);
    if (link.status !== "ativo") return json({ error: "link_bloqueado" }, 403);

    // Para Operacional: fluxo diferente — autoriza pela tabela tecnicos_campo + funcionarios.
    // Não exige pré-cadastro em acessos_cpf (técnicos já estão na base).
    if (link.modulo === "operacional") {
      const { data: func } = await client
        .from("funcionarios")
        .select("id, nome, cpf, company_id")
        .filter("cpf", "ilike", `%${cpfClean}%`)
        .maybeSingle();

      if (!func) return json({ error: "cpf_nao_encontrado" }, 403);

      // Verifica se a empresa do funcionário corresponde à unidade do link
      let empresaNome = "";
      if (func.company_id) {
        const { data: emp } = await client
          .from("empresas")
          .select("nome")
          .eq("id", func.company_id)
          .maybeSingle();
        empresaNome = emp?.nome || "";
      }

      const empresasOk = (link.empresas_permitidas || []) as string[];
      if (empresasOk.length > 0 && empresaNome && !empresasOk.includes(empresaNome)) {
        return json({ error: "unidade_incorreta" }, 403);
      }

      const { data: tec } = await client
        .from("tecnicos_campo")
        .select("access_token, link_status, link_bloqueado")
        .eq("funcionario_id", func.id)
        .maybeSingle();

      if (!tec) return json({ error: "tecnico_nao_encontrado" }, 403);
      if (tec.link_status === "revogado") return json({ error: "revoked_link" }, 403);
      if (tec.link_status === "bloqueado" || tec.link_bloqueado)
        return json({ error: "blocked_link" }, 403);
      if (!tec.access_token) return json({ error: "invalid_token" }, 403);

      // Atualiza contadores do link
      await client
        .from("links_acesso_publico")
        .update({ ultimo_acesso_em: new Date().toISOString() })
        .eq("token", link.token);

      return json({
        ok: true,
        modulo: "operacional",
        unidade: link.unidade,
        link_nome: link.nome,
        usuario: { nome: func.nome, cpf: cpfClean, empresa: empresaNome },
        tecnico_token: tec.access_token,
      });
    }

    // Financeiro / Faturamento / outros: usa tabela acessos_cpf via SECURITY DEFINER
    const { data: result, error: rerr } = await client.rpc("validar_acesso_cpf", {
      p_token: link.token,
      p_cpf: cpfClean,
    });
    if (rerr) return json({ error: "db_error", detalhe: rerr.message }, 500);
    const r = result as any;
    if (!r?.ok) return json({ error: r?.error || "negado" }, 403);

    return json({
      ok: true,
      modulo: link.modulo,
      unidade: link.unidade,
      link_nome: link.nome,
      usuario: r.usuario,
    });
  } catch (e) {
    return json({ error: "internal", detalhe: String((e as Error).message || e) }, 500);
  }
});
