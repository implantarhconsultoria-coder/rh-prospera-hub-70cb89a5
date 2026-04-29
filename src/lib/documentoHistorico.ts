import { supabase } from '@/integrations/supabase/client';

export type CategoriaDoc =
  | 'epi' | 'uniformes' | 'vr' | 'vt' | 'ferias' | 'atestados'
  | 'rescisoes' | 'aso' | 'ponto' | 'apontamentos' | 'advertencias'
  | 'protocolos' | 'outros';

export const CATEGORIAS_DOC: { v: CategoriaDoc; l: string }[] = [
  { v: 'epi', l: 'EPI' },
  { v: 'uniformes', l: 'Uniformes' },
  { v: 'vr', l: 'VR' },
  { v: 'vt', l: 'VT' },
  { v: 'ferias', l: 'Férias' },
  { v: 'atestados', l: 'Atestados' },
  { v: 'rescisoes', l: 'Rescisões' },
  { v: 'aso', l: 'ASO / Exames' },
  { v: 'ponto', l: 'Ponto' },
  { v: 'apontamentos', l: 'Apontamentos' },
  { v: 'advertencias', l: 'Advertências' },
  { v: 'protocolos', l: 'Protocolos' },
  { v: 'outros', l: 'Outros' },
];

/** Detecta categoria a partir do tipo do documento */
export const detectarCategoria = (tipo: string): CategoriaDoc => {
  const t = (tipo || '').toLowerCase();
  if (t.includes('epi')) return 'epi';
  if (t.includes('uniforme')) return 'uniformes';
  if (t.includes('rescis') || t.includes('trct')) return 'rescisoes';
  if (t.includes('feri')) return 'ferias';
  if (t.includes('atestad')) return 'atestados';
  if (t.includes('aso') || t.includes('exame')) return 'aso';
  if (t.includes('vr')) return 'vr';
  if (t.includes('vt')) return 'vt';
  if (t.includes('ponto') || t.includes('cartão')) return 'ponto';
  if (t.includes('apontament')) return 'apontamentos';
  if (t.includes('advert')) return 'advertencias';
  if (t.includes('protocolo')) return 'protocolos';
  return 'outros';
};

export interface DocumentoRegistro {
  funcionarioId: string;
  funcionarioNome: string;
  companyId: string;
  empresaNome: string;
  tipoDocumento: string;
  categoria?: CategoriaDoc;
  competencia?: string;
  descricao: string;
  arquivoUrl?: string;
  geradoPorUserId: string;
  geradoPorNome: string;
  unidade?: string;
  status?: 'emitido' | 'assinado' | 'arquivado' | 'cancelado';
}

/** Registra um documento no histórico do funcionário */
export const registrarDocumento = async (doc: DocumentoRegistro) => {
  const categoria = doc.categoria || detectarCategoria(doc.tipoDocumento);
  const { data, error } = await supabase.from('documentos_funcionario').insert({
    funcionario_id: doc.funcionarioId,
    funcionario_nome: doc.funcionarioNome,
    company_id: doc.companyId,
    empresa_nome: doc.empresaNome,
    tipo_documento: doc.tipoDocumento,
    categoria,
    competencia: doc.competencia || '',
    descricao: doc.descricao,
    arquivo_url: doc.arquivoUrl || '',
    gerado_por_user_id: doc.geradoPorUserId,
    gerado_por_nome: doc.geradoPorNome,
    unidade: doc.unidade || '',
    status_envio: 'gerado',
    status: doc.status || 'emitido',
  } as any).select().single();

  if (error) {
    console.error('Erro ao registrar documento:', error);
    throw error;
  }
  return data;
};

/** Marca um documento como enviado */
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

/** Busca histórico de documentos de um funcionário */
export const buscarHistoricoFuncionario = async (funcionarioId: string) => {
  const { data, error } = await supabase
    .from('documentos_funcionario')
    .select('*')
    .eq('funcionario_id', funcionarioId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Erro ao buscar histórico:', error);
    return [];
  }
  return data || [];
};

/** Upload de arquivo (PDF preferencialmente) para storage e retorna URL pública */
export const uploadDocumentoPdf = async (
  funcionarioId: string,
  tipoDocumento: string,
  conteudo: string | Blob,
  extensao: 'pdf' | 'html' = 'html',
): Promise<string> => {
  const blob = typeof conteudo === 'string'
    ? new Blob([conteudo], { type: 'text/html' })
    : conteudo;
  const contentType = extensao === 'pdf' ? 'application/pdf' : 'text/html';
  const fileName = `${funcionarioId}/${tipoDocumento}_${Date.now()}.${extensao}`;

  const { error } = await supabase.storage
    .from('documentos-funcionarios')
    .upload(fileName, blob, { contentType, upsert: false });

  if (error) {
    console.error('Erro no upload:', error);
    return '';
  }

  // Bucket privado: armazenamos apenas o path. Use getFileUrl/openFile para abrir.
  return fileName;
};
