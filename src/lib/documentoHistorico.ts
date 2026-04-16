import { supabase } from '@/integrations/supabase/client';

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
}

/** Registra um documento no histórico do funcionário */
export const registrarDocumento = async (doc: DocumentoRegistro) => {
  const { data, error } = await supabase.from('documentos_funcionario').insert({
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

/** Upload de PDF para storage e retorna URL pública */
export const uploadDocumentoPdf = async (
  funcionarioId: string,
  tipoDocumento: string,
  htmlContent: string,
): Promise<string> => {
  // Store the HTML as a file for reference (actual PDF is generated via print)
  const blob = new Blob([htmlContent], { type: 'text/html' });
  const fileName = `${funcionarioId}/${tipoDocumento}_${Date.now()}.html`;
  
  const { error } = await supabase.storage
    .from('documentos-funcionarios')
    .upload(fileName, blob, { contentType: 'text/html', upsert: false });

  if (error) {
    console.error('Erro no upload:', error);
    return '';
  }

  const { data: urlData } = supabase.storage
    .from('documentos-funcionarios')
    .getPublicUrl(fileName);

  return urlData.publicUrl;
};
