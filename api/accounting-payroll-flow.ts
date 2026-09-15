import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { addEvent, getServiceClient, PAYROLL_BUCKET, readBody, requireAdmin, sendJson, sha256 } from '../src/server/payrollServer.js';

const INBOX_BUCKET = 'contabilidade-inbox';
const MAX_ORIGINAL_BYTES = 50 * 1024 * 1024;
const MAX_PAGE_BYTES = 25 * 1024 * 1024;
const MAX_EMAIL_ATTACHMENTS_BYTES = 20 * 1024 * 1024;
const TOPAC_CENTRAL_EMAIL = 'adm.matriz@topac.com.br';
const TOPAC_ROBSON_EMAIL = 'robson@topac.com.br';
const TOPAC_GOIANIA_EMAIL = 'adm.gyn@topac.com.br';
const VANESSA_EMAIL = 'dp@aatconsultoria.com.br';
const MARISA_EMAIL = 'marisa@aatconsultoria.com.br';
const DEFAULT_EMAIL_FROM = 'TOPAC RH PRO <no-reply@topacrh.pro>';

const clean = (value: unknown) => String(value || '').trim();
const safeFile = (value: unknown) => clean(value || 'documento.pdf')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^A-Za-z0-9._-]+/g, '_').replace(/_+/g, '_').slice(0, 140) || 'documento.pdf';
const digits = (value: unknown) => clean(value).replace(/\D/g, '');
const uniqueEmails = (values: string[]) => Array.from(new Set(values.map(v => clean(v).toLowerCase()).filter(Boolean)));
const htmlEscape = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
const verifiedFrom = () => {
  const configured = clean(process.env.EMAIL_FROM || process.env.MAIL_FROM);
  return configured && !/@resend\.dev/i.test(configured) ? configured : DEFAULT_EMAIL_FROM;
};
const counterpartFor = (email: unknown) => {
  const normalized = clean(email).toLowerCase();
  if (normalized === VANESSA_EMAIL) return MARISA_EMAIL;
  if (normalized === MARISA_EMAIL) return VANESSA_EMAIL;
  return '';
};
const competenceLabel = (value: unknown) => {
  const [year, month] = clean(value).split('-');
  return year && month ? `${month}/${year}` : clean(value);
};

const competenceNow = () => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' })
    .formatToParts(new Date()).reduce<Record<string,string>>((acc, part) => { acc[part.type] = part.value; return acc; }, {});
  return `${parts.year}-${parts.month}`;
};

const validatePortal = (value: unknown) => {
  const portal = clean(value).toLowerCase();
  if (!['principal','goiania'].includes(portal)) throw Object.assign(new Error('portal_invalido'), { status: 400 });
  return portal;
};

const validateCompetence = (value: unknown) => {
  const competence = clean(value || competenceNow());
  if (!/^\d{4}-\d{2}$/.test(competence)) throw Object.assign(new Error('competencia_invalida'), { status: 400 });
  return competence;
};

const portalSession = async (service: any, portal: string, token: string, companyId?: string) => {
  if (!token) throw Object.assign(new Error('sessao_invalida'), { status: 401 });
  const { data: userId, error } = await service.rpc('contabilidade_portal_usuario_sessao', { p_token: token, p_portal: portal });
  if (error || !userId) throw Object.assign(new Error('sessao_invalida'), { status: 401 });
  const { data: user, error: userError } = await service.from('contabilidade_portal_usuarios')
    .select('id,nome,email,portal,ativo').eq('id', userId).eq('ativo', true).maybeSingle();
  if (userError || !user) throw Object.assign(new Error('sessao_invalida'), { status: 401 });
  if (companyId) {
    const { data: access, error: accessError } = await service.from('contabilidade_portal_acesso_empresas')
      .select('empresa_id').eq('portal_user_id', user.id).eq('empresa_id', companyId).maybeSingle();
    if (accessError || !access) throw Object.assign(new Error('empresa_nao_autorizada'), { status: 403 });
  }
  return user;
};

const allowedCompanies = async (service: any, userId: string) => {
  const { data: access, error } = await service.from('contabilidade_portal_acesso_empresas')
    .select('empresa_id').eq('portal_user_id', userId);
  if (error) throw error;
  const ids = Array.from(new Set((access || []).map((row: any) => String(row.empresa_id || '')).filter(Boolean))) as string[];
  if (!ids.length) return [];
  const { data: companies, error: companyError } = await service.from('empresas')
    .select('id,nome,codigo,cnpj').in('id', ids).order('nome');
  if (companyError) throw companyError;
  return companies || [];
};

