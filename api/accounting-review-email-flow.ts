import { Buffer } from 'node:buffer';
import { getServiceClient, readBody, sendJson } from '../src/server/payrollServer.js';

const VANESSA_EMAIL = 'dp@aatconsultoria.com.br';
const MARISA_EMAIL = 'marisa@aatconsultoria.com.br';
const TOPAC_CENTRAL_EMAIL = 'adm.matriz@topac.com.br';
const TOPAC_ROBSON_EMAIL = 'robson@topac.com.br';
const TOPAC_GOIANIA_EMAIL = 'adm.gyn@topac.com.br';
const DEFAULT_EMAIL_FROM = 'TOPAC RH PRO <no-reply@topacrh.pro>';
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

type Movement = {
  companyId: string;
  companyName?: string | null;
  employeeName?: string | null;
  reference?: string | null;
  label: string;
  subjectLabel: string;
  confirmationText: string;
  fileName?: string | null;
  bucket?: string | null;
  path?: string | null;
};

const clean = (value: unknown) => String(value || '').trim();
const unique = (values: string[]) => Array.from(new Set(values.map((v) => clean(v).toLowerCase()).filter(Boolean)));
const validEmails = (value: unknown) => {
  const raw = Array.isArray(value) ? value.join(' ') : clean(value);
  return unique(raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+[.][A-Z]{2,}/gi) || []).slice(0, 12);
};
const htmlEscape = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
const fileNameFromPath = (value?: string | null) => clean(value).split('/').pop() || 'documento.pdf';
const isHttpUrl = (value?: string | null) => {
  const normalized = clean(value).toLowerCase();
  return normalized.startsWith('http://') || normalized.startsWith('https://');
};
const getVerifiedFrom = () => {
  const configured = clean(process.env.EMAIL_FROM || process.env.MAIL_FROM);
  return configured && !/@resend[.]dev/i.test(configured) ? configured : DEFAULT_EMAIL_FROM;
};

const validatePortal = async (service: any, portal: string, token: string, companyId?: string) => {
  if (!['principal', 'goiania'].includes(portal) || !token) throw Object.assign(new Error('sessao_invalida'), { status: 401 });
  const { data: userId, error: sessionError } = await service.rpc('contabilidade_portal_usuario_sessao', { p_token: token, p_portal: portal });
  if (sessionError || !userId) throw Object.assign(new Error('sessao_invalida'), { status: 401 });
  const { data: user, error: userError } = await service
    .from('contabilidade_portal_usuarios')
    .select('id,nome,email,portal,ativo')
    .eq('id', userId).eq('ativo', true).maybeSingle();
  if (userError || !user) throw Object.assign(new Error('sessao_invalida'), { status: 401 });
  if (companyId) {
    const { data: allowed, error: allowedError } = await service
      .from('contabilidade_portal_acesso_empresas')
      .select('empresa_id')
      .eq('portal_user_id', userId).eq('empresa_id', companyId).maybeSingle();
    if (allowedError || !allowed) throw Object.assign(new Error('empresa_nao_autorizada'), { status: 403 });
  }
  return user;
};

