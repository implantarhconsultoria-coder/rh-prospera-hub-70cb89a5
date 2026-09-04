import { randomUUID } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { createCanvas } from '@napi-rs/canvas';
import { createWorker } from 'tesseract.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { sha256 } from './payrollServer.js';
import {
  classifyAccountingPage,
  extractAdmissionDate,
  extractCompetence,
  extractCpf,
  extractCnpj,
  extractLikelyFullName,
  extractRole,
  extractSalary,
  matchCompanySafely,
  matchPersonSafely,
  needsAccountingOcr,
  normalizeAccountingText,
  relevantDocumentIdentity,
  type AccountingCompanyCandidate,
  type AccountingDocumentType,
  type AccountingPersonCandidate,
} from './accountingCentralRules.js';

const INBOX_BUCKET = 'contabilidade-inbox';
const PAYROLL_BUCKET = 'payroll-private';
const ADMISSION_BUCKET = 'documentos-admissionais';
const OCR_LANG = process.env.ACCOUNTING_OCR_LANGUAGE || 'por';
const OCR_LANG_PATH = process.env.ACCOUNTING_OCR_LANG_PATH || 'https://tessdata.projectnaptha.com/4.0.0';

type PageInfo = {
  page: number;
  text: string;
  lines: string[];
  usedOcr: boolean;
  type: AccountingDocumentType;
  classificationConfidence: number;
  classificationReason: string;
};

type ProcessingContext = {
  service: SupabaseClient;
  parent: any;
  message: any;
  sourceBytes: Uint8Array;
  sourcePdf: PDFDocument;
  pages: PageInfo[];
  companies: AccountingCompanyCandidate[];
  employees: AccountingPersonCandidate[];
  preCadastros: AccountingPersonCandidate[];
  actorUserId?: string | null;
};

const safeFile = (value: string) => String(value || 'documento.pdf')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^A-Za-z0-9._-]+/g, '_')
  .replace(/_+/g, '_')
  .slice(0, 120);

const event = async (service: SupabaseClient, input: {
  mensagemId?: string | null;
  documentoId?: string | null;
  evento: string;
  actorUserId?: string | null;
  actorType?: string;
  payload?: Record<string, unknown>;
}) => {
  const { error } = await service.from('contabilidade_email_eventos').insert({
    mensagem_id: input.mensagemId || null,
    documento_id: input.documentoId || null,
    evento: input.evento,
    ator_tipo: input.actorType || (input.actorUserId ? 'USUARIO' : 'SISTEMA'),
    ator_user_id: input.actorUserId || null,
    payload: input.payload || {},
  });
  if (error) console.warn('[central-contabilidade][evento]', error.message);
};

const extractNetAmount = (text: string) => {
  const patterns = [
    /TOTAL\s+L[IÍ]QUIDO\s*(?:--?>|[:=\-]*)\s*(?:R\$\s*)?([\d.]+,\d{2})/i,
    /(?:VALOR\s+L[IÍ]QUIDO|L[IÍ]QUIDO\s+A\s+RECEBER)\D{0,35}(?:R\$\s*)?([\d.]+,\d{2})/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match?.[1]) continue;
    const n = Number(match[1].replace(/\./g, '').replace(',', '.'));
    if (Number.isFinite(n)) return Math.round(n * 100) / 100;
  }
  return null;
};

const structuredLines = (items: Array<{ str?: string; transform?: number[] }>) => {
  const raw = items
    .filter((item) => String(item.str || '').trim())
    .map((item) => ({ item, y: Number(item.transform?.[5] || 0) }));
  const groups: Array<{ y: number; items: Array<{ str?: string; transform?: number[] }> }> = [];
  for (const entry of raw) {
    const group = groups.find((candidate) => Math.abs(candidate.y - entry.y) <= 2.2);
    if (group) group.items.push(entry.item);
    else groups.push({ y: entry.y, items: [entry.item] });
  }
  return groups
    .sort((a, b) => b.y - a.y)
    .map((group) => group.items
      .sort((a, b) => Number(a.transform?.[4] || 0) - Number(b.transform?.[4] || 0))
      .map((item) => String(item.str || '').trim())
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim())
    .filter(Boolean);
};

