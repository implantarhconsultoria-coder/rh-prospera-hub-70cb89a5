import { Buffer } from 'node:buffer';
import { getServiceClient, readBody, sendJson } from '../src/server/payrollServer.js';

const VANESSA_EMAIL = 'dp@aatconsultoria.com.br';
const MARISA_EMAIL = 'marisa@aatconsultoria.com.br';
const TOPAC_CENTRAL_EMAIL = 'adm.matriz@topac.com.br';
const TOPAC_ROBSON_EMAIL = 'robson@topac.com.br';
const TOPAC_GOIANIA_EMAIL = 'adm.gyn@topac.com.br';
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

type Movement = {
  companyId: string;
  companyName?: string;
  employeeName?: string | null;
  reference?: string | null;
  label: string;
  subjectLabel: string;
  confirmationText: string;
  fileName?: string | null;
  bucket?: string | null;
  path?: string | null;
  directUrl?: string | null;
};

const clean = (value: unknown) => String(value || '').trim();
const getHeader = (req:any, name:string) => typeof req?.headers?.get === 'function' ? req.headers.get(name) : req?.headers?.[name] || req?.headers?.[name.toLowerCase()] || '';
const getBearer = (req:any) => clean(getHeader(req, 'authorization')).match(/^Bearer\s+(.+)$/i)?.[1] || '';
const unique = (values:string[]) => Array.from(new Set(values.map((v) => clean(v).toLowerCase()).filter(Boolean)));
const htmlEscape = (value:unknown) => String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
const fileNameFromPath = (value?:string|null) => clean(value).split('/').pop() || 'documento.pdf';

const validateAdmin = async (req:any, service:any) => {
  const token = getBearer(req);
  if (!token) throw Object.assign(new Error('sessao_invalida'), { status:401 });
  const { data:{ user }, error } = await service.auth.getUser(token);
  if (error || !user) throw Object.assign(new Error('sessao_invalida'), { status:401 });
  const { data:roles, error:roleError } = await service.from('user_roles').select('role').eq('user_id', user.id);
  if (roleError) throw roleError;
  if (!(roles || []).some((r:any) => ['admin','diretor_geral'].includes(String(r.role)))) throw Object.assign(new Error('sem_permissao'), { status:403 });
  return user;
};

const validatePortal = async (service:any, portal:string, token:string, companyId?:string) => {
  if (!['principal','goiania'].includes(portal) || !token) throw Object.assign(new Error('sessao_invalida'), { status:401 });
  const { data:userId, error:sessionError } = await service.rpc('contabilidade_portal_usuario_sessao', { p_token:token, p_portal:portal });
  if (sessionError || !userId) throw Object.assign(new Error('sessao_invalida'), { status:401 });
  const { data:user, error:userError } = await service.from('contabilidade_portal_usuarios').select('id,nome,email,portal,ativo').eq('id', userId).eq('ativo', true).maybeSingle();
  if (userError || !user) throw Object.assign(new Error('sessao_invalida'), { status:401 });
  if (companyId) {
    const { data:allowed } = await service.from('contabilidade_portal_acesso_empresas').select('empresa_id').eq('portal_user_id', userId).eq('empresa_id', companyId).maybeSingle();
    if (!allowed) throw Object.assign(new Error('empresa_nao_autorizada'), { status:403 });
  }
  return user;
};

