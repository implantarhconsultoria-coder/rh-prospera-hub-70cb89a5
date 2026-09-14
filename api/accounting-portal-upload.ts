import { getServiceClient, readBody, sendJson } from '../src/server/payrollServer.js';

const BUCKET = 'contabilidade-inbox';
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const VANESSA_EMAIL = 'dp@aatconsultoria.com.br';
const MARISA_EMAIL = 'marisa@aatconsultoria.com.br';

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

const sendFormalizationEmail = async (service: any, input: {
  portal: string;
  companyName: string;
  uploadId: string;
  userName: string;
  userEmail: string;
  typeLabel: string;
  competence: string;
  fileName: string;
  observation: string;
  createdAt: string;
}) => {
  const { data: config } = await service
    .from('contabilidade_portal_config')
    .select('formalizacao_destinos,ativo')
    .eq('portal', input.portal)
    .maybeSingle();

  const configured = config?.ativo ? cleanEmails(config?.formalizacao_destinos) : [];
  if (!configured.length) {
    return { status: 'aguardando_configuracao', to: [] as string[], cc: [] as string[] };
  }

  const primary = configured[0];
  const baseCc = configured.slice(1);
  const counterpart = input.portal === 'principal' ? counterpartFor(input.userEmail) : '';
  const cc = uniqueEmails([...baseCc, ...(counterpart ? [counterpart] : [])]).filter((email) => email !== primary);
  const to = [primary];

  const resendKey = String(process.env.RESEND_API_KEY || '').trim();
  if (!resendKey) return { status: 'erro_configuracao_email', to, cc };

  const from = String(process.env.EMAIL_FROM || process.env.MAIL_FROM || 'TOPAC RH PRO <no-reply@topacrh.pro>').trim();
  const replyTo = String(process.env.EMAIL_REPLY_TO || process.env.REPLY_TO || 'adm.matriz@topac.com.br').trim();
  const competenceText = input.competence ? ` · Competência ${input.competence}` : '';
  const subject = `[TOPAC RH PRO] Documento recebido da Contabilidade · ${input.companyName}${competenceText}`;
  const registeredAt = new Date(input.createdAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  const text = [
    'Prezados,',
    '',
    'Fica formalizado o recebimento de documento realizado diretamente pelo Portal da Contabilidade do TOPAC RH PRO.',
    '',
    `Empresa: ${input.companyName}`,
    `Tipo: ${input.typeLabel}`,
    input.competence ? `Competência: ${input.competence}` : '',
    `Arquivo: ${input.fileName}`,
    `Enviado por: ${input.userName}${input.userEmail ? ` <${input.userEmail}>` : ''}`,
    `Data e hora do registro: ${registeredAt}`,
    input.observation ? `Observação: ${input.observation}` : '',
    `ID da operação: ${input.uploadId}`,
    '',
    'O arquivo foi recebido e armazenado diretamente na Central da Contabilidade do TOPAC RH PRO.',
    'Este e-mail serve exclusivamente para formalizar o registro da operação.',
    '',
    'TOPAC RH PRO',
  ].filter(Boolean).join('\n');

  const html = `
    <div style="font-family:Arial,sans-serif;color:#111827;line-height:1.55;max-width:680px">
      <h2 style="margin-bottom:6px">Documento recebido da Contabilidade</h2>
      <p style="color:#4b5563;margin-top:0">Registro automático de formalização — TOPAC RH PRO</p>
      <table style="width:100%;border-collapse:collapse;margin:18px 0">
        <tr><td style="padding:8px;border-bottom:1px solid #e5e7eb"><b>Empresa</b></td><td style="padding:8px;border-bottom:1px solid #e5e7eb">${htmlEscape(input.companyName)}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #e5e7eb"><b>Tipo</b></td><td style="padding:8px;border-bottom:1px solid #e5e7eb">${htmlEscape(input.typeLabel)}</td></tr>
        ${input.competence ? `<tr><td style="padding:8px;border-bottom:1px solid #e5e7eb"><b>Competência</b></td><td style="padding:8px;border-bottom:1px solid #e5e7eb">${htmlEscape(input.competence)}</td></tr>` : ''}
        <tr><td style="padding:8px;border-bottom:1px solid #e5e7eb"><b>Arquivo</b></td><td style="padding:8px;border-bottom:1px solid #e5e7eb">${htmlEscape(input.fileName)}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #e5e7eb"><b>Enviado por</b></td><td style="padding:8px;border-bottom:1px solid #e5e7eb">${htmlEscape(input.userName)}${input.userEmail ? ` &lt;${htmlEscape(input.userEmail)}&gt;` : ''}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #e5e7eb"><b>Registrado em</b></td><td style="padding:8px;border-bottom:1px solid #e5e7eb">${htmlEscape(registeredAt)}</td></tr>
        ${input.observation ? `<tr><td style="padding:8px;border-bottom:1px solid #e5e7eb"><b>Observação</b></td><td style="padding:8px;border-bottom:1px solid #e5e7eb">${htmlEscape(input.observation)}</td></tr>` : ''}
        <tr><td style="padding:8px"><b>ID da operação</b></td><td style="padding:8px;font-family:monospace">${htmlEscape(input.uploadId)}</td></tr>
      </table>
      <p><b>O arquivo já foi recebido e armazenado na Central da Contabilidade.</b> Este e-mail formaliza o registro da operação.</p>
    </div>`;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to,
        ...(cc.length ? { cc } : {}),
        reply_to: replyTo,
        subject,
        text,
        html,
      }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.warn('[accounting-portal-upload][email]', response.status, detail.slice(0, 500));
      return { status: 'erro_envio_email', to, cc };
    }
    return { status: 'enviado', to, cc };
  } catch (error) {
    console.warn('[accounting-portal-upload][email]', error);
    return { status: 'erro_envio_email', to, cc };
  }
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
      if (!companyId || !storagePath || !fileName) return sendJson(res, { ok: false, error: 'dados_invalidos' }, 400);

      const user = await validateSession(service, portal, token, companyId);

      const prefix = storagePath.split('/').slice(0, -1).join('/');
      const base = storagePath.split('/').pop() || '';
      const { data: objects, error: listError } = await service.storage.from(BUCKET).list(prefix, { search: base, limit: 20 });
      if (listError) throw listError;
      if (!(objects || []).some((item: any) => item.name === base)) {
        return sendJson(res, { ok: false, error: 'arquivo_nao_encontrado' }, 400);
      }

      const { data: company, error: companyError } = await service
        .from('empresas')
        .select('id,nome,codigo')
        .eq('id', companyId)
        .single();
      if (companyError) throw companyError;

      const { data: existing } = await service
        .from('contabilidade_portal_uploads')
        .select('id,formalizacao_email_status,formalizacao_email_em,formalizacao_destinos')
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
        });
      }

      const now = new Date().toISOString();
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
          formalizacao_email_status: 'processando',
          created_at: now,
          updated_at: now,
        })
        .select('*')
        .single();
      if (uploadError) throw uploadError;

      const typeLabels: Record<string, string> = {
        recibos_holerites: 'Recibos / Holerites',
        folha_processada: 'Folha processada',
        contrato: 'Contrato de trabalho',
        rescisao: 'Documentos de rescisão',
        ferias: 'Documentos de férias',
        retorno_folha: 'Retorno da contabilidade',
        outro: 'Outro documento',
      };

      const mail = await sendFormalizationEmail(service, {
        portal,
        companyName: company.nome,
        uploadId: upload.id,
        userName: user.nome,
        userEmail: String(user.email || ''),
        typeLabel: typeLabels[type] || type,
        competence: competence || '',
        fileName,
        observation: observation || '',
        createdAt: now,
      });

      const formalizedAt = mail.status === 'enviado' ? new Date().toISOString() : null;
      const allRecipients = uniqueEmails([...(mail.to || []), ...(mail.cc || [])]);
      await service
        .from('contabilidade_portal_uploads')
        .update({
          formalizacao_email_status: mail.status,
          formalizacao_email_em: formalizedAt,
          formalizacao_destinos: allRecipients,
          updated_at: new Date().toISOString(),
        })
        .eq('id', upload.id);

      return sendJson(res, {
        ok: true,
        upload_id: upload.id,
        email_status: mail.status,
        formalizado_em: formalizedAt,
        email_to: mail.to,
        email_cc: mail.cc,
      });
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

      const { data: signed, error: signedError } = await service.storage
        .from(upload.storage_bucket)
        .createSignedUrl(upload.storage_path, 600);
      if (signedError || !signed?.signedUrl) throw signedError || new Error('signed_url_failed');
      return sendJson(res, { ok: true, url: signed.signedUrl, arquivo_nome: upload.arquivo_nome, expires_in: 600 });
    }

    return sendJson(res, { ok: false, error: 'action_invalid' }, 400);
  } catch (error: any) {
    console.error('[accounting-portal-upload]', error);
    return sendJson(res, { ok: false, error: String(error?.message || error) }, Number(error?.status || 500));
  }
}
