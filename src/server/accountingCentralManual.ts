import { randomUUID } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import type { SupabaseClient } from '@supabase/supabase-js';
import { sha256 } from './payrollServer.js';
import { extractCompetence, extractCpf, extractCnpj, extractAdmissionDate, extractRole, extractSalary } from './accountingCentralRules.js';

const PAYROLL_BUCKET = 'payroll-private';
const ADMISSION_BUCKET = 'documentos-admissionais';

const safeFile = (value: string) => String(value || 'documento.pdf')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^A-Za-z0-9._-]+/g, '_').replace(/_+/g, '_').slice(0, 120);

const copyPages = async (bytes: Uint8Array, pageNumbers: number[]) => {
  const source = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const out = await PDFDocument.create();
  const indexes = pageNumbers.map((page) => page - 1);
  const copied = await out.copyPages(source, indexes);
  copied.forEach((page) => out.addPage(page));
  return new Uint8Array(await out.save({ addDefaultPage: false, useObjectStreams: false }));
};

const loadCentralDocument = async (service: SupabaseClient, id: string) => {
  const { data: child, error } = await service.from('contabilidade_email_documentos').select('*').eq('id', id).single();
  if (error || !child) throw error || new Error('central_document_not_found');
  if (!child.parent_documento_id && !['CONTRATO_TRABALHO', 'HOLERITE'].includes(child.tipo_identificado)) throw new Error('manual_link_requires_classified_document');
  const { data: parent, error: parentError } = child.parent_documento_id
    ? await service.from('contabilidade_email_documentos').select('*').eq('id', child.parent_documento_id).single()
    : { data: child, error: null } as any;
  if (parentError || !parent) throw parentError || new Error('central_parent_not_found');
  const { data: blob, error: downloadError } = await service.storage.from(parent.storage_bucket).download(parent.storage_path);
  if (downloadError || !blob) throw downloadError || new Error('source_pdf_not_found');
  return { child, parent, sourceBytes: new Uint8Array(await blob.arrayBuffer()) };
};

const event = async (service: SupabaseClient, child: any, actorUserId: string, evento: string, payload: Record<string, unknown>) => {
  await service.from('contabilidade_email_eventos').insert({
    mensagem_id: child.mensagem_id,
    documento_id: child.id,
    evento,
    ator_tipo: 'USUARIO',
    ator_user_id: actorUserId,
    payload,
  });
};

export const ignoreAccountingDocument = async (service: SupabaseClient, documentId: string, actorUserId: string, reason: string) => {
  const { data: row, error } = await service.from('contabilidade_email_documentos').update({
    status: 'IGNORADO', decisao: 'MANUAL', revisado_por: actorUserId, revisado_em: new Date().toISOString(),
    motivo_decisao: reason || 'Documento ignorado manualmente pelo administrador.', ultimo_erro: null,
  }).eq('id', documentId).select('*').single();
  if (error) throw error;
  await event(service, row, actorUserId, 'DOCUMENTO_IGNORADO_MANUALMENTE', { reason: row.motivo_decisao });
  return row;
};

