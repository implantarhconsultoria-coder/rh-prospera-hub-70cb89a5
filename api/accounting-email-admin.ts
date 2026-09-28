import { requireAdmin, readBody, sendJson } from '../src/server/payrollServer.js';
import { accountingEmailProviderStatus } from '../src/server/accountingEmailProviders.js';

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
  }));
  const pending = rows.filter((row: any) => row?.metadata?.relevante === true && row?.metadata?.attention_status === 'PENDENTE').length;
  const relevant = rows.filter((row: any) => row?.metadata?.relevante === true).length;
  return { rows, counts: { total: rows.length, relevant, pending } };
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
        mode: 'INTELLIGENT_EMAIL_CENTER_V1',
        read_only: true,
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
