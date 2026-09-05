import { getServiceClient, sendJson, sha256 } from '../src/server/payrollServer.js';

const TARGET_MAILBOX = 'contabilidade@topacrh.pro';
const INBOX_BUCKET = 'contabilidade-inbox';

const safeFile = (value: string) => String(value || 'anexo.pdf')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^A-Za-z0-9._-]+/g, '_').replace(/_+/g, '_').slice(0, 140);

const isPdf = (name: string, contentType: string) => /\.pdf$/i.test(name) || /application\/pdf/i.test(contentType);

const parseBody = (req: any) => {
  if (!req?.body) return {} as any;
  if (typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body); } catch { return {}; }
};

const resendGet = async (path: string) => {
  const key = String(process.env.RESEND_API_KEY || '').trim();
  if (!key) throw new Error('missing_resend_api_key');
  const response = await fetch(`https://api.resend.com${path}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`resend_${response.status}:${text.slice(0,300)}`);
  try { return JSON.parse(text); } catch { throw new Error('invalid_resend_response'); }
};

const logEvent = async (service: any, mensagemId: string, documentoId: string | null, evento: string, payload: Record<string, unknown> = {}) => {
  const { error } = await service.from('contabilidade_email_eventos').insert({
    mensagem_id: mensagemId,
    documento_id: documentoId,
    evento,
    ator_tipo: 'SISTEMA',
    payload,
  });
  if (error) console.warn('[accounting-email-resend][event]', error.message);
};

export default async function handler(req: any, res?: any) {
  if (String(req?.method || 'GET').toUpperCase() !== 'POST') {
    return sendJson(res, { ok: false, error: 'method_not_allowed' }, 405);
  }

  try {
    const event = parseBody(req);
    if (event?.type !== 'email.received') {
      return sendJson(res, { ok: true, ignored: true, reason: 'event_not_supported' });
    }

    const emailId = String(event?.data?.email_id || '').trim();
    if (!emailId) return sendJson(res, { ok: false, error: 'email_id_required' }, 400);

    const email = await resendGet(`/emails/receiving/${encodeURIComponent(emailId)}`);
    const recipients = Array.isArray(email?.to) ? email.to.map((item: any) => String(item).trim().toLowerCase()) : [];
    if (!recipients.includes(TARGET_MAILBOX)) {
      return sendJson(res, { ok: true, ignored: true, reason: 'different_mailbox' });
    }

    const service = getServiceClient();
    const { data: existing, error: existingError } = await service
      .from('contabilidade_email_mensagens')
      .select('id,status')
      .eq('provider', 'RESEND')
      .eq('provider_message_id', emailId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) return sendJson(res, { ok: true, duplicate_event: true, message_id: existing.id });

    const attachmentList = await resendGet(`/emails/receiving/${encodeURIComponent(emailId)}/attachments`);
    const attachments = Array.isArray(attachmentList?.data) ? attachmentList.data : [];
    const pdfs = attachments.filter((a: any) => isPdf(String(a?.filename || ''), String(a?.content_type || '')));

    const receivedAt = String(email?.created_at || event?.created_at || new Date().toISOString());
    const { data: messageRow, error: messageError } = await service.from('contabilidade_email_mensagens').insert({
      provider: 'RESEND',
      provider_message_id: emailId,
      mailbox: TARGET_MAILBOX,
      remetente: String(email?.from || event?.data?.from || ''),
      assunto: String(email?.subject || event?.data?.subject || ''),
      recebido_em: receivedAt,
      status: pdfs.length ? 'ANALISANDO' : 'IGNORADO',
      total_anexos: attachments.length,
      total_pdfs: pdfs.length,
      metadata: {
        integration_mode: 'RESEND_INBOUND_WEBHOOK',
        message_id: email?.message_id || event?.data?.message_id || null,
        to: recipients,
        attachments: attachments.map((a: any) => ({
          id: a?.id || null,
          name: a?.filename || '',
          content_type: a?.content_type || '',
          size: a?.size || 0,
          pdf: isPdf(String(a?.filename || ''), String(a?.content_type || '')),
        })),
      },
      processado_em: pdfs.length ? null : new Date().toISOString(),
    }).select('*').single();
    if (messageError) throw messageError;

    await logEvent(service, messageRow.id, null, 'EMAIL_RECEBIDO_RESEND', {
      remetente: email?.from || null,
      assunto: email?.subject || null,
      anexos: attachments.length,
      pdfs: pdfs.length,
    });

    let hadError = false;
    let created = 0;
    let duplicates = 0;

    for (const attachment of pdfs) {
      try {
        let downloadUrl = String(attachment?.download_url || '');
        if (!downloadUrl && attachment?.id) {
          const detail = await resendGet(`/emails/receiving/${encodeURIComponent(emailId)}/attachments/${encodeURIComponent(String(attachment.id))}`);
          downloadUrl = String(detail?.download_url || '');
        }
        if (!downloadUrl) throw new Error('attachment_download_url_missing');

        const fileResponse = await fetch(downloadUrl);
        if (!fileResponse.ok) throw new Error(`attachment_download_${fileResponse.status}`);
        const bytes = new Uint8Array(await fileResponse.arrayBuffer());
        if (!bytes.byteLength) throw new Error('attachment_empty');

        const sourceHash = sha256(bytes);
        const { data: prior, error: priorError } = await service.from('contabilidade_email_documentos')
          .select('id,storage_bucket,storage_path')
          .is('parent_documento_id', null)
          .eq('source_sha256', sourceHash)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();
        if (priorError) throw priorError;

        let storageBucket = INBOX_BUCKET;
        let storagePath = '';
        let status = 'RECEBIDO';
        let duplicateOf: string | null = null;
        let reason = 'PDF recebido via contabilidade@topacrh.pro e aguardando classificação automática.';

        if (prior) {
          storageBucket = prior.storage_bucket;
          storagePath = prior.storage_path;
          duplicateOf = prior.id;
          status = 'DUPLICADO';
          reason = 'Anexo idêntico já recebido anteriormente (hash SHA-256).';
          duplicates += 1;
        } else {
          const date = receivedAt.slice(0, 10) || new Date().toISOString().slice(0, 10);
          storagePath = `resend/${date}/${emailId}/${crypto.randomUUID()}-${safeFile(String(attachment?.filename || 'anexo.pdf'))}`;
          const { error: uploadError } = await service.storage.from(INBOX_BUCKET).upload(storagePath, bytes, {
            contentType: 'application/pdf',
            upsert: false,
          });
          if (uploadError) throw uploadError;
        }

        const { data: doc, error: docError } = await service.from('contabilidade_email_documentos').insert({
          mensagem_id: messageRow.id,
          arquivo_original: String(attachment?.filename || 'anexo.pdf'),
          mime_type: 'application/pdf',
          storage_bucket: storageBucket,
          storage_path: storagePath,
          source_sha256: sourceHash,
          tamanho_bytes: bytes.byteLength,
          status,
          duplicado_de: duplicateOf,
          motivo_decisao: reason,
          decisao: 'AUTOMATICA',
        }).select('*').single();
        if (docError) throw docError;
        created += 1;
        await logEvent(service, messageRow.id, doc.id, status === 'DUPLICADO' ? 'ANEXO_DUPLICADO' : 'PDF_RECEBIDO_RESEND', {
          arquivo: attachment?.filename || null,
          sha256: sourceHash,
          duplicate_of: duplicateOf,
        });
      } catch (error: any) {
        hadError = true;
        await logEvent(service, messageRow.id, null, 'ANEXO_PDF_ERRO', {
          arquivo: attachment?.filename || null,
          error: String(error?.message || error),
        });
      }
    }

    await service.from('contabilidade_email_mensagens').update({
      status: hadError ? 'ERRO_PROCESSAMENTO' : (pdfs.length ? 'PROCESSADO' : 'IGNORADO'),
      processado_em: new Date().toISOString(),
      erro: hadError ? 'Um ou mais PDFs não puderam ser recebidos.' : null,
      updated_at: new Date().toISOString(),
    }).eq('id', messageRow.id);

    return sendJson(res, {
      ok: true,
      mailbox: TARGET_MAILBOX,
      email_id: emailId,
      pdfs_received: created,
      duplicate_pdfs: duplicates,
      had_error: hadError,
    });
  } catch (error: any) {
    console.error('[accounting-email-resend]', error);
    return sendJson(res, { ok: false, error: String(error?.message || error) }, Number(error?.status || 500));
  }
}
