// Edge function: ocr-atestado
// Aceita { fileUrl } (imagem) OU { dataUrl } (data URL base64 de PNG/JPEG/WebP/GIF).
// O Lovable AI Gateway (Gemini) só aceita imagens — PDFs devem ser rasterizados
// no cliente (pdf.js) e enviados como dataUrl.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SYSTEM_PROMPT = `Você é um analisador de atestados médicos brasileiros (CLT).
Receberá uma imagem (ou primeira página de PDF) de um atestado e deve devolver SOMENTE um JSON válido com os campos:
{
  "funcionario_nome": "string (nome completo do paciente/colaborador)",
  "cpf": "string (somente dígitos, vazio se não houver)",
  "data_inicio": "YYYY-MM-DD",
  "data_fim": "YYYY-MM-DD",
  "dias_cobertos": numero inteiro (>=1),
  "cid": "string (ex: Z76.3)",
  "medico": "string (nome completo do médico)",
  "crm": "string (CRM/UF)",
  "texto_bruto": "string (texto do atestado, máx 2000 chars)",
  "confianca": número entre 0 e 1
}
Regras:
- Se não conseguir ler um campo, devolva string vazia ou 0.
- Datas SEMPRE em ISO (YYYY-MM-DD). Se só houver "afastar por X dias" sem data fim, calcule data_fim = data_inicio + X-1 dias.
- Não inclua texto fora do JSON. Sem markdown, sem comentários, sem \`\`\`json.`;

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

    // Se veio só fileUrl, baixar e converter pra dataUrl (somente imagens).
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
            error: 'PDF deve ser rasterizado no cliente. Envie dataUrl da primeira página.',
            code: 'PDF_NEEDS_RASTERIZATION',
          }),
          { status: 415, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      if (!mime || !IMG_MIME.includes(mime)) {
        return new Response(
          JSON.stringify({ error: `Formato não suportado: ${mime || 'desconhecido'}. Use PNG/JPEG/WebP/GIF.` }),
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
              { type: 'text', text: 'Extraia os dados deste atestado. Devolva APENAS JSON.' },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
        temperature: 0.1,
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