const ensureCycle = async (service: any, input: { portal: string; companyId: string; competence: string; type: 'adiantamento'|'pagamento' }) => {
  const initialStatus = input.type === 'pagamento' ? 'aguardando_apontamento' : 'aguardando_envio';
  const { data, error } = await service.from('contabilidade_folha_ciclos').upsert({
    portal: input.portal,
    empresa_id: input.companyId,
    competencia: input.competence,
    tipo: input.type,
    status: initialStatus,
    ativo: true,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'portal,empresa_id,competencia,tipo', ignoreDuplicates: true }).select('*').maybeSingle();
  if (error) throw error;
  if (data) return data;
  const { data: existing, error: existingError } = await service.from('contabilidade_folha_ciclos')
    .select('*').eq('portal', input.portal).eq('empresa_id', input.companyId).eq('competencia', input.competence).eq('tipo', input.type).single();
  if (existingError) throw existingError;
  return existing;
};

const getCycle = async (service: any, cycleId: string) => {
  const { data, error } = await service.from('contabilidade_folha_ciclos').select('*').eq('id', cycleId).maybeSingle();
  if (error || !data) throw Object.assign(new Error('ciclo_nao_encontrado'), { status: 404 });
  return data;
};

const assertCycleUploadAllowed = (cycle: any) => {
  if (cycle.status === 'conferido') throw Object.assign(new Error('ciclo_ja_conferido'), { status: 409 });
  if (cycle.tipo === 'pagamento' && !cycle.apontamento_liberado_em) {
    throw Object.assign(new Error('aguardando_apontamento'), { status: 409 });
  }
};

const objectExists = async (service: any, bucket: string, path: string) => {
  const prefix = path.split('/').slice(0, -1).join('/');
  const base = path.split('/').pop() || '';
  const { data, error } = await service.storage.from(bucket).list(prefix, { search: base, limit: 10 });
  if (error) throw error;
  return (data || []).some((row: any) => row.name === base);
};

const buildCycleAttachments = async (service: any, cycleId: string) => {
  const { data: uploads, error } = await service.from('contabilidade_portal_uploads')
    .select('id,arquivo_nome,storage_bucket,storage_path,tamanho_bytes')
    .eq('ciclo_id', cycleId)
    .order('created_at');
  if (error) throw error;
  const attachments: Array<{ filename: string; content: string }> = [];
  let total = 0;
  for (const upload of uploads || []) {
    const declared = Number(upload.tamanho_bytes || 0);
    if (declared > MAX_EMAIL_ATTACHMENTS_BYTES || total + declared > MAX_EMAIL_ATTACHMENTS_BYTES) continue;
    const { data: file, error: downloadError } = await service.storage.from(upload.storage_bucket || INBOX_BUCKET).download(upload.storage_path);
    if (downloadError || !file) continue;
    const bytes = Buffer.from(await file.arrayBuffer());
    if (!bytes.length || total + bytes.length > MAX_EMAIL_ATTACHMENTS_BYTES) continue;
    total += bytes.length;
    attachments.push({ filename: safeFile(upload.arquivo_nome), content: bytes.toString('base64') });
  }
  return { attachments, uploads: uploads || [] };
};

const sendResend = async (input: { to: string[]; cc?: string[]; replyTo?: string; subject: string; body: string; attachments?: Array<{ filename: string; content: string }> }) => {
  const resendKey = clean(process.env.RESEND_API_KEY);
  if (!resendKey) return { status: 'erro', error: 'RESEND_API_KEY ausente' };
  const to = uniqueEmails(input.to);
  const cc = uniqueEmails(input.cc || []).filter(email => !to.includes(email));
  if (!to.length) return { status: 'erro', error: 'destinatario_ausente' };
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#111827;line-height:1.6;max-width:720px">${input.body.split('\n').map(line => line ? `<p style="margin:5px 0">${htmlEscape(line)}</p>` : '<div style="height:8px"></div>').join('')}</div>`;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: verifiedFrom(),
      to,
      ...(cc.length ? { cc } : {}),
      ...(clean(input.replyTo) ? { reply_to: clean(input.replyTo) } : {}),
      subject: input.subject,
      text: input.body,
      html,
      ...(input.attachments?.length ? { attachments: input.attachments } : {}),
    }),
  });
  const detail = await response.text().catch(() => '');
  if (!response.ok) return { status: 'erro', error: detail.slice(0, 1000) || `HTTP ${response.status}` };
  return { status: 'enviado', error: null };
};

