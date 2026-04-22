// Public edge function: link-based access for field technicians.
// Validates `access_token`, performs all writes with service role on behalf of the technician.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

// Resolve técnico from token; returns null if invalid.
async function resolveTecnico(token: string) {
  if (!token || token.length < 10) return null;
  const { data } = await sb()
    .from("tecnicos_campo")
    .select(
      "id, apelido, status, user_id, veiculo_id, funcionario_id, funcionarios:funcionario_id(id, nome, cargo, celular, cpf), veiculos:veiculo_id(id, placa, modelo, identificacao_interna)",
    )
    .eq("access_token", token)
    .maybeSingle();
  return data;
}

// Touch ultima_atividade_em + status online
async function touch(tecnicoId: string) {
  await sb()
    .from("tecnicos_campo")
    .update({ ultima_atividade_em: new Date().toISOString(), status: "online" })
    .eq("id", tecnicoId);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const { action, token, payload } = body as {
      action: string;
      token: string;
      payload?: Record<string, unknown>;
    };

    const tec = await resolveTecnico(token);
    if (!tec) return json({ error: "invalid_token" }, 401);

    const userId = tec.user_id as string | null;
    const veiculoId = tec.veiculo_id as string | null;

    switch (action) {
      // ---------- BOOTSTRAP ----------
      case "perfil": {
        const today = new Date().toISOString().split("T")[0];
        const [pontoToday, chamadosAbertos, ultPonto, ultKm, ultChamado] =
          await Promise.all([
            userId
              ? sb()
                  .from("registros_ponto")
                  .select("tipo, hora, selfie_url, latitude, longitude, created_at")
                  .eq("user_id", userId)
                  .eq("data", today)
                  .order("hora", { ascending: false })
              : Promise.resolve({ data: [] }),
            userId
              ? sb()
                  .from("chamados")
                  .select("id", { count: "exact", head: true })
                  .eq("colaborador_id", userId)
                  .in("status", ["pendente", "aceito", "em_deslocamento", "no_local", "em_execucao"])
              : Promise.resolve({ count: 0 }),
            userId
              ? sb()
                  .from("registros_ponto")
                  .select("tipo, hora, data, created_at")
                  .eq("user_id", userId)
                  .order("created_at", { ascending: false })
                  .limit(1)
                  .maybeSingle()
              : Promise.resolve({ data: null }),
            userId
              ? sb()
                  .from("registros_km")
                  .select("km_valor, created_at, tipo_registro")
                  .eq("user_id", userId)
                  .order("created_at", { ascending: false })
                  .limit(1)
                  .maybeSingle()
              : Promise.resolve({ data: null }),
            userId
              ? sb()
                  .from("chamados")
                  .select("id, cliente, status, created_at")
                  .eq("colaborador_id", userId)
                  .order("created_at", { ascending: false })
                  .limit(1)
                  .maybeSingle()
              : Promise.resolve({ data: null }),
          ]);
        return json({
          tecnico: tec,
          today: pontoToday.data || [],
          chamados_abertos: chamadosAbertos.count || 0,
          ultimo_ponto: ultPonto.data || null,
          ultimo_km: ultKm.data || null,
          ultimo_chamado: ultChamado.data || null,
        });
      }

      // ---------- PONTO ----------
      case "registrar_ponto": {
        if (!userId) return json({ error: "tecnico_sem_user" }, 400);
        const p = payload || {};
        const tipo = String(p.tipo || "");
        if (!["entrada", "almoco_saida", "almoco_volta", "saida"].includes(tipo))
          return json({ error: "tipo_invalido" }, 400);

        let selfieUrl: string | null = null;
        if (p.selfie_base64) {
          const base64 = String(p.selfie_base64).replace(/^data:image\/\w+;base64,/, "");
          const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
          const path = `${userId}/${Date.now()}-${tipo}.jpg`;
          const { error: upErr } = await sb()
            .storage.from("ponto-selfies")
            .upload(path, bytes, { contentType: "image/jpeg", upsert: false });
          if (upErr) return json({ error: "upload_selfie", detalhe: upErr.message }, 500);
          const { data: pub } = sb().storage.from("ponto-selfies").getPublicUrl(path);
          selfieUrl = pub.publicUrl;
        }

        const now = new Date();
        const { data: row, error } = await sb()
          .from("registros_ponto")
          .insert({
            user_id: userId,
            tipo,
            data: now.toISOString().split("T")[0],
            hora: now.toTimeString().slice(0, 8),
            latitude: p.latitude ?? null,
            longitude: p.longitude ?? null,
            veiculo_id: veiculoId,
            selfie_url: selfieUrl,
          })
          .select("*")
          .single();
        if (error) return json({ error: "insert_ponto", detalhe: error.message }, 500);
        await touch(tec.id);
        return json({ ok: true, registro: row });
      }

      // ---------- KM ----------
      case "registrar_km": {
        if (!userId || !veiculoId) return json({ error: "sem_veiculo" }, 400);
        const p = payload || {};
        const km = Number(p.km_valor);
        if (!km || km < 0) return json({ error: "km_invalido" }, 400);

        let fotoUrl = "";
        if (p.foto_base64) {
          const base64 = String(p.foto_base64).replace(/^data:image\/\w+;base64,/, "");
          const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
          const path = `${userId}/${Date.now()}-km.jpg`;
          const { error: upErr } = await sb()
            .storage.from("km-fotos")
            .upload(path, bytes, { contentType: "image/jpeg", upsert: false });
          if (upErr) return json({ error: "upload_km", detalhe: upErr.message }, 500);
          const { data: pub } = sb().storage.from("km-fotos").getPublicUrl(path);
          fotoUrl = pub.publicUrl;
        }

        const now = new Date();
        const { data: row, error } = await sb()
          .from("registros_km")
          .insert({
            user_id: userId,
            veiculo_id: veiculoId,
            km_valor: km,
            tipo_registro: p.foto_base64 ? "foto" : "manual",
            foto_url: fotoUrl,
            latitude: p.latitude ?? null,
            longitude: p.longitude ?? null,
            data: now.toISOString().split("T")[0],
            hora: now.toTimeString().slice(0, 8),
          })
          .select("*")
          .single();
        if (error) return json({ error: "insert_km", detalhe: error.message }, 500);
        await touch(tec.id);
        return json({ ok: true, registro: row });
      }

      // ---------- CHAMADOS ----------
      case "listar_chamados": {
        if (!userId) return json({ chamados: [] });
        const { data } = await sb()
          .from("chamados")
          .select("*")
          .eq("colaborador_id", userId)
          .order("created_at", { ascending: false });
        return json({ chamados: data || [] });
      }

      case "atualizar_chamado": {
        if (!userId) return json({ error: "sem_user" }, 400);
        const p = payload || {};
        const id = String(p.id || "");
        const novo = String(p.status || "");
        const updates: Record<string, unknown> = {
          status: novo,
          latitude: p.latitude ?? null,
          longitude: p.longitude ?? null,
          veiculo_id: veiculoId,
        };
        if (novo === "aceito") updates.aceito_em = new Date().toISOString();
        if (novo === "concluido") updates.concluido_em = new Date().toISOString();
        const { error } = await sb()
          .from("chamados")
          .update(updates)
          .eq("id", id)
          .eq("colaborador_id", userId);
        if (error) return json({ error: "update_chamado", detalhe: error.message }, 500);

        if (novo === "concluido" && Array.isArray(p.itens) && p.itens.length) {
          const rows = (p.itens as Array<{ item_id: string; nome_item: string; quantidade: number }>).map(
            (i) => ({ chamado_id: id, item_id: i.item_id, nome_item: i.nome_item, quantidade: i.quantidade }),
          );
          await sb().from("chamado_itens_utilizados").insert(rows);
        }
        await touch(tec.id);
        return json({ ok: true });
      }

      // ---------- ESTOQUE DO CARRO ----------
      case "listar_estoque": {
        if (!veiculoId) return json({ itens: [] });
        const { data } = await sb()
          .from("estoque_veiculo")
          .select("*")
          .eq("veiculo_id", veiculoId)
          .order("nome_item");
        return json({ itens: data || [] });
      }

      case "estoque_add": {
        if (!veiculoId) return json({ error: "sem_veiculo" }, 400);
        const p = payload || {};
        const { error } = await sb().from("estoque_veiculo").insert({
          veiculo_id: veiculoId,
          nome_item: String(p.nome_item || "").trim(),
          quantidade: Number(p.quantidade) || 0,
        });
        if (error) return json({ error: error.message }, 500);
        await touch(tec.id);
        return json({ ok: true });
      }

      case "estoque_qtd": {
        if (!veiculoId) return json({ error: "sem_veiculo" }, 400);
        const p = payload || {};
        const { data: cur } = await sb()
          .from("estoque_veiculo")
          .select("quantidade")
          .eq("id", String(p.item_id))
          .eq("veiculo_id", veiculoId)
          .maybeSingle();
        if (!cur) return json({ error: "item_nao_encontrado" }, 404);
        const novo = Math.max(0, (cur.quantidade as number) + Number(p.delta || 0));
        const { error } = await sb()
          .from("estoque_veiculo")
          .update({ quantidade: novo })
          .eq("id", String(p.item_id));
        if (error) return json({ error: error.message }, 500);
        await touch(tec.id);
        return json({ ok: true, quantidade: novo });
      }

      // ---------- ABASTECIMENTO ----------
      case "validar_vale": {
        const raw = String((payload || {}).codigo || "").trim();
        if (!raw) return json({ error: "codigo_vazio" }, 400);

        // Normaliza: aceita "TOPAC-ABAST-001" mesmo se vier com espaços/case diferente
        const codigo = raw.toUpperCase().replace(/\s+/g, "");
        const isTopacAbast = /^TOPAC-ABAST-\d{1,6}$/.test(codigo);

        let { data: vale } = await sb()
          .from("vales_combustivel")
          .select("*")
          .eq("codigo", codigo)
          .maybeSingle();

        // Auto-provisiona vale TOPAC-ABAST se não existir (autorização impressa em série)
        if (!vale && isTopacAbast) {
          const ins = await sb()
            .from("vales_combustivel")
            .insert({
              codigo,
              tipo: "autorizacao_abastecimento",
              status: "ativo",
              valor_limite: 0,
              litros_limite: 0,
              emitido_por_nome: "Auto (QR TOPAC-ABAST)",
              observacao: "Autorização da série TOPAC reconhecida automaticamente no app.",
            })
            .select("*")
            .maybeSingle();
          vale = ins.data;
        }

        if (!vale) return json({ error: "vale_invalido" }, 404);
        if (vale.status !== "ativo") return json({ error: "vale_indisponivel", status: vale.status }, 400);
        if (vale.validade && new Date(vale.validade) < new Date(new Date().toISOString().split("T")[0])) {
          return json({ error: "vale_vencido" }, 400);
        }
        if (vale.veiculo_id && veiculoId && vale.veiculo_id !== veiculoId) {
          return json({ error: "vale_outro_veiculo" }, 400);
        }
        const veic = (tec as any).veiculos || null;
        const func = (tec as any).funcionarios || null;
        return json({
          ok: true,
          vale,
          tipo: vale.tipo || "autorizacao_abastecimento",
          mecanico: {
            id: tec.id,
            nome: func?.nome || tec.apelido,
            cargo: func?.cargo || "",
          },
          veiculo: veic ? { id: veic.id, placa: veic.placa, modelo: veic.modelo } : null,
          posto: {
            nome: vale.posto_nome || "",
            cnpj: vale.posto_cnpj || "",
            endereco: vale.posto_endereco || "",
          },
          agora: new Date().toISOString(),
        });
      }

      case "registrar_abastecimento": {
        const p = payload || {};
        const valor = Number(p.valor) || 0;
        const litros = Number(p.litros) || 0;
        if (valor <= 0 || litros <= 0) return json({ error: "valor_litros_invalido" }, 400);
        if (!p.foto_bomba_base64) return json({ error: "foto_obrigatoria" }, 400);
        if (!p.vale_codigo) return json({ error: "vale_obrigatorio" }, 400);

        const { data: vale } = await sb()
          .from("vales_combustivel")
          .select("*")
          .eq("codigo", String(p.vale_codigo))
          .maybeSingle();
        if (!vale) return json({ error: "vale_nao_encontrado" }, 404);

        // Upload foto
        const base64 = String(p.foto_bomba_base64).replace(/^data:image\/\w+;base64,/, "");
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        const path = `${tec.id}/${Date.now()}-bomba.jpg`;
        const up = await sb()
          .storage.from("abastecimento-fotos")
          .upload(path, bytes, { contentType: "image/jpeg", upsert: false });
        if (up.error) return json({ error: "upload_foto", detalhe: up.error.message }, 500);
        const { data: pub } = sb().storage.from("abastecimento-fotos").getPublicUrl(path);

        const veic = (tec as any).veiculos || null;
        const func = (tec as any).funcionarios || null;
        const now = new Date();
        const competencia = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

        const { data: row, error } = await sb()
          .from("abastecimentos")
          .insert({
            vale_id: vale.id,
            vale_codigo: vale.codigo,
            tecnico_id: tec.id,
            user_id: userId,
            mecanico_nome: func?.nome || tec.apelido,
            veiculo_id: veiculoId,
            placa: veic?.placa || "",
            modelo: veic?.modelo || "",
            data: now.toISOString().split("T")[0],
            hora: now.toTimeString().slice(0, 8),
            latitude: p.latitude ?? null,
            longitude: p.longitude ?? null,
            foto_bomba_url: pub.publicUrl,
            valor,
            litros,
            combustivel: String(p.combustivel || ""),
            km_atual: p.km_atual ? Number(p.km_atual) : null,
            preenchimento: String(p.preenchimento || "manual"),
            posto_cnpj: String(p.posto_cnpj || vale.posto_cnpj || ""),
            posto_nome: String(p.posto_nome || vale.posto_nome || ""),
            posto_endereco: String(p.posto_endereco || vale.posto_endereco || ""),
            forma_pagamento: String(p.forma_pagamento || ""),
            status: "pendente",
            competencia,
          })
          .select("*")
          .single();
        if (error) return json({ error: "insert_abast", detalhe: error.message }, 500);

        // Marcar vale como utilizado
        await sb()
          .from("vales_combustivel")
          .update({
            status: "utilizado",
            utilizado_em: now.toISOString(),
            utilizado_por: userId,
          })
          .eq("id", vale.id);

        await touch(tec.id);
        return json({ ok: true, abastecimento: row });
      }

      case "listar_abastecimentos": {
        const { data } = await sb()
          .from("abastecimentos")
          .select("*")
          .eq("tecnico_id", tec.id)
          .order("created_at", { ascending: false })
          .limit(50);
        return json({ abastecimentos: data || [] });
      }

      // ---------- HISTÓRICO UNIFICADO ----------
      case "historico": {
        if (!userId) return json({ historico: [] });
        const p = payload || {};
        const tipo = String(p.tipo || "todos");
        const limit = 30;
        const out: any[] = [];

        if (tipo === "todos" || tipo === "ponto") {
          const { data } = await sb()
            .from("registros_ponto")
            .select("id, tipo, data, hora, selfie_url, latitude, longitude, created_at")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(limit);
          (data || []).forEach((r) => out.push({ ...r, _kind: "ponto" }));
        }
        if (tipo === "todos" || tipo === "km") {
          const { data } = await sb()
            .from("registros_km")
            .select("id, km_valor, foto_url, data, hora, created_at")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(limit);
          (data || []).forEach((r) => out.push({ ...r, _kind: "km" }));
        }
        if (tipo === "todos" || tipo === "chamado") {
          const { data } = await sb()
            .from("chamados")
            .select("id, cliente, local_servico, tipo_servico, status, created_at, concluido_em")
            .eq("colaborador_id", userId)
            .order("created_at", { ascending: false })
            .limit(limit);
          (data || []).forEach((r) => out.push({ ...r, _kind: "chamado" }));
        }
        if (tipo === "todos" || tipo === "abastecimento") {
          const { data } = await sb()
            .from("abastecimentos")
            .select("id, valor, litros, placa, foto_bomba_url, data, hora, status, created_at")
            .eq("tecnico_id", tec.id)
            .order("created_at", { ascending: false })
            .limit(limit);
          (data || []).forEach((r) => out.push({ ...r, _kind: "abastecimento" }));
        }
        out.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        return json({ historico: out.slice(0, 60) });
      }

      default:
        return json({ error: "acao_desconhecida", action }, 400);
    }
  } catch (e) {
    return json({ error: "erro_interno", detalhe: (e as Error).message }, 500);
  }
});
