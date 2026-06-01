import { supabase } from '@/integrations/supabase/client';

export const DOCUMENTO_CATEGORIAS_PADRAO = [
  'DOCUMENTACAO ADMISSIONAL',
  'CONTRATO',
  'ASO',
  'ATESTADO',
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