const ocrPdfPage = async (page: any, worker: any) => {
  const viewport = page.getViewport({ scale: 2.0 });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const context = canvas.getContext('2d');
  await page.render({ canvasContext: context as any, viewport, canvas: canvas as any }).promise;
  const png = canvas.toBuffer('image/png');
  const result = await worker.recognize(png);
  return String(result?.data?.text || '').trim();
};

const readPdfPages = async (bytes: Uint8Array, subject: string) => {
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loading = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: true,
  });
  const pdf = await loading.promise;
  const pages: PageInfo[] = [];
  let worker: any = null;

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent({ disableNormalization: false });
      let lines = structuredLines((content.items || []) as any[]);
      let text = lines.join('\n').trim();
      let usedOcr = false;

      if (needsAccountingOcr(text)) {
        try {
          if (!worker) worker = await createWorker(OCR_LANG, 1, { langPath: OCR_LANG_PATH, gzip: true, logger: () => undefined });
          const ocrText = await ocrPdfPage(page, worker);
          if (ocrText) {
            text = ocrText;
            lines = ocrText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
            usedOcr = true;
          }
        } catch (ocrError: any) {
          console.warn('[central-contabilidade][ocr]', { page: pageNumber, error: String(ocrError?.message || ocrError) });
        }
      }

      const classification = classifyAccountingPage(text, subject);
      pages.push({
        page: pageNumber,
        text,
        lines,
        usedOcr,
        type: classification.type,
        classificationConfidence: classification.confidence,
        classificationReason: classification.reason,
      });
      try { page.cleanup?.(); } catch { /* noop */ }
    }
  } finally {
    try { if (worker) await worker.terminate(); } catch { /* noop */ }
    try { await loading.destroy?.(); } catch { /* noop */ }
    try { await pdf.destroy?.(); } catch { /* noop */ }
  }

  return pages;
};

const copyPages = async (source: PDFDocument, pageNumbers: number[]) => {
  const out = await PDFDocument.create();
  const indexes = pageNumbers.map((page) => page - 1);
  const copied = await out.copyPages(source, indexes);
  copied.forEach((page) => out.addPage(page));
  return new Uint8Array(await out.save({ addDefaultPage: false, useObjectStreams: false }));
};

const detectContractGroups = (pages: PageInfo[]) => {
  const groups: number[][] = [];
  const consumed = new Set<number>();

  for (let i = 0; i < pages.length; i += 1) {
    if (consumed.has(pages[i].page) || pages[i].type !== 'CONTRATO_TRABALHO') continue;
    const group = [pages[i].page];
    consumed.add(pages[i].page);
    const firstCpf = extractCpf(pages[i].text);

    for (let j = i + 1; j < pages.length; j += 1) {
      const next = pages[j];
      if (next.type === 'HOLERITE') break;
      if (next.type === 'OUTRO' && next.classificationConfidence >= 0.98) break;
      if (next.type === 'CONTRATO_TRABALHO') {
        const nextCpf = extractCpf(next.text);
        if (firstCpf && nextCpf && firstCpf !== nextCpf) break;
      }
      group.push(next.page);
      consumed.add(next.page);
    }
    groups.push(group);
  }
  return { groups, consumed };
};

const loadCandidates = async (service: SupabaseClient) => {
  const [{ data: companies, error: companyError }, { data: employees, error: employeeError }, { data: preCadastros, error: preError }] = await Promise.all([
    service.from('empresas').select('id,nome,razao_social,cnpj,status'),
    service.from('funcionarios').select('id,nome,cpf,empresa_id,company_id,data_admissao,status,ativo,excluido_em'),
    service.from('pre_cadastros_admissionais').select('id,nome,cpf,empresa_id,data_admissao,status'),
  ]);
  if (companyError) throw companyError;
  if (employeeError) throw employeeError;
  if (preError) throw preError;
  return {
    companies: (companies || []).filter((row: any) => row.status !== 'inativo'),
    employees: (employees || []).filter((row: any) => row.excluido_em == null && row.status !== 'excluido'),
    preCadastros: preCadastros || [],
  };
};

