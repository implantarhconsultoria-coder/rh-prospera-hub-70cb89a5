import { supabase } from '@/integrations/supabase/client';

export const DOCUMENTO_CATEGORIAS_PADRAO = [
  'DOCUMENTACAO ADMISSIONAL',
  'CONTRATO',
  'ASO',
  'ATESTADO',
  'DECLARACAO DE HORAS',
  'EPI',
  'UNIFORME',
  'VALE-TRANSPORTE / VT',
  'VALE-REFEICAO / VR',
  'FERIAS',
  'RECIBOS',
  'TERMOS',
  'APONTAMENTO CONTABILIDADE',
  'FECHAMENTO',
  'OUTROS',
] as const;

export const DOCUMENTO_ORIGENS_PADRAO = [
  'gerado_sistema',
  'upload_manual',
  'pre_cadastro',
  'email_clinica_soc',
] as const;

export type DocumentoCategoria = typeof DOCUMENTO_CATEGORIAS_PADRAO[number] | string;
export type DocumentoOrigem = typeof DOCUMENTO_ORIGENS_PADRAO[number] | string;

export interface DocumentoRegistro {
  funcionarioId: string;
  funcionarioNome: string;
  companyId: string;
  empresaNome: string;
  tipoDocumento: string;
  competencia?: string;
  descricao: string;
  arquivoUrl?: string;
  geradoPorUserId: string;
  geradoPorNome: string;
  unidade?: string;
  categoria?: DocumentoCategoria;
  origem?: DocumentoOrigem;
  observacao?: string;
  nomeArquivo?: string;
  dataDocumento?: string;
  storageBucket?: string;
  storagePath?: string;
}

export interface ArquivarDocumentoFuncionarioInput extends Omit<DocumentoRegistro, 'arquivoUrl'> {
  conteudo?: string | Blob;
  extensao?: 'pdf' | 'html';
  storageTipo?: string;
  arquivoUrl?: string;
}

const safeStorageName = (value: string) =>
  (value || 'documento')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'documento';

const normalizeText = (value: unknown) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();

const round2 = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

const isMissingEnhancedColumnError = (error: any) =>
  /could not find|schema cache|column/i.test(error?.message || '') &&
  /categoria|origem|observacao|nome_arquivo|data_documento|storage_bucket|storage_path/i.test(error?.message || '');

const getFileExtension = (fileName: string, fallback = 'pdf') => {
  const match = String(fileName || '').match(/\.([a-z0-9]+)$/i);
  return (match?.[1] || fallback).toLowerCase();
};

const contentTypeFromExtension = (ext: string) => {
  if (ext === 'pdf') return 'application/pdf';
  if (['jpg', 'jpeg'].includes(ext)) return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'html') return 'text/html';
  return 'application/octet-stream';
};

const resolveCompetenciaAtestado = (doc: DocumentoRegistro) => {
  if (/^\d{4}-\d{2}$/.test(doc.competencia || '')) return doc.competencia as string;

  const rawDate = String(doc.dataDocumento || '').trim();
  const iso = rawDate.match(/^(\d{4})-(\d{2})-\d{2}/);
  if (iso) return `${iso[1]}-${iso[2]}`;

  const br = rawDate.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/);
  if (br) {
    const year = br[3].length === 2 ? `20${br[3]}` : br[3];
    return `${year}-${br[2].padStart(2, '0')}`;
  }

  return new Date().toISOString().slice(0, 7);
};

const parseHorarioParaHoras = (hora: string, minuto: string) => (Number(hora) || 0) + (Number(minuto) || 0) / 60;

const extrairHorasAtestado = (doc: DocumentoRegistro) => {
  const texto = [doc.tipoDocumento, doc.categoria, doc.descricao, doc.observacao, doc.nomeArquivo]
    .map((item) => String(item || ''))
    .join(' | ');
  const normalizado = normalizeText(texto);
  const ehDocumentoHoras = normalizado.includes('atestado') || (normalizado.includes('declaracao') && normalizado.includes('hora'));
  const mencionaHoras = /\bhora(s)?\b|\d+\s*h\b|\d+h\d{1,2}\b|\d{1,2}:\d{2}/i.test(normalizado);
  if (!ehDocumentoHoras || !mencionaHoras) return 0;

  const intervalo = normalizado.match(/\b(\d{1,2})[:h](\d{2})\b.{0,30}\b(?:as|às|ate|até|-)\b.{0,30}\b(\d{1,2})[:h](\d{2})\b/);
  if (intervalo) {
    const inicio = parseHorarioParaHoras(intervalo[1], intervalo[2]);
    const fim = parseHorarioParaHoras(intervalo[3], intervalo[4]);
    const diferenca = fim >= inicio ? fim - inicio : (24 - inicio) + fim;
    return round2(diferenca);
  }

  const horasMinutos = normalizado.match(/\b(\d{1,2})\s*h\s*(\d{1,2})\b/) || normalizado.match(/\b(\d{1,2}):(\d{2})\b/);
  if (horasMinutos) {
    const horas = Number(horasMinutos[1]) || 0;
    const minutos = Number(horasMinutos[2]) || 0;
    return round2(horas + minutos / 60);
  }

  const decimal = normalizado.match(/\b(\d+(?:[,.]\d+)?)\s*(?:h|hora|horas)\b/);
  if (decimal) return round2(Number(decimal[1].replace(',', '.')) || 0);

  return 0;
};