const resolveMovement = async (service: any, originType: string, originId: string): Promise<Movement> => {
  if (originType === 'atestado_doc') {
    const { data: r, error } = await service.from('documentos_funcionario')
      .select('company_id,funcionario_nome,tipo_documento,nome_arquivo,arquivo_url,storage_bucket,storage_path,data_documento')
      .eq('id', originId).maybeSingle();
    if (error || !r) throw Object.assign(new Error('movimento_nao_encontrado'), { status: 404 });
    const declaration = /declara/i.test(clean(r.tipo_documento));
    return {
      companyId: r.company_id,
      employeeName: r.funcionario_nome,
      reference: r.data_documento,
      label: declaration ? 'Declaração / afastamento' : 'Atestado / afastamento',
      subjectLabel: declaration ? 'Declaração conferida' : 'Atestado conferido',
      confirmationText: declaration
        ? 'A declaração/afastamento foi conferida pela Contabilidade e está liberada para continuidade do RH.'
        : 'O atestado/afastamento foi conferido pela Contabilidade e está liberado para continuidade do RH.',
      fileName: r.nome_arquivo || fileNameFromPath(r.storage_path || r.arquivo_url),
      bucket: r.storage_bucket || 'documentos-funcionarios',
      path: r.storage_path || r.arquivo_url,
    };
  }

  if (originType === 'atestado') {
    const { data: r, error } = await service.from('atestados')
      .select('company_id,funcionario_nome,competencia,data_inicio,arquivo_url,arquivo_nome')
      .eq('id', originId).maybeSingle();
    if (error || !r) throw Object.assign(new Error('movimento_nao_encontrado'), { status: 404 });
    return {
      companyId: r.company_id,
      employeeName: r.funcionario_nome,
      reference: r.competencia || r.data_inicio,
      label: 'Atestado / afastamento',
      subjectLabel: 'Atestado conferido',
      confirmationText: 'O atestado/afastamento foi conferido pela Contabilidade e está liberado para continuidade do RH.',
      fileName: r.arquivo_nome || fileNameFromPath(r.arquivo_url),
      bucket: 'atestados',
      path: r.arquivo_url,
    };
  }

  if (originType === 'admissao') {
    const { data: r, error } = await service.from('pre_cadastros_admissionais')
      .select('empresa_id,nome,data_admissao,arquivo_ficha_url,arquivo_aso_url').eq('id', originId).maybeSingle();
    if (error || !r) throw Object.assign(new Error('movimento_nao_encontrado'), { status: 404 });
    const path = clean(r.arquivo_ficha_url) || clean(r.arquivo_aso_url);
    return {
      companyId: r.empresa_id,
      employeeName: r.nome,
      reference: r.data_admissao,
      label: 'Admissão',
      subjectLabel: 'Admissão conferida',
      confirmationText: 'A documentação admissional foi conferida pela Contabilidade e está liberada para continuidade do RH.',
      fileName: path ? fileNameFromPath(path) : null,
      bucket: path ? 'documentos-admissionais' : null,
      path: path || null,
    };
  }

  if (originType === 'demissao') {
    const { data: r, error } = await service.from('rescisoes')
      .select('company_id,funcionario_nome,data_desligamento,tipo_rescisao').eq('id', originId).maybeSingle();
    if (error || !r) throw Object.assign(new Error('movimento_nao_encontrado'), { status: 404 });
    return {
      companyId: r.company_id,
      employeeName: r.funcionario_nome,
      reference: r.data_desligamento,
      label: 'Demissão / rescisão',
      subjectLabel: 'Demissão / rescisão conferida',
      confirmationText: 'A movimentação de desligamento/rescisão foi conferida pela Contabilidade e está liberada para continuidade do RH.',
    };
  }

  if (originType === 'ferias') {
    const { data: r, error } = await service.from('ferias_avisos')
      .select('company_id,funcionario_nome,periodo_gozo_inicio,aviso_pdf_url,assinado_pdf_url').eq('id', originId).maybeSingle();
    if (error || !r) throw Object.assign(new Error('movimento_nao_encontrado'), { status: 404 });
    const path = clean(r.assinado_pdf_url) || clean(r.aviso_pdf_url);
    return {
      companyId: r.company_id,
      employeeName: r.funcionario_nome,
      reference: r.periodo_gozo_inicio,
      label: 'Férias',
      subjectLabel: 'Férias conferidas',
      confirmationText: 'A movimentação de férias foi conferida pela Contabilidade e está liberada para continuidade do RH.',
      fileName: path ? fileNameFromPath(path) : null,
      bucket: path ? 'documentos-funcionarios' : null,
      path: path || null,
    };
  }

  if (originType === 'fechamento') {
    const { data: r, error } = await service.from('fechamentos_filial')
      .select('company_id,empresa_nome,competencia').eq('id', originId).maybeSingle();
    if (error || !r) throw Object.assign(new Error('movimento_nao_encontrado'), { status: 404 });
    return {
      companyId: r.company_id,
      companyName: r.empresa_nome,
      reference: r.competencia,
      label: 'Fechamento da folha',
      subjectLabel: 'Fechamento conferido',
      confirmationText: 'O fechamento da folha foi conferido pela Contabilidade e está liberado para continuidade do RH.',
    };
  }

  if (originType === 'alerta') {
    const { data: r, error } = await service.from('contabilidade_portal_alertas')
      .select('empresa_id,funcionario_nome,categoria,titulo,detalhes').eq('id', originId).maybeSingle();
    if (error || !r) throw Object.assign(new Error('movimento_nao_encontrado'), { status: 404 });
    const category = clean(r.categoria);
    const label = category === 'alteracao_salario'
      ? 'Alteração salarial'
      : category === 'alteracao_funcao' ? 'Alteração de função' : clean(r.titulo) || 'Movimentação';
    return {
      companyId: r.empresa_id,
      employeeName: r.funcionario_nome,
      reference: r.detalhes?.competencia || r.detalhes?.data_registro || null,
      label,
      subjectLabel: `${label} conferida`,
      confirmationText: `A movimentação de ${label.toLowerCase()} foi conferida pela Contabilidade e está liberada para continuidade do RH.`,
    };
  }

  throw Object.assign(new Error('origem_invalida'), { status: 400 });
};