const createChild = async (ctx: ProcessingContext, input: {
  pages: number[];
  type: AccountingDocumentType;
  text: string;
  usedOcr: boolean;
  status?: string;
  reason?: string;
}) => {
  const pageStart = input.pages[0] || null;
  const pageEnd = input.pages[input.pages.length - 1] || pageStart;
  const childHash = sha256(await copyPages(ctx.sourcePdf, input.pages));
  const { data, error } = await ctx.service.from('contabilidade_email_documentos').insert({
    mensagem_id: ctx.parent.mensagem_id,
    parent_documento_id: ctx.parent.id,
    arquivo_original: ctx.parent.arquivo_original,
    mime_type: 'application/pdf',
    storage_bucket: ctx.parent.storage_bucket,
    storage_path: ctx.parent.storage_path,
    source_sha256: ctx.parent.source_sha256,
    tamanho_bytes: ctx.parent.tamanho_bytes,
    pagina_inicio: pageStart,
    pagina_fim: pageEnd,
    paginas: input.pages,
    tipo_identificado: input.type,
    status: input.status || 'ANALISANDO',
    motivo_decisao: input.reason || null,
    texto_extraido: input.text,
    ocr_utilizado: input.usedOcr,
    document_sha256: childHash,
    tentativas: 1,
  }).select('*').single();
  if (error) throw error;
  return data;
};

const getExistingChild = async (ctx: ProcessingContext, type: AccountingDocumentType, pages: number[]) => {
  const start = pages[0] || null;
  const end = pages[pages.length - 1] || start;
  const { data, error } = await ctx.service
    .from('contabilidade_email_documentos')
    .select('*')
    .eq('parent_documento_id', ctx.parent.id)
    .eq('tipo_identificado', type)
    .eq('pagina_inicio', start)
    .eq('pagina_fim', end)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
};

const ensureChild = async (ctx: ProcessingContext, input: {
  pages: number[];
  type: AccountingDocumentType;
  text: string;
  usedOcr: boolean;
  reason?: string;
}) => {
  const existing = await getExistingChild(ctx, input.type, input.pages);
  if (existing?.destino_id || ['IGNORADO', 'DUPLICADO', 'VINCULADO_AUTOMATICAMENTE'].includes(existing?.status)) return existing;
  if (existing) {
    const { data, error } = await ctx.service.from('contabilidade_email_documentos').update({
      status: 'ANALISANDO',
      texto_extraido: input.text,
      ocr_utilizado: input.usedOcr,
      motivo_decisao: input.reason || existing.motivo_decisao,
      ultimo_erro: null,
      tentativas: Number(existing.tentativas || 0) + 1,
    }).eq('id', existing.id).select('*').single();
    if (error) throw error;
    return data;
  }
  return createChild(ctx, input);
};

const resolveCompanyAndPerson = (ctx: ProcessingContext, text: string, candidateKind: 'employee' | 'pre') => {
  const company = matchCompanySafely(text, ctx.message?.assunto || '', ctx.companies);
  const candidates = candidateKind === 'employee' ? ctx.employees : ctx.preCadastros;
  const person = matchPersonSafely(text, company.row?.id || null, candidates as any[]);
  return { company, person };
};

const markPending = async (ctx: ProcessingContext, child: any, input: {
  text: string;
  company?: any;
  person?: any;
  type: AccountingDocumentType;
  competence?: string | null;
  reason: string;
}) => {
  const cpf = extractCpf(input.text);
  const cnpj = extractCnpj(input.text);
  const nome = extractLikelyFullName(input.text);
  const { data, error } = await ctx.service.from('contabilidade_email_documentos').update({
    status: 'AGUARDANDO_CONFERENCIA',
    tipo_identificado: input.type,
    empresa_id: input.company?.row?.id || null,
    funcionario_id: input.type === 'HOLERITE' ? input.person?.row?.id || null : null,
    pre_cadastro_id: input.type === 'CONTRATO_TRABALHO' ? input.person?.row?.id || null : null,
    cpf_detectado: cpf,
    nome_detectado: nome,
    cnpj_detectado: cnpj,
    competencia: input.competence || null,
    data_admissao_detectada: extractAdmissionDate(input.text),
    funcao_detectada: extractRole(input.text),
    salario_detectado: extractSalary(input.text),
    confianca: Math.min(input.company?.confidence || 0, input.person?.confidence || 0) || 0,
    metodo_vinculo: input.person?.method || input.company?.method || 'NAO_IDENTIFICADO',
    motivo_decisao: input.reason,
  }).eq('id', child.id).select('*').single();
  if (error) throw error;
  await event(ctx.service, { mensagemId: ctx.parent.mensagem_id, documentoId: child.id, evento: 'AGUARDANDO_CONFERENCIA', actorUserId: ctx.actorUserId, payload: { reason: input.reason } });
  return data;
};

