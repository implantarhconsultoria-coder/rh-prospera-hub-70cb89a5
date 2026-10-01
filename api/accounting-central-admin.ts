import { getServiceClient, readBody, sendJson } from '../src/server/payrollServer.js';
import { buildAccountingThreadKey, fetchResendMessageId, prepareAccountingThread, saveAccountingThread } from '../src/server/accountingEmailThread.js';

const VANESSA_EMAIL = 'dp@aatconsultoria.com.br';
const MARISA_EMAIL = 'marisa@aatconsultoria.com.br';
const ADM_EMAIL = 'adm.matriz@topac.com.br';
const ROBSON_EMAIL = 'robson@topac.com.br';
const ANTONIO_CARLOS_PRAIA_EMAIL = 'antonio.carlos@topac.com.br';

const getHeader = (req:any, name:string) => typeof req?.headers?.get === 'function' ? req.headers.get(name) : req?.headers?.[name] || req?.headers?.[name.toLowerCase()] || '';
const getBearer = (req:any) => String(getHeader(req, 'authorization') || '').match(/^Bearer\s+(.+)$/i)?.[1] || '';
const clean = (value:unknown) => String(value || '').trim();
const htmlEscape = (value:unknown) => String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
const unique = (values:string[]) => Array.from(new Set(values.map((v) => v.trim().toLowerCase()).filter(Boolean)));

const getPlatformFrom = () => {
  const configured = clean(process.env.EMAIL_FROM || process.env.MAIL_FROM);
  if (!configured || /@resend\.dev/i.test(configured) || /onboarding@/i.test(configured)) {
    return 'TOPAC RH PRO <centralrh@topacrh.pro>';
  }
  return configured;
};

const validateAdmin = async (req:any, service:any) => {
  const token = getBearer(req);
  if (!token) throw Object.assign(new Error('sessao_invalida'), { status:401 });
  const { data:{ user }, error } = await service.auth.getUser(token);
  if (error || !user) throw Object.assign(new Error('sessao_invalida'), { status:401 });
  const { data: roles, error: roleError } = await service.from('user_roles').select('role').eq('user_id', user.id);
  if (roleError) throw roleError;
  if (!(roles || []).some((r:any) => ['admin','diretor_geral'].includes(String(r.role)))) throw Object.assign(new Error('sem_permissao'), { status:403 });
  return user;
};

const counterpartFor = (email:string) => {
  const normalized = clean(email).toLowerCase();
  if (normalized === VANESSA_EMAIL) return MARISA_EMAIL;
  if (normalized === MARISA_EMAIL) return VANESSA_EMAIL;
  return '';
};