const companyNameFor = async (service: any, movement: Movement) => {
  if (clean(movement.companyName)) return clean(movement.companyName);
  const { data } = await service.from('empresas').select('nome').eq('id', movement.companyId).maybeSingle();
  return clean(data?.nome) || 'TOPAC';
};

const routingFor = async (service: any, portal: string, senderEmail: string) => {
  const sender = clean(senderEmail).toLowerCase();
  if (portal === 'principal') {
    const counterpart = sender === VANESSA_EMAIL ? MARISA_EMAIL : sender === MARISA_EMAIL ? VANESSA_EMAIL : '';
    return { to: [TOPAC_CENTRAL_EMAIL], cc: unique([TOPAC_ROBSON_EMAIL, counterpart]).filter((email) => email !== sender) };
  }
  const { data: config } = await service.from('contabilidade_portal_config')
    .select('formalizacao_destinos,ativo').eq('portal', portal).maybeSingle();
  const configured = config?.ativo ? validEmails(config?.formalizacao_destinos) : [];
  const primary = configured[0] || TOPAC_GOIANIA_EMAIL;
  return { to: [primary], cc: configured.slice(1).filter((email) => email !== sender && email !== primary) };
};

const buildPrepared = async (service: any, input: any) => {
  const portal = clean(input.portal);
  const token = clean(input.token);
  const originType = clean(input.origem_tipo);
  const originId = clean(input.origem_id);
  const observation = clean(input.observacao);
  if (!originType || !originId) throw Object.assign(new Error('origem_obrigatoria'), { status: 400 });

  const movement = await resolveMovement(service, originType, originId);
  const user = await validatePortal(service, portal, token, movement.companyId);
  const companyName = await companyNameFor(service, movement);
  const routing = await routingFor(service, portal, clean(user.email));
  const subject = `${movement.subjectLabel} - ${companyName}${movement.employeeName ? ` - ${movement.employeeName}` : ''}`;
  const body = [
    'Prezados,',
    '',
    movement.confirmationText,
    '',
    `Movimento: ${movement.label}`,
    `Empresa: ${companyName}`,
    movement.employeeName ? `Funcionário: ${movement.employeeName}` : '',
    movement.reference ? `Referência: ${movement.reference}` : '',
    observation ? `Observação: ${observation}` : '',
    '',
    movement.path
      ? 'O documento compartilhado segue anexado e permanece disponível no TOPAC RH PRO.'
      : 'O registro permanece disponível no TOPAC RH PRO.',
    '',
    'Atenciosamente,',
    clean(user.nome) || 'Contabilidade',
    'Contabilidade',
  ].filter((line, index, list) => line !== '' || (index > 0 && list[index - 1] !== '')).join('\n');

  return { portal, token, originType, originId, observation, movement, user, companyName, routing, subject, body };
};

const attachmentFor = async (service: any, movement: Movement) => {
  const path = clean(movement.path);
  const bucket = clean(movement.bucket);
  if (!path || !bucket || isHttpUrl(path)) return null;
  const { data: file, error } = await service.storage.from(bucket).download(path);
  if (error || !file) return null;
  const bytes = Buffer.from(await file.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_ATTACHMENT_BYTES) return null;
  return { filename: movement.fileName || fileNameFromPath(path), content: bytes.toString('base64') };
};

const signedAttachmentUrl = async (service: any, movement: Movement) => {
  const path = clean(movement.path);
  const bucket = clean(movement.bucket);
  if (!path) return '';
  if (isHttpUrl(path)) return path;
  if (!bucket) return '';
  const { data, error } = await service.storage.from(bucket).createSignedUrl(path, 1800);
  return error ? '' : clean(data?.signedUrl);
};

