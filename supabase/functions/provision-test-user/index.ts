// Provisiona usuário de teste com role tecnico_campo. EXIGE admin autenticado.
// A senha gerada NÃO é retornada — admin envia "Esqueci minha senha".
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function genStrongPassword(length = 24): string {
  const charset = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const arr = new Uint32Array(length);
  crypto.getRandomValues(arr);
  let out = "";
  for (let i = 0; i < length; i++) out += charset[arr[i] % charset.length];
  return out;
}

async function requireAdmin(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return { ok: false as const, status: 401, error: "Unauthorized" };
  const token = authHeader.replace("Bearer ", "");
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
  const { data, error } = await sb.auth.getClaims(token);
  if (error || !data?.claims?.sub) return { ok: false as const, status: 401, error: "Unauthorized" };
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: r } = await admin.from("user_roles").select("role").eq("user_id", data.claims.sub).eq("role", "admin").maybeSingle();
  if (!r) return { ok: false as const, status: 403, error: "Forbidden: admin role required" };
  return { ok: true as const, userId: data.claims.sub };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const auth = await requireAdmin(req);
  if (!auth.ok) return new Response(JSON.stringify({ error: auth.error }), { status: auth.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const { email, nome, placa } = await req.json();
    if (!email) throw new Error("email required");

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const senha = genStrongPassword();

    let userId: string | null = null;
    const { data: created, error: cErr } = await supabase.auth.admin.createUser({
      email, password: senha, email_confirm: true,
      user_metadata: { nome_completo: nome || email, tipo: "tecnico_campo" },
    });

    if (created?.user) {
      userId = created.user.id;
    } else {
      const { data: list } = await supabase.auth.admin.listUsers();
      const found = list?.users.find((u) => u.email === email);
      if (found) {
        userId = found.id;
        await supabase.auth.admin.updateUserById(found.id, { password: senha });
      }
    }

    if (!userId) throw new Error("could not provision user: " + (cErr?.message || "unknown"));

    await supabase.from("user_roles").upsert({ user_id: userId, role: "tecnico_campo" }, { onConflict: "user_id,role" });

    const targetPlaca = placa || "TEC-0001";
    const { data: veic } = await supabase.from("veiculos").select("id, placa, modelo, identificacao_interna").eq("placa", targetPlaca).maybeSingle();
    let veiculoInfo: any = null;
    if (veic) {
      await supabase.from("colaborador_veiculo").upsert({ user_id: userId, veiculo_id: veic.id }, { onConflict: "user_id" });
      veiculoInfo = veic;
    }

    return new Response(JSON.stringify({
      ok: true, email, user_id: userId, role: "tecnico_campo", veiculo: veiculoInfo,
      info: "Senha gerada internamente. Use o fluxo 'Esqueci minha senha' para entregar acesso.",
    }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
