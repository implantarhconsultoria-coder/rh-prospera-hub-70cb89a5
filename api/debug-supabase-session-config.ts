const safeHost = (value: unknown) => {
  try {
    return value ? new URL(String(value)).hostname : '';
  } catch {
    return 'invalid-url';
  }
};

const keyKind = (value: unknown) => {
  const raw = String(value || '');
  if (!raw) return 'missing';
  if (raw.startsWith('sb_publishable_')) return 'publishable';
  if (raw.startsWith('sb_secret_')) return 'secret';
  if (raw.startsWith('eyJ')) return 'legacy-jwt-key';
  return 'other';
};

export default function handler(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false });

  const viteUrl = process.env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_UR || '';
  const genericUrl = process.env.SUPABASE_URL || '';
  const viteKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  const genericKey = process.env.SUPABASE_PUBLISHABLE_KEY || '';

  return res.status(200).json({
    ok: true,
    viteHost: safeHost(viteUrl),
    genericHost: safeHost(genericUrl),
    urlSame: Boolean(viteUrl && genericUrl && viteUrl === genericUrl),
    viteKeyKind: keyKind(viteKey),
    genericKeyKind: keyKind(genericKey),
    keySame: Boolean(viteKey && genericKey && viteKey === genericKey),
    fallbackHost: 'djfjnxmbvjgweqzjvqtr.supabase.co',
  });
}