const retryEmail = async (service:any, uploadId:string) => {
  const { data: upload, error } = await service.from('contabilidade_portal_uploads').select('*').eq('id', uploadId).maybeSingle();
  if (error || !upload) throw Object.assign(new Error('documento_nao_encontrado'), { status:404 });

  const [{ data:user }, { data:company }] = await Promise.all([
    service.from('contabilidade_portal_usuarios').select('id,nome,email,portal').eq('id', upload.portal_user_id).maybeSingle(),
    service.from('empresas').select('id,nome,codigo').eq('id', upload.empresa_id).maybeSingle(),
  ]);
  if (!user || !company) throw Object.assign(new Error('dados_incompletos'), { status:400 });

  const counterpart = user.portal === 'principal' ? counterpartFor(String(user.email || '')) : '';
  const to = [ADM_EMAIL];
  const isPraiaGrande = /praia/i.test(String(company.nome || company.codigo || ''));
  const isFolhaFinal = upload.tipo_documento === 'folha_processada';
  const cc = unique([
    ROBSON_EMAIL,
    ...(counterpart ? [counterpart] : []),
    ...(isPraiaGrande && isFolhaFinal ? [ANTONIO_CARLOS_PRAIA_EMAIL] : []),
  ]);
  const resendKey = clean(process.env.RESEND_API_KEY);
  const from = getPlatformFrom();
  const replyTo = clean(user.email || process.env.EMAIL_REPLY_TO || ADM_EMAIL);
  const createdAt = new Date(upload.created_at || Date.now()).toLocaleString('pt-BR', { timeZone:'America/Sao_Paulo' });
  const typeLabels:Record<string,string> = { recibos_holerites:'Recibos / Holerites', folha_processada:'Folha processada', contrato:'Contrato de trabalho', rescisao:'Documentos de rescisão', ferias:'Documentos de férias', retorno_folha:'Retorno da contabilidade', outro:'Outro documento' };
  const typeLabel = typeLabels[upload.tipo_documento] || upload.tipo_documento || 'Documento';
  const requestedSubject = `[TOPAC RH PRO] Documento recebido da Contabilidade · ${company.nome}${upload.competencia ? ` · Competência ${upload.competencia}` : ''}`;
  const threadKey = upload.competencia ? buildAccountingThreadKey(company.id, upload.competencia) : '';
  const thread = threadKey
    ? await prepareAccountingThread(service, { threadKey, subject: requestedSubject })
    : { subject: requestedSubject, headers: {}, current: null as any };
  const subject = thread.subject;
  const text = [
    'Prezados,','',
    'Fica formalizado o recebimento do documento enviado diretamente pelo Portal da Contabilidade do TOPAC RH PRO.','',
    `Empresa: ${company.nome}`, `Tipo: ${typeLabel}`,
    upload.competencia ? `Competência: ${upload.competencia}` : '',
    upload.funcionario_nome ? `Funcionário: ${upload.funcionario_nome}` : '',
    `Arquivo: ${upload.arquivo_nome}`,
    `Enviado por: ${user.nome}${user.email ? ` <${user.email}>` : ''}`,
    `Registro na plataforma: ${createdAt}`,
    upload.observacao ? `Observação: ${upload.observacao}` : '',
    `ID da operação: ${upload.id}`,'',
    'O arquivo já está armazenado na Central da Contabilidade. Este e-mail formaliza o registro da operação.','',
    'TOPAC RH PRO',
  ].filter(Boolean).join('\n');
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#111827;line-height:1.55;max-width:680px"><h2>Documento recebido da Contabilidade</h2><p>Fica formalizado o registro realizado no Portal da Contabilidade do TOPAC RH PRO.</p><table style="width:100%;border-collapse:collapse"><tr><td style="padding:8px;border-bottom:1px solid #e5e7eb"><b>Empresa</b></td><td style="padding:8px;border-bottom:1px solid #e5e7eb">${htmlEscape(company.nome)}</td></tr><tr><td style="padding:8px;border-bottom:1px solid #e5e7eb"><b>Tipo</b></td><td style="padding:8px;border-bottom:1px solid #e5e7eb">${htmlEscape(typeLabel)}</td></tr>${upload.competencia ? `<tr><td style="padding:8px;border-bottom:1px solid #e5e7eb"><b>Competência</b></td><td style="padding:8px;border-bottom:1px solid #e5e7eb">${htmlEscape(upload.competencia)}</td></tr>` : ''}${upload.funcionario_nome ? `<tr><td style="padding:8px;border-bottom:1px solid #e5e7eb"><b>Funcionário</b></td><td style="padding:8px;border-bottom:1px solid #e5e7eb">${htmlEscape(upload.funcionario_nome)}</td></tr>` : ''}<tr><td style="padding:8px;border-bottom:1px solid #e5e7eb"><b>Arquivo</b></td><td style="padding:8px;border-bottom:1px solid #e5e7eb">${htmlEscape(upload.arquivo_nome)}</td></tr><tr><td style="padding:8px;border-bottom:1px solid #e5e7eb"><b>Enviado por</b></td><td style="padding:8px;border-bottom:1px solid #e5e7eb">${htmlEscape(user.nome)}${user.email ? ` &lt;${htmlEscape(user.email)}&gt;` : ''}</td></tr><tr><td style="padding:8px"><b>Registrado em</b></td><td style="padding:8px">${htmlEscape(createdAt)}</td></tr></table><p><b>O documento já está disponível na Central da Contabilidade.</b> Este e-mail é a formalização do registro.</p></div>`;

  let emailStatus = 'erro_configuracao_email';
  let detail = '';
  if (resendKey) {
    try {
      const response = await fetch('https://api.resend.com/emails', { method:'POST', headers:{ Authorization:`Bearer ${resendKey}`, 'Content-Type':'application/json' }, body:JSON.stringify({ from, to, cc, reply_to:replyTo, subject, text, html, ...(Object.keys(thread.headers).length ? { headers: thread.headers } : {}) }) });
      detail = await response.text().catch(() => '');
      emailStatus = response.ok ? 'enviado' : 'erro_envio_email';
      if (response.ok && threadKey) {
        const provider = detail ? JSON.parse(detail) : {};
        const providerEmailId = provider?.id || null;
        const messageId = await fetchResendMessageId(resendKey, providerEmailId);
        await saveAccountingThread(service, {
          threadKey,
          empresaId: company.id,
          competencia: upload.competencia,
          subject,
          providerEmailId,
          messageId,
          close: upload.tipo_documento === 'folha_processada',
        });
      }
    } catch (e:any) { detail = String(e?.message || e); emailStatus = 'erro_envio_email'; }
  }

  const formalizedAt = emailStatus === 'enviado' ? new Date().toISOString() : null;
  await service.from('contabilidade_portal_uploads').update({ formalizacao_email_status:emailStatus, formalizacao_email_em:formalizedAt, formalizacao_destinos:unique([...to,...cc]), updated_at:new Date().toISOString() }).eq('id', upload.id);

  try {
    const { error: logError } = await service.from('email_envios_log').insert({
      user_id:null, usuario_nome:user.nome, email_corporativo_usado:user.email || null, email_remetente:from, reply_to:replyTo,
      provider:'resend', modulo_origem:'central_contabilidade', documento_id:null, documento_nome:upload.arquivo_nome,
      destinatarios:to.join(', '), cc:cc.join(', '), assunto:subject, status:emailStatus === 'enviado' ? 'enviado' : 'erro', erro:emailStatus === 'enviado' ? null : detail.slice(0,1000), enviado_em:new Date().toISOString(),
    });
    if (logError) console.warn('[accounting-central-admin] email log failed', logError);
  } catch (logError) {
    console.warn('[accounting-central-admin] email log failed', logError);
  }

  return { email_status:emailStatus, formalizado_em:formalizedAt, to, cc, detail:emailStatus === 'enviado' ? undefined : detail.slice(0,500) };
};