const processHolerite = async (ctx: ProcessingContext, page: PageInfo) => {
  const child = await ensureChild(ctx, { pages: [page.page], type: 'HOLERITE', text: page.text, usedOcr: page.usedOcr, reason: page.classificationReason });
  if (['VINCULADO_AUTOMATICAMENTE', 'DUPLICADO'].includes(child.status)) return child;

  const { company, person } = resolveCompanyAndPerson(ctx, page.text, 'employee');
  const competence = extractCompetence(page.text) || extractCompetence(ctx.message?.assunto || '');
  const cpf = extractCpf(page.text);
  const canAutoByCpf = company.row && person.row && person.method === 'CPF' && company.confidence >= 0.7;
  const canAutoByName = company.row && company.confidence >= 0.9 && person.row && person.confidence >= 0.9;

  if (!(canAutoByCpf || canAutoByName) || !competence) {
    const reasons = [company.reason, person.reason, !competence ? 'Competência não identificada.' : ''].filter(Boolean).join(' ');
    return markPending(ctx, child, { text: page.text, company, person, type: 'HOLERITE', competence, reason: reasons });
  }

  const splitBytes = await copyPages(ctx.sourcePdf, [page.page]);
  const documentHash = sha256(splitBytes);
  const identityHash = sha256(relevantDocumentIdentity({ type: 'HOLERITE', cpf, companyId: company.row!.id, competence, text: page.text }));

  const { data: exactDuplicate, error: exactError } = await ctx.service.from('payroll_documents')
    .select('id')
    .or(`document_sha256.eq.${documentHash},source_sha256.eq.${ctx.parent.source_sha256}`)
    .eq('company_id', company.row!.id)
    .eq('employee_id', person.row!.id)
    .eq('competencia', competence)
    .eq('document_type', 'HOLERITE')
    .limit(1)
    .maybeSingle();
  if (exactError) throw exactError;

  let duplicate = exactDuplicate;
  if (!duplicate) {
    const { data: identityDuplicate, error: identityError } = await ctx.service.from('payroll_documents')
      .select('id,extracted_data')
      .eq('company_id', company.row!.id)
      .eq('employee_id', person.row!.id)
      .eq('competencia', competence)
      .eq('document_type', 'HOLERITE')
      .eq('extracted_data->>central_identity_sha256', identityHash)
      .limit(1)
      .maybeSingle();
    if (identityError) throw identityError;
    duplicate = identityDuplicate;
  }

  if (duplicate) {
    const { data, error } = await ctx.service.from('contabilidade_email_documentos').update({
      status: 'DUPLICADO', empresa_id: company.row!.id, funcionario_id: person.row!.id,
      cpf_detectado: cpf, nome_detectado: extractLikelyFullName(page.text) || person.row!.nome,
      cnpj_detectado: extractCnpj(page.text), competencia: competence, confianca: 1,
      metodo_vinculo: person.method, motivo_decisao: 'Documento já registrado para este funcionário/competência.',
      destino_tabela: 'payroll_documents', destino_id: duplicate.id,
    }).eq('id', child.id).select('*').single();
    if (error) throw error;
    await event(ctx.service, { mensagemId: ctx.parent.mensagem_id, documentoId: child.id, evento: 'DOCUMENTO_DUPLICADO', payload: { payroll_document_id: duplicate.id } });
    return data;
  }

  const { data: currentOther, error: currentError } = await ctx.service.from('payroll_documents')
    .select('id,document_sha256')
    .eq('company_id', company.row!.id)
    .eq('employee_id', person.row!.id)
    .eq('competencia', competence)
    .eq('document_type', 'HOLERITE')
    .eq('is_current', true)
    .limit(1)
    .maybeSingle();
  if (currentError) throw currentError;
  if (currentOther) {
    return markPending(ctx, child, {
      text: page.text, company, person, type: 'HOLERITE', competence,
      reason: 'Já existe outro holerite atual para este funcionário e competência. Conferir antes de substituir.',
    });
  }

  const path = `${company.row!.id}/${competence}/holerites/${randomUUID()}-${safeFile(`Recibo_${person.row!.nome || 'Funcionario'}_${competence}.pdf`)}`;
  const { error: uploadError } = await ctx.service.storage.from(PAYROLL_BUCKET).upload(path, splitBytes, { contentType: 'application/pdf', upsert: false });
  if (uploadError) throw uploadError;

  const now = new Date().toISOString();
  const { data: payroll, error: insertError } = await ctx.service.from('payroll_documents').insert({
    company_id: company.row!.id,
    employee_id: person.row!.id,
    competencia: competence,
    document_type: 'HOLERITE',
    storage_bucket: PAYROLL_BUCKET,
    storage_path: path,
    original_filename: safeFile(`Recibo_${person.row!.nome || 'Funcionario'}_${competence}.pdf`),
    mime_type: 'application/pdf',
    file_size: splitBytes.byteLength,
    document_sha256: documentHash,
    source_sha256: ctx.parent.source_sha256,
    source_page_start: page.page,
    source_page_end: page.page,
    document_version: 1,
    is_current: true,
    net_amount: extractNetAmount(page.text),
    extracted_data: {
      origem: 'CENTRAL_CONTABILIDADE_EMAIL',
      central_documento_id: child.id,
      central_mensagem_id: ctx.parent.mensagem_id,
      central_identity_sha256: identityHash,
      cpf_detectado: cpf,
      cnpj_detectado: extractCnpj(page.text),
      nome_detectado: extractLikelyFullName(page.text) || person.row!.nome,
      metodo_vinculo: person.method,
      paginas: [page.page],
      ocr_utilizado: page.usedOcr,
    },
    match_confidence: Math.min(1, Math.max(person.confidence, company.confidence)),
    status: 'AGUARDANDO_PAGAMENTO',
    confirmed: true,
    confirmed_at: now,
    confirmed_by: null,
    created_by: ctx.actorUserId || null,
  }).select('*').single();

  if (insertError) {
    await ctx.service.storage.from(PAYROLL_BUCKET).remove([path]);
    throw insertError;
  }

  const { data: linked, error: linkError } = await ctx.service.from('contabilidade_email_documentos').update({
    status: 'VINCULADO_AUTOMATICAMENTE', empresa_id: company.row!.id, funcionario_id: person.row!.id,
    cpf_detectado: cpf, nome_detectado: extractLikelyFullName(page.text) || person.row!.nome,
    cnpj_detectado: extractCnpj(page.text), competencia: competence,
    data_admissao_detectada: extractAdmissionDate(page.text), funcao_detectada: extractRole(page.text), salario_detectado: extractSalary(page.text),
    confianca: Math.min(1, Math.max(person.confidence, company.confidence)), metodo_vinculo: person.method,
    motivo_decisao: 'Recibo/holerite vinculado automaticamente com identificação segura.',
    destino_tabela: 'payroll_documents', destino_id: payroll.id,
  }).eq('id', child.id).select('*').single();
  if (linkError) throw linkError;

  await event(ctx.service, { mensagemId: ctx.parent.mensagem_id, documentoId: child.id, evento: 'HOLERITE_VINCULADO_AUTOMATICAMENTE', payload: { payroll_document_id: payroll.id, company_id: company.row!.id, employee_id: person.row!.id, competence } });
  return linked;
};

