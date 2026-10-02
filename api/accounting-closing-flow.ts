import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { getServiceClient, readBody, requireAdmin, sendJson } from '../src/server/payrollServer.js';
import { buildAccountingThreadKey, fetchResendMessageId, prepareAccountingThread, saveAccountingThread } from '../src/server/accountingEmailThread.js';

const INBOX_BUCKET = 'contabilidade-inbox';
const ACCOUNTING_REPLY_MAILBOX = String(process.env.ACCOUNTING_RESEND_MAILBOX || 'centralrh@mleurob.resend.app').trim();
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
  const { data: company, error: companyError } = await service.from('empresas')
    .select('id,nome,codigo')
    .eq('id', companyId)
    .maybeSingle();
  if (companyError || !company) throw companyError || new Error('empresa_nao_encontrada');

  const accountingPortal = /goi[âa]nia|gyn/i.test(clean(company.nome || company.codigo)) ? 'goiania' : 'principal';

  const { data: existingRows, error: findError } = await service.from('contabilidade_folha_ciclos')
    .select('*')
    .eq('empresa_id', companyId)
    .eq('competencia', competencia)
    .eq('tipo', 'pagamento')
    .order('created_at', { ascending: false })
    .limit(2);
  if (findError) throw findError;

  const existing = Array.isArray(existingRows) ? existingRows[0] : null;
  if (existing) return existing;

  const { data, error } = await service.from('contabilidade_folha_ciclos').insert({
    portal: accountingPortal,
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

async function buildClosingPdf(service: any, companyId: string, competencia: string, retificationReason = '') {
  const [
    { data: company, error: companyError },
    { data: employees, error: employeeError },
    { data: entries, error: entryError },
    { data: atestados, error: atestadoError },
  ] = await Promise.all([
    service.from('empresas').select('*').eq('id', companyId).maybeSingle(),
    service.from('funcionarios')
      .select('*')
      .or(`company_id.eq.${companyId},empresa_id.eq.${companyId}`)
      .eq('ativo', true)
      .order('nome'),
    service.from('lancamentos_mensais')
      .select('funcionario_id,faltas_dias,faltas_datas,atrasos,he50,he60,he100,comissao_base,adicionais,descontos_diversos,adiantamento,observacoes')
      .eq('company_id', companyId)
      .eq('competencia', competencia)
      .is('apagado_em', null),
    service.from('atestados')
      .select('funcionario_id,dias_cobertos,status')
      .eq('company_id', companyId)
      .eq('competencia', competencia),
  ]);
  if (companyError || !company) throw companyError || new Error('empresa_nao_encontrada');
  if (employeeError) throw employeeError;
  if (entryError) throw entryError;
  if (atestadoError) console.warn('[accounting-closing-flow] atestados indisponiveis para o PDF:', atestadoError);

  const [year, month] = competencia.split('-').map(Number);
  const monthNames = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const competenciaFull = `${monthNames[(month || 1) - 1] || competencia}/${year || ''}`;
  const lastDay = year && month ? new Date(year, month, 0).getDate() : 31;
  const periodStart = `01/${String(month || '').padStart(2, '0')}/${year || ''}`;
  const periodEnd = `${String(lastDay).padStart(2, '0')}/${String(month || '').padStart(2, '0')}/${year || ''}`;
  let diasUteis = 0;
  if (year && month) {
    for (let day = 1; day <= lastDay; day += 1) {
      const dow = new Date(year, month - 1, day).getDay();
      if (dow !== 0 && dow !== 6) diasUteis += 1;
    }
  }
  if (!diasUteis) diasUteis = 22;

  const entryMap = new Map((entries || []).map((row: any) => [String(row.funcionario_id), row]));
  const atestadoMap = new Map<string, number>();
  for (const row of atestados || []) {
    const status = clean(row.status).toLowerCase();
    if (['cancelado','rejeitado','excluido'].includes(status)) continue;
    const key = String(row.funcionario_id || '');
    if (!key) continue;
    atestadoMap.set(key, (atestadoMap.get(key) || 0) + Math.max(0, num(row.dias_cobertos)));
  }

  const normalizeText = (value: unknown) => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const companyText = normalizeText(`${company.codigo || ''} ${company.nome || ''} ${company.cidade || ''}`);
  const defaultCommission = companyText.includes('topac-gyn') || companyText.includes('gyn') || companyText.includes('goian') ? 0.02 : 0.01;
  const hourText = (value: unknown) => {
    const totalMinutes = Math.round(Math.max(0, num(value)) * 60);
    return `${Math.floor(totalMinutes / 60)}h${String(totalMinutes % 60).padStart(2, '0')}`;
  };
  const dayText = (value: unknown) => {
    const n = Math.max(0, num(value));
    if (!n) return '-';
    return `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ${n === 1 ? 'dia' : 'dias'}`;
  };
  const moneyDash = (value: unknown) => num(value) > 0 ? money(value) : '-';

  const rows = (employees || [])
    .filter((employee: any) => String(employee.status || '').toLowerCase() === 'ativo')
    .map((employee: any) => {
      const entry: any = entryMap.get(String(employee.id)) || {};
      const faltas = Math.max(0, num(entry.faltas_dias));
      const atestadoDias = Math.max(0, atestadoMap.get(String(employee.id)) || 0);
      const he50 = Math.max(0, num(entry.he50));
      const he60 = Math.max(0, num(entry.he60));
      const he100 = Math.max(0, num(entry.he100));
      const comissaoBase = Math.max(0, num(entry.comissao_base));
      const nomeNormalizado = normalizeText(employee.nome || '');
      const isJerri = String(employee.id) === 'f93bd3f5-dfef-4a62-820d-bf553e7c63a0';
      const jerriPct = comissaoBase >= 650000 ? 0.018 : comissaoBase >= 501000 ? 0.015 : 0.01;
      const comissaoPct = isJerri && competencia >= '2026-09'
        ? jerriPct
        : defaultCommission === 0.02
          ? (nomeNormalizado.includes('aldenei') ? 0.02 : 0.01)
          : defaultCommission;
      const comissaoValor = Math.round(comissaoBase * comissaoPct * 100) / 100;
      const salario = Math.max(0, num(employee.salario_base ?? employee.salario));
      const adiantamentoPadrao = Math.round(salario * 0.4 * 100) / 100;
      const adiantamentoInformado = Math.max(0, num(entry.adiantamento));
      const adiantamentoExcepcional = Math.abs(adiantamentoInformado - adiantamentoPadrao) > 0.009
        ? adiantamentoInformado
        : 0;
      const observacoes:string[] = [];
      if (faltas > 0) observacoes.push(`Desconto de ${dayText(faltas)}`);
      if (atestadoDias > 0) observacoes.push(atestadoDias === 1 ? 'Atestado' : `${dayText(atestadoDias)} de atestado`);
      if (he50 > 0 || he60 > 0 || he100 > 0) observacoes.push('Hora extra');
      if (comissaoPct > 0) observacoes.push(`Comissão ${(comissaoPct * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`);

      return {
        id: String(employee.id || ''),
        nome: clean(employee.nome) || '-',
        cargo: clean(employee.cargo) || '-',
        faltas,
        atestados: atestadoDias,
        adiantamento: adiantamentoExcepcional,
        he50,
        he60,
        he100,
        comissaoBase,
        comissaoPct: comissaoPct * 100,
        comissaoValor,
        observacao: observacoes.length ? observacoes.join(' · ') : 'Sem movimento',
      };
    });

  const totals = rows.reduce((acc:any, row:any) => {
    acc.faltas += row.faltas;
    acc.atestados += row.atestados;
    acc.he50 += row.he50;
    acc.he60 += row.he60;
    acc.he100 += row.he100;
    acc.adiantamento += row.adiantamento;
    acc.comissaoBase += row.comissaoBase;
    acc.comissaoValor += row.comissaoValor;
    return acc;
  }, { faltas:0, atestados:0, he50:0, he60:0, he100:0, adiantamento:0, comissaoBase:0, comissaoValor:0 });

  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const boldOblique = await pdf.embedFont(StandardFonts.HelveticaBoldOblique);
  const oblique = await pdf.embedFont(StandardFonts.HelveticaOblique);

  const pageWidth = 841.89;
  const pageHeight = 595.28;
  const margin = 18;
  const contentWidth = pageWidth - margin * 2;
  const color = (hex:string) => {
    const cleanHex = hex.replace('#','');
    const n = parseInt(cleanHex, 16);
    return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
  };
  const C = {
    navy:'#071b3d', navy2:'#173f73', navy3:'#102b55', blue:'#245b8e',
    red:'#b52e38', green:'#147451', line:'#dbe4ef', text:'#12284b',
    meta:'#38577e', soft:'#eef4fa', absence:'#fff0f1', he:'#edf5ff',
    purple:'#f2efff', commission:'#edf9f4', sub:'#edf3f8', subRed:'#fbecee',
    subGreen:'#eaf6f1', total:'#e9f0f7', yellow:'#f2bf22',
  };

  const fitSize = (font:any, value:string, maxWidth:number, preferred:number, min:number) => {
    let size = preferred;
    const text = safePdfText(value);
    while (size > min && font.widthOfTextAtSize(text, size) > maxWidth) size -= 0.25;
    return size;
  };
  const drawFit = (page:any, value:unknown, x:number, y:number, width:number, opts:any={}) => {
    const font = opts.font || regular;
    const preferred = opts.size || 7;
    const min = opts.min || Math.max(4.5, preferred - 2.5);
    const text = safePdfText(value);
    const size = fitSize(font, text, Math.max(4, width - 4), preferred, min);
    const textWidth = font.widthOfTextAtSize(text, size);
    const align = opts.align || 'left';
    const tx = align === 'right' ? x + width - textWidth - 2 : align === 'center' ? x + (width - textWidth) / 2 : x + 2;
    page.drawText(text, { x:tx, y, size, font, color:color(opts.color || C.text) });
  };
  const splitWords = (font:any, textRaw:unknown, size:number, maxWidth:number, maxLines=2) => {
    const text = safePdfText(textRaw);
    const words = text.split(/\s+/).filter(Boolean);
    const out:string[] = [];
    let line = '';
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= maxWidth || !line) line = next;
      else {
        out.push(line);
        line = word;
        if (out.length >= maxLines - 1) break;
      }
    }
    if (line && out.length < maxLines) out.push(line);
    if (out.length === maxLines && words.join(' ').length > out.join(' ').length) {
      let last = out[maxLines - 1];
      while (last.length > 3 && font.widthOfTextAtSize(`${last}...`, size) > maxWidth) last = last.slice(0,-1);
      out[maxLines - 1] = `${last}...`;
    }
    return out;
  };
  const drawWrapped = (page:any, value:unknown, x:number, centerY:number, width:number, opts:any={}) => {
    const font = opts.font || regular;
    const size = opts.size || 6.5;
    const lines = splitWords(font, value, size, Math.max(4, width - 5), opts.maxLines || 2);
    const lineH = size + 1.5;
    const firstY = centerY + ((lines.length - 1) * lineH) / 2;
    lines.forEach((line, idx) => drawFit(page, line, x, firstY - idx * lineH, width, { font, size, min:size-1.2, align:opts.align || 'left', color:opts.color || C.text }));
  };
  const drawCard = (page:any, x:number, y:number, w:number, h:number, fill:string, label:string, value:string, valueColor=C.navy3, icon='') => {
    page.drawRectangle({ x, y, width:w, height:h, color:color(fill), borderColor:color('#e1e7ef'), borderWidth:0.6 });
    page.drawRectangle({ x:x+8, y:y+10, width:27, height:27, color:color('#ffffff'), borderColor:color('#e1e7ef'), borderWidth:0.5 });
    drawFit(page, icon, x+8, y+19, 27, { font:bold, size:9, min:7, align:'center', color:C.navy3 });
    drawFit(page, label.toUpperCase(), x+42, y+h-17, w-48, { font:bold, size:6.4, min:5.2, color:'#244a78' });
    drawFit(page, value, x+42, y+12, w-48, { font:bold, size:12.2, min:8, color:valueColor });
  };

  const columns = [
    { key:'nome', label:'Nome', width:116, align:'left' },
    { key:'cargo', label:'Cargo', width:88, align:'left' },
    { key:'faltas', label:'Faltas (dias)', width:52, align:'center', tone:'red' },
    { key:'atestados', label:'Atestados (dias)', width:52, align:'center', tone:'red' },
    { key:'adiantamento', label:'Adiantamento', width:64, align:'right', tone:'red' },
    { key:'he50', label:'HE 50%', width:52, align:'center' },
    { key:'he60', label:'HE 60%', width:52, align:'center' },
    { key:'he100', label:'HE 100%', width:52, align:'center' },
    { key:'comissaoBase', label:'Base Comissão', width:72, align:'right', tone:'green' },
    { key:'comissaoPct', label:'Comissão %', width:52, align:'center', tone:'green' },
    { key:'comissaoValor', label:'Comissão (R$)', width:72, align:'right', tone:'green' },
    { key:'observacao', label:'Observação', width:76, align:'left' },
  ];

  const renderPage = (pageRows:any[], pageIndex:number, totalPages:number) => {
    const page = pdf.addPage([pageWidth, pageHeight]);
    const top = pageHeight - margin;

    // Cabeçalho igual à pré-visualização.
    drawFit(page, 'TOPAC', margin, top - 26, 92, { font:boldOblique, size:22, min:18, color:C.navy });
    drawFit(page, 'RH PRO', margin + 77, top - 26, 72, { font:oblique, size:17, min:14, color:'#244f82' });
    page.drawRectangle({ x:margin+4, y:top-36, width:48, height:3, color:color(C.yellow) });
    drawFit(page, 'Plataforma Multiempresas', margin+34, top-47, 112, { font:oblique, size:6.7, min:5.2, align:'center', color:'#315681' });
    page.drawLine({ start:{x:margin+180,y:top-5}, end:{x:margin+180,y:top-58}, thickness:0.6, color:color('#8ea7c5') });

    const titleX = margin + 195;
    drawFit(page, String(company.nome || '').toUpperCase(), titleX, top - 19, 395, { font:bold, size:18.5, min:12.5, color:'#071633' });
    drawFit(page, `Relatório de Apontamento - ${competenciaFull}${retificationReason ? ' - RETIFICAÇÃO' : ''}`, titleX, top - 38, 395, { font:bold, size:10.8, min:8, color:retificationReason ? '#9b2831' : '#0f2450' });
    drawFit(page, `CNPJ: ${company.cnpj || '-'}   |   Competência: ${competenciaFull}   |   Dias úteis: ${diasUteis}`, titleX, top - 52, 395, { size:6.7, min:5.5, color:C.meta });

    const periodX = pageWidth - margin - 190;
    page.drawRectangle({ x:periodX, y:top-58, width:190, height:58, color:color('#e8f2fc') });
    page.drawRectangle({ x:periodX+10, y:top-43, width:28, height:28, color:color('#ffffff'), borderColor:color('#d1dfef'), borderWidth:0.5 });
    drawFit(page, '[]', periodX+10, top-33, 28, { font:bold, size:8, align:'center', color:'#274e7e' });
    drawFit(page, 'Período de apuração', periodX+47, top-17, 135, { font:bold, size:5.8, min:5, color:'#274e7e' });
    drawFit(page, `${periodStart} a`, periodX+47, top-31, 135, { font:bold, size:8.5, min:7, color:'#17345c' });
    drawFit(page, periodEnd, periodX+47, top-43, 135, { font:bold, size:8.5, min:7, color:'#17345c' });
    drawFit(page, `${diasUteis} dias úteis`, periodX+47, top-54, 135, { size:6, min:5, color:'#335d8d' });

    let tableTop:number;
    if (pageIndex === 0) {
      let cardsY = top - 120;
      if (retificationReason) {
        page.drawRectangle({ x:margin, y:top-92, width:contentWidth, height:24, color:color('#fff0f1'), borderColor:color('#d99aa0'), borderWidth:0.6 });
        drawFit(page, 'RETIFICAÇÃO', margin+8, top-83, 78, { font:bold, size:7.2, min:6, color:'#9b2831' });
        drawFit(page, retificationReason, margin+88, top-83, contentWidth-96, { font:bold, size:6.6, min:5.2, color:'#7f1f29' });
        cardsY = top - 148;
      }
      const gap = 7;
      const cardW = (contentWidth - gap * 4) / 5;
      drawCard(page, margin, cardsY, cardW, 48, C.soft, 'Funcionários', String(rows.length), C.navy3, 'P');
      drawCard(page, margin+(cardW+gap), cardsY, cardW, 48, C.absence, 'Faltas', dayText(totals.faltas), '#b11f2d', '[]');
      drawCard(page, margin+2*(cardW+gap), cardsY, cardW, 48, C.he, 'HE 50%', hourText(totals.he50), C.navy3, 'O');
      drawCard(page, margin+3*(cardW+gap), cardsY, cardW, 48, C.purple, 'HE 100%', hourText(totals.he100), C.navy3, '>>');
      drawCard(page, margin+4*(cardW+gap), cardsY, cardW, 48, C.commission, 'Comissão total', money(totals.comissaoValor), '#087556', '$');
      tableTop = cardsY - 10;
    } else {
      drawFit(page, `Continuação - página ${pageIndex + 1} de ${totalPages}`, titleX, top - 66, 395, { font:bold, size:7, color:C.meta });
      tableTop = top - 82;
    }

    const groupH = 20;
    const subH = 28;
    const totalH = 22;
    const bottom = 24;
    const availableRowsHeight = tableTop - groupH - subH - totalH - bottom;
    const rowH = Math.min(24, Math.max(18, pageRows.length ? availableRowsHeight / pageRows.length : 22));

    // Cabeçalho agrupado
    let gx = margin;
    const groupDefs = [
      { w:columns[0].width+columns[1].width, label:'COLABORADOR', fill:C.blue },
      { w:columns[2].width+columns[3].width+columns[4].width, label:'DESCONTOS / APONTAMENTOS', fill:C.red },
      { w:columns[5].width+columns[6].width+columns[7].width, label:'HORAS EXTRAS', fill:C.blue },
      { w:columns[8].width+columns[9].width+columns[10].width, label:'COMISSÕES / CONFERÊNCIA', fill:C.green },
      { w:columns[11].width, label:'OBSERVAÇÕES', fill:C.blue },
    ];
    groupDefs.forEach(group => {
      page.drawRectangle({ x:gx, y:tableTop-groupH, width:group.w, height:groupH, color:color(group.fill), borderColor:color('#ffffff'), borderWidth:0.25 });
      drawFit(page, group.label, gx, tableTop-groupH+7, group.w, { font:bold, size:6.4, min:5, align:'center', color:'#ffffff' });
      gx += group.w;
    });

    // Subcabeçalho
    let sx = margin;
    const subY = tableTop - groupH - subH;
    columns.forEach(col => {
      const fill = col.tone === 'red' ? C.subRed : col.tone === 'green' ? C.subGreen : C.sub;
      page.drawRectangle({ x:sx, y:subY, width:col.width, height:subH, color:color(fill), borderColor:color(C.line), borderWidth:0.5 });
      const labelColor = col.tone === 'red' ? '#9b2831' : col.tone === 'green' ? '#166b51' : '#264b75';
      drawWrapped(page, col.label, sx, subY + subH/2 - 2, col.width, { font:bold, size:5.8, maxLines:2, align:col.align === 'left' ? 'left' : 'center', color:labelColor });
      sx += col.width;
    });

    let y = subY;
    pageRows.forEach((row:any, idx:number) => {
      y -= rowH;
      const fill = idx % 2 === 1 ? '#f8fbfe' : '#ffffff';
      let x = margin;
      columns.forEach(col => {
        page.drawRectangle({ x, y, width:col.width, height:rowH, color:color(fill), borderColor:color(C.line), borderWidth:0.45 });
        let value:any = row[col.key];
        let textColor = C.text;
        let font:any = regular;
        let size = 6.2;
        if (col.key === 'nome') { font = bold; size = 6.4; }
        if (col.key === 'cargo') { size = 5.8; textColor = '#304f74'; }
        if (col.key === 'faltas' || col.key === 'atestados') {
          value = dayText(value);
          if (num(row[col.key]) > 0) { font = bold; textColor = '#b21f2d'; }
        }
        if (['he50','he60','he100'].includes(col.key)) {
          value = num(value) > 0 ? hourText(value) : '-';
          font = bold; textColor = C.navy3;
        }
        if (col.key === 'adiantamento') value = moneyDash(value);
        if (col.key === 'comissaoBase' || col.key === 'comissaoValor') {
          value = moneyDash(value); font = bold; textColor = '#0d6d51';
        }
        if (col.key === 'comissaoPct') {
          value = num(value) > 0 ? `${num(value).toLocaleString('pt-BR', { maximumFractionDigits:2 })}%` : '-';
          font = bold; textColor = '#0d6d51';
        }
        if (col.key === 'observacao') { size = 5.7; textColor = '#314f73'; }

        if (col.key === 'nome' || col.key === 'cargo' || col.key === 'observacao') {
          drawWrapped(page, value, x, y + rowH/2 - 2, col.width, { font, size, maxLines:2, align:'left', color:textColor });
        } else {
          drawFit(page, value, x, y + rowH/2 - size/3, col.width, { font, size, min:4.8, align:col.align, color:textColor });
        }
        x += col.width;
      });
    });

    if (pageIndex === totalPages - 1) {
      y -= totalH;
      let x = margin;
      const totalValues:any[] = [
        'TOTAIS','',
        dayText(totals.faltas),
        dayText(totals.atestados),
        moneyDash(totals.adiantamento),
        hourText(totals.he50),
        hourText(totals.he60),
        hourText(totals.he100),
        money(totals.comissaoBase),
        '-',
        money(totals.comissaoValor),
        '-',
      ];
      columns.forEach((col, idx) => {
        page.drawRectangle({ x, y, width:col.width, height:totalH, color:color(C.total), borderColor:color(C.line), borderWidth:0.5 });
        const value = totalValues[idx];
        const txtColor = idx === 2 || idx === 3 ? '#b21f2d' : idx === 8 || idx === 10 ? '#0b7153' : C.navy3;
        drawFit(page, value, x, y+7, col.width, { font:bold, size:5.8, min:4.8, align:idx === 0 ? 'left' : col.align, color:txtColor });
        x += col.width;
      });
    }
  };

  const firstPageCapacity = 14;
  const continuationCapacity = 18;
  const chunks:any[][] = [];
  if (rows.length <= firstPageCapacity) chunks.push(rows);
  else {
    chunks.push(rows.slice(0, firstPageCapacity));
    for (let i = firstPageCapacity; i < rows.length; i += continuationCapacity) chunks.push(rows.slice(i, i + continuationCapacity));
  }
  if (!chunks.length) chunks.push([]);
  chunks.forEach((chunk, idx) => renderPage(chunk, idx, chunks.length));

  const bytes = await pdf.save({ useObjectStreams:false });
  const filename = `${safePdfText(company.nome).replace(/[^A-Za-z0-9]+/g, '_').toUpperCase()}_-_${retificationReason ? 'RETIFICACAO_' : ''}APONTAMENTO_-_REF_${competencia}.pdf`;
  return { bytes, filename, company };
}

