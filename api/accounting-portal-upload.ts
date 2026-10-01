import { Buffer } from 'node:buffer';
import { getServiceClient, readBody, sendJson } from '../src/server/payrollServer.js';
import { buildAccountingProcessThreadKey, buildAccountingThreadKey, fetchResendMessageId, prepareAccountingThread, saveAccountingThread } from '../src/server/accountingEmailThread.js';

const BUCKET = 'contabilidade-inbox';
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MAX_EMAIL_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const VANESSA_EMAIL = 'dp@aatconsultoria.com.br';
const MARISA_EMAIL = 'marisa@aatconsultoria.com.br';
const TOPAC_CENTRAL_EMAIL = 'adm.matriz@topac.com.br';
const TOPAC_ROBSON_EMAIL = 'robson@topac.com.br';
const TOPAC_GOIANIA_EMAIL = 'adm.gyn@topac.com.br';
const ANTONIO_CARLOS_PRAIA_EMAIL = 'antonio.carlos@topac.com.br';

const TYPE_LABELS: Record<string, string> = {
  recibos_holerites: 'Recibos / Holerites',
  folha_processada: 'Folha processada',
  contrato: 'Contrato de trabalho',
  admissao: 'Documentos de admissão',
  rescisao: 'Documentos de rescisão',
  demissao: 'Documentos de rescisão',
  ferias: 'Documentos de férias',
  atestado: 'Documento de atestado / afastamento',
  alteracao_salario: 'Documento de alteração salarial',
  alteracao_funcao: 'Documento de alteração de função',
  fechamento: 'Documento de fechamento',
  adiantamento: 'Documento de adiantamento',
  retorno_folha: 'Retorno da contabilidade',
  outro: 'Outro documento',
};

const safeFile = (value: unknown) =>
  String(value || 'documento.pdf')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 140) || 'documento.pdf';

const cleanEmails = (value: unknown): string[] => {
  const raw = Array.isArray(value) ? value.join(' ') : String(value || '');
  const emails = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  return Array.from(new Set(emails.map((email) => email.toLowerCase())));
};

const uniqueEmails = (values: string[]) => Array.from(new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean)));
const htmlEscape = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const validateSession = async (service: any, portal: string, token: string, companyId?: string) => {
  if (!['principal', 'goiania'].includes(portal) || !token) {
    throw Object.assign(new Error('sessao_invalida'), { status: 401 });
  }

  const { data: userId, error: sessionError } = await service.rpc('contabilidade_portal_usuario_sessao', {
    p_token: token,
    p_portal: portal,
  });
  if (sessionError || !userId) throw Object.assign(new Error('sessao_invalida'), { status: 401 });

  const { data: user, error: userError } = await service
    .from('contabilidade_portal_usuarios')
    .select('id,nome,email,portal,ativo')
    .eq('id', userId)
    .eq('ativo', true)
    .maybeSingle();
  if (userError || !user) throw Object.assign(new Error('sessao_invalida'), { status: 401 });

  if (companyId) {
    const { data: allowed, error: allowedError } = await service
      .from('contabilidade_portal_acesso_empresas')
      .select('empresa_id')
      .eq('portal_user_id', userId)
      .eq('empresa_id', companyId)
      .maybeSingle();
    if (allowedError || !allowed) throw Object.assign(new Error('empresa_nao_autorizada'), { status: 403 });
  }

  return user;
};

const counterpartFor = (email: string) => {
  const normalized = String(email || '').trim().toLowerCase();
  if (normalized === VANESSA_EMAIL) return MARISA_EMAIL;
  if (normalized === MARISA_EMAIL) return VANESSA_EMAIL;
  return '';
};

