
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const OCR_URL = "https://rh-prospera-hub-70cb89a5.vercel.app/api/abastecimento-ocr";
const respond = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json", "cache-control": "no-store" },
});
const uuid = (v: unknown) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v || ""));
const allowedPhoto = (raw: unknown) => {
  try {
    const u = new URL(String(raw || ""));
    return u.protocol === "https:"
      && u.hostname === "djfjnxmbvjgweqzjvqtr.supabase.co"
      && (
        u.pathname.startsWith("/storage/v1/object/public/abastecimento-fotos/")
        || u.pathname.startsWith("/storage/v1/object/public/ponto-veiculo/")
      );
  } catch { return false; }
};
const numberValue = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
async function ocr(fileUrl: string | null, tipo: string) {
  if (!fileUrl || !allowedPhoto(fileUrl)) return { ok: false, error: "foto_ausente_ou_invalida" };
  try {
    const r = await fetch(OCR_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fileUrl, tipo }),
    });
    const data = await r.json().catch(() => ({}));
    return r.ok ? data : { ok: false, error: "ocr_http_" + r.status };
  } catch (e) {
    return { ok: false, error: "ocr_indisponivel", detail: e instanceof Error ? e.message : String(e) };
  }
}
function fuel(x: any) {
  const valor = numberValue(x?.valor);
  const litros = numberValue(x?.litros);
  let preco = numberValue(x?.valor_por_litro);
  if (!x?.ok || !valor || valor < 5 || valor > 10000 || !litros || litros < 0.5 || litros > 500) return null;
  if (!preco || preco < 1.5 || preco > 30) preco = valor / litros;
  if (preco < 1.5 || preco > 30) return null;
  const err = Math.abs(valor - litros * preco) / Math.max(valor, 1);
  if (err > 0.04) return null;
  return { valor, litros, preco: Number(preco.toFixed(3)) };
}
function near(a: number, b: number, pct: number) {
  return Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1) <= pct;
}
async function rpc(url: string, anon: string, name: string, body: Record<string, unknown>) {
  const r = await fetch(url + "/rest/v1/rpc/" + name, {
    method: "POST",
    headers: {
      apikey: anon,
      Authorization: "Bearer " + anon,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(name + ":" + r.status + ":" + text);
  return text ? JSON.parse(text) : null;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return respond({ ok: false, error: "method_not_allowed" }, 405);
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (!supabaseUrl || !anon) return respond({ ok: false, error: "backend_not_configured" }, 500);

  try {
    const body = await req.json().catch(() => ({}));
    const acessoId = String(body?.acessoId || "");
    const autorizacaoId = String(body?.autorizacaoId || "");
    const fotoBombaUrl = body?.fotoBombaUrl ? String(body.fotoBombaUrl) : null;
    const fotoPainelUrl = body?.fotoPainelUrl ? String(body.fotoPainelUrl) : null;
    const fotoReciboUrl = body?.fotoReciboUrl ? String(body.fotoReciboUrl) : null;

    if (!uuid(acessoId) || !uuid(autorizacaoId)) return respond({ ok: false, error: "identificacao_invalida" }, 400);
    if (!allowedPhoto(fotoBombaUrl) || !allowedPhoto(fotoPainelUrl) || !allowedPhoto(fotoReciboUrl)) {
      return respond({ ok: false, error: "fotos_invalidas" }, 400);
    }

    const [pumpRaw, panelRaw, receiptRaw] = await Promise.all([
      ocr(fotoBombaUrl, "bomba"),
      ocr(fotoPainelUrl, "painel_km"),
      ocr(fotoReciboUrl, "recibo_posto"),
    ]);

    const pump = fuel(pumpRaw);
    const receipt = fuel(receiptRaw);
    const kmRaw = numberValue(panelRaw?.km ?? panelRaw?.km_atual);
    const km = panelRaw?.ok && kmRaw && kmRaw >= 1000 && kmRaw <= 9999999 ? Math.round(kmRaw) : null;

    const reasons: string[] = [];
    if (!pump) reasons.push("foto da bomba não confirmada");
    if (!receipt) reasons.push("recibo do posto não confirmado");
    if (!km) reasons.push("KM do painel não confirmado");

    let resolvedFuel = pump || receipt;
    if (pump && receipt) {
      const consistent = near(pump.valor, receipt.valor, 0.03)
        && near(pump.litros, receipt.litros, 0.03)
        && near(pump.preco, receipt.preco, 0.05);
      if (!consistent) {
        reasons.push("bomba e recibo apresentam valores divergentes");
        resolvedFuel = null;
      } else {
        resolvedFuel = pump;
      }
    }

    const saved = await rpc(supabaseUrl, anon, "app_mecanico_registrar_ocr_abastecimento_validado", {
      p_acesso_id: acessoId,
      p_autorizacao_id: autorizacaoId,
      p_valor: resolvedFuel?.valor ?? null,
      p_litros: resolvedFuel?.litros ?? null,
      p_preco_litro: resolvedFuel?.preco ?? null,
      p_km: km,
    });

    if (!saved?.ok) return respond({ ok: false, error: saved?.error || "falha_ao_gravar_leitura" }, 400);
    if (saved?.km_rejeitado) reasons.push(saved?.motivo_km || "KM incompatível com o histórico");

    if (reasons.length) {
      await rpc(supabaseUrl, anon, "app_mecanico_marcar_revisao_abastecimento", {
        p_acesso_id: acessoId,
        p_autorizacao_id: autorizacaoId,
        p_motivo: reasons.join("; "),
      });
    }

    return respond({
      ok: true,
      status: reasons.length ? "revisao_manual" : "completo",
      revisao_manual: reasons.length > 0,
      motivos: reasons,
      valor: resolvedFuel?.valor ?? saved?.valor ?? null,
      litros: resolvedFuel?.litros ?? saved?.litros ?? null,
      valor_por_litro: resolvedFuel?.preco ?? saved?.valor_por_litro ?? null,
      km: km ?? saved?.km_atual ?? null,
      providers: {
        bomba: pumpRaw?.provider || null,
        painel: panelRaw?.provider || null,
        recibo: receiptRaw?.provider || null,
      },
    });
  } catch (error) {
    console.error("topac-abastecimento-leitura", error);
    return respond({ ok: false, error: "falha_processamento", detail: error instanceof Error ? error.message : String(error) }, 500);
  }
});