const appendUniqueObservation = (observacoes: string, marker: string) => {
  const atual = String(observacoes || '').trim();
  if (!marker || atual.includes(marker)) return atual;
  return [atual, marker].filter(Boolean).join(' | ');
};

const appendAtestadoHorasObservacao = (
  observacoes: string,
  horas: number,
  doc: DocumentoRegistro,
) => {
  const referenciaData = doc.dataDocumento ? ` em ${doc.dataDocumento}` : '';
  const marker = `DECLARACAO/ATESTADO HORAS: +${horas.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}h${referenciaData}`;
  const parecer = `PARECER DOCUMENTO: ${doc.tipoDocumento || doc.categoria || 'Documento'}; ${horas.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}h justificadas; arquivo ${doc.nomeArquivo || 'anexado'}`;
  return appendUniqueObservation(appendUniqueObservation(observacoes, marker), parecer);
};

const aplicarAtestadoHorasNoLancamento = async (doc: DocumentoRegistro) => {
  const horas = extrairHorasAtestado(doc);
  if (horas <= 0 || !doc.funcionarioId || !doc.companyId) return;

  const competencia = resolveCompetenciaAtestado(doc);
  const { data: entry, error: entryError } = await supabase
    .from('lancamentos_mensais')
    .select('id, observacoes, bloqueado')
    .eq('funcionario_id', doc.funcionarioId)
    .eq('competencia', competencia)
    .is('apagado_em', null)
    .maybeSingle();

  if (entryError) throw entryError;
  if (entry?.bloqueado) {
    console.warn('Documento reconhecido, mas o fechamento está bloqueado; parecer mantido apenas no histórico documental.', { funcionarioId: doc.funcionarioId, competencia });
    return;
  }

  // Importante: não somamos as horas justificadas em "atrasos".
  // "atrasos" permanece como apontamento bruto; o cálculo desconta o marcador documental.
  const observacoes = appendAtestadoHorasObservacao(String(entry?.observacoes || ''), horas, doc);

  if (entry?.id) {
    const { error } = await supabase
      .from('lancamentos_mensais')
      .update({ observacoes } as any)
      .eq('id', entry.id);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from('lancamentos_mensais').insert({
    funcionario_id: doc.funcionarioId,
    company_id: doc.companyId,
    competencia,
    observacoes,
    origem: 'consolidado',
    status_conferencia: 'pendente',
    user_id: doc.geradoPorUserId || null,
  } as any);
  if (error) throw error;
};

export const registrarDocumento = async (doc: DocumentoRegistro) => {
  const basePayload = {
    funcionario_id: doc.funcionarioId,
    funcionario_nome: doc.funcionarioNome,
    company_id: doc.companyId,
    empresa_nome: doc.empresaNome,
    tipo_documento: doc.tipoDocumento,
    competencia: doc.competencia || '',
    descricao: doc.descricao,
    arquivo_url: doc.arquivoUrl || '',
    gerado_por_user_id: doc.geradoPorUserId,
    gerado_por_nome: doc.geradoPorNome,
    unidade: doc.unidade || '',
    status_envio: 'gerado',
  };

  const enhancedPayload = {
    ...basePayload,
    categoria: doc.categoria || doc.tipoDocumento,
    origem: doc.origem || 'gerado_sistema',
    observacao: doc.observacao || doc.descricao || '',
    nome_arquivo: doc.nomeArquivo || '',
    data_documento: doc.dataDocumento || new Date().toISOString(),
    storage_bucket: doc.storageBucket || (doc.arquivoUrl ? 'documentos-funcionarios' : ''),
    storage_path: doc.storagePath || doc.arquivoUrl || '',
  };

  let result = await supabase.from('documentos_funcionario').insert(enhancedPayload as any).select().single();

  if (result.error && isMissingEnhancedColumnError(result.error)) {
    result = await supabase.from('documentos_funcionario').insert(basePayload as any).select().single();
  }

  if (result.error) {
    console.error('Erro ao registrar documento:', result.error);
    throw result.error;
  }

  try {
    await aplicarAtestadoHorasNoLancamento(doc);
  } catch (error) {
    console.error('Documento registrado, mas nao foi possivel aplicar declaracao/atestado de horas no lancamento:', error);
  }

  return result.data;
};

export const uploadDocumentoArquivo = async (
  funcionarioId: string,
  tipoDocumento: string,
  arquivo: File | Blob | string,
  nomeArquivo: string,
  funcionarioNome?: string,
  competencia?: string,
): Promise<string> => {
  const ext = getFileExtension(nomeArquivo, arquivo instanceof Blob && arquivo.type === 'text/html' ? 'html' : 'pdf');
  const blob = typeof arquivo === 'string'
    ? new Blob([arquivo], { type: 'text/html' })
    : arquivo;
  const contentType = blob.type || contentTypeFromExtension(ext);
  const nomeParte = safeStorageName(funcionarioNome || 'funcionario');
  const competenciaParte = safeStorageName(competencia || new Date().toISOString().slice(0, 10));
  const baseArquivo = safeStorageName(nomeArquivo.replace(/\.[^.]+$/, ''));
  const fileName = `${funcionarioId}/${safeStorageName(tipoDocumento)}/${competenciaParte}_${nomeParte}_${Date.now()}_${baseArquivo}.${ext}`;

  const { error } = await supabase.storage
    .from('documentos-funcionarios')
    .upload(fileName, blob, { contentType, upsert: false });

  if (error) {
    console.error('Erro no upload:', error);
    throw error;
  }

  return fileName;
};

export const arquivarDocumentoFuncionario = async (doc: ArquivarDocumentoFuncionarioInput) => {
  let arquivoUrl = doc.arquivoUrl || '';

  if (!arquivoUrl && doc.conteudo) {
    arquivoUrl = await uploadDocumentoPdf(
      doc.funcionarioId,
      safeStorageName(doc.storageTipo || doc.tipoDocumento),
      doc.conteudo,
      doc.extensao || 'pdf',
      doc.funcionarioNome,
      doc.competencia,
    );
  }

  return registrarDocumento({
    funcionarioId: doc.funcionarioId,
    funcionarioNome: doc.funcionarioNome,
    companyId: doc.companyId,
    empresaNome: doc.empresaNome,
    tipoDocumento: doc.tipoDocumento,
    competencia: doc.competencia,
    descricao: doc.descricao,
    arquivoUrl,
    geradoPorUserId: doc.geradoPorUserId,
    geradoPorNome: doc.geradoPorNome,
    unidade: doc.unidade,
    categoria: doc.categoria || doc.tipoDocumento,
    origem: doc.origem || 'gerado_sistema',
    observacao: doc.observacao || doc.descricao,
    nomeArquivo: doc.nomeArquivo,
    dataDocumento: doc.dataDocumento,
    storageBucket: doc.storageBucket || 'documentos-funcionarios',
    storagePath: doc.storagePath || arquivoUrl,
  });
};

export const marcarComoEnviado = async (
  documentoId: string,
  enviadoPorUserId: string,
  enviadoPorNome: string,
  destinatarios: string,
) => {
  const { error } = await supabase.from('documentos_funcionario').update({
    status_envio: 'enviado',
    enviado_por_user_id: enviadoPorUserId,
    enviado_por_nome: enviadoPorNome,
    enviado_em: new Date().toISOString(),
    destinatarios,
  } as any).eq('id', documentoId);

  if (error) console.error('Erro ao marcar envio:', error);
};

export const buscarHistoricoFuncionario = async (funcionarioId: string) => {
  const { data, error } = await supabase
    .from('documentos_funcionario')
    .select('*')
    .eq('funcionario_id', funcionarioId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Erro ao buscar historico:', error);
    return [];
  }
  return data || [];
};

export const excluirDocumentoFuncionario = async (documento: { id: string; arquivo_url?: string | null; storage_path?: string | null; storage_bucket?: string | null }) => {
  const path = documento.storage_path || documento.arquivo_url || '';
  const bucket = documento.storage_bucket || 'documentos-funcionarios';

  const { error } = await supabase.from('documentos_funcionario').delete().eq('id', documento.id);
  if (error) {
    console.error('Erro ao excluir documento:', error);
    throw error;
  }

  if (path && !/^https?:\/\//i.test(path)) {
    const { error: storageError } = await supabase.storage.from(bucket).remove([path]);
    if (storageError) console.warn('Documento removido do historico, mas storage nao foi limpo:', storageError);
  }
};

export const uploadDocumentoPdf = async (
  funcionarioId: string,
  tipoDocumento: string,
  conteudo: string | Blob,
  extensao: 'pdf' | 'html' = 'html',
  funcionarioNome?: string,
  competencia?: string,
): Promise<string> => {
  const blob = typeof conteudo === 'string'
    ? new Blob([conteudo], { type: 'text/html' })
    : conteudo;
  const nomeParte = safeStorageName(funcionarioNome || 'funcionario');
  const competenciaParte = safeStorageName(competencia || new Date().toISOString().slice(0, 10));
  return uploadDocumentoArquivo(
    funcionarioId,
    tipoDocumento,
    blob,
    `${tipoDocumento}_${nomeParte}_${competenciaParte}_${Date.now()}.${extensao}`,
    funcionarioNome,
    competencia,
  );
};