const sendSubmissionEmail = async (service: any, cycle: any, user: any, identified: number, review: number) => {
  if (cycle.email_envio_status === 'enviado') return { status: 'enviado', skipped: true };
  const { data: company } = await service.from('empresas').select('nome').eq('id', cycle.empresa_id).maybeSingle();
  const companyName = clean(company?.nome) || 'Empresa';
  const { attachments, uploads } = await buildCycleAttachments(service, cycle.id);
  const counterpart = counterpartFor(user.email);
  const to = cycle.portal === 'goiania' ? [TOPAC_GOIANIA_EMAIL] : [TOPAC_CENTRAL_EMAIL];
  const cc = cycle.portal === 'goiania'
    ? uniqueEmails([clean(user.email)])
    : uniqueEmails([TOPAC_ROBSON_EMAIL, clean(user.email), counterpart]);
  const processLabel = cycle.tipo === 'adiantamento' ? 'Adiantamento' : 'Pagamento';
  const names = uploads.map((row: any) => `• ${row.arquivo_nome}`).join('\n');
  const body = [
    'Prezados,', '',
    `A Contabilidade enviou os arquivos de ${processLabel} para conferência no TOPAC RH PRO.`, '',
    `Empresa: ${companyName}`,
    `Competência: ${competenceLabel(cycle.competencia)}`,
    `Enviado por: ${clean(user.nome) || 'Contabilidade'}`,
    `Documentos identificados: ${identified}`,
    review ? `Itens para revisão: ${review}` : 'Itens para revisão: 0', '',
    'Arquivos recebidos:', names || '• Nenhum arquivo listado', '',
    attachments.length === uploads.length
      ? 'Os PDFs seguem anexados neste e-mail e também estão disponíveis na Central da Contabilidade.'
      : 'Os PDFs estão disponíveis na Central da Contabilidade. Os arquivos que couberam no limite do e-mail seguem anexados.', '',
    'Os documentos identificados já foram preparados na Assinatura Digital, mas permanecem BLOQUEADOS para os funcionários até a autorização final do RH.', '',
    'Atenciosamente,', 'TOPAC RH PRO',
  ].join('\n');
  const result = await sendResend({
    to, cc, replyTo: clean(user.email),
    subject: `${processLabel} recebido para conferência - ${companyName} - ${competenceLabel(cycle.competencia)}`,
    body, attachments,
  });
  const now = new Date().toISOString();
  await service.from('contabilidade_folha_ciclos').update({
    email_envio_status: result.status,
    email_envio_em: result.status === 'enviado' ? now : null,
    updated_at: now,
  }).eq('id', cycle.id);
  await service.from('contabilidade_portal_uploads').update({
    formalizacao_email_status: result.status,
    formalizacao_email_em: result.status === 'enviado' ? now : null,
    formalizacao_destinos: uniqueEmails([...to, ...cc]),
    updated_at: now,
  }).eq('ciclo_id', cycle.id);
  return result;
};

const sendApprovalEmail = async (service: any, cycle: any, documentsReleased: number) => {
  if (cycle.email_retorno_status === 'enviado') return { status: 'enviado', skipped: true };
  const [{ data: company }, { data: accountingUser }] = await Promise.all([
    service.from('empresas').select('nome').eq('id', cycle.empresa_id).maybeSingle(),
    cycle.enviado_por_portal_user_id
      ? service.from('contabilidade_portal_usuarios').select('nome,email,portal').eq('id', cycle.enviado_por_portal_user_id).maybeSingle()
      : Promise.resolve({ data: null } as any),
  ]);
  const companyName = clean(company?.nome) || 'Empresa';
  const processLabel = cycle.tipo === 'adiantamento' ? 'Adiantamento' : 'Pagamento';
  const uploaderEmail = clean(accountingUser?.email);
  const counterpart = counterpartFor(uploaderEmail);
  const to = uniqueEmails([uploaderEmail || (cycle.portal === 'goiania' ? TOPAC_GOIANIA_EMAIL : VANESSA_EMAIL)]);
  const cc = cycle.portal === 'goiania'
    ? uniqueEmails([TOPAC_GOIANIA_EMAIL])
    : uniqueEmails([counterpart, TOPAC_CENTRAL_EMAIL, TOPAC_ROBSON_EMAIL]).filter(email => !to.includes(email));
  const body = [
    'Prezados,', '',
    `O ${processLabel} enviado para ${companyName} foi conferido e aprovado pelo RH.`, '',
    `Empresa: ${companyName}`,
    `Competência: ${competenceLabel(cycle.competencia)}`,
    `Documentos liberados para assinatura: ${documentsReleased}`, '',
    'A partir desta autorização, os documentos aprovados ficam disponíveis no portal de Assinatura Digital dos respectivos funcionários.', '',
    'Atenciosamente,', 'TOPAC RH',
  ].join('\n');
  const result = await sendResend({
    to, cc, replyTo: TOPAC_CENTRAL_EMAIL,
    subject: `${processLabel} conferido / OK - ${companyName} - ${competenceLabel(cycle.competencia)}`,
    body,
  });
  const now = new Date().toISOString();
  await service.from('contabilidade_folha_ciclos').update({
    email_retorno_status: result.status,
    email_retorno_em: result.status === 'enviado' ? now : null,
    updated_at: now,
  }).eq('id', cycle.id);
  return result;
};

