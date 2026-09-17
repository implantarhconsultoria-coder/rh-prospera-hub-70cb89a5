import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ROWS = [
  { path: 'fixed/posters-row-1.webp', url: 'https://at.adobe.com/L7oq8V8GTiRqJgPc' },
  { path: 'fixed/posters-row-2.webp', url: 'https://at.adobe.com/5VbhlLl3cEb3h69O' },
  { path: 'fixed/posters-row-3.webp', url: 'https://at.adobe.com/3RdSruj70CSqiYuo' },
  { path: 'fixed/posters-row-4.webp', url: 'https://at.adobe.com/YyeucLrqoDca3laX' },
  { path: 'fixed/posters-row-5.webp', url: 'https://at.adobe.com/kttB1xC9d93pjJj4' },
  { path: 'fixed/posters-row-6.webp', url: 'https://at.adobe.com/NfqXjfHNXjC4qT6I' },
  { path: 'fixed/posters-row-7.webp', url: 'https://at.adobe.com/GskrHD9VgMVcZ4YU' },
];

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  const { data: existing, error: listError } = await supabase.storage
    .from('etiquetas-artes')
    .list('fixed', { limit: 100 });

  if (listError) {
    return new Response(JSON.stringify({ ok: false, error: listError.message }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }

  const existingNames = new Set((existing || []).map((file) => file.name));
  const result: Array<{ path: string; status: string; url?: string; error?: string }> = [];

  for (const row of ROWS) {
    const name = row.path.split('/').pop()!;
    if (existingNames.has(name)) {
      const { data } = supabase.storage.from('etiquetas-artes').getPublicUrl(row.path);
      result.push({ path: row.path, status: 'exists', url: data.publicUrl });
      continue;
    }

    try {
      const source = await fetch(row.url, { redirect: 'follow' });
      if (!source.ok) {
        result.push({ path: row.path, status: 'source_error', error: `HTTP ${source.status}` });
        continue;
      }
      const bytes = await source.arrayBuffer();
      const contentType = source.headers.get('content-type') || 'image/webp';
      const { error } = await supabase.storage
        .from('etiquetas-artes')
        .upload(row.path, bytes, {
          contentType: contentType.includes('image/') ? contentType : 'image/webp',
          cacheControl: '31536000',
          upsert: true,
        });
      if (error) {
        result.push({ path: row.path, status: 'upload_error', error: error.message });
        continue;
      }
      const { data } = supabase.storage.from('etiquetas-artes').getPublicUrl(row.path);
      result.push({ path: row.path, status: 'uploaded', url: data.publicUrl });
    } catch (error) {
      result.push({ path: row.path, status: 'exception', error: error instanceof Error ? error.message : String(error) });
    }
  }

  const ok = result.every((item) => item.status === 'exists' || item.status === 'uploaded');
  return new Response(JSON.stringify({ ok, result }), {
    status: ok ? 200 : 502,
    headers: { 'content-type': 'application/json' },
  });
});
