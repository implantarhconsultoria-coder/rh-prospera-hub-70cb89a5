import { Buffer } from 'node:buffer';
import { getServiceClient, readBody, sendJson } from '../src/server/payrollServer.js';

const BUCKET = 'contabilidade-inbox';
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MAX_EMAIL_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const VANESSA_EMAIL = 'dp@aatconsultoria.com.br';
const MARISA_EMAIL = 'marisa@aatconsultoria.com.br';
const TOPAC_CENTRAL_EMAIL = 'adm.matriz@topac.com.br';
const TOPAC_ROBSON_EMAIL = 'robson@topac.com.br';
const TOPAC_GOIANIA_EMAIL = 'adm.gyn@topac.com.br';

const TYPE_LABELS: Record<string, string> = {
  recibos_holerites: 'Recibos / Holerites',
  folha_processada: 'Folha processada',
  contrato: 'Contrato de trabalho',
  rescisao: 'Documentos de rescisão',
  ferias: 'Documentos de férias',
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
  bucket: string;
  path: string;
  fileName: string;
}) => {
  const resendKey = String(process.env.RESEND_API_KEY || '').trim();
  if (!resendKey) throw Object.assign(new Error('Envio de e-mail não configurado no servidor.'), { status: 503 });
  if (!input.to.length) throw Object.assign(new Error('Informe ao menos um destinatário.'), { status: 400 });
  if (!input.subject.trim() || !input.body.trim()) throw Object.assign(new Error('Assunto e mensagem são obrigatórios.'), { status: 400 });

  const { data: pdf, error: downloadError } = await service.storage.from(input.bucket).download(input.path);
  if (downloadError || !pdf) throw downloadError || new Error('pdf_nao_encontrado');
  const bytes = Buffer.from(await pdf.arrayBuffer());
  if (!bytes.length) throw new Error('pdf_anexo_vazio');
  if (bytes.length > MAX_EMAIL_ATTACHMENT_BYTES) {
    throw Object.assign(new Error('O PDF está salvo na plataforma, mas excede 20 MB para envio automático por e-mail. Use o e-mail manual.'), { status: 413 });
  }

  const from = String(process.env.EMAIL_FROM || process.env.MAIL_FROM || 'TOPAC RH PRO <no-reply@topacrh.pro>').trim();
  const replyTo = cleanEmails(input.replyTo)[0] || String(process.env.EMAIL_REPLY_TO || process.env.REPLY_TO || TOPAC_CENTRAL_EMAIL).trim();
  const htmlBody = htmlEscape(input.body).replace(/\n/g, '<br>');

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: input.to,
      ...(input.cc.length ? { cc: input.cc } : {}),
      reply_to: replyTo,
      subject: input.subject,
      text: input.body,
      html: `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#111827;line-height:1.55"><div style="max-width:720px">${htmlBody}</div></body></html>`,
      attachments: [{ filename: input.fileName, content: bytes.toString('base64') }],
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    console.warn('[accounting-portal-upload][email]', response.status, detail.slice(0, 800));
    throw Object.assign(new Error('O PDF foi salvo, mas o provedor recusou o envio do e-mail.'), { status: 502 });
  }
  const provider = await response.json().catch(() => ({}));
  return { provider_id: provider?.id || null };
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
      const to = cleanEmails(body.to).length ? cleanEmails(body.to) : routing.to;
      const cc = cleanEmails(body.cc);
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