export const manualLinkHolerite = async (service: SupabaseClient, documentId: string, employeeId: string, actorUserId: string, competenceOverride?: string) => {
  const { child, parent, sourceBytes } = await loadCentralDocument(service, documentId);
  if (child.tipo_identificado !== 'HOLERITE') throw new Error('document_is_not_holerite');
  const { data: employee, error: employeeError } = await service.from('funcionarios').select('id,nome,cpf,empresa_id,company_id,status,ativo').eq('id', employeeId).single();
  if (employeeError || !employee) throw employeeError || new Error('employee_not_found');
  const companyId = employee.empresa_id || employee.company_id;
  if (!companyId) throw new Error('employee_without_company');
  if (child.empresa_id && child.empresa_id !== companyId) throw Object.assign(new Error('employee_company_mismatch'), { status: 409 });

  const competence = competenceOverride || child.competencia || extractCompetence(child.texto_extraido || '');
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(String(competence || ''))) throw Object.assign(new Error('competence_required'), { status: 409 });
  const pages = Array.isArray(child.paginas) && child.paginas.length ? child.paginas : [child.pagina_inicio].filter(Boolean);
  if (!pages.length) throw new Error('source_pages_missing');
  const bytes = await copyPages(sourceBytes, pages);
  const documentHash = sha256(bytes);

  const { data: duplicate, error: duplicateError } = await service.from('payroll_documents').select('id')
    .eq('document_sha256', documentHash).eq('company_id', companyId).eq('employee_id', employee.id).eq('competencia', competence).limit(1).maybeSingle();
  if (duplicateError) throw duplicateError;
  if (duplicate) {
    const { data, error } = await service.from('contabilidade_email_documentos').update({
      status: 'DUPLICADO', empresa_id: companyId, funcionario_id: employee.id, destino_tabela: 'payroll_documents', destino_id: duplicate.id,
      decisao: 'MANUAL', revisado_por: actorUserId, revisado_em: new Date().toISOString(), confianca: 1, metodo_vinculo: 'REVISAO_MANUAL',
      motivo_decisao: 'Administrador confirmou vínculo, mas o mesmo PDF já estava registrado.',
    }).eq('id', child.id).select('*').single();
    if (error) throw error;
    await event(service, data, actorUserId, 'HOLERITE_DUPLICADO_CONFIRMADO_MANUALMENTE', { payroll_document_id: duplicate.id, employee_id: employee.id });
    return data;
  }

  const { data: current, error: currentError } = await service.from('payroll_documents').select('id')
    .eq('company_id', companyId).eq('employee_id', employee.id).eq('competencia', competence).eq('document_type', 'HOLERITE').eq('is_current', true).limit(1).maybeSingle();
  if (currentError) throw currentError;
  if (current) throw Object.assign(new Error('existing_current_holerite_requires_resolution'), { status: 409, current_document_id: current.id });

  const filename = safeFile(`Recibo_${employee.nome}_${competence}.pdf`);
  const path = `${companyId}/${competence}/holerites/${randomUUID()}-${filename}`;
  const { error: uploadError } = await service.storage.from(PAYROLL_BUCKET).upload(path, bytes, { contentType: 'application/pdf', upsert: false });
  if (uploadError) throw uploadError;
  const now = new Date().toISOString();
  const { data: payroll, error: payrollError } = await service.from('payroll_documents').insert({
    company_id: companyId, employee_id: employee.id, competencia: competence, document_type: 'HOLERITE',
    storage_bucket: PAYROLL_BUCKET, storage_path: path, original_filename: filename, mime_type: 'application/pdf', file_size: bytes.byteLength,
    document_sha256: documentHash, source_sha256: parent.source_sha256, source_page_start: pages[0], source_page_end: pages[pages.length - 1],
    document_version: 1, is_current: true,
    extracted_data: { origem: 'CENTRAL_CONTABILIDADE_EMAIL', central_documento_id: child.id, revisao_manual: true, cpf_detectado: extractCpf(child.texto_extraido || ''), paginas: pages, ocr_utilizado: child.ocr_utilizado === true },
    match_confidence: 1, status: 'AGUARDANDO_PAGAMENTO', confirmed: true, confirmed_at: now, confirmed_by: actorUserId, created_by: actorUserId,
  }).select('*').single();
  if (payrollError) {
    await service.storage.from(PAYROLL_BUCKET).remove([path]);
    throw payrollError;
  }

  const { data: linked, error: linkError } = await service.from('contabilidade_email_documentos').update({
    status: 'VINCULADO_AUTOMATICAMENTE', empresa_id: companyId, funcionario_id: employee.id, competencia: competence,
    cpf_detectado: child.cpf_detectado || employee.cpf, nome_detectado: employee.nome, confianca: 1, metodo_vinculo: 'REVISAO_MANUAL',
    motivo_decisao: 'Vínculo confirmado manualmente pelo administrador.', destino_tabela: 'payroll_documents', destino_id: payroll.id,
    decisao: 'MANUAL', revisado_por: actorUserId, revisado_em: now,
  }).eq('id', child.id).select('*').single();
  if (linkError) throw linkError;
  await event(service, linked, actorUserId, 'HOLERITE_VINCULADO_MANUALMENTE', { payroll_document_id: payroll.id, employee_id: employee.id, competence });
  return linked;
};

