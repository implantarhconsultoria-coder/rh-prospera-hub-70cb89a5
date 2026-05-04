// Edge function: ocr-cartao-ponto
// Lê um cartão de ponto (PDF rasterizado pelo cliente OU imagem) e devolve estrutura
// padronizada com nome do funcionário e batidas por dia.
// Usa Lovable AI Gateway (Gemini) — só aceita imagens. PDFs devem ser rasterizados
// no cliente (pdf.js) e enviados como dataUrl da página.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SYSTEM_PROMPT = `Você é um analisador de CARTÕES DE PONTO brasileiros (folha de espelho de ponto mensal).
Receberá UMA imagem de uma página do espelho e deve devolver SOMENTE um JSON válido com:
{
  "funcionario_nome": "string (nome completo, como aparece no cabeçalho)",
  "cpf": "string (somente dígitos, vazio se não houver)",
  "matricula": "string (vazio se não houver)",
  "competencia": "YYYY-MM (mês de referência do espelho; vazio se não identificar)",
  "dias": [
    {
      "data": "YYYY-MM-DD",
      "entrada": "HH:mm (vazio se nao houver)",
      "almoco_saida": "HH:mm",
      "almoco_volta": "HH:mm",
      "saida": "HH:mm",
      "observacao": "string (ex.: 'FALTA','ATESTADO','FERIADO','DSR','FOLGA','FÉRIAS', ou vazio)",
      "em_branco": true|false
    }
  ],
  "confianca": numero entre 0 e 1
}
Regras:
- "em_branco": true quando a linha do dia não tem nenhuma batida nem marcação especial.
- Se o dia for domingo/feriado/folga e estiver vazio, marque observacao = "DSR" ou "FOLGA" e em_branco=false.
- Datas SEMPRE em ISO. Se o cartão só mostrar dia (ex: "05"), use a competência identificada e monte a data.
- NÃO INVENTE batidas. Se não tem horário, deixe vazio.
- Devolva SOMENTE JSON puro. Sem markdown, sem comentários, sem \`\`\`json.`;

const IMG_MIME = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];

const guessMimeFromUrl = (url: string): string | null => {
  const lower = url.toLowerCase().split('?')[0];
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  return null;
};

const toBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const fileUrl: string | undefined = body.fileUrl;
    let dataUrl: string | undefined = body.dataUrl;

    if (!dataUrl && !fileUrl) {
      return new Response(
        JSON.stringify({ error: 'Envie dataUrl (preferencial) ou fileUrl' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'LOVABLE_API_KEY ausente' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (!dataUrl && fileUrl) {
      // SSRF guard: only allow HTTPS URLs hosted on the Supabase storage host.
      try {
        const allowedHost = new URL(Deno.env.get('SUPABASE_URL') || '').host;
        const target = new URL(fileUrl);
        if (target.protocol !== 'https:' || target.host !== allowedHost || !target.pathname.startsWith('/storage/v1/')) {
          return new Response(
            JSON.stringify({ error: 'fileUrl_not_allowed' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          );
        }
      } catch {
        return new Response(
          JSON.stringify({ error: 'fileUrl_invalido' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      const mime = guessMimeFromUrl(fileUrl);
      if (mime === 'application/pdf') {
        return new Response(
          JSON.stringify({
            error: 'PDF deve ser rasterizado no cliente. Envie dataUrl da página.',
            code: 'PDF_NEEDS_RASTERIZATION',
          }),
          { status: 415, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      if (!mime || !IMG_MIME.includes(mime)) {
        return new Response(
          JSON.stringify({ error: `Formato não suportado: ${mime || 'desconhecido'}.` }),
          { status: 415, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      const r = await fetch(fileUrl);
      if (!r.ok) {
        return new Response(
          JSON.stringify({ error: `Falha ao baixar arquivo: ${r.status}` }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      const bytes = new Uint8Array(await r.arrayBuffer());
      dataUrl = `data:${mime};base64,${toBase64(bytes)}`;
    }

    const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Extraia o cartão de ponto desta página. Devolva APENAS JSON.' },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
        temperature: 0.05,
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      return new Response(
        JSON.stringify({ error: 'AI gateway falhou', detail: errText }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const aiJson = await aiRes.json();
    const raw: string = aiJson?.choices?.[0]?.message?.content ?? '';
    const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return new Response(
        JSON.stringify({ error: 'JSON inválido vindo da IA', raw: cleaned }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({ ok: true, data: parsed }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: String(e) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
