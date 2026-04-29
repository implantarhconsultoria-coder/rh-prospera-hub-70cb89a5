// Provisiona usuários FAT/FIN. EXIGE admin autenticado.
// Senha NÃO é retornada — admin usa fluxo "Esqueci minha senha".
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const USERS = [
  { email: "fat@topac.local", role: "faturamento", nome: "Faturamento" },
  { email: "fin@topac.local", role: "financeiro", nome: "Financeiro" },
];

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
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const results: any[] = [];

    for (const u of USERS) {
      let userId: string | null = null;
      const senha = genStrongPassword();
      const { data: created } = await supabase.auth.admin.createUser({
        email: u.email, password: senha, email_confirm: true,
        user_metadata: { nome_completo: u.nome, tipo: u.role },
      });
      if (created?.user) {
        userId = created.user.id;
      } else {
        const { data: list } = await supabase.auth.admin.listUsers({ perPage: 1000 });
        const found = list?.users.find((x) => x.email === u.email);
        if (found) {
          userId = found.id;
          await supabase.auth.admin.updateUserById(found.id, { password: senha, email_confirm: true });
        }
      }
      if (!userId) { results.push({ email: u.email, ok: false }); continue; }
      await supabase.from("user_roles").upsert({ user_id: userId, role: u.role }, { onConflict: "user_id,role" });
      results.push({ email: u.email, role: u.role, user_id: userId, ok: true });
    }

    return new Response(JSON.stringify({
      ok: true, users: results,
      info: "Senhas geradas internamente. Use fluxo 'Esqueci minha senha' para entregar o acesso.",
    }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
