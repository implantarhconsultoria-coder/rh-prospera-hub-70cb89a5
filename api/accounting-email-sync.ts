import { getServiceClient, requireAdmin, sendJson, sha256 } from '../src/server/payrollServer.js';
import { accountingEmailProviderStatus, readAccountingMailbox } from '../src/server/accountingEmailProviders.js';

const INBOX_BUCKET = 'contabilidade-inbox';

const authorize = async (req: any) => {
  const cronSecret = String(process.env.CRON_SECRET || '').trim();
  const authorization = String(req?.headers?.authorization || '');
  if (cronSecret && authorization === `Bearer ${cronSecret}`) return { service: getServiceClient(), user: null as any, mode: 'CRON' };
  const admin = await requireAdmin(req);
  return { ...admin, mode: 'ADMIN' };
};

const safeFile = (value: string) => String(value || 'anexo.pdf')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^A-Za-z0-9._-]+/g, '_').replace(/_+/g, '_').slice(0, 140);

const isPdf = (name: string, contentType: string) => /\.pdf$/i.test(name) || /application\/pdf/i.test(contentType);

const logEvent = async (service: any, mensagemId: string, documentoId: string | null, evento: string, payload: Record<string, unknown> = {}) => {
  const { error } = await service.from('contabilidade_email_eventos').insert({
    mensagem_id: mensagemId, documento_id: documentoId, evento, ator_tipo: 'SISTEMA', payload,
  });
  if (error) console.warn('[accounting-email-sync][event]', error.message);
};

export default async function handler(req: any, res?: any) {
  if (!['GET', 'POST'].includes(String(req?.method || 'GET').toUpperCase())) return sendJson(res, { ok: false, error: 'method_not_allowed' }, 405);
  try {
    const { service, user, mode } = await authorize(req);
    const providerStatus = accountingEmailProviderStatus();
    if (!providerStatus.configured) {
      return sendJson(res, { ok: false, error: 'accounting_email_not_configured', provider: providerStatus }, 409);
    }

    const messages = await readAccountingMailbox();
    const result = { scanned: messages.length, created_messages: 0, created_pdfs: 0, duplicate_pdfs: 0, ignored_attachments: 0, errors: [] as string[] };

    for (const email of messages) {
      try {
        const { data: existingMessage, error: existingError } = await service.from('contabilidade_email_mensagens')
          .select('id,status').eq('provider', email.provider).eq('provider_message_id', email.providerMessageId).maybeSingle();
        if (existingError) throw existingError;
        if (existingMessage) continue;

        const pdfParts = email.attachments.filter((attachment) => isPdf(attachment.name, attachment.contentType));
        const { data: messageRow, error: messageError } = await service.from('contabilidade_email_mensagens').insert({
          provider: email.provider,
          provider_message_id: email.providerMessageId,
          mailbox: email.mailbox,
          remetente: email.sender,
          assunto: email.subject,
          recebido_em: email.receivedAt,
          status: pdfParts.length ? 'RECEBIDO' : 'IGNORADO',
          total_anexos: email.attachments.length,
          total_pdfs: pdfParts.length,
          metadata: {
            ...(email.metadata || {}),
            integration_mode: mode,
            attachments: email.attachments.map((attachment) => ({ name: attachment.name, content_type: attachment.contentType, size: attachment.size, pdf: isPdf(attachment.name, attachment.contentType) })),
          },
          processado_em: pdfParts.length ? null : new Date().toISOString(),
        }).select('*').single();
        if (messageError) throw messageError;
        result.created_messages += 1;
        result.ignored_attachments += email.attachments.length - pdfParts.length;
        await logEvent(service, messageRow.id, null, 'EMAIL_RECEBIDO', { remetente: email.sender, assunto: email.subject, anexos: email.attachments.length, pdfs: pdfParts.length });

        if (!pdfParts.length) {
          await logEvent(service, messageRow.id, null, 'EMAIL_IGNORADO_SEM_PDF', { reason: 'Nenhum anexo PDF encontrado.' });
          continue;
        }

        for (const attachment of pdfParts) {
          if (!attachment.bytes?.byteLength) {
            result.errors.push(`${email.subject || email.providerMessageId} / ${attachment.name}: anexo PDF sem conteúdo.`);
            await logEvent(service, messageRow.id, null, 'ANEXO_PDF_ERRO', { arquivo: attachment.name, reason: 'pdf_without_bytes' });
            continue;
          }
          const sourceHash = sha256(attachment.bytes);
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
          let duplicateOf: string | null = null;
          let status = 'RECEBIDO';
          let reason: string | null = null;

          if (prior) {
            storageBucket = prior.storage_bucket;
            storagePath = prior.storage_path;
            duplicateOf = prior.id;
            status = 'DUPLICADO';
            reason = 'Anexo idêntico já recebido anteriormente (hash SHA-256).';
            result.duplicate_pdfs += 1;
          } else {
            const date = email.receivedAt.slice(0, 10);
            storagePath = `${email.provider.toLowerCase()}/${date}/${email.providerMessageId.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 90)}/${crypto.randomUUID()}-${safeFile(attachment.name)}`;
            const { error: uploadError } = await service.storage.from(INBOX_BUCKET).upload(storagePath, attachment.bytes, { contentType: 'application/pdf', upsert: false });
            if (uploadError) throw uploadError;
          }

          const { data: doc, error: docError } = await service.from('contabilidade_email_documentos').insert({
            mensagem_id: messageRow.id,
            arquivo_original: attachment.name,
            mime_type: 'application/pdf',
            storage_bucket: storageBucket,
            storage_path: storagePath,
            source_sha256: sourceHash,
            tamanho_bytes: attachment.bytes.byteLength,
            status,
            duplicado_de: duplicateOf,
            motivo_decisao: reason,
            decisao: 'AUTOMATICA',
          }).select('*').single();
          if (docError) throw docError;
          result.created_pdfs += 1;
          await logEvent(service, messageRow.id, doc.id, status === 'DUPLICADO' ? 'ANEXO_DUPLICADO' : 'ANEXO_PDF_REGISTRADO', { arquivo: attachment.name, sha256: sourceHash, duplicate_of: duplicateOf });
        }

        const { data: originals } = await service.from('contabilidade_email_documentos').select('status').eq('mensagem_id', messageRow.id).is('parent_documento_id', null);
        const statuses = (originals || []).map((row: any) => row.status);
        if (statuses.length && statuses.every((status: string) => status === 'DUPLICADO')) {
          await service.from('contabilidade_email_mensagens').update({ status: 'PROCESSADO', processado_em: new Date().toISOString() }).eq('id', messageRow.id);
        }
      } catch (error: any) {
        result.errors.push(`${email.subject || email.providerMessageId}: ${String(error?.message || error)}`);
      }
    }

    return sendJson(res, { ok: true, provider: providerStatus, result });
  } catch (error: any) {
    console.error('[accounting-email-sync]', error);
    return sendJson(res, { ok: false, error: String(error?.message || error), details: error?.details || null }, Number(error?.status || 500));
  }
}
