// One-shot: provision a test user with tecnico_campo role bound to TEC-0001
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { email, nome, placa } = await req.json();
    if (!email) throw new Error("email required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const SENHA = "Topac@2026";

    // 1. Create or fetch user
    let userId: string | null = null;
    const { data: created, error: cErr } = await supabase.auth.admin.createUser({
      email,
      password: SENHA,
      email_confirm: true,
      user_metadata: { nome_completo: nome || email, tipo: "tecnico_campo" },
    });

    if (created?.user) {
      userId = created.user.id;
    } else {
      const { data: list } = await supabase.auth.admin.listUsers();
      const found = list?.users.find((u) => u.email === email);
      if (found) {
        userId = found.id;
        // Reset password just in case
        await supabase.auth.admin.updateUserById(found.id, { password: SENHA });
      }
    }

    if (!userId) throw new Error("could not provision user: " + (cErr?.message || "unknown"));

    // 2. Assign role tecnico_campo
    await supabase.from("user_roles").upsert(
      { user_id: userId, role: "tecnico_campo" },
      { onConflict: "user_id,role" }
    );

    // 3. Bind to a vehicle (default TEC-0001)
    const targetPlaca = placa || "TEC-0001";
    const { data: veic } = await supabase
      .from("veiculos")
      .select("id, placa, modelo, identificacao_interna")
      .eq("placa", targetPlaca)
      .maybeSingle();

    let veiculoInfo: any = null;
    if (veic) {
      await supabase.from("colaborador_veiculo").upsert(
        { user_id: userId, veiculo_id: veic.id },
        { onConflict: "user_id" }
      );
      veiculoInfo = veic;
    }

    return new Response(JSON.stringify({
      ok: true,
      email,
      senha: SENHA,
      user_id: userId,
      role: "tecnico_campo",
      veiculo: veiculoInfo,
    }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
