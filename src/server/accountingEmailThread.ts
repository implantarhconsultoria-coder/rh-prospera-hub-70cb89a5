export const buildAccountingThreadKey = (empresaId: string, competencia: string) =>
  `folha:${String(empresaId || '').trim()}:${String(competencia || '').trim()}`;

export const loadAccountingThread = async (service: any, threadKey: string) => {
  if (!threadKey) return null;
  const { data, error } = await service
    .from('contabilidade_email_threads')
    .select('*')
    .eq('thread_key', threadKey)
    .maybeSingle();
  if (error) throw error;
  return data || null;
};

export const prepareAccountingThread = async (
  service: any,
  input: { threadKey: string; subject: string },
) => {
  const current = await loadAccountingThread(service, input.threadKey);
  return {
    subject: current?.assunto || input.subject,
    headers: current?.last_message_id
      ? {
          'In-Reply-To': current.last_message_id,
          'References': [current.root_message_id, current.last_message_id].filter(Boolean).join(' '),
        }
      : {},
    current,
  };
};

export const fetchResendMessageId = async (apiKey: string, providerEmailId?: string | null) => {
  if (!apiKey || !providerEmailId) return '';
  try {
    const response = await fetch(`https://api.resend.com/emails/${encodeURIComponent(providerEmailId)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) return '';
    const data = await response.json().catch(() => ({}));
    return String((data as any)?.message_id || '').trim();
  } catch {
    return '';
  }
};

export const saveAccountingThread = async (
  service: any,
  input: {
    threadKey: string;
    empresaId?: string | null;
    competencia?: string | null;
    subject: string;
    providerEmailId?: string | null;
    messageId?: string | null;
    close?: boolean;
  },
) => {
  if (!input.threadKey) return;
  const current = await loadAccountingThread(service, input.threadKey);
  const now = new Date().toISOString();
  const messageId = String(input.messageId || '').trim();
  const payload = {
    thread_key: input.threadKey,
    empresa_id: input.empresaId || current?.empresa_id || null,
    competencia: input.competencia || current?.competencia || null,
    assunto: current?.assunto || input.subject,
    root_message_id: current?.root_message_id || messageId || null,
    last_message_id: messageId || current?.last_message_id || null,
    last_provider_email_id: input.providerEmailId || current?.last_provider_email_id || null,
    status: input.close ? 'encerrado' : 'aberto',
    encerrado_em: input.close ? now : current?.encerrado_em || null,
    updated_at: now,
  };
  const { error } = await service
    .from('contabilidade_email_threads')
    .upsert(payload, { onConflict: 'thread_key' });
  if (error) throw error;
};
