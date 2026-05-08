// Edge function: ocr-bomba-combustivel
// Lê uma foto da bomba de combustível e devolve valor / litros / preço por litro / combustível.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SYSTEM_PROMPT = `Você analisa FOTOS de bombas de combustível em postos brasileiros.
Devolva SOMENTE um JSON válido (sem markdown) com:
{
  "valor": numero (R$ total abastecido, sem símbolo, ponto decimal),
  "litros": numero (litros, ponto decimal),
  "valor_por_litro": numero (R$/L),
  "combustivel": "Gasolina" | "Etanol" | "Diesel" | "Diesel S10" | "GNV" | "" ,
  "confianca": numero entre 0 e 1
}
Regras:
- Se não conseguir ler um campo, devolva 0 (números) ou "" (texto).
- Não invente. Confiança baixa quando incerto.
- Apenas JSON puro.`;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const dataUrl: string | undefined = body.dataUrl;
    const fileUrl: string | undefined = body.fileUrl;
    if (!dataUrl && !fileUrl) {
      return new Response(JSON.stringify({ error: 'Envie dataUrl ou fileUrl' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!KEY) {
      return new Response(JSON.stringify({ error: 'LOVABLE_API_KEY ausente' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const imageUrl = dataUrl || fileUrl!;

    const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${KEY}` },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: [
            { type: 'text', text: 'Extraia os dados desta bomba.' },
            { type: 'image_url', image_url: { url: imageUrl } },
          ]},
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!resp.ok) {
      const t = await resp.text();
      return new Response(JSON.stringify({ error: 'ai_error', detail: t }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const j = await resp.json();
    const content = j?.choices?.[0]?.message?.content || '{}';
    let parsed: any = {};
    try { parsed = JSON.parse(content); } catch { parsed = {}; }

    return new Response(JSON.stringify({
      ok: true,
      valor: Number(parsed.valor) || 0,
      litros: Number(parsed.litros) || 0,
      valor_por_litro: Number(parsed.valor_por_litro) || 0,
      combustivel: String(parsed.combustivel || ''),
      confianca: Number(parsed.confianca) || 0,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: 'erro', detail: e.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