export default async function handler(req:any, res?:any) {
  if (String(req?.method || 'GET').toUpperCase() !== 'POST') return sendJson(res, { ok:false, error:'method_not_allowed' }, 405);
  try {
    const service = getServiceClient();
    await validateAdmin(req, service);
    const body = readBody(req);
    const action = clean(body.action);
    const uploadId = clean(body.upload_id);
    if (!uploadId) return sendJson(res, { ok:false, error:'upload_id_obrigatorio' }, 400);

    if (action === 'view_upload') {
      const { data:upload, error } = await service.from('contabilidade_portal_uploads').select('id,storage_bucket,storage_path,arquivo_nome').eq('id', uploadId).maybeSingle();
      if (error || !upload) return sendJson(res, { ok:false, error:'documento_nao_encontrado' }, 404);
      const { data:signed, error:signedError } = await service.storage.from(upload.storage_bucket).createSignedUrl(upload.storage_path, 600);
      if (signedError || !signed?.signedUrl) throw signedError || new Error('signed_url_failed');
      return sendJson(res, { ok:true, url:signed.signedUrl, arquivo_nome:upload.arquivo_nome, expires_in:600 });
    }

    if (action === 'retry_email') {
      const result = await retryEmail(service, uploadId);
      return sendJson(res, { ok:true, ...result });
    }

    if (action === 'reply_uploads_bulk') {
      const responseText = clean(body.text).slice(0, 5000);
      const uploadIds = Array.from(new Set((Array.isArray(body.upload_ids) ? body.upload_ids : []).map((id:any) => clean(id)).filter(Boolean))) as string[];
      if (!responseText) return sendJson(res, { ok:false, error:'resposta_obrigatoria' }, 400);
      if (!uploadIds.length) return sendJson(res, { ok:false, error:'documentos_obrigatorios' }, 400);

      const { data:rows, error:rowsError } = await service.from('contabilidade_portal_uploads').select('*').in('id', uploadIds);
      if (rowsError) throw rowsError;
      if (!rows?.length) return sendJson(res, { ok:false, error:'documentos_nao_encontrados' }, 404);

      const portalUserIds = Array.from(new Set(rows.map((r:any) => r.portal_user_id).filter(Boolean)));
      const companyIds = Array.from(new Set(rows.map((r:any) => r.empresa_id).filter(Boolean)));
      const [{ data:portalUsers }, { data:companies }] = await Promise.all([
        service.from('contabilidade_portal_usuarios').select('id,nome,email,portal').in('id', portalUserIds),
        service.from('empresas').select('id,nome,codigo').in('id', companyIds),
      ]);
      const userMap = new Map((portalUsers || []).map((u:any) => [u.id, u]));
      const companyMap = new Map((companies || []).map((c:any) => [c.id, c]));
      const resendKey = clean(process.env.RESEND_API_KEY);
      if (!resendKey) return sendJson(res, { ok:false, error:'email_nao_configurado' }, 500);
      const from = getPlatformFrom();
      const adminUser = await validateAdmin(req, service);

      // Agrupa por remetente da Contabilidade + empresa + competência.
      // Assim um clique pode responder muitos documentos sem misturar destinatários ou competências.
      const groups = new Map<string, any[]>();
      for (const row of rows) {
        const key = [row.portal_user_id, row.empresa_id, row.competencia || ''].join('|');
        groups.set(key, [...(groups.get(key) || []), row]);
      }

      let sent = 0;
      const failures:any[] = [];
      for (const groupRows of groups.values()) {
        const first:any = groupRows[0];
        const portalUser:any = userMap.get(first.portal_user_id);
        const company:any = companyMap.get(first.empresa_id);
        if (!portalUser?.email || !company) {
          failures.push({ ids:groupRows.map((r:any)=>r.id), error:'destinatario_nao_encontrado' });
          continue;
        }

        const to = unique([String(portalUser.email)]);
        const counterpart = portalUser.portal === 'principal' ? counterpartFor(String(portalUser.email || '')) : '';
        const cc = unique([ROBSON_EMAIL, ADM_EMAIL, ...(counterpart ? [counterpart] : [])]).filter(email => !to.includes(email));
        const requestedSubject = `[TOPAC RH PRO] Retorno do RH · ${company.nome}${first.competencia ? ` · Competência ${first.competencia}` : ''}`;
        const threadKey = first.competencia ? buildAccountingThreadKey(company.id, first.competencia) : '';
        const thread = threadKey
          ? await prepareAccountingThread(service, { threadKey, subject: requestedSubject })
          : { subject: requestedSubject, headers: {}, current: null as any };
        const subject = thread.subject;
        const files = groupRows.map((r:any) => `- ${r.arquivo_nome}`).join('\n');

        const text = [
          'Prezados,','',
          responseText,'',
          'Documentos relacionados:',
          files,'',
          'Atenciosamente,',
          'RH TOPAC',
        ].join('\n');
        const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#111827;line-height:1.6;max-width:720px"><p>${htmlEscape(responseText).replace(/\n/g,'<br/>')}</p><p><b>Documentos relacionados:</b></p><ul>${groupRows.map((r:any)=>`<li>${htmlEscape(r.arquivo_nome)}</li>`).join('')}</ul></div>`;

        try {
          const response = await fetch('https://api.resend.com/emails', {
            method:'POST',
            headers:{ Authorization:`Bearer ${resendKey}`, 'Content-Type':'application/json' },
            body:JSON.stringify({ from, to, cc, reply_to:ADM_EMAIL, subject, text, html, ...(Object.keys(thread.headers).length ? { headers:thread.headers } : {}) }),
          });
          const detail = await response.text().catch(() => '');
          if (!response.ok) throw new Error(detail.slice(0,500) || 'erro_envio_email');

          const provider = detail ? JSON.parse(detail) : {};
          const providerEmailId = provider?.id || null;
          if (threadKey) {
            const messageId = await fetchResendMessageId(resendKey, providerEmailId);
            await saveAccountingThread(service, { threadKey, empresaId:company.id, competencia:first.competencia, subject, providerEmailId, messageId, close:false });
          }

          const now = new Date().toISOString();
          const ids = groupRows.map((r:any) => r.id);
          await service.from('contabilidade_portal_uploads').update({
            rh_resposta:responseText,
            rh_resposta_em:now,
            rh_resposta_por:adminUser.id,
            updated_at:now,
          }).in('id', ids);

          await service.from('email_envios_log').insert({
            user_id:adminUser.id,
            usuario_nome:adminUser.email || 'Administrador',
            email_corporativo_usado:ADM_EMAIL,
            email_remetente:from,
            reply_to:ADM_EMAIL,
            provider:'resend',
            modulo_origem:'central_contabilidade_retorno_massa',
            documento_id:null,
            documento_nome:`${ids.length} documentos`,
            destinatarios:to.join(', '),
            cc:cc.join(', '),
            assunto:subject,
            status:'enviado',
            erro:null,
            enviado_em:now,
          });
          sent += ids.length;
        } catch (e:any) {
          failures.push({ ids:groupRows.map((r:any)=>r.id), error:String(e?.message || e) });
        }
      }

      if (!sent && failures.length) return sendJson(res, { ok:false, error:'nenhum_envio_concluido', failures }, 502);
      return sendJson(res, { ok:true, sent, failures });
    }

    if (action === 'reply_upload') {
      const responseText = clean(body.text).slice(0, 5000);
      if (!responseText) return sendJson(res, { ok:false, error:'resposta_obrigatoria' }, 400);

      const { data:upload, error:uploadError } = await service.from('contabilidade_portal_uploads').select('*').eq('id', uploadId).maybeSingle();
      if (uploadError || !upload) return sendJson(res, { ok:false, error:'documento_nao_encontrado' }, 404);

      const [{ data:portalUser }, { data:company }] = await Promise.all([
        service.from('contabilidade_portal_usuarios').select('id,nome,email,portal').eq('id', upload.portal_user_id).maybeSingle(),
        service.from('empresas').select('id,nome,codigo').eq('id', upload.empresa_id).maybeSingle(),
      ]);
      if (!portalUser?.email || !company) return sendJson(res, { ok:false, error:'destinatario_nao_encontrado' }, 400);

      const resendKey = clean(process.env.RESEND_API_KEY);
      if (!resendKey) return sendJson(res, { ok:false, error:'email_nao_configurado' }, 500);

      const from = getPlatformFrom();
      const to = unique([String(portalUser.email)]);
      const counterpart = portalUser.portal === 'principal' ? counterpartFor(String(portalUser.email || '')) : '';
      const cc = unique([ROBSON_EMAIL, ADM_EMAIL, ...(counterpart ? [counterpart] : [])]).filter(email => !to.includes(email));

      const requestedSubject = `[TOPAC RH PRO] Retorno do RH · ${company.nome}${upload.competencia ? ` · Competência ${upload.competencia}` : ''}`;
      const threadKey = upload.competencia ? buildAccountingThreadKey(company.id, upload.competencia) : '';
      const thread = threadKey
        ? await prepareAccountingThread(service, { threadKey, subject: requestedSubject })
        : { subject: requestedSubject, headers: {}, current: null as any };
      const subject = thread.subject;

      const text = [
        'Prezados,','',
        `Retorno do RH referente ao documento: ${upload.arquivo_nome}`,
        `Empresa: ${company.nome}`,
        upload.competencia ? `Competência: ${upload.competencia}` : '',
        '',
        responseText,
        '',
        'Atenciosamente,',
        'TOPAC RH PRO',
      ].filter(Boolean).join('\n');
      const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#111827;line-height:1.6;max-width:720px"><h2>Retorno do RH</h2><p><b>Documento:</b> ${htmlEscape(upload.arquivo_nome)}</p><p><b>Empresa:</b> ${htmlEscape(company.nome)}</p>${upload.competencia ? `<p><b>Competência:</b> ${htmlEscape(upload.competencia)}</p>` : ''}<hr style="border:0;border-top:1px solid #e5e7eb;margin:16px 0"/><p>${htmlEscape(responseText).replace(/\n/g,'<br/>')}</p></div>`;

      const response = await fetch('https://api.resend.com/emails', {
        method:'POST',
        headers:{ Authorization:`Bearer ${resendKey}`, 'Content-Type':'application/json' },
        body:JSON.stringify({ from, to, cc, reply_to:ADM_EMAIL, subject, text, html, ...(Object.keys(thread.headers).length ? { headers:thread.headers } : {}) }),
      });
      const detail = await response.text().catch(() => '');
      if (!response.ok) return sendJson(res, { ok:false, error:'erro_envio_email', detail:detail.slice(0,500) }, 502);

      const provider = detail ? JSON.parse(detail) : {};
      const providerEmailId = provider?.id || null;
      if (threadKey) {
        const messageId = await fetchResendMessageId(resendKey, providerEmailId);
        await saveAccountingThread(service, {
          threadKey,
          empresaId:company.id,
          competencia:upload.competencia,
          subject,
          providerEmailId,
          messageId,
          close:false,
        });
      }

      const now = new Date().toISOString();
      const { user:adminUser } = await validateAdmin(req, service).then((u:any) => ({ user:u }));
      await service.from('contabilidade_portal_uploads').update({
        rh_resposta: responseText,
        rh_resposta_em: now,
        rh_resposta_por: adminUser.id,
        updated_at: now,
      }).eq('id', upload.id);

      await service.from('email_envios_log').insert({
        user_id:adminUser.id,
        usuario_nome:adminUser.email || 'Administrador',
        email_corporativo_usado:ADM_EMAIL,
        email_remetente:from,
        reply_to:ADM_EMAIL,
        provider:'resend',
        modulo_origem:'central_contabilidade_retorno',
        documento_id:null,
        documento_nome:upload.arquivo_nome,
        destinatarios:to.join(', '),
        cc:cc.join(', '),
        assunto:subject,
        status:'enviado',
        erro:null,
        enviado_em:now,
      });

      return sendJson(res, { ok:true, enviado_em:now, to, cc });
    }

    return sendJson(res, { ok:false, error:'action_invalid' }, 400);
  } catch (e:any) {
    console.error('[accounting-central-admin]', e);
    return sendJson(res, { ok:false, error:String(e?.message || e) }, Number(e?.status || 500));
  }
}
