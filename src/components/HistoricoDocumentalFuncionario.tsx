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
import { Archive, Building2, ChevronDown, ChevronRight, Clock, Download, Eye, FileText, Folder, FolderOpen, Mail, Trash2, Upload, User } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import PdfDocumentViewer from '@/components/PdfDocumentViewer';
import { useApp } from '@/context/AppContext';
import { downloadDocument, getDocumentUrl, type DocumentSource } from '@/lib/documentUrl';
import EmailPdfModal, { type EmailPdfDraft } from '@/components/EmailPdfModal';
import { CC_OBRIGATORIO, getDestinatariosRescisao } from '@/lib/emailUtils';
import { formatBRL, formatCompetenciaFolder, tipoPagamentoLabel } from '@/lib/comprovantesPagamento';
import { toast } from 'sonner';

interface Props {
  funcionarioId: string;
}

const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

const ORIGEM_LABEL: Record<string, string> = {
  gerado_sistema: 'Gerado pelo sistema',
  upload_manual: 'Upload manual',
  pre_cadastro: 'Pre-cadastro',
  email_clinica_soc: 'E-mail clinica/SOC',
  importacao_comprovante_pagamento: 'Importacao comprovante pagamento',
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

const getDocDateValue = (doc: any) => String(doc.data_documento || doc.created_at || new Date().toISOString());

const getMonthKey = (doc: any) => {
  const dateValue = getDocDateValue(doc);
  const match = dateValue.match(/^(\d{4})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}` : new Date().toISOString().slice(0, 7);
};

const isComprovantePagamento = (doc: any) => {
  const value = `${doc.categoria || ''} ${doc.tipo_documento || ''}`.toUpperCase();
  return value.includes('COMPROVANTE DE PAGAMENTO') || value.includes('PAGAMENTO');
};

const normalizeDocText = (value: unknown) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();

const getDocumentText = (doc: any) => normalizeDocText([
  doc?.categoria,
  doc?.tipo_documento,
  doc?.nome_arquivo,
  doc?.descricao,
  doc?.observacao,
  doc?.subcategoria,
  doc?.status_envio,
].filter(Boolean).join(' '));

const docHasFile = (doc: any) => Boolean(doc?.arquivo_url || doc?.storage_path);

const isDocumentoAso = (doc: any) => {
  const text = getDocumentText(doc);
  return text.includes('ASO') || text.includes('ATESTADO DE SAUDE OCUPACIONAL');
};

const isAsoDemissional = (doc: any) => {
  const text = getDocumentText(doc);
  return isDocumentoAso(doc) && (
    text.includes('DEMISSIONAL') ||
    text.includes('DEMISSAO') ||
    text.includes('DESLIGAMENTO') ||
    text.includes('RESCISAO')
  );
};

const isAvisoPrevio = (doc: any) => {
  const text = getDocumentText(doc);
  return text.includes('AVISO') && text.includes('PREVIO');
};

const isTermoRescisao = (doc: any) => {
  const text = getDocumentText(doc);
  return text.includes('TRCT') || (text.includes('TERMO') && text.includes('RESCISAO'));
};

const isDocumentoRescisao = (doc: any) => {
  const text = getDocumentText(doc);
  return (text.includes('RESCISAO') || text.includes('RESCISOES') || text.includes('TRCT')) &&
    !isDocumentoAso(doc) &&
    !isAvisoPrevio(doc);
};

const isDocumentoDesligamento = (doc: any) => {
  const text = getDocumentText(doc);
  return isDocumentoRescisao(doc) ||
    isAsoDemissional(doc) ||
    isAvisoPrevio(doc) ||
    isTermoRescisao(doc) ||
    text.includes('DESLIGAMENTO') ||
    text.includes('DEMISSIONAL') ||
    text.includes('DEMISSAO');
};

const getDocumentSource = (doc: any): DocumentSource => {
  const categoriaDoc = doc?.categoria || doc?.tipo_documento || 'OUTROS';
  return {
    arquivo_url: doc?.arquivo_url,
    storage_path: doc?.storage_path,
    bucket: doc?.storage_bucket || 'documentos-funcionarios',
    tipo: inferTipo(categoriaDoc),
  };
};

const getCompetenciaPagamento = (doc: any) => {
  if (doc.competencia && /^\d{4}-\d{2}$/.test(String(doc.competencia))) return String(doc.competencia);
  return getMonthKey(doc);
};

const formatMonthFolder = (key: string) => {
  const [year, month] = key.split('-').map(Number);
  return new Date(year, (month || 1) - 1, 1).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  });
};

const HistoricoDocumentalFuncionario: React.FC<Props> = ({ funcionarioId }) => {
  const { employees, companies, session } = useApp();
  const funcionario = employees.find((e) => e.id === funcionarioId);
  const company = companies.find((c) => c.id === funcionario?.companyId);
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [viewing, setViewing] = useState<{ doc: any; source: DocumentSource; titulo: string; isAso: boolean } | null>(null);
  const [emailPdfDraft, setEmailPdfDraft] = useState<EmailPdfDraft | null>(null);
  const [categoria, setCategoria] = useState('DOCUMENTACAO ADMISSIONAL');
  const [origem, setOrigem] = useState('upload_manual');
  const [observacao, setObservacao] = useState('');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroOrigem, setFiltroOrigem] = useState('');
  const [filtroData, setFiltroData] = useState('');
  const [filtroEmpresa, setFiltroEmpresa] = useState('');
  const [pastasAbertas, setPastasAbertas] = useState<Record<string, boolean>>({});

  const mesAtualKey = useMemo(() => new Date().toISOString().slice(0, 7), []);
  const anoAtual = mesAtualKey.slice(0, 4);

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

  const comprovantesPagamentoFiltrados = useMemo(
    () => docsFiltrados.filter(isComprovantePagamento),
    [docsFiltrados],
  );

  const docsGeraisFiltrados = useMemo(
    () => docsFiltrados.filter((doc) => !isComprovantePagamento(doc)),
    [docsFiltrados],
  );

  const pastasComprovantesPagamento = useMemo(() => {
    const grouped = comprovantesPagamentoFiltrados.reduce<Record<string, Record<string, any[]>>>((acc, doc) => {
      const competencia = getCompetenciaPagamento(doc);
      const tipo = doc.subcategoria || tipoPagamentoLabel(doc.tipo_pagamento || 'outros');
      acc[competencia] = acc[competencia] || {};
      acc[competencia][tipo] = acc[competencia][tipo] || [];
      acc[competencia][tipo].push(doc);
      return acc;
    }, {});

    return Object.entries(grouped)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([competencia, grupos]) => ({
        key: `pagamentos-${competencia}`,
        competencia,
        title: formatCompetenciaFolder(competencia),
        grupos: Object.entries(grupos)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([tipo, documentos]) => ({
            tipo,
            documentos: documentos.sort((a, b) => getDocDateValue(b).localeCompare(getDocDateValue(a))),
          })),
      }));
  }, [comprovantesPagamentoFiltrados]);

  const pastasDocumentais = useMemo(() => {
    const grouped = docsGeraisFiltrados.reduce<Record<string, any[]>>((acc, doc) => {
      const key = getMonthKey(doc);
      acc[key] = acc[key] || [];
      acc[key].push(doc);
      return acc;
    }, {});

    return Object.entries(grouped)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([key, documentos]) => ({
        key,
        year: key.slice(0, 4),
        title: formatMonthFolder(key),
        documentos: documentos.sort((a, b) => getDocDateValue(b).localeCompare(getDocDateValue(a))),
      }));
  }, [docsGeraisFiltrados]);

  const pastaAberta = (key: string) => pastasAbertas[key] ?? key === mesAtualKey;

  const togglePasta = (key: string) => {
    setPastasAbertas((current) => ({ ...current, [key]: !pastaAberta(key) }));
  };

  const anexarDocumento = async () => {
    if (!funcionario || !company) {
      toast.error('Funcionario ou empresa nao localizados para vincular o documento.');
      return;
    }
    if (!arquivo) {
      toast.error('Selecione um arquivo PDF, JPG, PNG ou WEBP.');
      return;
    }

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
        descricao: observacao || arquivo.name,
        observacao,
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

  const baixarPdfComoBlob = async (source: DocumentSource) => {
    const url = await getDocumentUrl(source);
    if (!url) throw new Error('Documento indisponivel para anexar ao e-mail.');
    const response = await fetch(url);
    if (!response.ok) throw new Error('Nao foi possivel ler o PDF salvo no historico.');
    const blob = await response.blob();
    return blob.type === 'application/pdf' ? blob : new Blob([blob], { type: 'application/pdf' });
  };

  const abrirEnvioRescisaoContabilidade = async () => {
    if (!viewing || !funcionario || !company) return;

    try {
      const docsComArquivo = docs.filter(docHasFile);
      const rescisaoDoc = docsComArquivo.find(isDocumentoRescisao) || (isDocumentoRescisao(viewing.doc) ? viewing.doc : null);
      const asoDoc = docsComArquivo.find(isAsoDemissional) || docsComArquivo.find(isDocumentoAso) || (isDocumentoAso(viewing.doc) ? viewing.doc : null);
      const avisoDoc = docsComArquivo.find(isAvisoPrevio) || (isAvisoPrevio(viewing.doc) ? viewing.doc : null);
      const termoDoc = docsComArquivo.find(isTermoRescisao) || (isTermoRescisao(viewing.doc) ? viewing.doc : null);
      const documentosSelecionados: { doc: any; label: string }[] = [];
      const selectedIds = new Set<string>();

      const addDoc = (doc: any, label: string) => {
        if (!doc || !docHasFile(doc)) return;
        const key = String(doc.id || doc.nome_arquivo || label);
        if (selectedIds.has(key)) return;
        selectedIds.add(key);
        documentosSelecionados.push({ doc, label });
      };

      addDoc(rescisaoDoc, 'Rescisão');
      addDoc(asoDoc, 'ASO Demissional');
      addDoc(avisoDoc, 'Aviso Prévio');
      addDoc(termoDoc, 'Termo de Rescisão');

      docsComArquivo
        .filter((doc) => isDocumentoDesligamento(doc) && !selectedIds.has(String(doc.id || doc.nome_arquivo || '')))
        .forEach((doc) => addDoc(doc, 'Documento complementar'));

      if (!documentosSelecionados.length) {
        toast.error('Nenhum documento de desligamento com PDF foi encontrado no historico.');
        return;
      }

      const attachments = await Promise.all(documentosSelecionados.map(async ({ doc, label }) => {
        const source = getDocumentSource(doc);
        const pdfBlob = await baixarPdfComoBlob(source);
        const rawName = doc.nome_arquivo || `${company.name} - ${label} - ${funcionario.name}.pdf`;
        const nomeArquivo = safeFileName(rawName);
        return {
          attachmentBlob: pdfBlob,
          attachmentName: nomeArquivo.toLowerCase().endsWith('.pdf') ? nomeArquivo : `${nomeArquivo}.pdf`,
          documentId: doc.id,
          documentName: doc.nome_arquivo || label,
          label,
        };
      }));

      const destinatarios = Array.from(getDestinatariosRescisao(company.name || ''));
      const copias = Array.from(new Set(CC_OBRIGATORIO));
      const missingWarnings = [
        !rescisaoDoc ? 'Atenção: não foi encontrado PDF da Rescisão.' : '',
        !asoDoc ? 'Atenção: não foi encontrado ASO Demissional.' : '',
        !avisoDoc ? 'Atenção: não foi encontrado Aviso Prévio assinado.' : '',
      ].filter(Boolean);
      const complementaresCount = documentosSelecionados.filter((item) => item.label === 'Documento complementar').length;
      const missingTarget = !rescisaoDoc ? 'RESCISOES' : !asoDoc ? 'ASO' : !avisoDoc ? 'TERMOS' : 'OUTROS';

      setEmailPdfDraft({
        to: destinatarios,
        cc: copias,
        subject: `Documentação de Desligamento - ${funcionario.name}`,
        body: [
          'Prezados,',
          '',
          `Segue em anexo toda a documentação referente ao desligamento do colaborador ${funcionario.name}.`,
          '',
          'Documentos anexados:',
          '- Rescisão;',
          '- ASO Demissional;',
          '- Aviso Prévio;',
          '- Documentos complementares.',
          '',
          'Atenciosamente,',
          'TOPAC RH PRO',
        ].join('\n'),
        attachments,
        checklistItems: [
          { label: 'Rescisão', found: Boolean(rescisaoDoc), required: true },
          { label: 'ASO Demissional', found: Boolean(asoDoc), required: true },
          { label: 'Aviso Prévio', found: Boolean(avisoDoc), required: true },
          ...(termoDoc ? [{ label: 'Termo de Rescisão assinado', found: true }] : []),
          {
            label: 'Outros documentos encontrados',
            found: complementaresCount > 0,
            detail: complementaresCount > 0 ? `${complementaresCount} documento(s) complementar(es).` : 'Nenhum complementar localizado.',
          },
        ],
        missingWarnings,
        senderUserId: session?.user?.id,
        senderName: 'Rodrigo De Souza Sabino',
        senderEmail: session?.user?.email,
        moduleOrigin: 'historico_documental_rescisao',
        documentId: documentosSelecionados[0]?.doc?.id,
        documentName: documentosSelecionados.map((item) => item.doc?.nome_arquivo || item.label).join('; '),
        onOpenMissingDocuments: () => {
          setCategoria(missingTarget);
          setEmailPdfDraft(null);
          setViewing(null);
          toast.info('Anexe ou selecione os documentos faltantes no Historico Documental do funcionario.');
        },
        afterSend: async () => {
          if (!session?.user?.id) return;
          await Promise.all(documentosSelecionados
            .filter((item) => item.doc?.id)
            .map((item) => marcarComoEnviado(
              item.doc.id,
              session.user.id,
              'Rodrigo De Souza Sabino',
              [...destinatarios, ...copias].join(', '),
            )));
          await carregar();
        },
      });
    } catch (error: any) {
      toast.error(error?.message || 'Nao foi possivel preparar o envio para a contabilidade.');
    }
  };

  const renderDocumento = (doc: any) => {
    const categoriaDoc = doc.categoria || doc.tipo_documento || 'OUTROS';
    const origemDoc = doc.origem || (doc.status_envio === 'gerado' ? 'gerado_sistema' : doc.status_envio) || 'gerado_sistema';
    const titulo = `${categoriaDoc}${doc.competencia ? ' - ' + doc.competencia : ''}`;
    const source = getDocumentSource(doc);
    const isAso = isDocumentoAso(doc);

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
        <p className="text-xs text-muted-foreground mt-1">{doc.observacao || doc.descricao}</p>
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
                onClick={() => setViewing({ doc, source, titulo, isAso })}
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
        <Input value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Observacao opcional" />
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
          {pastasComprovantesPagamento.length > 0 && (
            <div className="rounded-lg border border-primary/30 overflow-hidden">
              <div className="px-3 py-3 border-b border-border bg-primary/5">
                <div className="flex items-center gap-2">
                  <Archive className="w-4 h-4 text-primary" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">Comprovantes de Pagamento</p>
                    <p className="text-xs text-muted-foreground">Organizado por ano, mes, tipo de pagamento, empresa e arquivo PDF.</p>
                  </div>
                </div>
              </div>
              <div className="space-y-3 p-3">
                {pastasComprovantesPagamento.map((pasta) => (
                  <div key={pasta.key} className="rounded-lg border border-border overflow-hidden">
                    <div className="px-3 py-2 bg-muted/20">
                      <p className="text-sm font-semibold text-foreground">{pasta.title}</p>
                      <p className="text-xs text-muted-foreground">{pasta.grupos.reduce((total, grupo) => total + grupo.documentos.length, 0)} comprovante(s)</p>
                    </div>
                    <div className="space-y-3 p-3">
                      {pasta.grupos.map((grupo) => {
                        const totalGrupo = grupo.documentos.reduce((sum, doc) => sum + (Number(doc.valor_documento) || 0), 0);
                        return (
                          <div key={`${pasta.key}-${grupo.tipo}`} className="rounded-lg border border-border p-3 space-y-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-xs font-semibold uppercase text-muted-foreground">{grupo.tipo}</p>
                              <Badge variant="outline">{grupo.documentos.length} arquivo(s) - {formatBRL(totalGrupo)}</Badge>
                            </div>
                            {grupo.documentos.map(renderDocumento)}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {pastasDocumentais.length === 0 && pastasComprovantesPagamento.length === 0 ? (
            <div className="text-center py-6 text-sm text-muted-foreground">
              Nenhum documento encontrado com os filtros selecionados.
            </div>
          ) : (
            pastasDocumentais.map((pasta) => {
              const aberta = pastaAberta(pasta.key);
              const arquivadaAnoAnterior = pasta.year !== anoAtual;
              return (
                <div key={pasta.key} className="rounded-lg border border-border overflow-hidden">
                  <button
                    type="button"
                    onClick={() => togglePasta(pasta.key)}
                    className="w-full flex items-center justify-between gap-3 px-3 py-3 text-left hover:bg-muted/20 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {aberta ? <FolderOpen className="w-5 h-5 text-primary shrink-0" /> : <Folder className="w-5 h-5 text-primary shrink-0" />}
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground uppercase truncate">{pasta.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {pasta.documentos.length} documento(s)
                          {pasta.key === mesAtualKey ? ' - pasta atual' : arquivadaAnoAnterior ? ` - arquivo anual ${pasta.year}` : ' - arquivo mensal'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge className={pasta.key === mesAtualKey ? 'bg-success/20 text-success' : 'bg-muted text-muted-foreground'}>
                        {pasta.key === mesAtualKey ? 'Aberta' : arquivadaAnoAnterior ? (
                          <span className="inline-flex items-center gap-1"><Archive className="w-3 h-3" /> Ano arquivado</span>
                        ) : 'Mes arquivado'}
                      </Badge>
                      {aberta ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                    </div>
                  </button>
                  {aberta && (
                    <div className="space-y-3 border-t border-border p-3">
                      {pasta.documentos.map(renderDocumento)}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-5xl p-0 overflow-hidden">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle className="text-base">{viewing?.titulo || 'Documento'}</DialogTitle>
          </DialogHeader>
          <div className="px-6 pb-6 pt-3">
            {viewing && (viewing.isAso || isDocumentoDesligamento(viewing.doc)) && (
              <div className="mb-3 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={abrirEnvioRescisaoContabilidade}>
                  <Mail className="w-4 h-4 mr-2" /> Enviar documentação de desligamento
                </Button>
              </div>
            )}
            <PdfDocumentViewer
              source={viewing?.source}
              title={viewing?.titulo || 'Documento'}
            />
          </div>
        </DialogContent>
      </Dialog>
      <EmailPdfModal
        open={!!emailPdfDraft}
        draft={emailPdfDraft}
        onOpenChange={(open) => {
          if (!open) setEmailPdfDraft(null);
        }}
      />
    </div>
  );
};

export default HistoricoDocumentalFuncionario;