const resolveMovement = async (service:any, originType:string, originId:string):Promise<Movement> => {
  if (originType === 'atestado_doc') {
    const { data:r, error } = await service.from('documentos_funcionario').select('company_id,funcionario_nome,tipo_documento,nome_arquivo,arquivo_url,storage_bucket,storage_path,data_documento').eq('id', originId).maybeSingle();
    if (error || !r) throw Object.assign(new Error('movimento_nao_encontrado'), { status:404 });
    const isDeclaration = /declara/i.test(clean(r.tipo_documento));
    return { companyId:r.company_id, employeeName:r.funcionario_nome, reference:r.data_documento, label:isDeclaration?'Declaração / afastamento':'Atestado / afastamento', subjectLabel:isDeclaration?'Declaração conferida':'Atestado conferido', confirmationText:isDeclaration?'A declaração/afastamento foi conferida pela Contabilidade e está liberada para continuidade do RH.':'O atestado/afastamento foi conferido pela Contabilidade e está liberado para continuidade do RH.', fileName:r.nome_arquivo || fileNameFromPath(r.storage_path || r.arquivo_url), bucket:r.storage_bucket || 'documentos-funcionarios', path:r.storage_path || r.arquivo_url };
  }
  if (originType === 'atestado') {
    const { data:r, error } = await service.from('atestados').select('company_id,funcionario_nome,competencia,data_inicio,data_fim,arquivo_url,arquivo_nome').eq('id', originId).maybeSingle();
    if (error || !r) throw Object.assign(new Error('movimento_nao_encontrado'), { status:404 });
    return { companyId:r.company_id, employeeName:r.funcionario_nome, reference:r.competencia || r.data_inicio, label:'Atestado / afastamento', subjectLabel:'Atestado conferido', confirmationText:'O atestado/afastamento foi conferido pela Contabilidade e está liberado para continuidade do RH.', fileName:r.arquivo_nome || fileNameFromPath(r.arquivo_url), bucket:'atestados', path:r.arquivo_url };
  }
  if (originType === 'admissao') {
    const { data:r, error } = await service.from('pre_cadastros_admissionais').select('empresa_id,nome,data_admissao,arquivo_ficha_url,arquivo_aso_url').eq('id', originId).maybeSingle();
    if (error || !r) throw Object.assign(new Error('movimento_nao_encontrado'), { status:404 });
    const path = clean(r.arquivo_ficha_url) || clean(r.arquivo_aso_url);
    return { companyId:r.empresa_id, employeeName:r.nome, reference:r.data_admissao, label:'Admissão', subjectLabel:'Admissão conferida', confirmationText:'A documentação admissional foi conferida pela Contabilidade e está liberada para continuidade do RH.', fileName:path?fileNameFromPath(path):null, bucket:path?'documentos-admissionais':null, path:path||null };
  }
  if (originType === 'demissao') {
    const { data:r, error } = await service.from('rescisoes').select('company_id,funcionario_nome,data_desligamento,tipo_rescisao').eq('id', originId).maybeSingle();
    if (error || !r) throw Object.assign(new Error('movimento_nao_encontrado'), { status:404 });
    return { companyId:r.company_id, employeeName:r.funcionario_nome, reference:r.data_desligamento, label:'Demissão / rescisão', subjectLabel:'Demissão / rescisão conferida', confirmationText:'A movimentação de desligamento/rescisão foi conferida pela Contabilidade e está liberada para continuidade do RH.' };
  }
  if (originType === 'ferias') {
    const { data:r, error } = await service.from('ferias_avisos').select('company_id,funcionario_nome,periodo_gozo_inicio,periodo_gozo_fim,aviso_pdf_url,assinado_pdf_url').eq('id', originId).maybeSingle();
    if (error || !r) throw Object.assign(new Error('movimento_nao_encontrado'), { status:404 });
    const path = clean(r.assinado_pdf_url) || clean(r.aviso_pdf_url);
    return { companyId:r.company_id, employeeName:r.funcionario_nome, reference:r.periodo_gozo_inicio, label:'Férias', subjectLabel:'Férias conferidas', confirmationText:'A movimentação de férias foi conferida pela Contabilidade e está liberada para continuidade do RH.', fileName:path?fileNameFromPath(path):null, bucket:path?'documentos-funcionarios':null, path:path||null };
  }
  if (originType === 'fechamento') {
    const { data:r, error } = await service.from('fechamentos_filial').select('company_id,empresa_nome,competencia').eq('id', originId).maybeSingle();
    if (error || !r) throw Object.assign(new Error('movimento_nao_encontrado'), { status:404 });
    return { companyId:r.company_id, companyName:r.empresa_nome, reference:r.competencia, label:'Fechamento da folha', subjectLabel:'Fechamento conferido', confirmationText:'O fechamento da folha foi conferido pela Contabilidade e está liberado para continuidade do RH.' };
  }
  if (originType === 'alerta') {
    const { data:r, error } = await service.from('contabilidade_portal_alertas').select('empresa_id,funcionario_nome,categoria,titulo,detalhes').eq('id', originId).maybeSingle();
    if (error || !r) throw Object.assign(new Error('movimento_nao_encontrado'), { status:404 });
    const category = clean(r.categoria);
    const label = category === 'alteracao_salario' ? 'Alteração salarial' : category === 'alteracao_funcao' ? 'Alteração de função' : clean(r.titulo) || 'Movimentação';
    return { companyId:r.empresa_id, employeeName:r.funcionario_nome, reference:r.detalhes?.competencia || null, label, subjectLabel:`${label} conferida`, confirmationText:`A movimentação de ${label.toLowerCase()} foi conferida pela Contabilidade e está liberada para continuidade do RH.` };
  }
  throw Object.assign(new Error('origem_invalida'), { status:400 });
};