const portalState = async (service: any, user: any, portal: string) => {
  const competence = competenceNow();
  const companies = await allowedCompanies(service, user.id);
  for (const company of companies) {
    await ensureCycle(service, { portal, companyId: company.id, competence, type: 'adiantamento' });
    await ensureCycle(service, { portal, companyId: company.id, competence, type: 'pagamento' });
  }
  const companyIds = companies.map((row: any) => String(row.id || '')).filter(Boolean);
  const [{ data: cycles, error: cycleError }, { data: employees, error: employeeError }] = await Promise.all([
    companyIds.length ? service.from('contabilidade_folha_ciclos').select('*').eq('portal', portal).in('empresa_id', companyIds).eq('competencia', competence).eq('ativo', true).order('tipo').order('empresa_id') : Promise.resolve({ data: [], error: null }),
    companyIds.length ? service.from('funcionarios').select('id,nome,cpf,cargo,empresa_id,company_id,registro,matricula_esocial,ativo,status').or(`company_id.in.(${companyIds.join(',')}),empresa_id.in.(${companyIds.join(',')})`).eq('ativo', true).order('nome') : Promise.resolve({ data: [], error: null }),
  ] as any);
  if (cycleError) throw cycleError;
  if (employeeError) throw employeeError;

  const cycleIds = (cycles || []).map((row: any) => row.id);
  const { data: docs, error: docError } = cycleIds.length
    ? await service.from('contabilidade_folha_documentos').select('id,ciclo_id,empresa_id,funcionario_id,pagina,tipo_documento,nome_detectado,classificacao,status,detalhes,created_at').in('ciclo_id', cycleIds)
    : { data: [], error: null } as any;
  if (docError) throw docError;

  return { competence, companies, cycles: cycles || [], employees: employees || [], documents: docs || [] };
};

const adminState = async (service: any) => {
  const competence = competenceNow();
  const { data: principalUsers, error: userError } = await service.from('contabilidade_portal_usuarios').select('id').eq('portal', 'principal').eq('ativo', true);
  if (userError) throw userError;
  const userIds = (principalUsers || []).map((row: any) => String(row.id || '')).filter(Boolean);
  const { data: access, error: accessError } = userIds.length
    ? await service.from('contabilidade_portal_acesso_empresas').select('empresa_id').in('portal_user_id', userIds)
    : { data: [], error: null } as any;
  if (accessError) throw accessError;
  const companyIds = Array.from(new Set((access || []).map((row: any) => String(row.empresa_id || '')).filter(Boolean))) as string[];
  for (const companyId of companyIds) {
    await ensureCycle(service, { portal: 'principal', companyId, competence, type: 'adiantamento' });
    await ensureCycle(service, { portal: 'principal', companyId, competence, type: 'pagamento' });
  }
  const [{ data: companies, error: companyError }, { data: cycles, error: cycleError }] = await Promise.all([
    companyIds.length ? service.from('empresas').select('id,nome,codigo,cnpj').in('id', companyIds).order('nome') : Promise.resolve({ data: [], error: null }),
    companyIds.length ? service.from('contabilidade_folha_ciclos').select('*').eq('portal', 'principal').in('empresa_id', companyIds).eq('competencia', competence).eq('ativo', true).order('tipo').order('empresa_id') : Promise.resolve({ data: [], error: null }),
  ] as any);
  if (companyError) throw companyError;
  if (cycleError) throw cycleError;
  const cycleIds = (cycles || []).map((row: any) => row.id);
  const [{ data: docs, error: docError }, { data: uploads, error: uploadError }] = await Promise.all([
    cycleIds.length ? service.from('contabilidade_folha_documentos').select('*').in('ciclo_id', cycleIds).order('created_at') : Promise.resolve({ data: [], error: null }),
    cycleIds.length ? service.from('contabilidade_portal_uploads').select('id,ciclo_id,empresa_id,arquivo_nome,processo_tipo,processamento_status,processamento_detalhes,formalizacao_email_status,created_at,storage_bucket,storage_path').in('ciclo_id', cycleIds).order('created_at') : Promise.resolve({ data: [], error: null }),
  ] as any);
  if (docError) throw docError;
  if (uploadError) throw uploadError;
  return { competence, companies: companies || [], cycles: cycles || [], documents: docs || [], uploads: uploads || [] };
};

