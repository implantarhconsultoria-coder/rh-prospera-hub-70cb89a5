import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { getServiceClient, readBody, requireAdmin, sendJson } from '../src/server/payrollServer.js';
import { buildAccountingThreadKey, fetchResendMessageId, prepareAccountingThread, saveAccountingThread } from '../src/server/accountingEmailThread.js';

const INBOX_BUCKET = 'contabilidade-inbox';
const clean = (value: unknown) => String(value ?? '').trim();
const num = (value: unknown) => Number(value || 0) || 0;
const money = (value: unknown) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(num(value));
const competenceLabel = (value: string) => {
  const [year, month] = value.split('-');
  return year && month ? `${month}/${year}` : value;
};
const safePdfText = (value: unknown) => String(value ?? '')
  .replace(/[\u2018\u2019]/g, "'")
  .replace(/[\u201C\u201D]/g, '"')
  .replace(/[\u2013\u2014]/g, '-')
  .replace(/[^\x20-\x7E\xA0-\xFF]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();
const shorten = (value: unknown, max: number) => {
  const text = safePdfText(value);
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 3))}...`;
};

async function getOrCreatePaymentCycle(service: any, companyId: string, competencia: string) {
  const { data: existing, error: findError } = await service.from('contabilidade_folha_ciclos')
    .select('*')
    .eq('portal', 'principal')
    .eq('empresa_id', companyId)
    .eq('competencia', competencia)
    .eq('tipo', 'pagamento')
    .maybeSingle();
  if (findError) throw findError;
  if (existing) return existing;

  const { data, error } = await service.from('contabilidade_folha_ciclos').insert({
    portal: 'principal',
    empresa_id: companyId,
    competencia,
    tipo: 'pagamento',
    status: 'aguardando_apontamento',
    ativo: true,
  }).select('*').single();
  if (error) throw error;
  return data;
}

async function accountingRecipients(service: any, companyId: string): Promise<{ owner:any; emails:string[]; cc:string[] }> {
  const [{ data: access, error: accessError }, { data: company, error: companyError }] = await Promise.all([
    service.from('contabilidade_portal_acesso_empresas').select('portal_user_id').eq('empresa_id', companyId),
    service.from('empresas').select('id,nome,codigo').eq('id', companyId).maybeSingle(),
  ]);
  if (accessError) throw accessError;
  if (companyError || !company) throw companyError || new Error('empresa_nao_encontrada');

  const ids = Array.from(new Set<string>((access || []).map((row: any) => clean(row.portal_user_id)).filter(Boolean) as string[]));
  if (!ids.length) throw new Error('contabilidade_sem_acesso_empresa');

  const { data: users, error: usersError } = await service.from('contabilidade_portal_usuarios')
    .select('id,nome,email,portal,ativo')
    .in('id', ids)
    .eq('ativo', true);
  if (usersError) throw usersError;
  const rows = users || [];
  if (!rows.length) throw new Error('contabilidade_sem_usuario_ativo');

  const isGoiania = /goi[âa]nia|gyn/i.test(clean(company.nome || company.codigo));
  const wantedTo = isGoiania
    ? ['requisicao@incocontabilidade.com.br']
    : ['marisa@aatconsultoria.com.br', 'dp@aatconsultoria.com.br'];
  const emails = wantedTo.filter((email) => rows.some((row: any) => clean(row.email).toLowerCase() === email));
  if (!emails.length) throw new Error('contabilidade_sem_destinatario_oficial');

  const owner = rows.find((row: any) => clean(row.email).toLowerCase() === emails[0]) || rows[0];
  const cc = Array.from(new Set([
    'adm.matriz@topac.com.br',
    'robson@topac.com.br',
    ...(isGoiania ? ['adm.gyn@topac.com.br'] : []),
  ])).filter((email) => !emails.includes(email));

  return { owner, emails, cc };
}

async function buildClosingPdf(service: any, companyId: string, competencia: string) {
  const [{ data: company, error: companyError }, { data: employees, error: employeeError }, { data: entries, error: entryError }] = await Promise.all([
    service.from('empresas').select('id,nome,cnpj,codigo').eq('id', companyId).maybeSingle(),
    service.from('funcionarios')
      .select('id,nome,cargo,status,ativo,categoria')
      .or(`company_id.eq.${companyId},empresa_id.eq.${companyId}`)
      .eq('ativo', true)
      .order('nome'),
    service.from('lancamentos_mensais')
      .select('funcionario_id,faltas_dias,faltas_datas,atrasos,he50,he60,he100,comissao_base,adicionais,descontos_diversos,adiantamento,observacoes')
      .eq('company_id', companyId)
      .eq('competencia', competencia)
      .is('apagado_em', null),
  ]);
  if (companyError || !company) throw companyError || new Error('empresa_nao_encontrada');
  if (employeeError) throw employeeError;
  if (entryError) throw entryError;

  const entryMap = new Map((entries || []).map((row: any) => [String(row.funcionario_id), row]));
  const rows = (employees || [])
    .filter((employee: any) => String(employee.status || '').toLowerCase() === 'ativo')
    .map((employee: any) => ({ employee, entry: entryMap.get(String(employee.id)) || {} }));

  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageWidth = 841.89;
  const pageHeight = 595.28;
  const margin = 26;
  const headerHeight = 70;
  const rowHeight = 22;
  const columns = [
    { label: 'Funcionario', width: 150, max: 25 },
    { label: 'Faltas', width: 40, max: 7 },
    { label: 'Atrasos', width: 48, max: 8 },
    { label: 'HE 50', width: 44, max: 7 },
    { label: 'HE 60', width: 44, max: 7 },
    { label: 'HE 100', width: 44, max: 7 },
    { label: 'Comissao base', width: 75, max: 12 },
    { label: 'Adicional', width: 62, max: 11 },
    { label: 'Desc. extra', width: 62, max: 11 },
    { label: 'Adiant.', width: 62, max: 11 },
    { label: 'Observacoes', width: 190, max: 34 },
  ];

  const drawHeader = (page: any, pageNo: number) => {
    page.drawText(safePdfText(company.nome), { x: margin, y: pageHeight - 30, size: 15, font: bold, color: rgb(0.08, 0.08, 0.1) });
    page.drawText(`APONTAMENTO PARA CONTABILIDADE - PAGAMENTO`, { x: margin, y: pageHeight - 48, size: 10.5, font: bold, color: rgb(0.16, 0.16, 0.2) });
    page.drawText(`CNPJ: ${safePdfText(company.cnpj || '-')}   Competencia: ${competenceLabel(competencia)}   Pagina: ${pageNo}`, { x: margin, y: pageHeight - 63, size: 8, font: regular, color: rgb(0.35, 0.35, 0.4) });

    let x = margin;
    const y = pageHeight - headerHeight - 18;
    page.drawRectangle({ x: margin, y: y - 3, width: pageWidth - margin * 2, height: 18, color: rgb(0.93, 0.93, 0.95) });
    for (const column of columns) {
      page.drawText(column.label, { x: x + 2, y: y + 2, size: 6.6, font: bold, color: rgb(0.12, 0.12, 0.15) });
      x += column.width;
    }
    return y - 10;
  };

  const maxRowsPerPage = Math.max(1, Math.floor((pageHeight - headerHeight - 70) / rowHeight));
  const pageCount = Math.max(1, Math.ceil(rows.length / maxRowsPerPage));
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
    const page = pdf.addPage([pageWidth, pageHeight]);
    let y = drawHeader(page, pageIndex + 1);
    const pageRows = rows.slice(pageIndex * maxRowsPerPage, (pageIndex + 1) * maxRowsPerPage);

    for (let index = 0; index < pageRows.length; index++) {
      const { employee, entry } = pageRows[index];
      if (index % 2 === 1) page.drawRectangle({ x: margin, y: y - 9, width: pageWidth - margin * 2, height: rowHeight, color: rgb(0.985, 0.985, 0.99) });
      const values = [
        shorten(employee.nome, 25),
        shorten(num(entry.faltas_dias).toLocaleString('pt-BR', { maximumFractionDigits: 1 }), 7),
        shorten(`${num(entry.atrasos).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}h`, 8),
        shorten(`${num(entry.he50).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}h`, 7),
        shorten(`${num(entry.he60).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}h`, 7),
        shorten(`${num(entry.he100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}h`, 7),
        shorten(money(entry.comissao_base), 12),
        shorten(money(entry.adicionais), 11),
        shorten(money(entry.descontos_diversos), 11),
        shorten(money(entry.adiantamento), 11),
        shorten(entry.observacoes || '', 34),
      ];
      let x = margin;
      values.forEach((value, col) => {
        page.drawText(value, { x: x + 2, y, size: 6.5, font: regular, color: rgb(0.12, 0.12, 0.15) });
        x += columns[col].width;
      });
      page.drawLine({ start: { x: margin, y: y - 5 }, end: { x: pageWidth - margin, y: y - 5 }, thickness: 0.25, color: rgb(0.85, 0.85, 0.88) });
      y -= rowHeight;
    }
  }

  const bytes = await pdf.save();
  const filename = `apontamento_pagamento_${safePdfText(company.nome).replace(/[^A-Za-z0-9]+/g, '_').toLowerCase()}_${competencia}.pdf`;
  return { bytes, filename, company };
}

async function sendAccountingEmail(service: any, input: { emails: string[]; cc: string[]; empresaId: string; companyName: string; competencia: string; filename: string; bytes: Uint8Array }) {
  const key = clean(process.env.RESEND_API_KEY);
  if (!key || !input.emails.length) return { status: 'pendente', error: key ? 'destinatario_ausente' : 'RESEND_API_KEY ausente' };
  const configured = clean(process.env.EMAIL_FROM || process.env.MAIL_FROM);
  const from = configured && !/@resend\.dev/i.test(configured) ? configured : 'TOPAC RH PRO <no-reply@topacrh.pro>';
  const threadKey = buildAccountingThreadKey(input.empresaId, input.competencia);
  const baseSubject = `[TOPAC RH PRO] FECHAMENTO DA FOLHA - ${input.companyName} - ${competenceLabel(input.competencia)}`;
  const thread = await prepareAccountingThread(service, { threadKey, subject: baseSubject });
  const text = [
    'Prezadas,', '',
    'Fica formalizado o início do processo de fechamento da folha desta competência.', '',
    `Empresa: ${input.companyName}`,
    `Competência: ${competenceLabel(input.competencia)}`, '',
    'O PDF do apontamento segue anexo e o processo já está liberado no Portal da Contabilidade.', '',
    'A partir deste e-mail, toda pendência, correção, confirmação e o retorno da folha fechada deverão permanecer nesta mesma conversa.', '',
    'Após receber, confirmem o recebimento no portal e sigam com o processamento.', '',
    'TOPAC RH PRO',
  ].join('\n');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: input.emails,
      cc: Array.from(new Set([...input.cc, 'adm.matriz@topac.com.br'])).filter((email) => !input.emails.includes(email)),
      reply_to: 'adm.matriz@topac.com.br',
      subject: thread.subject,
      text,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.55;color:#111827"><p>Prezadas,</p><p><strong>Fica formalizado o início do processo de fechamento da folha desta competência.</strong></p><p><strong>Empresa:</strong> ${safePdfText(input.companyName)}<br><strong>Competência:</strong> ${competenceLabel(input.competencia)}</p><p>O PDF do apontamento segue anexo e o processo já está liberado no Portal da Contabilidade.</p><p>A partir deste e-mail, toda pendência, correção, confirmação e o retorno da folha fechada deverão permanecer nesta mesma conversa.</p><p>TOPAC RH PRO</p></div>`,
      ...(Object.keys(thread.headers).length ? { headers: thread.headers } : {}),
      attachments: [{ filename: input.filename, content: Buffer.from(input.bytes).toString('base64') }],
    }),
  });
  const detail = await response.text().catch(() => '');
  if (!response.ok) return { status: 'erro', error: detail.slice(0, 800) || `HTTP ${response.status}` };
  const provider = detail ? JSON.parse(detail) : {};
  const providerEmailId = provider?.id || null;
  const messageId = await fetchResendMessageId(key, providerEmailId);
  await saveAccountingThread(service, {
    threadKey,
    empresaId: input.empresaId,
    competencia: input.competencia,
    subject: thread.subject,
    providerEmailId,
    messageId,
  });
  return { status: 'enviado', error: null, thread_key: threadKey, provider_id: providerEmailId, message_id: messageId || null };
}