async function sendAccountingEmail(service: any, input: { emails: string[]; cc: string[]; empresaId: string; companyName: string; competencia: string; filename: string; bytes: Uint8Array; retificationReason?: string }) {
  const key = clean(process.env.RESEND_API_KEY);
  if (!key || !input.emails.length) return { status: 'pendente', error: key ? 'destinatario_ausente' : 'RESEND_API_KEY ausente' };
  const configured = clean(process.env.EMAIL_FROM || process.env.MAIL_FROM);
  const from = configured && !/@resend\.dev/i.test(configured) ? configured : 'TOPAC RH PRO <no-reply@topacrh.pro>';
  const threadKey = buildAccountingThreadKey(input.empresaId, input.competencia);
  const baseSubject = `[TOPAC RH PRO] FECHAMENTO DA FOLHA - ${input.companyName} - ${competenceLabel(input.competencia)}`;
  const thread = await prepareAccountingThread(service, { threadKey, subject: baseSubject });
  const isRetification = Boolean(clean(input.retificationReason));
  const text = isRetification
    ? [
        'Prezadas,', '',
        'Segue RETIFICAÇÃO do apontamento do fechamento da folha.', '',
        `Empresa: ${input.companyName}`,
        `Competência: ${competenceLabel(input.competencia)}`, '',
        'O que foi retificado:',
        clean(input.retificationReason), '',
        'O PDF completo e atualizado segue anexo. Considerem este arquivo como a versão válida para o processamento.', '',
        'A retificação também foi registrada no Portal da Contabilidade e permanece vinculada ao histórico desta competência.', '',
        'TOPAC RH PRO',
      ].join('\n')
    : [
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
      to: Array.from(new Set(input.emails)),
      cc: Array.from(new Set(input.cc)).filter((email) => !input.emails.includes(email)),
      reply_to: ACCOUNTING_REPLY_MAILBOX,
      subject: thread.subject,
      text,
      html: isRetification
        ? `<div style="font-family:Arial,sans-serif;line-height:1.55;color:#111827"><p>Prezadas,</p><p><strong>Segue RETIFICAÇÃO do apontamento do fechamento da folha.</strong></p><p><strong>Empresa:</strong> ${safePdfText(input.companyName)}<br><strong>Competência:</strong> ${competenceLabel(input.competencia)}</p><p style="padding:12px;border:1px solid #fecaca;background:#fff1f2"><strong>O que foi retificado:</strong><br>${safePdfText(input.retificationReason)}</p><p>O PDF completo e atualizado segue anexo. Considerem este arquivo como a versão válida para o processamento.</p><p>A retificação também foi registrada no Portal da Contabilidade e permanece vinculada ao histórico desta competência.</p><p>TOPAC RH PRO</p></div>`
        : `<div style="font-family:Arial,sans-serif;line-height:1.55;color:#111827"><p>Prezadas,</p><p><strong>Fica formalizado o início do processo de fechamento da folha desta competência.</strong></p><p><strong>Empresa:</strong> ${safePdfText(input.companyName)}<br><strong>Competência:</strong> ${competenceLabel(input.competencia)}</p><p>O PDF do apontamento segue anexo e o processo já está liberado no Portal da Contabilidade.</p><p>A partir deste e-mail, toda pendência, correção, confirmação e o retorno da folha fechada deverão permanecer nesta mesma conversa.</p><p>TOPAC RH PRO</p></div>`,
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
    if (!['finalize','retify','reopen'].includes(action)) return sendJson(res, { ok: false, error: 'action_invalid' }, 400);

    const companyId = clean(body.empresa_id);
    const competencia = clean(body.competencia);
    const retificationReason = clean(body.retificacao_motivo || body.motivo || '');
    if (!companyId || !/^\d{4}-\d{2}$/.test(competencia)) return sendJson(res, { ok: false, error: 'empresa_competencia_invalidas' }, 400);

    if (action === 'reopen') {
      if (!retificationReason) return sendJson(res, { ok:false, error:'retificacao_motivo_obrigatorio', message:'Informe o que será retificado.' }, 400);
      const { data: reopened, error: reopenError } = await service.from('fechamentos_filial')
        .update({ status:'reaberto' })
        .eq('company_id', companyId)
        .eq('competencia', competencia)
        .select('id,status')
        .maybeSingle();
      if (reopenError) throw reopenError;
      if (!reopened) return sendJson(res, { ok:false, error:'fechamento_nao_encontrado' }, 404);

      const cycle = await getOrCreatePaymentCycle(service, companyId, competencia);
      const now = new Date().toISOString();
      await service.from('contabilidade_folha_ciclos').update({
        status:'aguardando_apontamento',
        observacao:`Retificação aberta pelo RH: ${retificationReason}`,
        contabilidade_recebeu_em:null,
        conferido_em:null,
        email_retorno_status:null,
        updated_at:now,
      }).eq('id', cycle.id);

      return sendJson(res, { ok:true, reopened:true, fechamento:reopened, ciclo_id:cycle.id, retificacao_motivo:retificationReason });
    }

    if (action === 'retify' && !retificationReason) {
      return sendJson(res, { ok:false, error:'retificacao_motivo_obrigatorio', message:'Informe o que foi retificado antes de reenviar.' }, 400);
    }

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
    const portal = clean(cycle?.portal) || (/goi[âa]nia|gyn/i.test(clean((await service.from('empresas').select('nome,codigo').eq('id', companyId).maybeSingle()).data?.nome || '')) ? 'goiania' : 'principal');
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

    if (existingGenerated && action !== 'retify') {
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

    const { bytes, filename, company } = await buildClosingPdf(service, companyId, competencia, action === 'retify' ? retificationReason : '');

    if (action !== 'retify') {
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
      processamento_detalhes: {
        origem: 'fechamento_rh',
        fechamento_id: fechamento.id,
        gerado_automaticamente: true,
        retificacao: action === 'retify',
        retificacao_motivo: action === 'retify' ? retificationReason : null,
      },
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
      apontamento_liberado_em: action === 'retify' ? now : (cycle.apontamento_liberado_em || now),
      apontamento_liberado_por: user.id,
      contabilidade_recebeu_em: action === 'retify' ? null : (cycle.contabilidade_recebeu_em || null),
      conferido_em: action === 'retify' ? null : (cycle.conferido_em || null),
      status: action === 'retify' ? 'liberado' : (cycle.contabilidade_recebeu_em ? 'recebido' : 'liberado'),
      observacao: action === 'retify'
        ? `Retificação enviada pelo RH: ${retificationReason}`
        : 'Apontamento gerado automaticamente no fechamento. Formalização por e-mail é independente da liberação operacional.',
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
        retificationReason: action === 'retify' ? retificationReason : undefined,
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
      observacao: action === 'retify'
        ? (email.status === 'enviado'
          ? `Retificação enviada e formalizada por e-mail: ${retificationReason}`
          : `Retificação liberada no portal; e-mail pendente: ${retificationReason}`)
        : (email.status === 'enviado'
          ? 'Apontamento gerado automaticamente no fechamento e formalizado por e-mail.'
          : 'Apontamento liberado normalmente. Formalização por e-mail pendente, sem bloqueio operacional.'),
      updated_at: emailNow,
    }).eq('id', cycle.id);

    try {
      await service.from('email_envios_log').insert({
        user_id: user.id,
        usuario_nome: user.email || 'Administrador',
        email_corporativo_usado: 'adm.matriz@topac.com.br',
        email_remetente: clean(process.env.EMAIL_FROM || process.env.MAIL_FROM || 'TOPAC RH PRO <no-reply@topacrh.pro>'),
        reply_to: ACCOUNTING_REPLY_MAILBOX,
        provider: 'resend',
        modulo_origem: action === 'retify' ? 'contabilidade_fechamento_retificacao' : 'contabilidade_fechamento',
        documento_id: null,
        documento_nome: filename,
        destinatarios: emails.join('; '),
        cc: cc.join('; '),
        assunto: action === 'retify'
          ? `[TOPAC RH PRO] RETIFICAÇÃO DO FECHAMENTO - ${company.nome} - ${competenceLabel(competencia)}`
          : `[TOPAC RH PRO] FECHAMENTO DA FOLHA - ${company.nome} - ${competenceLabel(competencia)}`,
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
      retificacao: action === 'retify',
      retificacao_motivo: action === 'retify' ? retificationReason : null,
    });
  } catch (error: any) {
    console.error('[accounting-closing-flow]', error);
    return sendJson(res, { ok: false, error: clean(error?.message || error), message: clean(error?.message || error) }, Number(error?.status || 500));
  }
}