const companyNameFor = async (service:any, movement:Movement) => {
  if (movement.companyName) return movement.companyName;
  const { data } = await service.from('empresas').select('nome').eq('id', movement.companyId).maybeSingle();
  return clean(data?.nome) || 'TOPAC';
};

const routingFor = async (service:any, portal:string, senderEmail:string) => {
  const sender = clean(senderEmail).toLowerCase();
  if (portal === 'principal') {
    const counterpart = sender === VANESSA_EMAIL ? MARISA_EMAIL : sender === MARISA_EMAIL ? VANESSA_EMAIL : '';
    return { to:[TOPAC_CENTRAL_EMAIL], cc:unique([TOPAC_ROBSON_EMAIL, counterpart]).filter((e) => e !== sender) };
  }
  const { data:config } = await service.from('contabilidade_portal_config').select('formalizacao_destinos,ativo').eq('portal', portal).maybeSingle();
  const configured = Array.isArray(config?.formalizacao_destinos) ? config.formalizacao_destinos.map(clean).filter(Boolean) : clean(config?.formalizacao_destinos).split(/[;,\s]+/).filter((v:string) => /@/.test(v));
  const primary = configured[0] || TOPAC_GOIANIA_EMAIL;
  return { to:[primary], cc:unique(configured.slice(1)).filter((e) => e !== sender && e !== primary) };
};