const mergeJsonObject = (value: any) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const mergeJsonArray = (value: any) => Array.isArray(value) ? value : [];

const processContract = async (ctx: ProcessingContext, pageNumbers: number[]) => {
  const groupPages = pageNumbers.map((number) => ctx.pages.find((page) => page.page === number)!).filter(Boolean);
  const text = groupPages.map((page) => page.text).join('\n\n');
  const usedOcr = groupPages.some((page) => page.usedOcr);
  const child = await ensureChild(ctx, { pages: pageNumbers, type: 'CONTRATO_TRABALHO', text, usedOcr, reason: 'Contrato preservado como documento integral.' });
  if (['VINCULADO_AUTOMATICAMENTE', 'DUPLICADO'].includes(child.status)) return child;

  const { company, person } = resolveCompanyAndPerson(ctx, text, 'pre');
  const cpf = extractCpf(text);
  const canAutoByCpf = company.row && person.row && person.method === 'CPF' && company.confidence >= 0.7;
  const canAutoByName = company.row && company.confidence >= 0.9 && person.row && person.confidence >= 0.9;
  if (!(canAutoByCpf || canAutoByName)) {
    const reasons = [company.reason, person.reason].filter(Boolean).join(' ');
    return markPending(ctx, child, { text, company, person, type: 'CONTRATO_TRABALHO', reason: reasons || 'Pré-cadastro não localizado com segurança.' });
  }

  const contractBytes = await copyPages(ctx.sourcePdf, pageNumbers);
  const documentHash = sha256(contractBytes);
  const { data: docs, error: docsError } = await ctx.service.from('pre_cadastro_documentos')
    .select('id,dados_extraidos')
    .eq('pre_cadastro_id', person.row!.id)
    .ilike('tipo_documento', '%CONTRATO%');
  if (docsError) throw docsError;
  const duplicate = (docs || []).find((row: any) => row?.dados_extraidos?.document_sha256 === documentHash);
  if (duplicate) {
    const { data, error } = await ctx.service.from('contabilidade_email_documentos').update({
      status: 'DUPLICADO', empresa_id: company.row!.id, pre_cadastro_id: person.row!.id,
      cpf_detectado: cpf, nome_detectado: extractLikelyFullName(text) || person.row!.nome,
      cnpj_detectado: extractCnpj(text), confianca: 1, metodo_vinculo: person.method,
      motivo_decisao: 'Contrato idêntico já vinculado ao pré-cadastro.', destino_tabela: 'pre_cadastro_documentos', destino_id: duplicate.id,
    }).eq('id', child.id).select('*').single();
    if (error) throw error;
    await event(ctx.service, { mensagemId: ctx.parent.mensagem_id, documentoId: child.id, evento: 'DOCUMENTO_DUPLICADO', payload: { pre_cadastro_documento_id: duplicate.id } });
    return data;
  }

  const fileName = safeFile(`Contrato_Trabalho_${person.row!.nome || 'Funcionario'}.pdf`);
  const path = `central-contabilidade/${person.row!.id}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}-${fileName}`;
  const { error: uploadError } = await ctx.service.storage.from(ADMISSION_BUCKET).upload(path, contractBytes, { contentType: 'application/pdf', upsert: false });
  if (uploadError) throw uploadError;
  const publicUrl = ctx.service.storage.from(ADMISSION_BUCKET).getPublicUrl(path).data.publicUrl;

  const now = new Date().toISOString();
  const { data: preDoc, error: insertError } = await ctx.service.from('pre_cadastro_documentos').insert({
    pre_cadastro_id: person.row!.id,
    tipo_documento: 'CONTRATO DE TRABALHO',
    nome_arquivo: fileName,
    arquivo_url: publicUrl,
    status: 'recebido',
    dados_extraidos: {
      origem: 'CENTRAL_CONTABILIDADE_EMAIL',
      recebido_em: now,
      central_documento_id: child.id,
      central_mensagem_id: ctx.parent.mensagem_id,
      document_sha256: documentHash,
      cpf: cpf,
      empresa_id: company.row!.id,
      data_admissao: extractAdmissionDate(text),
      funcao: extractRole(text),
      salario: extractSalary(text),
      paginas: pageNumbers,
      ocr_utilizado: usedOcr,
    },
  }).select('*').single();
  if (insertError) {
    await ctx.service.storage.from(ADMISSION_BUCKET).remove([path]);
    throw insertError;
  }

  const { data: preRow, error: preLoadError } = await ctx.service.from('pre_cadastros_admissionais')
    .select('dados_extraidos,conferencia,historico,status')
    .eq('id', person.row!.id)
    .single();
  if (preLoadError) throw preLoadError;
  const dados = mergeJsonObject((preRow as any)?.dados_extraidos);
  const conferencia = mergeJsonObject((preRow as any)?.conferencia);
  const historico = mergeJsonArray((preRow as any)?.historico);
  const { error: preUpdateError } = await ctx.service.from('pre_cadastros_admissionais').update({
    dados_extraidos: { ...dados, contrato_recebido: true, contrato_recebido_em: now, contrato_documento_id: preDoc.id },
    conferencia: { ...conferencia, contrato: { status: 'recebido', recebido_em: now, documento_id: preDoc.id } },
    historico: [...historico, { tipo: 'CONTRATO_RECEBIDO_CONTABILIDADE', em: now, documento_id: preDoc.id, central_documento_id: child.id }],
  }).eq('id', person.row!.id);
  if (preUpdateError) throw preUpdateError;

  const { data: linked, error: linkError } = await ctx.service.from('contabilidade_email_documentos').update({
    status: 'VINCULADO_AUTOMATICAMENTE', empresa_id: company.row!.id, pre_cadastro_id: person.row!.id,
    cpf_detectado: cpf, nome_detectado: extractLikelyFullName(text) || person.row!.nome,
    cnpj_detectado: extractCnpj(text), data_admissao_detectada: extractAdmissionDate(text),
    funcao_detectada: extractRole(text), salario_detectado: extractSalary(text),
    confianca: Math.min(1, Math.max(person.confidence, company.confidence)), metodo_vinculo: person.method,
    motivo_decisao: 'Contrato integral vinculado automaticamente ao pré-cadastro; admissão geral não foi concluída.',
    destino_tabela: 'pre_cadastro_documentos', destino_id: preDoc.id,
  }).eq('id', child.id).select('*').single();
  if (linkError) throw linkError;

  await event(ctx.service, { mensagemId: ctx.parent.mensagem_id, documentoId: child.id, evento: 'CONTRATO_VINCULADO_AUTOMATICAMENTE', payload: { pre_cadastro_id: person.row!.id, pre_cadastro_documento_id: preDoc.id, status_pre_cadastro_preservado: (preRow as any)?.status } });
  return linked;
};

