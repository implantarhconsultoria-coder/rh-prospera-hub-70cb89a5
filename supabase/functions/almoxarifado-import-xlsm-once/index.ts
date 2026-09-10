import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: 'Sessão ausente' }), { status: 401, headers: { ...corsHeaders, 'content-type': 'application/json' } });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) {
      return new Response(JSON.stringify({ error: 'Sessão inválida' }), { status: 401, headers: { ...corsHeaders, 'content-type': 'application/json' } });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: roleRow, error: roleError } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', authData.user.id)
      .eq('role', 'admin')
      .maybeSingle();
    if (roleError || !roleRow) {
      return new Response(JSON.stringify({ error: 'Somente administrador pode importar a planilha oficial' }), { status: 403, headers: { ...corsHeaders, 'content-type': 'application/json' } });
    }

    const body = await req.json();
    const { lote, seq, tipo, company_code, payload } = body ?? {};
    if (!lote || !Number.isInteger(seq) || !tipo || !company_code || payload == null) {
      return new Response(JSON.stringify({ error: 'Payload inválido' }), { status: 400, headers: { ...corsHeaders, 'content-type': 'application/json' } });
    }
    if (!['topac-matriz','topac-pg','topac-gyn'].includes(company_code)) {
      return new Response(JSON.stringify({ error: 'Unidade TOPAC inválida' }), { status: 400, headers: { ...corsHeaders, 'content-type': 'application/json' } });
    }

    const { data, error } = await admin.rpc('almoxarifado_import_excel_batch_v2', {
      p_lote: lote,
      p_seq: seq,
      p_tipo: tipo,
      p_company_code: company_code,
      p_payload: payload,
    });

    if (error) {
      return new Response(JSON.stringify({ error: error.message, details: error.details, hint: error.hint }), { status: 500, headers: { ...corsHeaders, 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify(data), { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), { status: 500, headers: { ...corsHeaders, 'content-type': 'application/json' } });
  }
});