const resolveSignedUrl = async (service:any, movement:Movement) => {
  if (movement.directUrl && /^https?:\/\//i.test(movement.directUrl)) return movement.directUrl;
  const path = clean(movement.path);
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  const bucket = clean(movement.bucket);
  if (!bucket) return '';
  const { data, error } = await service.storage.from(bucket).createSignedUrl(path, 1800);
  if (error || !data?.signedUrl) return '';
  return data.signedUrl;
};

const attachmentFor = async (service:any, movement:Movement) => {
  const path = clean(movement.path);
  const bucket = clean(movement.bucket);
  if (!path || !bucket || /^https?:\/\//i.test(path)) return null;
  const { data:file, error } = await service.storage.from(bucket).download(path);
  if (error || !file) return null;
  const bytes = Buffer.from(await file.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_ATTACHMENT_BYTES) return null;
  return { filename:movement.fileName || fileNameFromPath(path), content:bytes.toString('base64') };
};

const sendConfirmed = async (service:any, body:any) => {
  const portal = clean(body.portal);
  const token = clean(body.token);
  const originType = clean(body.origem_tipo);
  const originId = clean(body.origem_id);
  const emailLogId = clean(body.email_log_id);
  const observation = clean(body.observacao);
  if (!originType || !originId) throw Object.assign(new Error('origem_obrigatoria'), { status:400 });

  if (emailLogId) {
    const { data:existing } = await service.from('contabilidade_portal_review_emails').select('status').eq('id', emailLogId).maybeSingle();
    if (existing?.status === 'enviado') return { email_status:'enviado', duplicate:false };
  }

  const movement = await resolveMovement(service, originType, originId);
  const user = await validatePortal(service, portal, token, movement.companyId);
  const companyName = await companyNameFor(service, movement);
  const routing = await routingFor(service, portal, clean(user.email));
  const subject = `[TOPAC RH PRO] ${movement.subjectLabel} · ${companyName}${movement.employeeName ? ` · ${movement.employeeName}` : ''}`;
  const attachment = await attachmentFor(service, movement);
  const lines = [
    'Prezados,', '', movement.confirmationText, '',
    `Movimento: ${movement.label}`, `Empresa: ${companyName}`,
    movement.employeeName ? `Funcionário: ${movement.employeeName}` : '',
    movement.reference ? `Referência: ${movement.reference}` : '',
    'Status: CONFERIDO',
    observation ? `Observação da Contabilidade: ${observation}` : '', '',
    attachment ? 'O documento compartilhado segue anexado e permanece disponível na Central da Contabilidade durante a competência atual.' : 'O registro permanece disponível na Central da Contabilidade durante a competência atual.', '',
    'Atenciosamente,', clean(user.nome) || 'Contabilidade', 'Contabilidade',
  ].filter((line, index, list) => line !== '' || (index > 0 && list[index-1] !== '')).join('\n');

  const resendKey = clean(process.env.RESEND_API_KEY);
  if (!resendKey) throw Object.assign(new Error('Envio de e-mail não configurado no servidor.'), { status:503 });
  const from = clean(process.env.EMAIL_FROM || process.env.MAIL_FROM || 'TOPAC RH PRO <no-reply@topacrh.pro>');
  const replyTo = clean(user.email || process.env.EMAIL_REPLY_TO || TOPAC_CENTRAL_EMAIL);
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#111827;line-height:1.6;max-width:720px"><h2 style="margin:0 0 16px">${htmlEscape(movement.subjectLabel)}</h2>${lines.split('\n').map((line) => line ? `<p style="margin:5px 0">${htmlEscape(line)}</p>` : '<div style="height:8px"></div>').join('')}</div>`;

  let emailStatus = 'erro';
  let providerId = '';
  let detail = '';
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method:'POST', headers:{ Authorization:`Bearer ${resendKey}`, 'Content-Type':'application/json' },
      body:JSON.stringify({ from, to:routing.to, ...(routing.cc.length?{cc:routing.cc}:{}), reply_to:replyTo, subject, text:lines, html, ...(attachment?{attachments:[attachment]}:{}) }),
    });
    detail = await response.text().catch(() => '');
    if (!response.ok) throw new Error(detail || `resend_${response.status}`);
    emailStatus = 'enviado';
    try { providerId = clean(JSON.parse(detail)?.id); } catch { providerId = ''; }
  } catch (e:any) {
    detail = clean(e?.message || e);
    if (emailLogId) await service.from('contabilidade_portal_review_emails').update({ status:'erro', erro:detail.slice(0,1500), assunto:subject, destinos:unique([...routing.to,...routing.cc]), updated_at:new Date().toISOString() }).eq('id', emailLogId);
    try { await service.from('email_envios_log').insert({ user_id:null, usuario_nome:user.nome, email_corporativo_usado:user.email || null, email_remetente:from, reply_to:replyTo, provider:'resend', modulo_origem:'contabilidade_confirmacao', documento_id:null, documento_nome:movement.fileName || movement.label, destinatarios:routing.to.join(', '), cc:routing.cc.join(', '), assunto:subject, status:'erro', erro:detail.slice(0,1000), enviado_em:new Date().toISOString() }); } catch {}
    throw Object.assign(new Error('falha_envio_email'), { status:502, detail });
  }

  if (emailLogId) await service.from('contabilidade_portal_review_emails').update({ status:'enviado', erro:null, assunto:subject, destinos:unique([...routing.to,...routing.cc]), provider_id:providerId || null, enviado_em:new Date().toISOString(), updated_at:new Date().toISOString() }).eq('id', emailLogId);
  try { await service.from('email_envios_log').insert({ user_id:null, usuario_nome:user.nome, email_corporativo_usado:user.email || null, email_remetente:from, reply_to:replyTo, provider:'resend', modulo_origem:'contabilidade_confirmacao', documento_id:null, documento_nome:movement.fileName || movement.label, destinatarios:routing.to.join(', '), cc:routing.cc.join(', '), assunto:subject, status:'enviado', erro:null, enviado_em:new Date().toISOString() }); } catch {}
  return { email_status:emailStatus, to:routing.to, cc:routing.cc, provider_id:providerId || null, attached:!!attachment };
};

export default async function handler(req:any, res?:any) {
  if (String(req?.method || 'GET').toUpperCase() !== 'POST') return sendJson(res, { ok:false, error:'method_not_allowed' }, 405);
  const service = getServiceClient();
  try {
    const body = readBody(req);
    const action = clean(body.action);

    if (action === 'view_review_source') {
      await validateAdmin(req, service);
      const movement = await resolveMovement(service, clean(body.origem_tipo), clean(body.origem_id));
      const url = await resolveSignedUrl(service, movement);
      if (!url) return sendJson(res, { ok:false, error:'documento_indisponivel', message:'Este movimento não possui documento anexado.' }, 404);
      return sendJson(res, { ok:true, url, arquivo_nome:movement.fileName || 'documento.pdf', expires_in:1800 });
    }

    if (action === 'send_confirmed') {
      const result = await sendConfirmed(service, body);
      return sendJson(res, { ok:true, ...result });
    }

    return sendJson(res, { ok:false, error:'action_invalid' }, 400);
  } catch (e:any) {
    console.error('[accounting-review-action]', e?.message || e, e?.detail || '');
    return sendJson(res, { ok:false, error:clean(e?.message || e), detail:clean(e?.detail).slice(0,500) }, Number(e?.status || 500));
  }
}
