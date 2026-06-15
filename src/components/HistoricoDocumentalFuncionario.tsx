import React, { useEffect, useMemo, useState } from 'react';
import {
  DOCUMENTO_CATEGORIAS_PADRAO,
  DOCUMENTO_ORIGENS_PADRAO,
  buscarHistoricoFuncionario,
  excluirDocumentoFuncionario,
  marcarComoEnviado,
  registrarDocumento,
  uploadDocumentoArquivo,
} from '@/lib/documentoHistorico';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { FileText, Mail, Clock, User, Building2, Eye, Download, Trash2, Upload } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import PdfDocumentViewer from '@/components/PdfDocumentViewer';
import { useApp } from '@/context/AppContext';
import { downloadDocument, getDocumentUrl } from '@/lib/documentUrl';
import { CC_OBRIGATORIO, DESTINATARIOS_CONTABILIDADE } from '@/lib/emailUtils';
import EmailPdfModal, { type EmailPdfDraft } from '@/components/EmailPdfModal';
import { toast } from 'sonner';
import { prepareDocumentTextForSave } from '@/lib/documentoHistoricoTexto';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  funcionarioId: string;
}

const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

const ORIGEM_LABEL: Record<string, string> = {
  gerado_sistema: 'Gerado pelo sistema',
  upload_manual: 'Upload manual',
  pre_cadastro: 'Pre-cadastro',
};

const inferTipo = (tipoDocumento: string): string => {
  const t = (tipoDocumento || '').toLowerCase();
  if (t.includes('atestado')) return 'atestado';
  if (t.includes('ferias') || t.includes('férias')) return 'ferias';
  if (t.includes('veiculo') || t.includes('veículo')) return 'veiculo';
  return 'funcionario';
};

const safeFileName = (value: string) =>
  (value || 'documento.pdf')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w.-]+/g, '_');