const getEmailRouting = async (service: any, portal: string, userEmail: string) => {
  const senderEmail = cleanEmails(userEmail)[0] || '';
  if (portal === 'principal') {
    const counterpart = counterpartFor(senderEmail);
    const to = [TOPAC_CENTRAL_EMAIL];
    const cc = uniqueEmails([TOPAC_ROBSON_EMAIL, ...(counterpart ? [counterpart] : [])])
      .filter((email) => email !== senderEmail && !to.includes(email));
    return { to, cc };
  }

  const { data: config } = await service
    .from('contabilidade_portal_config')
    .select('formalizacao_destinos,ativo')
    .eq('portal', portal)
    .maybeSingle();
  const configured = config?.ativo ? cleanEmails(config?.formalizacao_destinos) : [];
  const primary = configured[0] || TOPAC_GOIANIA_EMAIL;
  const to = [primary];
  const cc = uniqueEmails(configured.slice(1)).filter((email) => email !== senderEmail && email !== primary);
  return { to, cc };
};

const defaultSubject = (companyName: string, typeLabel: string, competence?: string | null) =>
  ['Retorno da Contabilidade', typeLabel, companyName, competence || ''].filter(Boolean).join(' - ');

const defaultBody = (input: {
  companyName: string;
  typeLabel: string;
  competence?: string | null;
  employeeName?: string | null;
  fileName: string;
  observation?: string | null;
  userName: string;
}) => [
  'Prezados,',
  '',
  `Segue em anexo o retorno da Contabilidade referente a ${input.typeLabel}.`,
  '',
  `Empresa: ${input.companyName}`,
  input.employeeName ? `Funcionário: ${input.employeeName}` : '',
  input.competence ? `Competência / referência: ${input.competence}` : '',
  `Documento: ${input.fileName}`,
  input.observation ? `Observação: ${input.observation}` : '',
  '',
  'O PDF segue anexado para conferência e arquivamento no TOPAC RH PRO.',
  '',
  'Atenciosamente,',
  input.userName || 'Contabilidade',
  'Contabilidade',
].filter((line, index, list) => line !== '' || (index > 0 && list[index - 1] !== '')).join('\n');

const sendStoredPdfEmail = async (service: any, input: {
  to: string[];
  cc: string[];
  subject: string;
  body: string;
  replyTo?: string;
  bucket?: string;
  path?: string;
  fileName?: string;
  attachments?: Array<{ bucket: string; path: string; fileName: string }>;
  empresaId?: string;
  competencia?: string | null;
  threadKey?: string;
  closeThread?: boolean;
}) => {
  const resendKey = String(process.env.RESEND_API_KEY || '').trim();
  if (!resendKey) throw Object.assign(new Error('Envio de e-mail não configurado no servidor.'), { status: 503 });
  if (!input.to.length) throw Object.assign(new Error('Informe ao menos um destinatário.'), { status: 400 });
  if (!input.subject.trim() || !input.body.trim()) throw Object.assign(new Error('Assunto e mensagem são obrigatórios.'), { status: 400 });

  const attachmentInputs = input.attachments?.length
    ? input.attachments
    : (input.bucket && input.path && input.fileName ? [{ bucket: input.bucket, path: input.path, fileName: input.fileName }] : []);
  if (!attachmentInputs.length) throw Object.assign(new Error('Nenhum PDF foi informado para envio.'), { status: 400 });

  const emailAttachments: Array<{ filename: string; content: string }> = [];
  let totalAttachmentBytes = 0;
  for (const attachment of attachmentInputs) {
    const { data: pdf, error: downloadError } = await service.storage.from(attachment.bucket).download(attachment.path);
    if (downloadError || !pdf) throw downloadError || new Error('pdf_nao_encontrado');
    const bytes = Buffer.from(await pdf.arrayBuffer());
    if (!bytes.length) throw new Error('pdf_anexo_vazio');
    totalAttachmentBytes += bytes.length;
    emailAttachments.push({ filename: attachment.fileName, content: bytes.toString('base64') });
  }
  if (totalAttachmentBytes > MAX_EMAIL_ATTACHMENT_BYTES) {
    throw Object.assign(new Error('Os PDFs estão salvos na plataforma, mas o conjunto de anexos excede 20 MB para um único e-mail. Divida o envio em dois lotes.'), { status: 413 });
  }

  const configuredFrom = String(process.env.EMAIL_FROM || process.env.MAIL_FROM || '').trim();
  const from = configuredFrom && !/@resend\.dev/i.test(configuredFrom)
    ? configuredFrom
    : 'TOPAC RH PRO <no-reply@topacrh.pro>';
  const replyTo = cleanEmails(input.replyTo)[0] || String(process.env.EMAIL_REPLY_TO || process.env.REPLY_TO || TOPAC_CENTRAL_EMAIL).trim();
  const htmlBody = htmlEscape(input.body).replace(/\n/g, '<br>');
  const threadKey = String(input.threadKey || '').trim() || (input.empresaId && input.competencia
    ? buildAccountingThreadKey(input.empresaId, input.competencia)
    : '');
  const thread = threadKey
    ? await prepareAccountingThread(service, { threadKey, subject: input.subject })
    : { subject: input.subject, headers: {}, current: null as any };

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: input.to,
      ...(input.cc.length ? { cc: input.cc } : {}),
      reply_to: replyTo,
      subject: thread.subject,
      text: input.body,
      html: `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#111827;line-height:1.55"><div style="max-width:720px">${htmlBody}</div></body></html>`,
      ...(Object.keys(thread.headers).length ? { headers: thread.headers } : {}),
      attachments: emailAttachments,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    console.warn('[accounting-portal-upload][email]', response.status, detail.slice(0, 800));
    throw Object.assign(new Error('O PDF foi salvo, mas o provedor recusou o envio do e-mail.'), { status: 502 });
  }
  const provider = await response.json().catch(() => ({}));
  const providerEmailId = provider?.id || null;
  if (threadKey) {
    const messageId = await fetchResendMessageId(resendKey, providerEmailId);
    await saveAccountingThread(service, {
      threadKey,
      empresaId: input.empresaId || null,
      competencia: input.competencia || null,
      subject: thread.subject,
      providerEmailId,
      messageId,
      close: !!input.closeThread,
    });
  }
  return { provider_id: providerEmailId, thread_key: threadKey || null };
};

