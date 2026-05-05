// Edge function to provision auth users for technicians + bind vehicles
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

const SENHA_PROVISORIA = "Topac@2026";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const results: any[] = [];

    for (const t of TECNICOS) {
      // 1. Find tecnico_campo row
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

      // 2. Create or fetch auth user
      if (!userId) {
        // Try create
        const { data: created, error: cErr } = await supabase.auth.admin.createUser({
          email: t.email,
          password: SENHA_PROVISORIA,
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
          // Lookup by email
          const { data: list } = await supabase.auth.admin.listUsers();
          const found = list?.users.find((u) => u.email === t.email);
          if (found) userId = found.id;
        }
      }

      if (!userId) {
        results.push({ apelido: t.apelido, status: "user_id_indefinido" });
        continue;
      }

      // 3. Assign role tecnico_campo
      await supabase.from("user_roles").upsert(
        { user_id: userId, role: "tecnico_campo" },
        { onConflict: "user_id,role" }
      );

      // 4. Create vehicle if missing
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

      // 5. Bind colaborador <-> veiculo
      if (veiculoId) {
        await supabase.from("colaborador_veiculo").upsert(
          { user_id: userId, veiculo_id: veiculoId },
          { onConflict: "user_id" }
        );
      }

      // 6. Update tecnicos_campo row
      await supabase
        .from("tecnicos_campo")
        .update({
          user_id: userId,
          veiculo_id: veiculoId,
          status: "offline",
        })
        .eq("id", tec.id);

      results.push({
        apelido: t.apelido,
        email: t.email,
        senha: SENHA_PROVISORIA,
        user_id: userId,
        veiculo_id: veiculoId,
        placa: t.veiculo_placa,
        status: "ok",
      });
    }

    return new Response(JSON.stringify({ results, senha_provisoria: SENHA_PROVISORIA }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