const HistoricoDocumentalFuncionario: React.FC<Props> = ({ funcionarioId }) => {
  const { employees, companies, session } = useApp();
  const funcionario = employees.find((e) => e.id === funcionarioId);
  const company = companies.find((c) => c.id === funcionario?.companyId);
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [viewing, setViewing] = useState<{ url: string; tipo: string; titulo: string } | null>(null);
  const [categoria, setCategoria] = useState('DOCUMENTACAO ADMISSIONAL');
  const [origem, setOrigem] = useState('upload_manual');
  const [descricao, setDescricao] = useState('');
  const [observacao, setObservacao] = useState('');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroOrigem, setFiltroOrigem] = useState('');
  const [filtroData, setFiltroData] = useState('');
  const [filtroEmpresa, setFiltroEmpresa] = useState('');
  const [emailPdfDraft, setEmailPdfDraft] = useState<EmailPdfDraft | null>(null);

  const carregar = async () => {
    setLoading(true);
    const data = await buscarHistoricoFuncionario(funcionarioId);
    setDocs(data);
    setLoading(false);
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    buscarHistoricoFuncionario(funcionarioId).then((data) => {
      if (active) {
        setDocs(data);
        setLoading(false);
      }
    });
    return () => { active = false; };
  }, [funcionarioId]);

  const docsFiltrados = useMemo(() => {
    return docs.filter((doc) => {
      const docCategoria = doc.categoria || doc.tipo_documento || '';
      const docOrigem = doc.origem || (doc.status_envio === 'gerado' ? 'gerado_sistema' : doc.status_envio) || '';
      const docData = String(doc.data_documento || doc.created_at || '').slice(0, 10);
      const docEmpresa = doc.empresa_nome || '';
      if (filtroTipo && docCategoria !== filtroTipo) return false;
      if (filtroOrigem && docOrigem !== filtroOrigem) return false;
      if (filtroData && docData !== filtroData) return false;
      if (filtroEmpresa && docEmpresa !== filtroEmpresa) return false;
      return true;
    });
  }, [docs, filtroData, filtroEmpresa, filtroOrigem, filtroTipo]);

  const empresasDisponiveis = useMemo(
    () => Array.from(new Set(docs.map((doc) => doc.empresa_nome).filter(Boolean))).sort(),
    [docs],
  );

  const anexarDocumento = async () => {
    if (!funcionario || !company) {
      toast.error('Funcionario ou empresa nao localizados para vincular o documento.');
      return;
    }
    if (!arquivo) {
      toast.error('Selecione um arquivo PDF, JPG, PNG ou WEBP.');
      return;
    }

    const descricaoSalva = prepareDocumentTextForSave(descricao);
    const observacaoSalva = prepareDocumentTextForSave(observacao);

    setUploading(true);
    try {
      const path = await uploadDocumentoArquivo(
        funcionario.id,
        categoria,
        arquivo,
        arquivo.name,
        funcionario.name,
      );
      await registrarDocumento({
        funcionarioId: funcionario.id,
        funcionarioNome: funcionario.name,
        companyId: company.id,
        empresaNome: company.name,
        tipoDocumento: categoria,
        categoria,
        origem,
        descricao: descricaoSalva || arquivo.name,
        observacao: observacaoSalva,
        arquivoUrl: path,
        storageBucket: 'documentos-funcionarios',
        storagePath: path,
        nomeArquivo: arquivo.name,
        dataDocumento: new Date().toISOString(),
        geradoPorUserId: session?.user?.id || ZERO_UUID,
        geradoPorNome: session?.user?.email || 'Sistema',
        unidade: company.name,
      });
      setArquivo(null);
      setDescricao('');
      setObservacao('');
      await carregar();
      toast.success('Documento anexado ao historico do funcionario.');
    } catch (error: any) {
      toast.error(error?.message || 'Nao foi possivel anexar o documento.');
    } finally {
      setUploading(false);
    }
  };

  const excluir = async (doc: any) => {
    if (!confirm('Excluir este documento do historico?')) return;
    try {
      await excluirDocumentoFuncionario(doc);
      await carregar();
      toast.success('Documento excluido do historico.');
    } catch (error: any) {
      toast.error(error?.message || 'Nao foi possivel excluir o documento.');
    }
  };

  const isDocumentoContabilidade = (doc: any) => {
    const text = `${doc.categoria || ''} ${doc.tipo_documento || ''} ${doc.descricao || ''} ${doc.nome_arquivo || ''}`
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    return [
      'rescis',
      'aviso previo',
      'aso',
      'admissional',
      'desligamento',
      'demissional',
      'contrato',
      'atestado',
    ].some((term) => text.includes(term));
  };

  const enviarParaContabilidade = async (doc: any, source: any, titulo: string) => {
    if (!session?.user) {
      toast.error('Entre na plataforma para enviar documentos.');
      return;
    }
    if (!funcionario || !company) {
      toast.error('Funcionario ou empresa nao localizados.');
      return;
    }
    const fileName = safeFileName(doc.nome_arquivo || `${company.name} - ${titulo} - ${funcionario.name}.pdf`);
    const isAtestado = inferTipo(doc.categoria || doc.tipo_documento || '') === 'atestado';
    let to = [...DESTINATARIOS_CONTABILIDADE] as string[];
    let cc = [...CC_OBRIGATORIO] as string[];
    if (isAtestado) {
      const { data: emailConfig, error: emailConfigError } = await supabase
        .from('config_emails_contabilidade' as any)
        .select('email_marisa,email_robson,emails_copia')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (emailConfigError) {
        toast.error('Nao foi possivel carregar os e-mails cadastrados da contabilidade.');
        return;
      }
      const config = emailConfig as any;
      to = Array.from(new Set(
        [config?.email_marisa, config?.email_robson]
          .flatMap((value) => String(value || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [])
          .map((email) => email.toLowerCase()),
      ));
      cc = Array.from(new Set(
        (String(config?.emails_copia || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [])
          .map((email) => email.toLowerCase())
          .filter((email) => !to.includes(email)),
      ));
      if (!to.length) {
        toast.error('Nenhum e-mail da contabilidade esta cadastrado.');
        return;
      }
    } else if (!fileName.toLowerCase().endsWith('.pdf')) {
      toast.error('Este documento ainda nao esta salvo como PDF. Gere o PDF novamente antes de enviar.');
      return;
    }
    const url = await getDocumentUrl(source);
    if (!url) {
      toast.error('Nao foi possivel localizar o arquivo para anexar.');
      return;
    }
    const response = await fetch(url);
    if (!response.ok) {
      toast.error('Nao foi possivel baixar o arquivo para anexar.');
      return;
    }
    const originalBlob = await response.blob();
    const attachmentBlob = originalBlob.type === 'application/pdf'
      ? originalBlob
      : new Blob([originalBlob], { type: 'application/pdf' });
    const senderName = String(session.user.user_metadata?.nome_completo || session.user.email || 'TOPAC RH PRO');
    const dataDocumento = new Date(doc.data_documento || doc.created_at).toLocaleDateString('pt-BR');
    const detalheDocumento = [doc.descricao, doc.observacao].filter(Boolean).join(' | ') || 'Sem observacao/descricao.';
    setEmailPdfDraft({
      to,
      cc,
      subject: isAtestado ? `ATESTADO - ${funcionario.name}` : `${titulo} - ${funcionario.name}`,
      body: isAtestado
        ? [
          'Prezados,',
          '',
          `Funcionario: ${funcionario.name}`,
          `Empresa: ${company.name}`,
          'Tipo do documento: ATESTADO',
          `Data do documento: ${dataDocumento}`,
          `Observacao/descricao: ${detalheDocumento}`,
          '',
          'O PDF/arquivo enviado segue em anexo.',
          '',
          'Atenciosamente,',
          senderName,
        ].filter(Boolean).join('\n')
        : [
          'Prezados,',
          '',
          `Segue em anexo o documento ${titulo} referente ao colaborador ${funcionario.name}.`,
          '',
          `Empresa: ${company.name}`,
          doc.competencia ? `Competencia: ${doc.competencia}` : '',
          '',
          'Atenciosamente,',
          senderName,
        ].filter(Boolean).join('\n'),
      ...(isAtestado
        ? {
          attachments: [{
            attachmentBlob: originalBlob,
            attachmentName: fileName,
            attachmentContentType: originalBlob.type || 'application/octet-stream',
            documentId: doc.id,
            documentName: titulo,
          }],
        }
        : { attachmentBlob, attachmentName: fileName }),
      senderUserId: session.user.id,
      senderName,
      senderEmail: session.user.email,
      moduleOrigin: 'historico_documental',
      documentId: doc.id,
      documentName: titulo,
      afterSend: async () => {
        await marcarComoEnviado(doc.id, session.user.id, senderName, [...to, ...cc].join(', '));
        await carregar();
      },
    });
  };

  if (loading) return <p className="text-sm text-muted-foreground py-4">Carregando historico...</p>;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border p-3 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Upload className="w-4 h-4 text-primary" /> Anexar documento
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Tipo/categoria</label>
            <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm bg-background text-foreground">
              {DOCUMENTO_CATEGORIAS_PADRAO.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Origem</label>
            <select value={origem} onChange={(e) => setOrigem(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm bg-background text-foreground">
              {DOCUMENTO_ORIGENS_PADRAO.map((item) => <option key={item} value={item}>{ORIGEM_LABEL[item] || item}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Arquivo</label>
            <Input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={(e) => setArquivo(e.target.files?.[0] || null)} />
          </div>
          <div className="flex items-end">
            <Button type="button" onClick={anexarDocumento} disabled={uploading || !arquivo} className="w-full">
              {uploading ? 'Salvando...' : 'Anexar documento'}
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label htmlFor="historico-documento-descricao" className="text-xs text-muted-foreground block mb-1">Descrição/nome do documento</label>
            <Input
              id="historico-documento-descricao"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex.: CARTA DEMISSIONAL ILMA MENDES GOIANIA"
            />
          </div>
          <div>
            <label htmlFor="historico-documento-observacao" className="text-xs text-muted-foreground block mb-1">Observação do documento</label>
            <Textarea
              id="historico-documento-observacao"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Observação opcional"
              className="min-h-10"
            />
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border p-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} className="border rounded-lg px-3 py-2 text-sm bg-background text-foreground">
            <option value="">Todos os tipos</option>
            {DOCUMENTO_CATEGORIAS_PADRAO.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select value={filtroOrigem} onChange={(e) => setFiltroOrigem(e.target.value)} className="border rounded-lg px-3 py-2 text-sm bg-background text-foreground">
            <option value="">Todas as origens</option>
            {DOCUMENTO_ORIGENS_PADRAO.map((item) => <option key={item} value={item}>{ORIGEM_LABEL[item] || item}</option>)}
          </select>
          <Input type="date" value={filtroData} onChange={(e) => setFiltroData(e.target.value)} />
          <select value={filtroEmpresa} onChange={(e) => setFiltroEmpresa(e.target.value)} className="border rounded-lg px-3 py-2 text-sm bg-background text-foreground">
            <option value="">Todas as empresas</option>
            {empresasDisponiveis.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>
      </div>

      {docs.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Nenhum documento registrado ainda.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">{docsFiltrados.length} de {docs.length} documento(s) no historico</p>
          {docsFiltrados.map((doc: any) => {
            const categoriaDoc = doc.categoria || doc.tipo_documento || 'OUTROS';
            const origemDoc = doc.origem || (doc.status_envio === 'gerado' ? 'gerado_sistema' : doc.status_envio) || 'gerado_sistema';
            const titulo = `${categoriaDoc}${doc.competencia ? ' - ' + doc.competencia : ''}`;
            const source = {
              arquivo_url: doc.arquivo_url,
              storage_path: doc.storage_path,
              bucket: doc.storage_bucket || 'documentos-funcionarios',
              tipo: inferTipo(categoriaDoc),
            };
            return (
              <div key={doc.id} className="border rounded-lg p-3 hover:bg-muted/20 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-primary shrink-0" />
                    <div>
                      <span className="text-sm font-medium text-foreground">{categoriaDoc}</span>
                      {doc.nome_arquivo && <span className="text-xs text-muted-foreground ml-2">{doc.nome_arquivo}</span>}
                      {doc.competencia && <span className="text-xs text-muted-foreground ml-2">({doc.competencia})</span>}
                    </div>
                  </div>
                  <Badge className={doc.status_envio === 'enviado' ? 'bg-success/20 text-success' : 'bg-muted text-muted-foreground'}>
                    {doc.status_envio === 'enviado' ? 'Enviado' : ORIGEM_LABEL[origemDoc] || origemDoc}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{doc.observacao || doc.descricao}</p>
                <div className="flex flex-wrap gap-3 mt-2 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(doc.data_documento || doc.created_at).toLocaleString('pt-BR')}</span>
                  <span className="flex items-center gap-1"><User className="w-3 h-3" />{doc.funcionario_nome || funcionario?.name}</span>
                  <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{doc.empresa_nome}</span>
                </div>
                {doc.status_envio === 'enviado' && doc.enviado_em && (
                  <div className="flex items-center gap-1 mt-1 text-[10px] text-success">
                    <Mail className="w-3 h-3" />
                    Enviado em {new Date(doc.enviado_em).toLocaleString('pt-BR')} por {doc.enviado_por_nome}
                    {doc.destinatarios && <span className="ml-1">para {doc.destinatarios}</span>}
                  </div>
                )}
                <div className="flex flex-wrap gap-3 mt-2">
                  {(doc.arquivo_url || doc.storage_path) && (
                    <>
                      <button
                        type="button"
                        onClick={() => setViewing({ url: doc.storage_path || doc.arquivo_url, tipo: inferTipo(categoriaDoc), titulo })}
                        className="text-[11px] text-primary underline inline-flex items-center gap-1"
                      >
                        <Eye className="w-3 h-3" /> Visualizar
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadDocument(source, safeFileName(doc.nome_arquivo || `${titulo}.pdf`))}
                        className="text-[11px] text-primary underline inline-flex items-center gap-1"
                      >
                        <Download className="w-3 h-3" /> Baixar
                      </button>
                      {isDocumentoContabilidade(doc) && (
                        <button
                          type="button"
                          onClick={() => enviarParaContabilidade(doc, source, titulo)}
                          className="text-[11px] text-primary underline inline-flex items-center gap-1"
                        >
                          <Mail className="w-3 h-3" /> Enviar para contabilidade
                        </button>
                      )}
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => excluir(doc)}
                    className="text-[11px] text-destructive underline inline-flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" /> Excluir
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-5xl p-0 overflow-hidden">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle className="text-base">{viewing?.titulo || 'Documento'}</DialogTitle>
          </DialogHeader>
          <div className="px-6 pb-6 pt-3">
            <PdfDocumentViewer
              source={viewing ? { url: viewing.url, tipo: viewing.tipo } : undefined}
              title={viewing?.titulo || 'Documento'}
            />
          </div>
        </DialogContent>
      </Dialog>
      <EmailPdfModal
        open={!!emailPdfDraft}
        draft={emailPdfDraft}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setEmailPdfDraft(null);
        }}
      />
    </div>
  );
};

export default HistoricoDocumentalFuncionario;