const updatePreCadastroContractFlag = async (service: SupabaseClient, preCadastroId: string, preDocId: string, centralDocumentId: string) => {
  const { data: current, error } = await service.from('pre_cadastros_admissionais').select('dados_extraidos,conferencia,historico,status').eq('id', preCadastroId).single();
  if (error) throw error;
  const dados = current?.dados_extraidos && typeof current.dados_extraidos === 'object' && !Array.isArray(current.dados_extraidos) ? current.dados_extraidos : {};
  const conferencia = current?.conferencia && typeof current.conferencia === 'object' && !Array.isArray(current.conferencia) ? current.conferencia : {};
  const historico = Array.isArray(current?.historico) ? current.historico : [];
  const now = new Date().toISOString();
  const { error: updateError } = await service.from('pre_cadastros_admissionais').update({
    dados_extraidos: { ...(dados as any), contrato_recebido: true, contrato_recebido_em: now, contrato_documento_id: preDocId },
    conferencia: { ...(conferencia as any), contrato: { status: 'recebido', recebido_em: now, documento_id: preDocId } },
    historico: [...historico, { tipo: 'CONTRATO_RECEBIDO_CONTABILIDADE', em: now, documento_id: preDocId, central_documento_id: centralDocumentId, manual: true }],
  }).eq('id', preCadastroId);
  if (updateError) throw updateError;
  return current?.status;
};

export const manualLinkContract = async (service: SupabaseClient, documentId: string, preCadastroId: string, actorUserId: string) => {
  const { child, sourceBytes } = await loadCentralDocument(service, documentId);
  if (child.tipo_identificado !== 'CONTRATO_TRABALHO') throw new Error('document_is_not_contract');
  const { data: pre, error: preError } = await service.from('pre_cadastros_admissionais').select('id,nome,cpf,empresa_id,empresa_nome,cnpj,status').eq('id', preCadastroId).single();
  if (preError || !pre) throw preError || new Error('pre_cadastro_not_found');
  if (child.empresa_id && pre.empresa_id && child.empresa_id !== pre.empresa_id) throw Object.assign(new Error('pre_cadastro_company_mismatch'), { status: 409 });
  const pages = Array.isArray(child.paginas) && child.paginas.length ? child.paginas : [child.pagina_inicio].filter(Boolean);
  if (!pages.length) throw new Error('source_pages_missing');
  const bytes = await copyPages(sourceBytes, pages);
  const documentHash = sha256(bytes);

  const { data: existingDocs, error: existingError } = await service.from('pre_cadastro_documentos').select('id,dados_extraidos').eq('pre_cadastro_id', pre.id).ilike('tipo_documento', '%CONTRATO%');
  if (existingError) throw existingError;
  const duplicate = (existingDocs || []).find((row: any) => row?.dados_extraidos?.document_sha256 === documentHash);
  if (duplicate) {
    const { data, error } = await service.from('contabilidade_email_documentos').update({
      status: 'DUPLICADO', empresa_id: pre.empresa_id, pre_cadastro_id: pre.id, destino_tabela: 'pre_cadastro_documentos', destino_id: duplicate.id,
      decisao: 'MANUAL', revisado_por: actorUserId, revisado_em: new Date().toISOString(), confianca: 1, metodo_vinculo: 'REVISAO_MANUAL',
      motivo_decisao: 'Administrador confirmou o pré-cadastro, mas este contrato já estava registrado.',
    }).eq('id', child.id).select('*').single();
    if (error) throw error;
    await event(service, data, actorUserId, 'CONTRATO_DUPLICADO_CONFIRMADO_MANUALMENTE', { pre_cadastro_documento_id: duplicate.id, pre_cadastro_id: pre.id });
    return data;
  }

  const filename = safeFile(`Contrato_Trabalho_${pre.nome}.pdf`);
  const path = `central-contabilidade/${pre.id}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}-${filename}`;
  const { error: uploadError } = await service.storage.from(ADMISSION_BUCKET).upload(path, bytes, { contentType: 'application/pdf', upsert: false });
  if (uploadError) throw uploadError;
  const publicUrl = service.storage.from(ADMISSION_BUCKET).getPublicUrl(path).data.publicUrl;
  const now = new Date().toISOString();
  const { data: preDoc, error: insertError } = await service.from('pre_cadastro_documentos').insert({
    pre_cadastro_id: pre.id, tipo_documento: 'CONTRATO DE TRABALHO', nome_arquivo: filename, arquivo_url: publicUrl, status: 'recebido',
    dados_extraidos: { origem: 'CENTRAL_CONTABILIDADE_EMAIL', recebido_em: now, central_documento_id: child.id, document_sha256: documentHash, revisao_manual: true, cpf: extractCpf(child.texto_extraido || '') || pre.cpf, empresa_id: pre.empresa_id, data_admissao: extractAdmissionDate(child.texto_extraido || ''), funcao: extractRole(child.texto_extraido || ''), salario: extractSalary(child.texto_extraido || ''), paginas: pages, ocr_utilizado: child.ocr_utilizado === true },
  }).select('*').single();
  if (insertError) {
    await service.storage.from(ADMISSION_BUCKET).remove([path]);
    throw insertError;
  }
  const preservedStatus = await updatePreCadastroContractFlag(service, pre.id, preDoc.id, child.id);
  const { data: linked, error: linkError } = await service.from('contabilidade_email_documentos').update({
    status: 'VINCULADO_AUTOMATICAMENTE', empresa_id: pre.empresa_id, pre_cadastro_id: pre.id, cpf_detectado: child.cpf_detectado || pre.cpf,
    nome_detectado: pre.nome, cnpj_detectado: child.cnpj_detectado || pre.cnpj, confianca: 1, metodo_vinculo: 'REVISAO_MANUAL',
    motivo_decisao: 'Contrato vinculado manualmente ao pré-cadastro; status geral da admissão foi preservado.', destino_tabela: 'pre_cadastro_documentos', destino_id: preDoc.id,
    decisao: 'MANUAL', revisado_por: actorUserId, revisado_em: now,
  }).eq('id', child.id).select('*').single();
  if (linkError) throw linkError;
  await event(service, linked, actorUserId, 'CONTRATO_VINCULADO_MANUALMENTE', { pre_cadastro_id: pre.id, pre_cadastro_documento_id: preDoc.id, status_pre_cadastro_preservado: preservedStatus });
  return linked;
};

