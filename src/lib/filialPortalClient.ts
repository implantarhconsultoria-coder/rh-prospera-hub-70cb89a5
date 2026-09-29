import { supabase } from '@/integrations/supabase/client';
import { readExternalSession } from '@/lib/acessoExternoAuth';

export const filialPortalContext = (companyId?: string | null) => {
  const match = typeof window !== 'undefined'
    ? window.location.pathname.match(/^\/filial-ext\/([^/]+)/)
    : null;
  const external = !!match;
  const acessoId = match?.[1] || '';
  const sess = external ? readExternalSession() : null;
  return {
    external,
    acessoId,
    cpfClean: sess?.cpf_clean || '',
    companyId: companyId || '',
  };
};

export const postFilialPortal = async <T = any>(
  action: string,
  payload: Record<string, any> = {},
  companyId?: string | null,
): Promise<T> => {
  const ctx = filialPortalContext(companyId);
  const { data: auth } = await supabase.auth.getSession();
  const token = auth.session?.access_token || '';
  const response = await fetch('/api/filial-portal', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      action,
      ...payload,
      accessId: ctx.acessoId || undefined,
      cpfClean: ctx.cpfClean || undefined,
      companyId: ctx.companyId || undefined,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false) throw new Error(data?.error || 'Falha no portal da filial.');
  return data as T;
};

export const uploadFilialSigned = async (input: {
  bucket: string;
  path: string;
  token: string;
  file: File;
}) => {
  const { error } = await supabase.storage
    .from(input.bucket)
    .uploadToSignedUrl(input.path, input.token, input.file, {
      contentType: input.file.type || 'application/octet-stream',
      upsert: false,
    });
  if (error) throw error;
};
