import { supabase } from '@/integrations/supabase/client';

export type LoggedUserSignature = {
  userId?: string;
  name: string;
  email?: string;
  cargo?: string;
  empresa?: string;
  filial?: string;
  text: string;
};

const clean = (value: unknown) => String(value || '').trim();

const titleCaseIfUppercase = (value: string) => {
  const text = clean(value).replace(/\s+/g, ' ');
  if (!text || text !== text.toUpperCase()) return text;
  return text.toLowerCase().replace(/\b([\p{L}\p{M}])/gu, (match) => match.toUpperCase());
};

const displayFromEmail = (email?: string) => {
  const local = clean(email).split('@')[0] || 'TOPAC RH PRO';
  return titleCaseIfUppercase(local.replace(/[._-]+/g, ' '));
};

const normalizeSignatureText = (signature: string) => {
  const lines = clean(signature)
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return '';
  const first = lines[0] || '';
  if (/^atenciosamente[,.]?$/i.test(first)) return lines.join('\n');
  return ['Atenciosamente,', ...lines].join('\n');
};

const buildSignatureText = (input: {
  assinaturaPadrao?: string;
  name: string;
  cargo?: string;
  empresa?: string;
  filial?: string;
}) => {
  const assinaturaPadrao = normalizeSignatureText(input.assinaturaPadrao || '');
  if (assinaturaPadrao) return assinaturaPadrao;

  const empresaFilial = Array.from(new Set([input.empresa, input.filial].map(clean).filter(Boolean))).join(' / ');
  return ['Atenciosamente,', input.name, input.cargo, empresaFilial]
    .map(clean)
    .filter(Boolean)
    .join('\n');
};

export const replaceEmailSignature = (body: string, signatureText: string) => {
  const normalizedBody = clean(body).replace(/\r\n/g, '\n');
  const signature = normalizeSignatureText(signatureText);
  if (!signature) return normalizedBody;

  const lines = normalizedBody.split('\n');
  let signatureIndex = -1;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (/^\s*Atenciosamente[,.]?\s*$/i.test(lines[index] || '')) {
      signatureIndex = index;
      break;
    }
  }

  if (signatureIndex >= 0) {
    const before = lines.slice(0, signatureIndex).join('\n').trimEnd();
    return before ? `${before}\n\n${signature}` : signature;
  }

  return normalizedBody ? `${normalizedBody}\n\n${signature}` : signature;
};

const selectCurrentProfile = async (userId: string) => {
  const profileSelect =
    'nome_completo,cargo,empresa,filial,email,email_corporativo,assinatura_padrao';
  const safeProfileSelect = 'nome_completo,cargo,email';

  const { data, error } = await (supabase as any)
    .from('profiles')
    .select(profileSelect)
    .eq('user_id', userId)
    .maybeSingle();

  if (!error) return data || null;

  const errorText = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  const canFallback = errorText.includes('column') || errorText.includes('schema cache') || errorText.includes('does not exist');
  if (!canFallback) throw error;

  const fallback = await (supabase as any)
    .from('profiles')
    .select(safeProfileSelect)
    .eq('user_id', userId)
    .maybeSingle();
  if (fallback.error) throw fallback.error;
  return fallback.data || null;
};

export const getLoggedUserSignature = async (): Promise<LoggedUserSignature> => {
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user) {
    const text = buildSignatureText({ name: 'TOPAC RH PRO' });
    return { name: 'TOPAC RH PRO', text };
  }

  let profile: any = null;
  try {
    profile = await selectCurrentProfile(user.id);
  } catch (error) {
    console.warn('Nao foi possivel carregar assinatura do perfil logado:', error);
  }

  const metadata: any = user.user_metadata || {};
  const email = clean(profile?.email_corporativo) || clean(profile?.email) || clean(user.email);
  const name = titleCaseIfUppercase(
    clean(profile?.nome_completo) ||
    clean(metadata.nome_completo) ||
    clean(metadata.full_name) ||
    clean(metadata.name) ||
    displayFromEmail(email),
  );
  const cargo = titleCaseIfUppercase(clean(profile?.cargo));
  const empresa = titleCaseIfUppercase(clean(profile?.empresa));
  const filial = titleCaseIfUppercase(clean(profile?.filial));
  const text = buildSignatureText({
    assinaturaPadrao: profile?.assinatura_padrao,
    name,
    cargo,
    empresa,
    filial,
  });

  return {
    userId: user.id,
    name,
    email,
    cargo,
    empresa,
    filial,
    text,
  };
};

export const applyLoggedUserSignatureToBody = async (body: string) => {
  const signature = await getLoggedUserSignature();
  return replaceEmailSignature(body, signature.text);
};
