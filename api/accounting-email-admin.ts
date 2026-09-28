import { requireAdmin, readBody, sendJson } from '../src/server/payrollServer.js';
import { accountingEmailProviderStatus } from '../src/server/accountingEmailProviders.js';

const TOPAC_CENTRAL_EMAIL = 'adm.matriz@topac.com.br';
const DEFAULT_FROM = 'TOPAC RH PRO <no-reply@topacrh.pro>';

const clean = (value: unknown) => String(value ?? '').trim();
const htmlEscape = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const extractEmail = (value: unknown) =>
  clean(value).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.toLowerCase() || '';

const senderLabel = (value: unknown) => {
  const raw = clean(value);
  const before = raw.replace(/<[^>]+>/g, '').replace(/^["']|["']$/g, '').trim();
  if (before && !before.includes('@')) return before.split(/\s+/)[0] || '';
  const email = extractEmail(raw);
  return email ? email.split('@')[0].replace(/[._-]+/g, ' ') : '';
};

const replySuggestions = (row: any) => {
  const metadata = row?.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata) ? row.metadata : {};
  const category = clean(metadata.categoria || 'OUTRO');
  const first = senderLabel(row?.remetente);
  const hello = first ? `Olá, ${first}.` : 'Olá.';
  const context = [
    metadata.empresa_nome ? `empresa ${metadata.empresa_nome}` : '',
    metadata.funcionario_nome ? `funcionário(a) ${metadata.funcionario_nome}` : '',
    metadata.competencia ? `competência ${metadata.competencia}` : '',
  ].filter(Boolean).join(' · ');
  const subject = clean(row?.assunto || 'seu e-mail');
  const ref = context ? `${subject} (${context})` : subject;

  const categoryAction: Record<string,string> = {
    FOLHA: 'Vamos conferir os valores e o fechamento e retornaremos caso haja algum ajuste.',
    RESCISAO: 'Vamos conferir datas, valores e documentos da rescisão antes de concluir.',
    ADMISSAO: 'Vamos conferir os dados e documentos da admissão antes de dar sequência.',
    FERIAS: 'Vamos conferir o período, valores e documentos de férias e retornaremos.',
    PONTO_HE: 'Vamos conferir o apontamento, horários e horas extras e retornaremos.',
    ATESTADO: 'Vamos conferir o documento e o período informado e retornaremos.',
    BENEFICIOS: 'Vamos conferir as informações de VR/VT e os valores informados e retornaremos.',
    CONTABILIDADE: 'Vamos conferir o material e retornaremos pelo mesmo fluxo.',
    GUIAS_ENCARGOS: 'Vamos conferir as guias e os dados encaminhados e retornaremos.',
    OUTRO: 'Vamos conferir o conteúdo e retornaremos pelo mesmo fluxo.',
  };

  return [
    {
      id: 'direta',
      label: 'Direta',
      text: `${hello}\n\nRecebemos o e-mail referente a “${ref}”. ${categoryAction[category] || categoryAction.OUTRO}\n\nObrigado.`,
    },
    {
      id: 'formal',
      label: 'Formal',
      text: `Prezados,\n\nConfirmamos o recebimento do e-mail referente a “${ref}”. O material seguirá para conferência interna. Caso seja necessária alguma correção ou informação complementar, retornaremos por este mesmo e-mail.\n\nAtenciosamente,\nTOPAC`,
    },
    {
      id: 'ajuste',
      label: 'Pedir complemento',
      text: `${hello}\n\nRecebemos o material referente a “${ref}”. Antes de concluirmos a conferência, precisamos confirmar se esta é a versão final e se todas as informações/documentos necessários foram enviados.\n\nPor favor, confirme ou encaminhe o que estiver faltando.\n\nObrigado.`,
    },
  ];
};

const listEmails = async (service: any) => {
  const { data: messages, error } = await service
    .from('contabilidade_email_mensagens')
    .select('id,provider,provider_message_id,mailbox,remetente,assunto,recebido_em,status,total_anexos,total_pdfs,metadata,erro,processado_em,created_at,updated_at')
    .order('recebido_em', { ascending: false })
    .limit(120);
  if (error) throw error;

  const ids = (messages || []).map((row: any) => row.id);
  let documents: any[] = [];
  if (ids.length) {
    const { data, error: docError } = await service
      .from('contabilidade_email_documentos')
      .select('id,mensagem_id,arquivo_original,mime_type,status,empresa_id,funcionario_id,competencia,tipo_identificado,confianca,metodo_vinculo,motivo_decisao,created_at')
      .in('mensagem_id', ids)
      .order('created_at', { ascending: true });
    if (docError) throw docError;
    documents = data || [];
  }

  const byMessage = new Map<string, any[]>();
  for (const doc of documents) {
    const current = byMessage.get(doc.mensagem_id) || [];
    current.push(doc);
    byMessage.set(doc.mensagem_id, current);
  }

  const rows = (messages || []).map((row: any) => ({
    ...row,
    documentos: byMessage.get(row.id) || [],
    reply_suggestions: replySuggestions(row),
    reply_to: extractEmail(row.remetente),
  }));
  const pending = rows.filter((row: any) => row?.metadata?.relevante === true && row?.metadata?.attention_status === 'PENDENTE').length;
  const relevant = rows.filter((row: any) => row?.metadata?.relevante === true).length;
  const replied = rows.filter((row: any) => row?.metadata?.reply_status === 'RESPONDIDO').length;
  return { rows, counts: { total: rows.length, relevant, pending, replied } };
};

const updateAttention = async (service: any, userId: string, messageId: string, attentionStatus: 'PENDENTE'|'LIDO'|'RESOLVIDO') => {
  const { data: current, error } = await service
    .from('contabilidade_email_mensagens')
    .select('id,metadata')
    .eq('id', messageId)
    .maybeSingle();
  if (error) throw error;
  if (!current) throw Object.assign(new Error('email_not_found'), { status: 404 });

  const now = new Date().toISOString();
  const oldMeta = current.metadata && typeof current.metadata === 'object' && !Array.isArray(current.metadata) ? current.metadata : {};
  const metadata = {
    ...oldMeta,
    attention_status: attentionStatus,
    ...(attentionStatus === 'LIDO' ? { lido_em: now, lido_por: userId } : {}),
    ...(attentionStatus === 'RESOLVIDO' ? { resolvido_em: now, resolvido_por: userId } : {}),
    ...(attentionStatus === 'PENDENTE' ? { reaberto_em: now, reaberto_por: userId } : {}),
  };

  const { data: updated, error: updateError } = await service
    .from('contabilidade_email_mensagens')
    .update({ metadata, updated_at: now })
    .eq('id', messageId)
    .select('id,metadata,updated_at')
    .single();
  if (updateError) throw updateError;

  await service.from('contabilidade_email_eventos').insert({
    mensagem_id: messageId,
    documento_id: null,
    evento: `EMAIL_${attentionStatus}`,
    ator_tipo: 'USUARIO',
    ator_user_id: userId,
    payload: { attention_status: attentionStatus },
  });

  return updated;
};

const sendReply = async (service: any, user: any, messageId: string, messageText: string) => {
  if (!messageId) throw Object.assign(new Error('message_id_required'), { status: 400 });
  const text = clean(messageText);
  if (!text) throw Object.assign(new Error('reply_text_required'), { status: 400 });
  if (text.length > 12000) throw Object.assign(new Error('reply_text_too_long'), { status: 400 });

  const { data: current, error } = await service
    .from('contabilidade_email_mensagens')
    .select('id,remetente,assunto,metadata')
    .eq('id', messageId)
    .maybeSingle();
  if (error) throw error;
  if (!current) throw Object.assign(new Error('email_not_found'), { status: 404 });

  const recipient = extractEmail(current.remetente);
  if (!recipient) throw Object.assign(new Error('sender_email_not_found'), { status: 409 });

  const apiKey = clean(process.env.RESEND_API_KEY);
  if (!apiKey) throw Object.assign(new Error('email_provider_not_configured'), { status: 503 });

  const metadata = current.metadata && typeof current.metadata === 'object' && !Array.isArray(current.metadata) ? current.metadata : {};
  const originalMessageId = clean(metadata.message_id);
  const subject = /^re:/i.test(clean(current.assunto)) ? clean(current.assunto) : `Re: ${clean(current.assunto || 'Mensagem')}`;
  const configuredFrom = clean(process.env.EMAIL_FROM || process.env.MAIL_FROM);
  const from = configuredFrom && !/@resend\.dev/i.test(configuredFrom) ? configuredFrom : DEFAULT_FROM;

  const headers: Record<string,string> = {};
  if (originalMessageId) {
    headers['In-Reply-To'] = originalMessageId;
    headers.References = originalMessageId;
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [recipient],
      reply_to: TOPAC_CENTRAL_EMAIL,
      subject,
      text,
      html: `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#111827;line-height:1.55;white-space:pre-wrap">${htmlEscape(text).replace(/\n/g, '<br>')}</body></html>`,
      ...(Object.keys(headers).length ? { headers } : {}),
    }),
  });

  const detail = await response.text();
  if (!response.ok) {
    console.error('[accounting-email-admin][reply]', response.status, detail.slice(0, 1000));
    throw Object.assign(new Error('reply_send_failed'), { status: 502 });
  }

  let provider: any = {};
  try { provider = JSON.parse(detail || '{}'); } catch { provider = {}; }

  const now = new Date().toISOString();
  const nextMetadata = {
    ...metadata,
    reply_status: 'RESPONDIDO',
    resposta_enviada_em: now,
    resposta_enviada_por: user.id,
    resposta_destinatario: recipient,
    resposta_provider_id: provider?.id || null,
    resposta_preview: text.slice(0, 500),
    attention_status: metadata.attention_status === 'PENDENTE' ? 'LIDO' : metadata.attention_status,
  };

  const { error: updateError } = await service
    .from('contabilidade_email_mensagens')
    .update({ metadata: nextMetadata, updated_at: now })
    .eq('id', messageId);
  if (updateError) throw updateError;

  await service.from('contabilidade_email_eventos').insert({
    mensagem_id: messageId,
    documento_id: null,
    evento: 'EMAIL_RESPONDIDO',
    ator_tipo: 'USUARIO',
    ator_user_id: user.id,
    payload: {
      to: recipient,
      subject,
      provider_id: provider?.id || null,
      response_preview: text.slice(0, 500),
    },
  });

  return { recipient, subject, provider_id: provider?.id || null, sent_at: now };
};