const processIgnoredPage = async (ctx: ProcessingContext, page: PageInfo) => {
  const child = await ensureChild(ctx, { pages: [page.page], type: page.type === 'DESCONHECIDO' ? 'DESCONHECIDO' : 'OUTRO', text: page.text, usedOcr: page.usedOcr, reason: page.classificationReason });
  if (child.status === 'IGNORADO') return child;
  const { data, error } = await ctx.service.from('contabilidade_email_documentos').update({
    status: 'IGNORADO', tipo_identificado: page.type === 'DESCONHECIDO' ? 'DESCONHECIDO' : 'OUTRO',
    motivo_decisao: page.classificationReason || 'Documento não permitido pelas regras de importação.',
    cpf_detectado: extractCpf(page.text), cnpj_detectado: extractCnpj(page.text),
  }).eq('id', child.id).select('*').single();
  if (error) throw error;
  await event(ctx.service, { mensagemId: ctx.parent.mensagem_id, documentoId: child.id, evento: 'DOCUMENTO_IGNORADO', payload: { page: page.page, reason: page.classificationReason } });
  return data;
};

const summarizeParentAndMessage = async (ctx: ProcessingContext) => {
  const { data: children, error } = await ctx.service.from('contabilidade_email_documentos')
    .select('status,tipo_identificado')
    .eq('parent_documento_id', ctx.parent.id);
  if (error) throw error;
  const statuses = (children || []).map((row: any) => row.status);
  const parentStatus = statuses.some((status: string) => status === 'ERRO_PROCESSAMENTO') ? 'ERRO_PROCESSAMENTO'
    : statuses.some((status: string) => status === 'AGUARDANDO_CONFERENCIA') ? 'AGUARDANDO_CONFERENCIA'
      : statuses.length && statuses.every((status: string) => status === 'IGNORADO') ? 'IGNORADO'
        : 'PROCESSADO';

  await ctx.service.from('contabilidade_email_documentos').update({ status: parentStatus, ultimo_erro: null }).eq('id', ctx.parent.id);

  const { data: messageDocs, error: messageDocsError } = await ctx.service.from('contabilidade_email_documentos')
    .select('status')
    .eq('mensagem_id', ctx.parent.mensagem_id)
    .is('parent_documento_id', null);
  if (messageDocsError) throw messageDocsError;
  const messageStatuses = (messageDocs || []).map((row: any) => row.status);
  const messageStatus = messageStatuses.some((status: string) => status === 'ERRO_PROCESSAMENTO') ? 'ERRO_PROCESSAMENTO'
    : messageStatuses.some((status: string) => status === 'AGUARDANDO_CONFERENCIA') ? 'AGUARDANDO_CONFERENCIA'
      : messageStatuses.length && messageStatuses.every((status: string) => status === 'IGNORADO') ? 'IGNORADO'
        : messageStatuses.some((status: string) => status === 'RECEBIDO' || status === 'ANALISANDO') ? 'ANALISANDO'
          : 'PROCESSADO';
  await ctx.service.from('contabilidade_email_mensagens').update({ status: messageStatus, processado_em: ['PROCESSADO', 'IGNORADO'].includes(messageStatus) ? new Date().toISOString() : null }).eq('id', ctx.parent.mensagem_id);
  return { parentStatus, messageStatus, children: children || [] };
};