export const createPreCadastroFromAccounting = async (service: SupabaseClient, documentId: string, actorUserId: string) => {
  const { child } = await loadCentralDocument(service, documentId);
  if (child.tipo_identificado !== 'CONTRATO_TRABALHO') throw new Error('only_contract_can_create_pre_cadastro');
  const text = String(child.texto_extraido || '');
  const cpf = child.cpf_detectado || extractCpf(text);
  const nome = child.nome_detectado || '';
  const empresaId = child.empresa_id || null;
  if (!cpf || !nome || !empresaId) throw Object.assign(new Error('insufficient_data_to_create_pre_cadastro'), { status: 409 });
  const { data: company } = await service.from('empresas').select('id,nome,cnpj').eq('id', empresaId).single();
  const { data: existing } = await service.from('pre_cadastros_admissionais').select('id').eq('cpf', cpf).eq('empresa_id', empresaId).limit(1).maybeSingle();
  if (existing) return { created: false, pre_cadastro_id: existing.id, linked: await manualLinkContract(service, documentId, existing.id, actorUserId) };
  const { data: pre, error } = await service.from('pre_cadastros_admissionais').insert({
    status: 'aguardando_validacao', empresa_id: empresaId, empresa_nome: company?.nome || '', cnpj: company?.cnpj || child.cnpj_detectado || '',
    nome, cpf, data_admissao: child.data_admissao_detectada || extractAdmissionDate(text), funcao: child.funcao_detectada || extractRole(text), salario: child.salario_detectado || extractSalary(text),
    criado_por: actorUserId, dados_extraidos: { origem: 'CENTRAL_CONTABILIDADE_EMAIL', criado_por_documento_pendente: child.id },
    conferencia: { contrato: { status: 'aguardando_vinculo' } }, historico: [{ tipo: 'PRE_CADASTRO_CRIADO_A_PARTIR_CONTRATO', em: new Date().toISOString(), central_documento_id: child.id }],
  }).select('*').single();
  if (error) throw error;
  return { created: true, pre_cadastro_id: pre.id, linked: await manualLinkContract(service, documentId, pre.id, actorUserId) };
};
