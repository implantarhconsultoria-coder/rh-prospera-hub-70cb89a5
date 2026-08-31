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
import {
  Building2,
  Bus,
  Clock,
  Download,
  Eye,
  FileText,
  FolderLock,
  HardHat,
  Mail,
  Shirt,
  Stethoscope,
  Trash2,
  Upload,
  User,
  Utensils,
  WalletCards,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import PdfDocumentViewer from '@/components/PdfDocumentViewer';
import { useApp } from '@/context/AppContext';
import { downloadDocument, getDocumentUrl, type DocumentSource } from '@/lib/documentUrl';
import { CC_OBRIGATORIO, DESTINATARIOS_CONTABILIDADE } from '@/lib/emailUtils';
import EmailPdfModal, { type EmailPdfDraft } from '@/components/EmailPdfModal';
import { toast } from 'sonner';
import { prepareDocumentTextForSave } from '@/lib/documentoHistoricoTexto';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  funcionarioId: string;
}

type HistoryGroupId =
  | 'pagamentos'
  | 'vr'
  | 'vt'
  | 'atestados'
  | 'documentos'
  | 'epi'
  | 'uniformes';

const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

const HISTORY_GROUPS: Array<{
  id: HistoryGroupId;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'pagamentos', label: 'Pagamentos', shortLabel: 'Pagamentos', icon: WalletCards },
  { id: 'vr', label: 'Vale-Refeição (VR)', shortLabel: 'VR', icon: Utensils },
  { id: 'vt', label: 'Vale-Transporte (VT)', shortLabel: 'VT', icon: Bus },
  { id: 'atestados', label: 'Atestados', shortLabel: 'Atestados', icon: Stethoscope },
  { id: 'documentos', label: 'Contratos e Documentos Pessoais', shortLabel: 'Contratos / Docs.', icon: FolderLock },
  { id: 'epi', label: 'EPI', shortLabel: 'EPI', icon: HardHat },
  { id: 'uniformes', label: 'Uniformes', shortLabel: 'Uniformes', icon: Shirt },
];

const ORIGEM_LABEL: Record<string, string> = {
  gerado_sistema: 'Gerado pelo sistema',
  upload_manual: 'Upload manual',
  pre_cadastro: 'Pré-cadastro',
  email_clinica_soc: 'Clínica / SOC',
  payroll_portal: 'Portal de assinatura',
};

const normalizeText = (value: unknown) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();

const groupsForDocument = (doc: any): HistoryGroupId[] => {
  const text = normalizeText([
    doc.categoria,
    doc.tipo_documento,
    doc.descricao,
    doc.observacao,
    doc.nome_arquivo,
    doc.competencia,
  ].filter(Boolean).join(' | '));

  const groups = new Set<HistoryGroupId>();

  const hasVr = /(^|[^a-z])vr([^a-z]|$)/.test(text)
    || text.includes('vale-refeicao')
    || text.includes('vale refeicao')
    || text.includes('vale alimentacao');
  const hasVt = /(^|[^a-z])vt([^a-z]|$)/.test(text)
    || text.includes('vale-transporte')
    || text.includes('vale transporte');

  if (hasVr) groups.add('vr');
  if (hasVt) groups.add('vt');

  if (text.includes('atestado') || (text.includes('declaracao') && text.includes('hora'))) {
    groups.add('atestados');
  }

  if (text.includes('uniform')) groups.add('uniformes');
  if (text.includes('epi') && !text.includes('uniform')) groups.add('epi');

  const isBenefit = hasVr || hasVt;
  const isPayment = !isBenefit && [
    'holerite',
    'pagamento',
    'folha',
    'salario',
    'comprovante',
    'recibo',
    'apontamento contabilidade',
    'adiantamento',
    'rescisao',
  ].some((term) => text.includes(term));

  if (isPayment) groups.add('pagamentos');

  const isPersonalDocument = [
    'contrato',
    'documentacao',
    'admissional',
    'aso',
    'toxicologico',
    'termo',
    'rg',
    'cpf',
    'cnh',
    'ctps',
    'ficha',
    'ferias',
  ].some((term) => text.includes(term));

  if (isPersonalDocument && !groups.has('epi') && !groups.has('uniformes')) {
    groups.add('documentos');
  }

  // Nada desaparece do histórico: documentos que não encaixam nas demais
  // categorias ficam junto aos documentos pessoais/contratuais.
  if (groups.size === 0) groups.add('documentos');

  return Array.from(groups);
};

