// Provisiona usuÃ¡rios por e-mail/senha (idempotente).
// Inclui: contas de teste FAT/FIN + 15 funcionÃ¡rios com seus respectivos mÃ³dulos.
// Para mecÃ¢nicos, garante tambÃ©m o registro em tecnicos_campo com access_token.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Role =
  | "admin"
  | "filial_praia"
  | "filial_goiania"
  | "faturamento"
  | "financeiro"
  | "tecnico_campo";

interface UserSpec {
  email: string;
  senha: string;
  nome: string;
  roles: Role[];
  // se informado, vincula este auth.user ao funcionÃ¡rio e (para tecnico_campo) cria tecnicos_campo
  funcionario_nome_match?: string[];
}

const SENHA = "TOPAC2026";

const USERS: UserSpec[] = [
  // Admin principal da plataforma
  { email: "adm.matriz@topac.com.br", senha: SENHA, nome: "Administrador Matriz", roles: ["admin"] },

  // Acessos de teste rÃ¡pido (mantidos)
  { email: "fat@topac.local", senha: SENHA, nome: "Faturamento (Teste)", roles: ["faturamento"] },
  { email: "fin@topac.local", senha: SENHA, nome: "Financeiro (Teste)", roles: ["financeiro"] },

  // 15 usuÃ¡rios reais
  { email: "antonio.carlos@topac.app", senha: SENHA, nome: "Antonio Carlos Servilio",
    roles: ["filial_praia", "faturamento"], funcionario_nome_match: ["ANTONIO CARLOS"] },
  { email: "ilma@topac.app", senha: SENHA, nome: "Ilma Mendes de Mello",
    roles: ["filial_goiania", "faturamento"], funcionario_nome_match: ["ILMA MENDES"] },
  { email: "paula@topac.app", senha: SENHA, nome: "Paula Rubia Faquini Goncalves",
    roles: ["financeiro", "faturamento"], funcionario_nome_match: ["PAULA RUBIA"] },
  { email: "robson@topac.app", senha: SENHA, nome: "Robson Chafi Servilio",
    roles: ["financeiro", "faturamento"], funcionario_nome_match: ["ROBSON CHAFI"] },
  { email: "rafaela@topac.app", senha: SENHA, nome: "Rafaela Aparecida Del Nobile",
    roles: ["faturamento"], funcionario_nome_match: ["RAFAELA"] },
  { email: "kayky@topac.app", senha: SENHA, nome: "Kayky Chafi Servilio",
    roles: ["faturamento"], funcionario_nome_match: ["KAYKY"] },
  { email: "douglas@topac.app", senha: SENHA, nome: "Douglas Cesar Chiappetta",
    roles: ["faturamento"], funcionario_nome_match: ["DOUGLAS"] },

  // MecÃ¢nicos â€” App MecÃ¢nico (tecnico_campo)
  { email: "diego@topac.app", senha: SENHA, nome: "Diego Martins Silva Santos",
    roles: ["tecnico_campo"], funcionario_nome_match: ["DIEGO MARTINS"] },
  { email: "tiago.moreira@topac.app", senha: SENHA, nome: "Tiago Moreira da Silva Ferreira",
    roles: ["tecnico_campo"], funcionario_nome_match: ["TIAGO MOREIRA"] },
  { email: "tiago.toledo@topac.app", senha: SENHA, nome: "Tiago Toledo Dias",
    roles: ["tecnico_campo"], funcionario_nome_match: ["TIAGO TOLEDO"] },
  { email: "jerri@topac.app", senha: SENHA, nome: "Jerri Silva Inocencio",
    roles: ["tecnico_campo"], funcionario_nome_match: ["JERRI"] },
  { email: "leandro@topac.app", senha: SENHA, nome: "Leandro Martins de Oliveira",
    roles: ["tecnico_campo"], funcionario_nome_match: ["LEANDRO MARTINS"] },
  { email: "rafael@topac.app", senha: SENHA, nome: "Rafael Olimpio",
    roles: ["tecnico_campo"], funcionario_nome_match: ["RAFAEL OLIMPIO"] },
  { email: "naciel@topac.app", senha: SENHA, nome: "Naciel Santos da Silva",
    roles: ["tecnico_campo"], funcionario_nome_match: ["NACIEL"] },
  { email: "vitor@topac.app", senha: SENHA, nome: "Edenilson Pereira Vitor",
    roles: ["tecnico_campo"], funcionario_nome_match: ["EDENILSON", "VITOR"] },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const results: any[] = [];

    // Cache de listUsers para evitar chamadas repetidas
    const { data: existingList } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const existing = new Map<string, string>(); // email -> id
    for (const u of existingList?.users || []) {
      if (u.email) existing.set(u.email.toLowerCase(), u.id);
    }

    for (const u of USERS) {
      try {
        const emailLower = u.email.toLowerCase();
        let userId = existing.get(emailLower) || null;

        if (!userId) {
          const { data: created, error: cErr } = await supabase.auth.admin.createUser({
            email: u.email,
            password: u.senha,
            email_confirm: true,
            user_metadata: { nome_completo: u.nome },
          });
          if (cErr || !created?.user) {
            results.push({ email: u.email, ok: false, error: cErr?.message || "create_failed" });
            continue;
          }
          userId = created.user.id;
        } else {
          // Reseta senha para garantir TOPAC2026 no primeiro acesso
          await supabase.auth.admin.updateUserById(userId, {
            password: u.senha,
            email_confirm: true,
          });
        }

        // Garante profile
        await supabase.from("profiles").upsert(
          { user_id: userId, nome_completo: u.nome, email: u.email },
          { onConflict: "user_id" },
        );

        // Garante todas as roles
        for (const role of u.roles) {
          await supabase.from("user_roles").upsert(
            { user_id: userId, role },
            { onConflict: "user_id,role" },
          );
        }

        // Vincula a funcionÃ¡rio (se houver match)
        let funcionarioId: string | null = null;
        if (u.funcionario_nome_match?.length) {
          for (const m of u.funcionario_nome_match) {
            const { data: f } = await supabase
              .from("funcionarios")
              .select("id, nome")
              .ilike("nome", `%${m}%`)
              .limit(1)
              .maybeSingle();
            if (f?.id) { funcionarioId = f.id; break; }
          }
          if (funcionarioId) {
            // Atualiza email do funcionÃ¡rio (corrige caso esteja com e-mail errado, ex: Diego)
            await supabase.from("funcionarios").update({ email: u.email }).eq("id", funcionarioId);
          }
        }

        // Para mecÃ¢nicos: garantir tecnicos_campo (com access_token)
        if (u.roles.includes("tecnico_campo") && funcionarioId) {
          const { data: tc } = await supabase
            .from("tecnicos_campo")
            .select("id, user_id, access_token")
            .eq("funcionario_id", funcionarioId)
            .maybeSingle();

          if (!tc) {
            // Cria registro com token
            await supabase.rpc("gen_tecnico_access_token");
            const { data: tokRes } = await supabase.rpc("gen_tecnico_access_token");
            await supabase.from("tecnicos_campo").insert({
              funcionario_id: funcionarioId,
              user_id: userId,
              apelido: u.nome,
              status: "ativo",
              access_token: tokRes as unknown as string,
            });
          } else {
            const updates: any = { user_id: userId, status: "ativo" };
            if (!tc.access_token) {
              const { data: tokRes } = await supabase.rpc("gen_tecnico_access_token");
              updates.access_token = tokRes;
            }
            await supabase.from("tecnicos_campo").update(updates).eq("id", tc.id);
          }
        }

        results.push({
          email: u.email, senha: u.senha, roles: u.roles,
          user_id: userId, funcionario_id: funcionarioId, ok: true,
        });
      } catch (innerErr: any) {
        results.push({ email: u.email, ok: false, error: innerErr?.message || String(innerErr) });
      }
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