const logEmail = async (service: any, input: any) => {
  try {
    const { error } = await service.from('email_envios_log').insert(input);
    if (error) console.warn('[accounting-review-email-flow] email log failed', error);
  } catch (error) {
    console.warn('[accounting-review-email-flow] email log failed', error);
  }
};

export default async function handler(req: any, res?: any) {
  if (String(req?.method || 'GET').toUpperCase() !== 'POST') {
    return sendJson(res, { ok: false, error: 'method_not_allowed' }, 405);
  }

  const service = getServiceClient();
  try {
    const input = readBody(req);
    const action = clean(input.action);
    const prepared = await buildPrepared(service, input);

    if (action === 'prepare') {
      return sendJson(res, {
        ok: true,
        to: prepared.routing.to,
        cc: prepared.routing.cc,
        subject: prepared.subject,
        body: prepared.body,
        attachment_name: prepared.movement.fileName || null,
        attachment_url: await signedAttachmentUrl(service, prepared.movement),
        has_attachment: !!prepared.movement.path,
        sender_name: prepared.user.nome,
      });
    }

    if (action !== 'send') return sendJson(res, { ok: false, error: 'action_invalid' }, 400);

    const to = validEmails(input.to).length ? validEmails(input.to) : prepared.routing.to;
    const cc = validEmails(input.cc).filter((email) => !to.includes(email));
    const subject = clean(input.subject) || prepared.subject;
    const body = clean(input.body) || prepared.body;
    if (!to.length || !subject || !body) {
      return sendJson(res, { ok: false, error: 'dados_invalidos', message: 'Destinatário, assunto e mensagem são obrigatórios.' }, 400);
    }

    const resendKey = clean(process.env.RESEND_API_KEY);
    if (!resendKey) throw Object.assign(new Error('Envio de e-mail não configurado no servidor.'), { status: 503 });

    const from = getVerifiedFrom();
    const replyTo = clean(prepared.user.email || process.env.EMAIL_REPLY_TO || TOPAC_CENTRAL_EMAIL);
    const attachment = await attachmentFor(service, prepared.movement);
    const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#111827;line-height:1.6;max-width:720px">${body.split('\n').map((line: string) => line ? `<p style="margin:5px 0">${htmlEscape(line)}</p>` : '<div style="height:8px"></div>').join('')}</div>`;

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to,
        ...(cc.length ? { cc } : {}),
        reply_to: replyTo,
        subject,
        text: body,
        html,
        ...(attachment ? { attachments: [attachment] } : {}),
      }),
    });

    const detail = await response.text().catch(() => '');
    if (!response.ok) {
      await logEmail(service, {
        user_id: null,
        usuario_nome: prepared.user.nome,
        email_corporativo_usado: prepared.user.email || null,
        email_remetente: from,
        reply_to: replyTo,
        provider: 'resend',
        modulo_origem: 'contabilidade_confirmacao',
        documento_id: null,
        documento_nome: prepared.movement.fileName || prepared.movement.label,
        destinatarios: to.join(', '),
        cc: cc.join(', '),
        assunto: subject,
        status: 'erro',
        erro: detail.slice(0, 1000),
        enviado_em: new Date().toISOString(),
      });
      throw Object.assign(new Error('falha_envio_email'), { status: 502, detail });
    }

    await logEmail(service, {
      user_id: null,
      usuario_nome: prepared.user.nome,
      email_corporativo_usado: prepared.user.email || null,
      email_remetente: from,
      reply_to: replyTo,
      provider: 'resend',
      modulo_origem: 'contabilidade_confirmacao',
      documento_id: null,
      documento_nome: prepared.movement.fileName || prepared.movement.label,
      destinatarios: to.join(', '),
      cc: cc.join(', '),
      assunto: subject,
      status: 'enviado',
      erro: null,
      enviado_em: new Date().toISOString(),
    });

    return sendJson(res, { ok: true, email_status: 'enviado', attached: !!attachment, to, cc });
  } catch (error: any) {
    console.error('[accounting-review-email-flow]', error?.message || error, error?.detail || '');
    return sendJson(res, {
      ok: false,
      error: clean(error?.message || error),
      message: clean(error?.detail || error?.message || 'Não foi possível enviar o e-mail.'),
      detail: clean(error?.detail).slice(0, 500),
    }, Number(error?.status || 500));
  }
}