export const processAccountingDocument = async (service: SupabaseClient, documentId: string, actorUserId?: string | null) => {
  const { data: parent, error: parentError } = await service.from('contabilidade_email_documentos').select('*').eq('id', documentId).single();
  if (parentError || !parent) throw parentError || new Error('central_document_not_found');
  if (parent.parent_documento_id) throw new Error('process_only_original_attachment');
  const { data: message, error: messageError } = await service.from('contabilidade_email_mensagens').select('*').eq('id', parent.mensagem_id).single();
  if (messageError) throw messageError;

  await service.from('contabilidade_email_documentos').update({ status: 'ANALISANDO', ultimo_erro: null, tentativas: Number(parent.tentativas || 0) + 1 }).eq('id', parent.id);
  await service.from('contabilidade_email_mensagens').update({ status: 'ANALISANDO' }).eq('id', parent.mensagem_id);
  await event(service, { mensagemId: parent.mensagem_id, documentoId: parent.id, evento: 'PROCESSAMENTO_INICIADO', actorUserId });

  try {
    const { data: blob, error: downloadError } = await service.storage.from(parent.storage_bucket || INBOX_BUCKET).download(parent.storage_path);
    if (downloadError || !blob) throw downloadError || new Error('inbox_pdf_not_found');
    const sourceBytes = new Uint8Array(await blob.arrayBuffer());
    const sourceHash = sha256(sourceBytes);
    if (parent.source_sha256 && parent.source_sha256 !== sourceHash) throw new Error('source_hash_mismatch');
    const sourcePdf = await PDFDocument.load(sourceBytes, { ignoreEncryption: true, updateMetadata: false });
    const pages = await readPdfPages(sourceBytes, message?.assunto || '');
    if (pages.length !== sourcePdf.getPageCount()) throw new Error('pdf_page_count_mismatch');
    const candidates = await loadCandidates(service);
    const ctx: ProcessingContext = { service, parent: { ...parent, source_sha256: sourceHash }, message, sourceBytes, sourcePdf, pages, companies: candidates.companies, employees: candidates.employees, preCadastros: candidates.preCadastros, actorUserId };

    const { groups: contractGroups, consumed: contractPages } = detectContractGroups(pages);
    for (const group of contractGroups) await processContract(ctx, group);
    for (const page of pages) {
      if (contractPages.has(page.page)) continue;
      if (page.type === 'HOLERITE') await processHolerite(ctx, page);
      else await processIgnoredPage(ctx, page);
    }

    const summary = await summarizeParentAndMessage(ctx);
    await event(service, { mensagemId: parent.mensagem_id, documentoId: parent.id, evento: 'PROCESSAMENTO_FINALIZADO', actorUserId, payload: summary });
    return { ok: true, document_id: parent.id, pages: pages.length, ocr_pages: pages.filter((page) => page.usedOcr).length, ...summary };
  } catch (error: any) {
    const messageText = String(error?.message || error);
    await service.from('contabilidade_email_documentos').update({ status: 'ERRO_PROCESSAMENTO', ultimo_erro: messageText }).eq('id', parent.id);
    await service.from('contabilidade_email_mensagens').update({ status: 'ERRO_PROCESSAMENTO', erro: messageText }).eq('id', parent.mensagem_id);
    await event(service, { mensagemId: parent.mensagem_id, documentoId: parent.id, evento: 'ERRO_PROCESSAMENTO', actorUserId, payload: { error: messageText } });
    throw error;
  }
};

export const processAccountingQueue = async (service: SupabaseClient, limit = 4, actorUserId?: string | null) => {
  const { data, error } = await service.from('contabilidade_email_documentos')
    .select('id')
    .is('parent_documento_id', null)
    .in('status', ['RECEBIDO', 'ERRO_PROCESSAMENTO'])
    .order('created_at', { ascending: true })
    .limit(Math.max(1, Math.min(10, limit)));
  if (error) throw error;
  const results: any[] = [];
  for (const row of data || []) {
    try { results.push(await processAccountingDocument(service, row.id, actorUserId)); }
    catch (error: any) { results.push({ ok: false, document_id: row.id, error: String(error?.message || error) }); }
  }
  return results;
};