export default async function handler(req: any, res?: any) {
  if (String(req?.method || 'POST').toUpperCase() !== 'POST') return sendJson(res, { ok: false, error: 'method_not_allowed' }, 405);
  try {
    const { user } = await requireAdmin(req);
    const service = getServiceClient();
    const body = readBody(req);
    const action = clean(body.action || 'finalize');
    if (action !== 'finalize') return sendJson(res, { ok: false, error: 'action_invalid' }, 400);

    const companyId = clean(body.empresa_id);
    const competencia = clean(body.competencia);
    if (!companyId || !/^\d{4}-\d{2}$/.test(competencia)) return sendJson(res, { ok: false, error: 'empresa_competencia_invalidas' }, 400);

    const { data: fechamento, error: fechamentoError } = await service.from('fechamentos_filial')
      .select('id,status,fechado_em')
      .eq('company_id', companyId)
      .eq('competencia', competencia)
      .maybeSingle();
    if (fechamentoError) throw fechamentoError;
    if (!fechamento || fechamento.status !== 'fechado') {
      return sendJson(res, { ok: false, error: 'fechamento_nao_concluido', message: 'O fechamento ainda não foi confirmado no banco.' }, 409);
    }

    const cycle = await getOrCreatePaymentCycle(service, companyId, competencia);
    const { owner, emails, cc } = await accountingRecipients(service, companyId);

    // Idempotência: se este mesmo fechamento já gerou o apontamento, não cria
    // outro arquivo, não duplica e-mail e não volta o ciclo para trás.
    const { data: existingGenerated, error: existingGeneratedError } = await service
      .from('contabilidade_portal_uploads')
      .select('*')
      .eq('ciclo_id', cycle.id)
      .eq('origem_tipo', 'rh_apontamento')
      .eq('origem_id', fechamento.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingGeneratedError) throw existingGeneratedError;

    if (existingGenerated) {
      let stableCycle = cycle;
      if (!cycle.apontamento_liberado_em) {
        const stableNow = new Date().toISOString();
        const { data: repaired, error: repairError } = await service.from('contabilidade_folha_ciclos').update({
          apontamento_liberado_em: stableNow,
          apontamento_liberado_por: user.id,
          status: cycle.contabilidade_recebeu_em ? 'recebido' : 'liberado',
          updated_at: stableNow,
        }).eq('id', cycle.id).select('*').single();
        if (repairError) throw repairError;
        stableCycle = repaired;
      }
      return sendJson(res, {
        ok: true,
        cycle: stableCycle,
        upload_id: existingGenerated.id,
        arquivo_nome: existingGenerated.arquivo_nome,
        email_status: existingGenerated.formalizacao_email_status || 'pendente',
        email_error: null,
        already_finalized: true,
      });
    }

    const { bytes, filename, company } = await buildClosingPdf(service, companyId, competencia);

    const { data: prior, error: priorError } = await service.from('contabilidade_portal_uploads')
      .select('id,storage_bucket,storage_path')
      .eq('ciclo_id', cycle.id)
      .eq('origem_tipo', 'rh_apontamento');
    if (priorError) throw priorError;
    for (const row of prior || []) {
      if (row.storage_path) await service.storage.from(row.storage_bucket || INBOX_BUCKET).remove([row.storage_path]).catch(() => null);
    }
    if ((prior || []).length) {
      const ids = (prior || []).map((row: any) => row.id);
      const { error: deleteError } = await service.from('contabilidade_portal_uploads').delete().in('id', ids);
      if (deleteError) throw deleteError;
    }

    const storagePath = `apontamentos-rh/principal/${competencia}/${companyId}/${Date.now()}-${filename}`;
    const { error: storageError } = await service.storage.from(INBOX_BUCKET).upload(storagePath, bytes, { contentType: 'application/pdf', upsert: false });
    if (storageError) throw storageError;

    const now = new Date().toISOString();

    // 1) Primeiro conclui a operação da plataforma.
    // E-mail nunca pode ser pré-requisito para liberar a Contabilidade.
    const { data: upload, error: uploadError } = await service.from('contabilidade_portal_uploads').insert({
      portal_user_id: owner.id,
      empresa_id: companyId,
      ciclo_id: cycle.id,
      processo_tipo: 'pagamento',
      tipo_documento: 'apontamento_pagamento',
      competencia,
      arquivo_nome: filename,
      tamanho_bytes: bytes.length,
      storage_bucket: INBOX_BUCKET,
      storage_path: storagePath,
      status: 'recebido',
      formalizacao_email_status: 'pendente',
      formalizacao_email_em: null,
      formalizacao_destinos: Array.from(new Set([...emails, ...cc])),
      processamento_status: 'processado',
      processamento_detalhes: { origem: 'fechamento_rh', fechamento_id: fechamento.id, gerado_automaticamente: true },
      origem_tipo: 'rh_apontamento',
      origem_id: fechamento.id,
      created_at: now,
      updated_at: now,
    }).select('*').single();
    if (uploadError) {
      await service.storage.from(INBOX_BUCKET).remove([storagePath]).catch(() => null);
      throw uploadError;
    }

    const { data: updatedCycle, error: cycleError } = await service.from('contabilidade_folha_ciclos').update({
      apontamento_liberado_em: cycle.apontamento_liberado_em || now,
      apontamento_liberado_por: cycle.apontamento_liberado_por || user.id,
      contabilidade_recebeu_em: cycle.contabilidade_recebeu_em || null,
      status: cycle.contabilidade_recebeu_em ? 'recebido' : 'liberado',
      observacao: 'Apontamento gerado automaticamente no fechamento. Formalização por e-mail é independente da liberação operacional.',
      email_envio_status: 'pendente',
      updated_at: now,
    }).eq('id', cycle.id).select('*').single();
    if (cycleError) throw cycleError;

    // 2) Só depois tenta formalizar por e-mail. Qualquer falha fica registrada,
    // mas a ação da Vanessa continua liberada.
    let email: any = { status: 'pendente', error: null };
    try {
      email = await sendAccountingEmail(service, {
        emails, cc, empresaId: companyId, companyName: company.nome, competencia, filename, bytes,
      });
    } catch (emailError: any) {
      email = { status: 'erro', error: clean(emailError?.message || emailError).slice(0, 1000) };
      console.error('[accounting-closing-flow][email-isolated]', email.error);
    }

    const emailNow = new Date().toISOString();
    await service.from('contabilidade_portal_uploads').update({
      formalizacao_email_status: email.status,
      formalizacao_email_em: email.status === 'enviado' ? emailNow : null,
      updated_at: emailNow,
    }).eq('id', upload.id);

    await service.from('contabilidade_folha_ciclos').update({
      email_envio_status: email.status,
      email_envio_em: email.status === 'enviado' ? emailNow : null,
      observacao: email.status === 'enviado'
        ? 'Apontamento gerado automaticamente no fechamento e formalizado por e-mail.'
        : 'Apontamento liberado normalmente. Formalização por e-mail pendente, sem bloqueio operacional.',
      updated_at: emailNow,
    }).eq('id', cycle.id);

    try {
      await service.from('email_envios_log').insert({
        user_id: user.id,
        usuario_nome: user.email || 'Administrador',
        email_corporativo_usado: 'adm.matriz@topac.com.br',
        email_remetente: clean(process.env.EMAIL_FROM || process.env.MAIL_FROM || 'TOPAC RH PRO <no-reply@topacrh.pro>'),
        reply_to: 'adm.matriz@topac.com.br',
        provider: 'resend',
        modulo_origem: 'contabilidade_fechamento',
        documento_id: null,
        documento_nome: filename,
        destinatarios: emails.join('; '),
        cc: cc.join('; '),
        assunto: `[TOPAC RH PRO] FECHAMENTO DA FOLHA - ${company.nome} - ${competenceLabel(competencia)}`,
        status: email.status === 'enviado' ? 'enviado' : 'erro',
        erro: email.status === 'enviado' ? null : (email.error || null),
        enviado_em: emailNow,
      });
    } catch (logError) {
      console.warn('[accounting-closing-flow] email log failed', logError);
    }

    return sendJson(res, {
      ok: true,
      cycle: { ...updatedCycle, email_envio_status: email.status },
      upload_id: upload.id,
      arquivo_nome: filename,
      email_status: email.status,
      email_error: email.error || null,
      operation_released: true,
    });
  } catch (error: any) {
    console.error('[accounting-closing-flow]', error);
    return sendJson(res, { ok: false, error: clean(error?.message || error), message: clean(error?.message || error) }, Number(error?.status || 500));
  }
}
