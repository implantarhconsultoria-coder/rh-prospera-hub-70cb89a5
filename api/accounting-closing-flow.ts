import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { getServiceClient, readBody, requireAdmin, sendJson } from '../src/server/payrollServer.js';

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

async function accountingRecipients(service: any, companyId: string): Promise<{ owner:any; emails:string[] }> {
  const { data: access, error: accessError } = await service.from('contabilidade_portal_acesso_empresas')
    .select('portal_user_id')
    .eq('empresa_id', companyId);
  if (accessError) throw accessError;
  const ids = Array.from(new Set<string>((access || []).map((row: any) => clean(row.portal_user_id)).filter(Boolean) as string[]));
  if (!ids.length) throw new Error('contabilidade_sem_acesso_empresa');
  const { data: users, error: usersError } = await service.from('contabilidade_portal_usuarios')
    .select('id,nome,email,portal,ativo')
    .in('id', ids)
    .eq('portal', 'principal')
    .eq('ativo', true);
  if (usersError) throw usersError;
  const rows = users || [];
  if (!rows.length) throw new Error('contabilidade_sem_usuario_ativo');
  const owner = rows.find((row: any) => clean(row.email).toLowerCase() === 'dp@aatconsultoria.com.br') || rows[0];
  const emails = Array.from(new Set<string>((rows.map((row: any) => clean(row.email).toLowerCase()).filter(Boolean)) as string[]));
  return { owner, emails };
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
      .select('funcionario_id,faltas_dias,faltas_datas,atrasos,he50,he100,comissao_base,adicionais,descontos_diversos,adiantamento,observacoes')
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
    { label: 'HE 50/60', width: 50, max: 8 },
    { label: 'HE 100', width: 48, max: 8 },
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
        shorten(`${num(entry.he50).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}h`, 8),
        shorten(`${num(entry.he100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}h`, 8),
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

async function sendAccountingEmail(input: { emails: string[]; companyName: string; competencia: string; filename: string; bytes: Uint8Array }) {
  const key = clean(process.env.RESEND_API_KEY);
  if (!key || !input.emails.length) return { status: 'pendente', error: key ? 'destinatario_ausente' : 'RESEND_API_KEY ausente' };
  const configured = clean(process.env.EMAIL_FROM || process.env.MAIL_FROM);
  const from = configured && !/@resend\.dev/i.test(configured) ? configured : 'TOPAC RH PRO <no-reply@topacrh.pro>';
  const subject = `Apontamento liberado - ${input.companyName} - ${competenceLabel(input.competencia)}`;
  const text = [
    'Prezadas,', '',
    'O fechamento do RH foi concluido e o apontamento de Pagamento esta liberado para processamento.', '',
    `Empresa: ${input.companyName}`,
    `Competencia: ${competenceLabel(input.competencia)}`, '',
    'O PDF do apontamento segue anexo e o processo tambem ja esta liberado no Portal da Contabilidade.', '',
    'Apos receber, confirme o recebimento no portal e siga com o envio dos PDFs do Pagamento.', '',
    'TOPAC RH PRO',
  ].join('\n');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: input.emails,
      reply_to: 'adm.matriz@topac.com.br',
      subject,
      text,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.55;color:#111827"><p>Prezadas,</p><p>O fechamento do RH foi concluído e o apontamento de <strong>Pagamento</strong> está liberado para processamento.</p><p><strong>Empresa:</strong> ${safePdfText(input.companyName)}<br><strong>Competência:</strong> ${competenceLabel(input.competencia)}</p><p>O PDF do apontamento segue anexo e o processo também já está liberado no Portal da Contabilidade.</p><p>Após receber, confirmem o recebimento no portal e sigam com o envio dos PDFs do Pagamento.</p><p>TOPAC RH PRO</p></div>`,
      attachments: [{ filename: input.filename, content: Buffer.from(input.bytes).toString('base64') }],
    }),
  });
  const detail = await response.text().catch(() => '');
  if (!response.ok) return { status: 'erro', error: detail.slice(0, 800) || `HTTP ${response.status}` };
  return { status: 'enviado', error: null };
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
    const { owner, emails } = await accountingRecipients(service, companyId);
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
    const email = await sendAccountingEmail({ emails, companyName: company.nome, competencia, filename, bytes });
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
      formalizacao_email_status: email.status,
      formalizacao_email_em: email.status === 'enviado' ? now : null,
      formalizacao_destinos: emails,
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
      apontamento_liberado_em: now,
      apontamento_liberado_por: user.id,
      contabilidade_recebeu_em: null,
      status: 'liberado',
      observacao: email.status === 'enviado' ? 'Apontamento gerado automaticamente no fechamento e enviado à Contabilidade.' : 'Apontamento gerado automaticamente no fechamento. E-mail pendente.',
      updated_at: now,
    }).eq('id', cycle.id).select('*').single();
    if (cycleError) throw cycleError;

    return sendJson(res, {
      ok: true,
      cycle: updatedCycle,
      upload_id: upload.id,
      arquivo_nome: filename,
      email_status: email.status,
      email_error: 'error' in email ? email.error || null : null,
    });
  } catch (error: any) {
    console.error('[accounting-closing-flow]', error);
    return sendJson(res, { ok: false, error: clean(error?.message || error), message: clean(error?.message || error) }, Number(error?.status || 500));
  }
}