export default async function handler(req: any, res?: any) {
  if (String(req?.method || 'GET').toUpperCase() !== 'POST') return sendJson(res, { ok:false, error:'method_not_allowed' }, 405);

  try {
    const { service, user } = await requireAdmin(req);
    const body = readBody(req);
    const action = String(body?.action || 'list');

    if (action === 'list') {
      const data = await listEmails(service);
      return sendJson(res, {
        ok: true,
        provider: accountingEmailProviderStatus(),
        mode: 'INTELLIGENT_EMAIL_CENTER_V2',
        read_only: false,
        reply_enabled: true,
        ...data,
      });
    }

    if (['mark_read','resolve','reopen'].includes(action)) {
      const messageId = String(body?.message_id || '').trim();
      if (!messageId) return sendJson(res, { ok:false, error:'message_id_required' }, 400);
      const target = action === 'mark_read' ? 'LIDO' : action === 'resolve' ? 'RESOLVIDO' : 'PENDENTE';
      const updated = await updateAttention(service, user.id, messageId, target as any);
      return sendJson(res, { ok:true, message:updated });
    }

    if (action === 'reply') {
      const result = await sendReply(
        service,
        user,
        clean(body?.message_id),
        clean(body?.text),
      );
      return sendJson(res, { ok:true, reply:result });
    }

    if (action === 'view_document') {
      const documentId = String(body?.document_id || '').trim();
      if (!documentId) return sendJson(res, { ok:false, error:'document_id_required' }, 400);
      const { data: doc, error } = await service
        .from('contabilidade_email_documentos')
        .select('id,storage_bucket,storage_path,arquivo_original')
        .eq('id', documentId)
        .maybeSingle();
      if (error) throw error;
      if (!doc) return sendJson(res, { ok:false, error:'document_not_found' }, 404);
      const { data, error: signedError } = await service.storage.from(doc.storage_bucket).createSignedUrl(doc.storage_path, 600);
      if (signedError || !data?.signedUrl) throw signedError || new Error('signed_url_failed');
      return sendJson(res, { ok:true, url:data.signedUrl, filename:doc.arquivo_original });
    }

    return sendJson(res, { ok:false, error:'unknown_action' }, 400);
  } catch (error: any) {
    console.error('[accounting-email-admin]', error);
    return sendJson(res, { ok:false, error:String(error?.message || error) }, Number(error?.status || 500));
  }
}
