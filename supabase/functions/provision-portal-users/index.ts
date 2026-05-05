// Provisiona usuários de teste FAT (faturamento) e FIN (financeiro).
// Idempotente: pode ser chamada várias vezes; sempre garante e-mail/senha/role.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const USERS = [
  { email: "fat@topac.local", senha: "TOPAC2026", role: "faturamento", nome: "Faturamento (Teste)" },
  { email: "fin@topac.local", senha: "TOPAC2026", role: "financeiro", nome: "Financeiro (Teste)" },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const results: any[] = [];

    for (const u of USERS) {
      let userId: string | null = null;
      const { data: created, error: cErr } = await supabase.auth.admin.createUser({
        email: u.email,
        password: u.senha,
        email_confirm: true,
        user_metadata: { nome_completo: u.nome, tipo: u.role },
      });

      if (created?.user) {
        userId = created.user.id;
      } else {
        // já existe — buscar e resetar senha
        const { data: list } = await supabase.auth.admin.listUsers({ perPage: 1000 });
        const found = list?.users.find((x) => x.email === u.email);
        if (found) {
          userId = found.id;
          await supabase.auth.admin.updateUserById(found.id, {
            password: u.senha,
            email_confirm: true,
          });
        }
      }

      if (!userId) {
        results.push({ email: u.email, ok: false, error: cErr?.message || "no user id" });
        continue;
      }

      // Garantir role
      await supabase
        .from("user_roles")
        .upsert({ user_id: userId, role: u.role }, { onConflict: "user_id,role" });

      results.push({ email: u.email, senha: u.senha, role: u.role, user_id: userId, ok: true });
    }

    return new Response(JSON.stringify({ ok: true, users: results }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