const inferTipo = (tipoDocumento: string): string => {
  const t = normalizeText(tipoDocumento);
  if (t.includes('atestado')) return 'atestado';
  if (t.includes('ferias')) return 'ferias';
  if (t.includes('veiculo')) return 'veiculo';
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
  const [viewing, setViewing] = useState<{ source: DocumentSource; titulo: string } | null>(null);
  const [activeGroup, setActiveGroup] = useState<HistoryGroupId>('pagamentos');
  const [categoria, setCategoria] = useState('DOCUMENTACAO ADMISSIONAL');
  const [origem, setOrigem] = useState('upload_manual');
  const [descricao, setDescricao] = useState('');
  const [observacao, setObservacao] = useState('');
  const [arquivo, setArquivo] = useState<File | null>(null);
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

  const groupCounts = useMemo(() => {
    const counts: Record<HistoryGroupId, number> = {
      pagamentos: 0,
      vr: 0,
      vt: 0,
      atestados: 0,
      documentos: 0,
      epi: 0,
      uniformes: 0,
    };
    docs.forEach((doc) => {
      groupsForDocument(doc).forEach((group) => { counts[group] += 1; });
    });
    return counts;
  }, [docs]);

  const docsFiltrados = useMemo(() => docs.filter((doc) => {
    if (!groupsForDocument(doc).includes(activeGroup)) return false;
    const docOrigem = doc.origem || (doc.status_envio === 'gerado' ? 'gerado_sistema' : doc.status_envio) || '';
    const docData = String(doc.data_documento || doc.created_at || '').slice(0, 10);
    const docEmpresa = doc.empresa_nome || '';
    if (filtroOrigem && docOrigem !== filtroOrigem) return false;
    if (filtroData && docData !== filtroData) return false;
    if (filtroEmpresa && docEmpresa !== filtroEmpresa) return false;
    return true;
  }), [activeGroup, docs, filtroData, filtroEmpresa, filtroOrigem]);

  const empresasDisponiveis = useMemo(
    () => Array.from(new Set(docs.map((doc) => doc.empresa_nome).filter(Boolean))).sort(),
    [docs],
  );

  const anexarDocumento = async () => {
    if (!funcionario || !company) {
      toast.error('Funcionário ou empresa não localizados para vincular o documento.');
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
      toast.success('Documento anexado ao histórico do funcionário.');
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível anexar o documento.');
    } finally {
      setUploading(false);
    }
  };

  const excluir = async (doc: any) => {
    if (doc.origem === 'payroll_portal') {
      toast.error('Holerites e recibos do portal são registros protegidos e não podem ser removidos pelo histórico.');
      return;
    }
    if (!confirm('Excluir este documento do histórico?')) return;
    try {
      await excluirDocumentoFuncionario(doc);
      await carregar();
      toast.success('Documento excluído do histórico.');
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível excluir o documento.');
    }
  };

  const isDocumentoContabilidade = (doc: any) => {
    const text = normalizeText(`${doc.categoria || ''} ${doc.tipo_documento || ''} ${doc.descricao || ''} ${doc.nome_arquivo || ''}`);
    return ['rescis', 'aviso previo', 'aso', 'admissional', 'desligamento', 'demissional', 'contrato', 'atestado']
      .some((term) => text.includes(term));
  };

  const sourceFor = (doc: any): DocumentSource => ({
    url: doc.arquivo_url || undefined,
    arquivo_url: doc.arquivo_url || undefined,
    bucket: doc.storage_bucket || 'documentos-funcionarios',
    path: doc.storage_path || doc.arquivo_url || undefined,
    storage_path: doc.storage_path || undefined,
    tipo: inferTipo(doc.categoria || doc.tipo_documento || ''),
  });

  const enviarParaContabilidade = async (doc: any, source: DocumentSource, titulo: string) => {
    if (!session?.user) {
      toast.error('Entre na plataforma para enviar documentos.');
      return;
    }
    if (!funcionario || !company) {
      toast.error('Funcionário ou empresa não localizados.');
      return;
    }

    const fileName = safeFileName(doc.nome_arquivo || `${company.name} - ${titulo} - ${funcionario.name}.pdf`);
    const isAtestado = groupsForDocument(doc).includes('atestados');
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
        toast.error('Não foi possível carregar os e-mails cadastrados da contabilidade.');
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
        toast.error('Nenhum e-mail da contabilidade está cadastrado.');
        return;
      }
    }

    const url = await getDocumentUrl(source);
    if (!url) {
      toast.error('Não foi possível localizar o arquivo para anexar.');
      return;
    }
    const response = await fetch(url);
    if (!response.ok) {
      toast.error('Não foi possível baixar o arquivo para anexar.');
      return;
    }
    const originalBlob = await response.blob();
    const senderName = String(session.user.user_metadata?.nome_completo || session.user.email || 'TOPAC RH PRO');
    const dataDocumento = new Date(doc.data_documento || doc.created_at).toLocaleDateString('pt-BR');
    const detalheDocumento = [doc.descricao, doc.observacao].filter(Boolean).join(' | ') || 'Sem observação/descrição.';

    setEmailPdfDraft({
      to,
      cc,
      subject: isAtestado ? `ATESTADO - ${funcionario.name}` : `${titulo} - ${funcionario.name}`,
      body: isAtestado
        ? [
          'Prezados,',
          '',
          `Funcionário: ${funcionario.name}`,
          `Empresa: ${company.name}`,
          'Tipo do documento: ATESTADO',
          `Data do documento: ${dataDocumento}`,
          `Observação/descrição: ${detalheDocumento}`,
          '',
          'O PDF/arquivo enviado segue em anexo.',
          '',
          'Atenciosamente,',
          senderName,
        ].join('\n')
        : [
          'Prezados,',
          '',
          `Segue em anexo o documento ${titulo} referente ao colaborador ${funcionario.name}.`,
          '',
          `Empresa: ${company.name}`,
          doc.competencia ? `Competência: ${doc.competencia}` : '',
          '',
          'Atenciosamente,',
          senderName,
        ].filter(Boolean).join('\n'),
      attachments: [{
        attachmentBlob: originalBlob,
        attachmentName: fileName,
        attachmentContentType: originalBlob.type || 'application/octet-stream',
        documentId: doc.id,
        documentName: titulo,
      }],
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

  if (loading) return <p className="text-sm text-muted-foreground py-4">Carregando histórico...</p>;

  const activeGroupLabel = HISTORY_GROUPS.find((group) => group.id === activeGroup)?.label || 'Histórico';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
        {HISTORY_GROUPS.map((group) => {
          const Icon = group.icon;
          const selected = activeGroup === group.id;
          return (
            <button
              key={group.id}
              type="button"
              onClick={() => setActiveGroup(group.id)}
              className={`rounded-xl border p-3 text-left transition-colors ${selected ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card hover:bg-muted/40'}`}
              title={group.label}
            >
              <div className="flex items-center justify-between gap-2">
                <Icon className="h-4 w-4" />
                <span className="text-lg font-bold">{groupCounts[group.id]}</span>
              </div>
              <p className="mt-2 text-xs font-semibold leading-tight">{group.shortLabel}</p>
            </button>
          );
        })}
      </div>

      <div className="rounded-lg border border-border p-3 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Upload className="w-4 h-4 text-primary" /> Anexar documento
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
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
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label htmlFor="historico-documento-descricao" className="text-xs text-muted-foreground block mb-1">Descrição/nome do documento</label>
            <Input
              id="historico-documento-descricao"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex.: contrato, documento pessoal, recibo..."
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
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">{activeGroupLabel}</p>
            <p className="text-xs text-muted-foreground">Histórico individual permanente do funcionário.</p>
          </div>
          <Badge variant="outline">{docsFiltrados.length} registro(s)</Badge>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <select value={filtroOrigem} onChange={(e) => setFiltroOrigem(e.target.value)} className="border rounded-lg px-3 py-2 text-sm bg-background text-foreground">
            <option value="">Todas as origens</option>
            {[...DOCUMENTO_ORIGENS_PADRAO, 'payroll_portal'].map((item) => <option key={item} value={item}>{ORIGEM_LABEL[item] || item}</option>)}
          </select>
          <Input type="date" value={filtroData} onChange={(e) => setFiltroData(e.target.value)} />
          <select value={filtroEmpresa} onChange={(e) => setFiltroEmpresa(e.target.value)} className="border rounded-lg px-3 py-2 text-sm bg-background text-foreground">
            <option value="">Todas as empresas</option>
            {empresasDisponiveis.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>
      </div>

      {docsFiltrados.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Nenhum registro nesta categoria.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {docsFiltrados.map((doc: any) => {
            const categoriaDoc = doc.tipo_documento || doc.categoria || 'Documento';
            const origemDoc = doc.origem || (doc.status_envio === 'gerado' ? 'gerado_sistema' : doc.status_envio) || 'gerado_sistema';
            const titulo = `${categoriaDoc}${doc.competencia ? ' - ' + doc.competencia : ''}`;
            const source = sourceFor(doc);
            const protectedPayroll = doc.origem === 'payroll_portal';

            return (
              <div key={`${activeGroup}-${doc.id}`} className="border rounded-lg p-3 hover:bg-muted/20 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="w-4 h-4 text-primary shrink-0" />
                    <div className="min-w-0">
                      <span className="text-sm font-medium text-foreground">{categoriaDoc}</span>
                      {doc.nome_arquivo && <span className="block truncate text-xs text-muted-foreground">{doc.nome_arquivo}</span>}
                      {doc.competencia && <span className="text-xs text-muted-foreground">Competência {doc.competencia}</span>}
                    </div>
                  </div>
                  <Badge className={protectedPayroll ? 'bg-primary/10 text-primary' : doc.status_envio === 'enviado' ? 'bg-success/20 text-success' : 'bg-muted text-muted-foreground'}>
                    {protectedPayroll ? 'Protegido' : doc.status_envio === 'enviado' ? 'Enviado' : ORIGEM_LABEL[origemDoc] || origemDoc}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{doc.descricao || doc.observacao}</p>
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
                        onClick={() => setViewing({ source, titulo })}
                        className="text-[11px] text-primary underline inline-flex items-center gap-1"
                      >
                        <Eye className="w-3 h-3" /> Visualizar
                      </button>
                      <button
                        type="button"
                        onClick={() => void downloadDocument(source, safeFileName(doc.nome_arquivo || `${titulo}.pdf`))}
                        className="text-[11px] text-primary underline inline-flex items-center gap-1"
                      >
                        <Download className="w-3 h-3" /> Baixar
                      </button>
                      {isDocumentoContabilidade(doc) && (
                        <button
                          type="button"
                          onClick={() => void enviarParaContabilidade(doc, source, titulo)}
                          className="text-[11px] text-primary underline inline-flex items-center gap-1"
                        >
                          <Mail className="w-3 h-3" /> Enviar para contabilidade
                        </button>
                      )}
                    </>
                  )}
                  {!protectedPayroll && (
                    <button
                      type="button"
                      onClick={() => void excluir(doc)}
                      className="text-[11px] text-destructive underline inline-flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" /> Excluir
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!viewing} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent className="max-w-5xl p-0 overflow-hidden">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle className="text-base">{viewing?.titulo || 'Documento'}</DialogTitle>
          </DialogHeader>
          <div className="px-6 pb-6 pt-3">
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
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setEmailPdfDraft(null);
        }}
      />
    </div>
  );
};

export default HistoricoDocumentalFuncionario;