export default async function handler(req: any, res?: any) {
  if (String(req?.method || 'GET').toUpperCase() !== 'POST') return sendJson(res, { ok: false, error: 'method_not_allowed' }, 405);
  try {
    const service = getServiceClient();
    const body = readBody(req);
    const action = clean(body.action);

    if (action.startsWith('admin_')) {
      const { user } = await requireAdmin(req);

      if (action === 'admin_state') return sendJson(res, { ok: true, ...(await adminState(service)) });

      if (action === 'admin_release_payment') {
        const companyId = clean(body.empresa_id);
        const competence = validateCompetence(body.competencia);
        if (!companyId) return sendJson(res, { ok: false, error: 'empresa_obrigatoria' }, 400);
        const cycle = await ensureCycle(service, { portal: 'principal', companyId, competence, type: 'pagamento' });
        const now = new Date().toISOString();
        const { data, error } = await service.from('contabilidade_folha_ciclos').update({
          apontamento_liberado_em: now,
          apontamento_liberado_por: user.id,
          status: cycle.contabilidade_recebeu_em ? 'recebido' : 'liberado',
          updated_at: now,
        }).eq('id', cycle.id).select('*').single();
        if (error) throw error;
        return sendJson(res, { ok: true, cycle: data });
      }

      if (action === 'admin_approve_cycle') {
        const cycle = await getCycle(service, clean(body.ciclo_id));
        const { data: mapped, error: mapError } = await service.from('contabilidade_folha_documentos')
          .select('id,payroll_document_id,classificacao').eq('ciclo_id', cycle.id).eq('classificacao', 'identificado').not('payroll_document_id', 'is', null);
        if (mapError) throw mapError;
        const documentIds = Array.from(new Set((mapped || []).map((row: any) => String(row.payroll_document_id || '')).filter(Boolean))) as string[];
        const now = new Date().toISOString();
        if (documentIds.length) {
          const releaseStatus = cycle.tipo === 'adiantamento' ? 'AGUARDANDO_ASSINATURA' : 'AGUARDANDO_PAGAMENTO';
          const { error: docUpdateError } = await service.from('payroll_documents').update({
            confirmed: true,
            confirmed_at: now,
            confirmed_by: user.id,
            status: releaseStatus,
            updated_at: now,
          }).in('id', documentIds);
          if (docUpdateError) throw docUpdateError;
          await service.from('contabilidade_folha_documentos').update({ status: 'liberado_assinatura', updated_at: now }).in('payroll_document_id', documentIds);
        }
        const { data, error } = await service.from('contabilidade_folha_ciclos').update({
          status: 'conferido', conferido_em: now, conferido_por: user.id, observacao: null, updated_at: now,
        }).eq('id', cycle.id).select('*').single();
        if (error) throw error;
        const emailResult = await sendApprovalEmail(service, { ...cycle, ...data }, documentIds.length);
        return sendJson(res, { ok: true, cycle: data, documentos_liberados: documentIds.length, email_status: emailResult.status, email_error: emailResult.error || null });
      }

      if (action === 'admin_mark_pending') {
        const cycle = await getCycle(service, clean(body.ciclo_id));
        const observation = clean(body.observacao).slice(0, 2000);
        if (!observation) return sendJson(res, { ok: false, error: 'observacao_obrigatoria' }, 400);
        const now = new Date().toISOString();
        const { data, error } = await service.from('contabilidade_folha_ciclos').update({ status: 'pendencia', observacao: observation, updated_at: now }).eq('id', cycle.id).select('*').single();
        if (error) throw error;
        return sendJson(res, { ok: true, cycle: data });
      }

      if (action === 'admin_view_file') {
        const bucket = clean(body.bucket);
        const path = clean(body.path);
        if (![INBOX_BUCKET, PAYROLL_BUCKET].includes(bucket) || !path) return sendJson(res, { ok: false, error: 'arquivo_invalido' }, 400);
        const { data, error } = await service.storage.from(bucket).createSignedUrl(path, 600);
        if (error || !data?.signedUrl) throw error || new Error('signed_url_failed');
        return sendJson(res, { ok: true, url: data.signedUrl });
      }

      return sendJson(res, { ok: false, error: 'admin_action_invalid' }, 400);
    }

    const portal = validatePortal(body.portal);
    const token = clean(body.token);
    const user = await portalSession(service, portal, token);

    if (action === 'state') return sendJson(res, { ok: true, ...(await portalState(service, user, portal)) });

    const companyId = clean(body.empresa_id);
    const cycleId = clean(body.ciclo_id);
    if (!companyId || !cycleId) return sendJson(res, { ok: false, error: 'empresa_e_ciclo_obrigatorios' }, 400);
    await portalSession(service, portal, token, companyId);
    const cycle = await getCycle(service, cycleId);
    if (cycle.portal !== portal || cycle.empresa_id !== companyId) return sendJson(res, { ok: false, error: 'ciclo_fora_do_escopo' }, 403);

    if (action === 'ack_apontamento') {
      if (cycle.tipo !== 'pagamento' || !cycle.apontamento_liberado_em) return sendJson(res, { ok: false, error: 'apontamento_nao_liberado' }, 409);
      const now = new Date().toISOString();
      const { data, error } = await service.from('contabilidade_folha_ciclos').update({ contabilidade_recebeu_em: now, status: 'recebido', updated_at: now }).eq('id', cycle.id).select('*').single();
      if (error) throw error;
      return sendJson(res, { ok: true, cycle: data });
    }

    assertCycleUploadAllowed(cycle);

    if (action === 'prepare_original') {
      const filename = safeFile(body.arquivo_nome);
      const size = Number(body.tamanho_bytes || 0);
      if (!/\.pdf$/i.test(filename) || !Number.isFinite(size) || size <= 0 || size > MAX_ORIGINAL_BYTES) return sendJson(res, { ok: false, error: 'pdf_invalido' }, 400);
      const path = `folha/${portal}/${cycle.tipo}/${cycle.competencia}/${companyId}/${randomUUID()}-${filename}`;
      const { data, error } = await service.storage.from(INBOX_BUCKET).createSignedUploadUrl(path);
      if (error || !data?.token) throw error || new Error('signed_upload_failed');
      return sendJson(res, { ok: true, bucket: INBOX_BUCKET, path, upload_token: data.token });
    }

    if (action === 'finalize_original') {
      const path = clean(body.storage_path);
      const filename = safeFile(body.arquivo_nome);
      if (!path || !(await objectExists(service, INBOX_BUCKET, path))) return sendJson(res, { ok: false, error: 'arquivo_nao_encontrado' }, 400);
      const now = new Date().toISOString();
      const { data: existing } = await service.from('contabilidade_portal_uploads').select('*').eq('storage_path', path).maybeSingle();
      if (existing) return sendJson(res, { ok: true, upload: existing, duplicate: true });
      const { data, error } = await service.from('contabilidade_portal_uploads').insert({
        portal_user_id: user.id,
        empresa_id: companyId,
        ciclo_id: cycle.id,
        processo_tipo: cycle.tipo,
        tipo_documento: cycle.tipo === 'pagamento' ? 'recibos_holerites' : 'outro',
        competencia: cycle.competencia,
        arquivo_nome: filename,
        tamanho_bytes: Number(body.tamanho_bytes || 0) || null,
        storage_bucket: INBOX_BUCKET,
        storage_path: path,
        status: 'recebido',
        formalizacao_email_status: 'pendente',
        processamento_status: 'processando',
        processamento_detalhes: { source_sha256: clean(body.source_sha256) || null },
        created_at: now,
        updated_at: now,
      }).select('*').single();
      if (error) throw error;
      await service.from('contabilidade_folha_ciclos').update({ status: 'processando', enviado_por_portal_user_id: user.id, email_envio_status: 'pendente', updated_at: now }).eq('id', cycle.id);
      return sendJson(res, { ok: true, upload: data });
    }

    if (action === 'register_page') {
      const uploadId = clean(body.upload_id);
      const page = Number(body.pagina || 0) || null;
      const { data: existing } = await service.from('contabilidade_folha_documentos').select('*').eq('ciclo_id', cycle.id).eq('portal_upload_id', uploadId).eq('pagina', page).maybeSingle();
      if (existing) return sendJson(res, { ok: true, page: existing, duplicate: true });
      const { data, error } = await service.from('contabilidade_folha_documentos').insert({
        ciclo_id: cycle.id,
        portal_upload_id: uploadId || null,
        empresa_id: companyId,
        funcionario_id: body.funcionario_id || null,
        pagina: page,
        tipo_documento: clean(body.tipo_documento) || null,
        nome_detectado: clean(body.nome_detectado).slice(0, 180) || null,
        cpf_detectado: digits(body.cpf_detectado).slice(0, 11) || null,
        classificacao: ['revisao','ignorado','erro','duplicado'].includes(clean(body.classificacao)) ? clean(body.classificacao) : 'revisao',
        status: clean(body.status) || 'pendente',
        detalhes: typeof body.detalhes === 'object' && body.detalhes ? body.detalhes : {},
      }).select('*').single();
      if (error) throw error;
      return sendJson(res, { ok: true, page: data });
    }

    if (action === 'prepare_document') {
      const uploadId = clean(body.upload_id);
      const employeeId = clean(body.funcionario_id);
      const page = Number(body.pagina || 0);
      const filename = safeFile(body.arquivo_nome);
      const size = Number(body.tamanho_bytes || 0);
      if (!uploadId || !employeeId || !page || !/\.pdf$/i.test(filename) || !Number.isFinite(size) || size <= 0 || size > MAX_PAGE_BYTES) return sendJson(res, { ok: false, error: 'documento_invalido' }, 400);
      const { data: upload, error: uploadError } = await service.from('contabilidade_portal_uploads').select('id,ciclo_id,empresa_id').eq('id', uploadId).eq('ciclo_id', cycle.id).eq('empresa_id', companyId).maybeSingle();
      if (uploadError || !upload) return sendJson(res, { ok: false, error: 'upload_original_invalido' }, 404);
      const { data: employee, error: employeeError } = await service.from('funcionarios').select('id,nome,cpf,empresa_id,company_id,ativo').eq('id', employeeId).eq('ativo', true).maybeSingle();
      if (employeeError || !employee || ![employee.company_id, employee.empresa_id].includes(companyId)) return sendJson(res, { ok: false, error: 'funcionario_fora_da_empresa' }, 409);
      const folder = cycle.tipo === 'adiantamento' ? 'adiantamentos' : 'holerites';
      const path = `${companyId}/${cycle.competencia}/${folder}/contabilidade-${randomUUID()}-${filename}`;
      const { data, error } = await service.storage.from(PAYROLL_BUCKET).createSignedUploadUrl(path);
      if (error || !data?.token) throw error || new Error('signed_upload_failed');
      return sendJson(res, { ok: true, bucket: PAYROLL_BUCKET, path, upload_token: data.token, employee: { id: employee.id, nome: employee.nome } });
    }

    if (action === 'finalize_document') {
      const uploadId = clean(body.upload_id);
      const employeeId = clean(body.funcionario_id);
      const path = clean(body.storage_path);
      const page = Number(body.pagina || 0);
      const sourceHash = clean(body.source_sha256);
      const documentHash = clean(body.document_sha256);
      if (!uploadId || !employeeId || !path || !page || !(await objectExists(service, PAYROLL_BUCKET, path))) return sendJson(res, { ok: false, error: 'documento_nao_encontrado' }, 400);
      const { data: existingMap } = await service.from('contabilidade_folha_documentos').select('*').eq('ciclo_id', cycle.id).eq('portal_upload_id', uploadId).eq('pagina', page).maybeSingle();
      if (existingMap) return sendJson(res, { ok: true, mapping: existingMap, duplicate: true });

      const documentType = cycle.tipo === 'adiantamento' ? 'ADIANTAMENTO' : 'HOLERITE';
      if (sourceHash) {
        const { data: duplicateDoc } = await service.from('payroll_documents').select('id')
          .eq('company_id', companyId)
          .eq('competencia', cycle.competencia)
          .eq('document_type', documentType)
          .eq('source_sha256', sourceHash)
          .eq('source_page_start', page)
          .eq('source_page_end', page)
          .eq('is_current', true)
          .maybeSingle();
        if (duplicateDoc) {
          const { data: mapping, error: mapError } = await service.from('contabilidade_folha_documentos').insert({
            ciclo_id: cycle.id, portal_upload_id: uploadId, empresa_id: companyId, funcionario_id: employeeId,
            payroll_document_id: duplicateDoc.id, pagina: page, tipo_documento: documentType,
            nome_detectado: clean(body.nome_detectado).slice(0,180) || null, cpf_detectado: digits(body.cpf_detectado).slice(0,11) || null,
            classificacao: 'duplicado', status: 'duplicado', detalhes: { source_sha256: sourceHash },
          }).select('*').single();
          if (mapError) throw mapError;
          await service.storage.from(PAYROLL_BUCKET).remove([path]).catch(() => null);
          return sendJson(res, { ok: true, mapping, duplicate: true });
        }
      }

      let version = 1;
      const { data: current, error: currentError } = await service.from('payroll_documents')
        .select('id,document_version').eq('employee_id', employeeId).eq('competencia', cycle.competencia).eq('document_type', documentType).eq('is_current', true).maybeSingle();
      if (currentError) throw currentError;
      if (current) {
        const { count: signedCount, error: signedError } = await service.from('payroll_signatures').select('id', { count: 'exact', head: true }).eq('document_id', current.id);
        if (signedError) throw signedError;
        if (Number(signedCount || 0) > 0) {
          await service.storage.from(PAYROLL_BUCKET).remove([path]).catch(() => null);
          const { data: mapping, error: mapError } = await service.from('contabilidade_folha_documentos').insert({
            ciclo_id: cycle.id, portal_upload_id: uploadId, empresa_id: companyId, funcionario_id: employeeId,
            pagina: page, tipo_documento: documentType, nome_detectado: clean(body.nome_detectado).slice(0,180) || null,
            cpf_detectado: digits(body.cpf_detectado).slice(0,11) || null, classificacao: 'revisao', status: 'documento_anterior_ja_assinado',
            detalhes: { current_document_id: current.id },
          }).select('*').single();
          if (mapError) throw mapError;
          return sendJson(res, { ok: true, mapping, review_required: true });
        }
        version = Number(current.document_version || 1) + 1;
        const { error: replaceError } = await service.from('payroll_documents').update({ is_current: false, status: 'SUBSTITUIDO', updated_at: new Date().toISOString() }).eq('id', current.id);
        if (replaceError) throw replaceError;
      }

      const filename = safeFile(body.arquivo_nome);
      const now = new Date().toISOString();
      const { data: document, error: documentError } = await service.from('payroll_documents').insert({
        company_id: companyId,
        employee_id: employeeId,
        competencia: cycle.competencia,
        document_type: documentType,
        storage_bucket: PAYROLL_BUCKET,
        storage_path: path,
        original_filename: filename,
        mime_type: 'application/pdf',
        file_size: Number(body.tamanho_bytes || 0) || null,
        document_sha256: documentHash || sha256(`${path}:${now}`),
        source_sha256: sourceHash || null,
        source_page_start: page,
        source_page_end: page,
        document_version: version,
        is_current: true,
        net_amount: body.valor_liquido == null ? null : Number(body.valor_liquido),
        extracted_data: {
          origem: 'CONTABILIDADE_PORTAL', ciclo_id: cycle.id, upload_id: uploadId,
          processo_tipo: cycle.tipo, nome_detectado: clean(body.nome_detectado) || null,
          cpf_detectado: digits(body.cpf_detectado) || null, cnpj_detectado: digits(body.cnpj_detectado) || null,
          tipo_detectado: clean(body.tipo_detectado) || null, metodo_vinculo: clean(body.metodo_vinculo) || null,
          pagina: page, competencia_detectada: clean(body.competencia_detectada) || null,
        },
        match_confidence: 100,
        status: 'HOLERITE_PENDENTE',
        confirmed: false,
        created_at: now,
        updated_at: now,
      }).select('id').single();
      if (documentError) {
        await service.storage.from(PAYROLL_BUCKET).remove([path]).catch(() => null);
        throw documentError;
      }

      const { data: mapping, error: mapError } = await service.from('contabilidade_folha_documentos').insert({
        ciclo_id: cycle.id, portal_upload_id: uploadId, empresa_id: companyId, funcionario_id: employeeId,
        payroll_document_id: document.id, pagina: page, tipo_documento: documentType,
        nome_detectado: clean(body.nome_detectado).slice(0,180) || null, cpf_detectado: digits(body.cpf_detectado).slice(0,11) || null,
        classificacao: 'identificado', status: 'aguardando_conferencia_rh',
        detalhes: { source_sha256: sourceHash || null, document_sha256: documentHash || null, metodo_vinculo: clean(body.metodo_vinculo) || null },
      }).select('*').single();
      if (mapError) throw mapError;
      await addEvent(service, {
        company_id: companyId, employee_id: employeeId, event_type: 'DOCUMENTO_RECEBIDO_CONTABILIDADE', actor_type: 'SYSTEM',
        payload: { document_id: document.id, ciclo_id: cycle.id, processo_tipo: cycle.tipo, competencia: cycle.competencia, liberado_funcionario: false },
      });
      return sendJson(res, { ok: true, mapping, payroll_document_id: document.id });
    }

    if (action === 'complete_cycle') {
      const now = new Date().toISOString();
      const { count: identified } = await service.from('contabilidade_folha_documentos').select('id', { count: 'exact', head: true }).eq('ciclo_id', cycle.id).eq('classificacao', 'identificado');
      const { count: review } = await service.from('contabilidade_folha_documentos').select('id', { count: 'exact', head: true }).eq('ciclo_id', cycle.id).in('classificacao', ['revisao','erro']);
      const { data, error } = await service.from('contabilidade_folha_ciclos').update({
        status: 'aguardando_conferencia', enviado_em: now, enviado_por_portal_user_id: user.id,
        observacao: Number(review || 0) > 0 ? `${Number(review || 0)} página(s) precisam de conferência manual.` : null,
        updated_at: now,
      }).eq('id', cycle.id).select('*').single();
      if (error) throw error;
      await service.from('contabilidade_portal_uploads').update({
        processamento_status: Number(review || 0) > 0 ? 'processado_com_pendencias' : 'processado',
        processamento_detalhes: { identificados: Number(identified || 0), revisar: Number(review || 0) },
        updated_at: now,
      }).eq('ciclo_id', cycle.id);
      const emailResult = await sendSubmissionEmail(service, { ...cycle, ...data }, user, Number(identified || 0), Number(review || 0));
      return sendJson(res, {
        ok: true,
        cycle: data,
        identificados: Number(identified || 0),
        revisar: Number(review || 0),
        email_status: emailResult.status,
        email_error: emailResult.error || null,
      });
    }

    return sendJson(res, { ok: false, error: 'action_invalid' }, 400);
  } catch (error: any) {
    console.error('[accounting-payroll-flow]', error);
    return sendJson(res, { ok: false, error: String(error?.message || error), message: String(error?.message || error) }, Number(error?.status || 500));
  }
}