export default async function handler(req: any, res?: any) {
  if (String(req?.method || 'GET').toUpperCase() !== 'POST') {
    return sendJson(res, { ok: false, error: 'method_not_allowed' }, 405);
  }

  try {
    const body = readBody(req);
    const action = String(body.action || '').trim();
    const portal = String(body.portal || '').trim().toLowerCase();
    const token = String(body.token || '').trim();
    const service = getServiceClient();

    if (action === 'prepare') {
      const companyId = String(body.empresa_id || '').trim();
      const fileName = safeFile(body.arquivo_nome);
      const fileSize = Number(body.tamanho_bytes || 0);
      if (!companyId || !/\.pdf$/i.test(fileName)) return sendJson(res, { ok: false, error: 'pdf_obrigatorio' }, 400);
      if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > MAX_FILE_BYTES) {
        return sendJson(res, { ok: false, error: 'tamanho_invalido', max_bytes: MAX_FILE_BYTES }, 400);
      }
      await validateSession(service, portal, token, companyId);

      const date = new Date().toISOString().slice(0, 10);
      const storagePath = `portal/${portal}/${companyId}/${date}/${crypto.randomUUID()}-${fileName}`;
      const { data, error } = await service.storage.from(BUCKET).createSignedUploadUrl(storagePath);
      if (error || !data?.token) throw error || new Error('signed_upload_failed');
      return sendJson(res, { ok: true, bucket: BUCKET, path: storagePath, upload_token: data.token, max_bytes: MAX_FILE_BYTES });
    }

    if (action === 'finalize') {
      const companyId = String(body.empresa_id || '').trim();
      const storagePath = String(body.storage_path || '').trim();
      const fileName = safeFile(body.arquivo_nome);
      const type = String(body.tipo_documento || 'retorno_folha').trim().slice(0, 60);
      const competence = String(body.competencia || '').trim().slice(0, 20) || null;
      const employeeName = String(body.funcionario_nome || '').trim().slice(0, 180) || null;
      const observation = String(body.observacao || '').trim().slice(0, 2000) || null;
      const originType = String(body.origem_tipo || '').trim().slice(0, 60) || null;
      const originId = String(body.origem_id || '').trim().slice(0, 120) || null;
      const fileSize = Number(body.tamanho_bytes || 0) || null;
      const deferEmail = body.defer_email === true;
      if (!companyId || !storagePath || !fileName) return sendJson(res, { ok: false, error: 'dados_invalidos' }, 400);

      const user = await validateSession(service, portal, token, companyId);
      const prefix = storagePath.split('/').slice(0, -1).join('/');
      const base = storagePath.split('/').pop() || '';
      const { data: objects, error: listError } = await service.storage.from(BUCKET).list(prefix, { search: base, limit: 20 });
      if (listError) throw listError;
      if (!(objects || []).some((item: any) => item.name === base)) return sendJson(res, { ok: false, error: 'arquivo_nao_encontrado' }, 400);

      const { data: company, error: companyError } = await service.from('empresas').select('id,nome,codigo').eq('id', companyId).single();
      if (companyError) throw companyError;
      const typeLabel = TYPE_LABELS[type] || type;
      const routing = await getEmailRouting(service, portal, String(user.email || ''));
      const isPraiaGrande = /praia/i.test(String(company.nome || company.codigo || ''));
      const isFolhaFinal = type === 'folha_processada';
      if (portal === 'principal' && isPraiaGrande && isFolhaFinal) {
        routing.cc = uniqueEmails([...routing.cc, ANTONIO_CARLOS_PRAIA_EMAIL]);
      }

      const { data: existing } = await service
        .from('contabilidade_portal_uploads')
        .select('*')
        .eq('storage_path', storagePath)
        .maybeSingle();
      if (existing) {
        return sendJson(res, {
          ok: true,
          upload_id: existing.id,
          duplicate_finalize: true,
          email_status: existing.formalizacao_email_status,
          formalizado_em: existing.formalizacao_email_em,
          destinatarios: existing.formalizacao_destinos || [],
          email_to: routing.to,
          email_cc: routing.cc,
          company_name: company.nome,
          type_label: typeLabel,
          sender_name: user.nome,
          sender_email: user.email || '',
        });
      }

      const now = new Date().toISOString();
      const initialStatus = deferEmail ? 'aguardando_envio' : 'processando';
      const { data: upload, error: uploadError } = await service
        .from('contabilidade_portal_uploads')
        .insert({
          portal_user_id: user.id,
          empresa_id: companyId,
          tipo_documento: type,
          competencia: competence,
          funcionario_nome: employeeName,
          observacao: observation,
          arquivo_nome: fileName,
          tamanho_bytes: fileSize,
          storage_bucket: BUCKET,
          storage_path: storagePath,
          status: 'recebido',
          formalizacao_email_status: initialStatus,
          formalizacao_destinos: uniqueEmails([...routing.to, ...routing.cc]),
          origem_tipo: originType,
          origem_id: originId,
          created_at: now,
          updated_at: now,
        })
        .select('*')
        .single();
      if (uploadError) throw uploadError;

      if (deferEmail) {
        return sendJson(res, {
          ok: true,
          upload_id: upload.id,
          email_status: 'aguardando_envio',
          email_to: routing.to,
          email_cc: routing.cc,
          company_name: company.nome,
          type_label: typeLabel,
          sender_name: user.nome,
          sender_email: user.email || '',
        });
      }

      const subject = defaultSubject(company.nome, typeLabel, competence);
      const text = defaultBody({
        companyName: company.nome,
        typeLabel,
        competence,
        employeeName,
        fileName,
        observation,
        userName: user.nome,
      });

      try {
        await sendStoredPdfEmail(service, {
          to: routing.to,
          cc: routing.cc,
          subject,
          body: text,
          replyTo: String(user.email || ''),
          bucket: BUCKET,
          path: storagePath,
          fileName,
          empresaId: company.id,
          competencia: competence,
          threadKey: originType && originId
            ? buildAccountingProcessThreadKey({ originType, originId, companyId: company.id, reference: competence })
            : undefined,
          closeThread: type === 'folha_processada',
        });
        const formalizedAt = new Date().toISOString();
        await service.from('contabilidade_portal_uploads').update({
          formalizacao_email_status: 'enviado',
          formalizacao_email_em: formalizedAt,
          formalizacao_destinos: uniqueEmails([...routing.to, ...routing.cc]),
          updated_at: formalizedAt,
        }).eq('id', upload.id);
        return sendJson(res, { ok: true, upload_id: upload.id, email_status: 'enviado', formalizado_em: formalizedAt, email_to: routing.to, email_cc: routing.cc });
      } catch (mailError: any) {
        await service.from('contabilidade_portal_uploads').update({
          formalizacao_email_status: 'erro_envio_email',
          updated_at: new Date().toISOString(),
        }).eq('id', upload.id);
        return sendJson(res, { ok: true, upload_id: upload.id, email_status: 'erro_envio_email', email_to: routing.to, email_cc: routing.cc, email_error: String(mailError?.message || mailError) });
      }
    }

    if (action === 'send_batch_email') {
      const uploadIds = Array.isArray(body.upload_ids)
        ? Array.from(new Set(body.upload_ids.map((value: unknown) => String(value || '').trim()).filter(Boolean))).slice(0, 30)
        : [];
      if (!uploadIds.length) return sendJson(res, { ok: false, error: 'upload_ids_obrigatorios' }, 400);

      const { data: uploads, error: uploadsError } = await service
        .from('contabilidade_portal_uploads')
        .select('*')
        .in('id', uploadIds);
      if (uploadsError) throw uploadsError;
      if (!uploads || uploads.length !== uploadIds.length) {
        return sendJson(res, { ok: false, error: 'documentos_nao_encontrados' }, 404);
      }

      const first = uploads[0];
      const user = await validateSession(service, portal, token, first.empresa_id);
      const sameProcess = uploads.every((upload: any) =>
        upload.empresa_id === first.empresa_id &&
        String(upload.origem_tipo || '') === String(first.origem_tipo || '') &&
        String(upload.origem_id || '') === String(first.origem_id || '')
      );
      if (!sameProcess) {
        return sendJson(res, { ok: false, error: 'lote_processos_diferentes', message: 'Os PDFs do lote precisam pertencer ao mesmo processo.' }, 400);
      }

      const routing = await getEmailRouting(service, portal, String(user.email || ''));
      const { data: company } = await service.from('empresas').select('id,nome,codigo').eq('id', first.empresa_id).maybeSingle();
      if (!company) return sendJson(res, { ok: false, error: 'empresa_nao_encontrada' }, 404);

      const isPraiaGrande = /praia/i.test(String(company.nome || company.codigo || ''));
      const isFolhaFinal = uploads.some((upload: any) => upload.tipo_documento === 'folha_processada');
      if (portal === 'principal' && isPraiaGrande && isFolhaFinal) {
        routing.cc = uniqueEmails([...routing.cc, ANTONIO_CARLOS_PRAIA_EMAIL]);
      }

      const typeLabel = TYPE_LABELS[first.tipo_documento] || first.tipo_documento || 'Retorno da contabilidade';
      const competence = first.competencia || null;
      const subject = String(body.subject || '').trim().slice(0, 240)
        || defaultSubject(company.nome, typeLabel, competence);
      const fileNames = uploads.map((upload: any) => upload.arquivo_nome);
      const requestedBody = String(body.body || '').trim().slice(0, 12000);
      const text = requestedBody || [
        'Prezados,',
        '',
        `Segue em anexo o retorno da Contabilidade referente a ${typeLabel}.`,
        '',
        `Empresa: ${company.nome}`,
        first.funcionario_nome ? `Funcionário: ${first.funcionario_nome}` : '',
        competence ? `Competência / referência: ${competence}` : '',
        `Documentos anexados (${fileNames.length}):`,
        ...fileNames.map((name: string) => `- ${name}`),
        '',
        'Os PDFs seguem anexados em um único envio para conferência e arquivamento no TOPAC RH PRO.',
        '',
        'Atenciosamente,',
        user.nome || 'Contabilidade',
        'Contabilidade',
      ].filter((line, index, list) => line !== '' || (index > 0 && list[index - 1] !== '')).join('\n');

      try {
        const provider = await sendStoredPdfEmail(service, {
          to: routing.to,
          cc: routing.cc,
          subject,
          body: text,
          replyTo: String(user.email || ''),
          attachments: uploads.map((upload: any) => ({
            bucket: upload.storage_bucket,
            path: upload.storage_path,
            fileName: upload.arquivo_nome,
          })),
          empresaId: first.empresa_id,
          competencia: competence,
          threadKey: first.origem_tipo && first.origem_id
            ? buildAccountingProcessThreadKey({
                originType: first.origem_tipo,
                originId: first.origem_id,
                companyId: first.empresa_id,
                reference: competence,
              })
            : undefined,
          closeThread: isFolhaFinal,
        });

        const now = new Date().toISOString();
        await service.from('contabilidade_portal_uploads').update({
          formalizacao_email_status: 'enviado',
          formalizacao_email_em: now,
          formalizacao_destinos: uniqueEmails([...routing.to, ...routing.cc]),
          updated_at: now,
        }).in('id', uploadIds);

        return sendJson(res, {
          ok: true,
          email_status: 'enviado',
          formalizado_em: now,
          provider_id: provider.provider_id,
          quantidade_anexos: uploads.length,
          email_to: routing.to,
          email_cc: routing.cc,
        });
      } catch (error: any) {
        await service.from('contabilidade_portal_uploads').update({
          formalizacao_email_status: 'erro_envio_email',
          formalizacao_destinos: uniqueEmails([...routing.to, ...routing.cc]),
          updated_at: new Date().toISOString(),
        }).in('id', uploadIds);

        return sendJson(res, {
          ok: false,
          error: 'batch_email_send_failed',
          message: String(error?.message || error),
        }, Number(error?.status || 502));
      }
    }

    if (action === 'send_email') {
      const uploadId = String(body.upload_id || '').trim();
      if (!uploadId) return sendJson(res, { ok: false, error: 'upload_id_obrigatorio' }, 400);

      const { data: upload, error: uploadError } = await service
        .from('contabilidade_portal_uploads')
        .select('*')
        .eq('id', uploadId)
        .maybeSingle();
      if (uploadError || !upload) return sendJson(res, { ok: false, error: 'documento_nao_encontrado' }, 404);

      const user = await validateSession(service, portal, token, upload.empresa_id);
      const routing = await getEmailRouting(service, portal, String(user.email || ''));
      const { data: uploadCompany } = await service.from('empresas').select('id,nome,codigo').eq('id', upload.empresa_id).maybeSingle();
      const isPraiaGrande = /praia/i.test(String(uploadCompany?.nome || uploadCompany?.codigo || ''));
      const isFolhaFinal = upload.tipo_documento === 'folha_processada';
      if (portal === 'principal' && isPraiaGrande && isFolhaFinal) {
        routing.cc = uniqueEmails([...routing.cc, ANTONIO_CARLOS_PRAIA_EMAIL]);
      }
      const to = cleanEmails(body.to).length ? cleanEmails(body.to) : routing.to;
      const requestedCc = cleanEmails(body.cc);
      const cc = uniqueEmails([
        ...(requestedCc.length ? requestedCc : routing.cc),
        ...(portal === 'principal' && isPraiaGrande && isFolhaFinal ? [ANTONIO_CARLOS_PRAIA_EMAIL] : []),
      ]).filter((email) => !to.includes(email));
      const subject = String(body.subject || '').trim().slice(0, 240);
      const text = String(body.body || '').trim().slice(0, 12000);
      if (!to.length || !subject || !text) return sendJson(res, { ok: false, error: 'dados_email_invalidos', message: 'Destinatário, assunto e mensagem são obrigatórios.' }, 400);

      try {
        const provider = await sendStoredPdfEmail(service, {
          to,
          cc,
          subject,
          body: text,
          replyTo: String(user.email || ''),
          bucket: upload.storage_bucket,
          path: upload.storage_path,
          fileName: upload.arquivo_nome,
          empresaId: upload.empresa_id,
          competencia: upload.competencia,
          threadKey: upload.origem_tipo && upload.origem_id
            ? buildAccountingProcessThreadKey({
                originType: upload.origem_tipo,
                originId: upload.origem_id,
                companyId: upload.empresa_id,
                reference: upload.competencia,
              })
            : undefined,
          closeThread: upload.tipo_documento === 'folha_processada',
        });
        const now = new Date().toISOString();
        await service.from('contabilidade_portal_uploads').update({
          formalizacao_email_status: 'enviado',
          formalizacao_email_em: now,
          formalizacao_destinos: uniqueEmails([...to, ...cc]),
          updated_at: now,
        }).eq('id', uploadId);
        return sendJson(res, { ok: true, email_status: 'enviado', formalizado_em: now, provider_id: provider.provider_id, email_to: to, email_cc: cc });
      } catch (error: any) {
        await service.from('contabilidade_portal_uploads').update({
          formalizacao_email_status: 'erro_envio_email',
          formalizacao_destinos: uniqueEmails([...to, ...cc]),
          updated_at: new Date().toISOString(),
        }).eq('id', uploadId);
        return sendJson(res, { ok: false, error: 'email_send_failed', message: String(error?.message || error) }, Number(error?.status || 502));
      }
    }

    if (action === 'list_process') {
      const companyId = String(body.empresa_id || '').trim();
      const originType = String(body.origem_tipo || '').trim().slice(0, 60);
      const originId = String(body.origem_id || '').trim().slice(0, 120);
      if (!companyId || !originType || !originId) {
        return sendJson(res, { ok: false, error: 'processo_obrigatorio' }, 400);
      }

      await validateSession(service, portal, token, companyId);
      const { data, error } = await service
        .from('contabilidade_portal_uploads')
        .select('id,tipo_documento,arquivo_nome,tamanho_bytes,status,formalizacao_email_status,formalizacao_email_em,created_at,updated_at')
        .eq('empresa_id', companyId)
        .eq('origem_tipo', originType)
        .eq('origem_id', originId)
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) throw error;

      return sendJson(res, { ok: true, documentos: data || [] });
    }

    if (action === 'view') {
      const uploadId = String(body.upload_id || '').trim();
      const user = await validateSession(service, portal, token);
      const { data: upload, error } = await service
        .from('contabilidade_portal_uploads')
        .select('id,portal_user_id,empresa_id,storage_bucket,storage_path,arquivo_nome')
        .eq('id', uploadId)
        .maybeSingle();
      if (error || !upload) return sendJson(res, { ok: false, error: 'documento_nao_encontrado' }, 404);

      const { data: allowed } = await service
        .from('contabilidade_portal_acesso_empresas')
        .select('empresa_id')
        .eq('portal_user_id', user.id)
        .eq('empresa_id', upload.empresa_id)
        .maybeSingle();
      if (!allowed) return sendJson(res, { ok: false, error: 'empresa_nao_autorizada' }, 403);

      const { data: signed, error: signedError } = await service.storage.from(upload.storage_bucket).createSignedUrl(upload.storage_path, 600);
      if (signedError || !signed?.signedUrl) throw signedError || new Error('signed_url_failed');
      return sendJson(res, { ok: true, url: signed.signedUrl, arquivo_nome: upload.arquivo_nome, expires_in: 600 });
    }

    return sendJson(res, { ok: false, error: 'action_invalid' }, 400);
  } catch (error: any) {
    console.error('[accounting-portal-upload]', error);
    return sendJson(res, { ok: false, error: String(error?.message || error) }, Number(error?.status || 500));
  }
}
