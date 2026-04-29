// Provisiona usuários para técnicos de campo. EXIGE admin autenticado.
// Senha provisória NUNCA é retornada na resposta. Admin deve usar "Recuperar senha".
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TecnicoProvision {
  apelido: string;
  email: string;
  veiculo_placa: string;
  veiculo_modelo: string;
  veiculo_id_interna: string;
}

const TECNICOS: TecnicoProvision[] = [
  { apelido: "Tiago Moreira", email: "tiago.moreira@topac.app", veiculo_placa: "TEC-0001", veiculo_modelo: "Fiat Strada", veiculo_id_interna: "VEÍC-01" },
  { apelido: "Tiago Toledo",  email: "tiago.toledo@topac.app",  veiculo_placa: "TEC-0002", veiculo_modelo: "Fiat Strada", veiculo_id_interna: "VEÍC-02" },
  { apelido: "Diego",         email: "diego@topac.app",         veiculo_placa: "TEC-0003", veiculo_modelo: "Fiat Strada", veiculo_id_interna: "VEÍC-03" },
  { apelido: "Leandro",       email: "leandro@topac.app",       veiculo_placa: "TEC-0004", veiculo_modelo: "Fiat Strada", veiculo_id_interna: "VEÍC-04" },
  { apelido: "Rafael",        email: "rafael@topac.app",        veiculo_placa: "TEC-0005", veiculo_modelo: "Fiat Strada", veiculo_id_interna: "VEÍC-05" },
  { apelido: "Jerri",         email: "jerri@topac.app",         veiculo_placa: "TEC-0006", veiculo_modelo: "Fiat Strada", veiculo_id_interna: "VEÍC-06" },
  { apelido: "Naciel",        email: "naciel@topac.app",        veiculo_placa: "TEC-0007", veiculo_modelo: "Fiat Strada", veiculo_id_interna: "VEÍC-07" },
  { apelido: "Vitor",         email: "vitor@topac.app",         veiculo_placa: "TEC-0008", veiculo_modelo: "Fiat Strada", veiculo_id_interna: "VEÍC-08" },
];

function genStrongPassword(length = 24): string {
  const charset = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const arr = new Uint32Array(length);
  crypto.getRandomValues(arr);
  let out = "";
  for (let i = 0; i < length; i++) out += charset[arr[i] % charset.length];
  return out;
}

async function requireAdmin(req: Request): Promise<{ ok: boolean; userId?: string; error?: string; status?: number }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return { ok: false, error: "Unauthorized", status: 401 };
  const token = authHeader.replace("Bearer ", "");
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
  const { data, error } = await sb.auth.getClaims(token);
  if (error || !data?.claims?.sub) return { ok: false, error: "Unauthorized", status: 401 };
  const adminClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: roles } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", data.claims.sub)
    .eq("role", "admin")
    .maybeSingle();
  if (!roles) return { ok: false, error: "Forbidden: admin role required", status: 403 };
  return { ok: true, userId: data.claims.sub };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await requireAdmin(req);
  if (!auth.ok) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: auth.status || 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const results: any[] = [];

    for (const t of TECNICOS) {
      const { data: tec } = await supabase
        .from("tecnicos_campo")
        .select("id, funcionario_id, user_id, veiculo_id")
        .eq("apelido", t.apelido)
        .maybeSingle();

      if (!tec) {
        results.push({ apelido: t.apelido, status: "tecnico_nao_encontrado" });
        continue;
      }

      let userId = tec.user_id;
      const senha = genStrongPassword();

      if (!userId) {
        const { data: created, error: cErr } = await supabase.auth.admin.createUser({
          email: t.email,
          password: senha,
          email_confirm: true,
          user_metadata: { nome_completo: t.apelido, tipo: "tecnico_campo" },
        });

        if (cErr && !cErr.message.includes("already")) {
          results.push({ apelido: t.apelido, status: "erro_criar_user", erro: cErr.message });
          continue;
        }

        if (created?.user) {
          userId = created.user.id;
        } else {
          const { data: list } = await supabase.auth.admin.listUsers();
          const found = list?.users.find((u) => u.email === t.email);
          if (found) userId = found.id;
        }
      }

      if (!userId) {
        results.push({ apelido: t.apelido, status: "user_id_indefinido" });
        continue;
      }

      await supabase.from("user_roles").upsert(
        { user_id: userId, role: "tecnico_campo" },
        { onConflict: "user_id,role" },
      );

      let veiculoId = tec.veiculo_id;
      if (!veiculoId) {
        const { data: veic } = await supabase
          .from("veiculos")
          .insert({
            placa: t.veiculo_placa,
            modelo: t.veiculo_modelo,
            identificacao_interna: t.veiculo_id_interna,
          })
          .select("id")
          .single();
        veiculoId = veic?.id;
      }

      if (veiculoId) {
        await supabase.from("colaborador_veiculo").upsert(
          { user_id: userId, veiculo_id: veiculoId },
          { onConflict: "user_id" },
        );
      }

      await supabase
        .from("tecnicos_campo")
        .update({ user_id: userId, veiculo_id: veiculoId, status: "offline" })
        .eq("id", tec.id);

      // Senha NÃO é retornada — admin envia link "Esqueci minha senha".
      results.push({
        apelido: t.apelido,
        email: t.email,
        user_id: userId,
        veiculo_id: veiculoId,
        placa: t.veiculo_placa,
        status: "ok",
      });
    }

    return new Response(JSON.stringify({
      ok: true,
      results,
      info: "Senhas geradas internamente. Use 'Esqueci minha senha' para entregar acesso aos técnicos.",
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
