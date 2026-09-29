import { useCallback, useEffect, useRef, useState } from 'react';
import { Eye, FileText, FileUp, Loader2, RefreshCw, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type PortalKind = 'principal' | 'goiania';

type ProcessEvent = {
  origem_tipo: string;
  origem_id: string;
  empresa_id: string;
  empresa_nome?: string;
  funcionario_nome?: string;
  categoria: string;
  titulo: string;
  data_evento?: string;
  created_at?: string;
  detalhes?: Record<string, any>;
};

type ProcessDocument = {
  id: string;
  tipo_documento?: string | null;
  arquivo_nome: string;
  tamanho_bytes?: number | null;
  status?: string | null;
  formalizacao_email_status?: string | null;
  formalizacao_email_em?: string | null;
  created_at?: string | null;
};

const documentTypeFor = (event: ProcessEvent) => {
  if (event.categoria === 'demissao') return 'rescisao';
  if (event.categoria === 'ferias') return 'ferias';
  if (event.categoria === 'admissao') return 'admissao';
  if (event.categoria === 'atestado') return 'atestado';
  if (event.categoria === 'alteracao_salario') return 'alteracao_salario';
  if (event.categoria === 'alteracao_funcao') return 'alteracao_funcao';
  if (event.categoria === 'fechamento') return 'fechamento';
  if (event.categoria === 'adiantamento') return 'adiantamento';
  return 'outro';
};

const competenceFor = (event: ProcessEvent) => {
  const detail = String(event.detalhes?.competencia || '').trim();
  if (/^\d{4}-\d{2}$/.test(detail)) return detail;
  const direct = String(event.data_evento || event.created_at || '').slice(0, 7);
  return /^\d{4}-\d{2}$/.test(direct) ? direct : null;
};

const formatDateTime = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
};

const emailStatusLabel = (value?: string | null) => {
  const status = String(value || '');
  if (status === 'enviado') return 'E-mail enviado';
  if (status === 'aguardando_envio') return 'Aguardando envio';
  if (status === 'erro_envio_email') return 'Erro no e-mail';
  return 'Anexado';
};

const postJson = async (body: Record<string, unknown>) => {
  const response = await fetch('/api/accounting-portal-upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.ok) {
    throw new Error(data?.message || data?.error || 'Não foi possível concluir a operação.');
  }
  return data;
};

export default function ContabilidadeProcessReturn({
  portal,
  token,
  evento,
}: {
  portal: PortalKind;
  token: string;
  evento: ProcessEvent;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [retrying, setRetrying] = useState('');
  const [docs, setDocs] = useState<ProcessDocument[]>([]);

  const loadDocs = useCallback(async () => {
    if (!token || !evento.empresa_id || !evento.origem_tipo || !evento.origem_id) return;
    setLoadingDocs(true);
    try {
      const data = await postJson({
        action: 'list_process',
        portal,
        token,
        empresa_id: evento.empresa_id,
        origem_tipo: evento.origem_tipo,
        origem_id: evento.origem_id,
      });
      setDocs(Array.isArray(data.documentos) ? data.documentos : []);
    } catch (error) {
      console.error('[contabilidade-process-return][list]', error);
    } finally {
      setLoadingDocs(false);
    }
  }, [evento.empresa_id, evento.origem_id, evento.origem_tipo, portal, token]);

  useEffect(() => { void loadDocs(); }, [loadDocs]);

  const upload = async (file?: File | null) => {
    if (!file) return;
    if (!(file.type === 'application/pdf' || /\.pdf$/i.test(file.name))) {
      return toast.error('Selecione um arquivo PDF.');
    }
    if (file.size <= 0 || file.size > 50 * 1024 * 1024) {
      return toast.error('O PDF deve ter até 50 MB.');
    }

    setUploading(true);
    try {
      const prepared = await postJson({
        action: 'prepare',
        portal,
        token,
        empresa_id: evento.empresa_id,
        arquivo_nome: file.name,
        tamanho_bytes: file.size,
      });

      const { error: storageError } = await (supabase.storage.from(prepared.bucket) as any).uploadToSignedUrl(
        prepared.path,
        prepared.upload_token,
        file,
        { contentType: 'application/pdf', upsert: false },
      );
      if (storageError) throw storageError;

      const finalized = await postJson({
        action: 'finalize',
        portal,
        token,
        empresa_id: evento.empresa_id,
        origem_tipo: evento.origem_tipo,
        origem_id: evento.origem_id,
        tipo_documento: documentTypeFor(evento),
        competencia: competenceFor(evento),
        funcionario_nome: evento.funcionario_nome || null,
        observacao: `Retorno da Contabilidade - ${evento.titulo}`,
        arquivo_nome: file.name,
        tamanho_bytes: file.size,
        storage_path: prepared.path,
      });

      await loadDocs();
      if (finalized?.email_status !== 'enviado') {
        toast.warning('PDF salvo. O envio do e-mail ficou pendente e pode ser reenviado abaixo.');
      } else {
        toast.success('PDF salvo e e-mail de retorno enviado na mesma conversa.');
      }
    } catch (error: any) {
      console.error('[contabilidade-process-return]', error);
      toast.error(error?.message || 'Não foi possível anexar o PDF.');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const retryEmail = async (doc: ProcessDocument) => {
    if (retrying) return;
    setRetrying(doc.id);
    try {
      const competence = competenceFor(evento);
      const typeLabel = documentTypeFor(evento).replace(/_/g, ' ');
      const subject = ['Retorno da Contabilidade', typeLabel, evento.empresa_nome || '', competence || ''].filter(Boolean).join(' - ');
      const body = [
        'Prezados,',
        '',
        `Segue em anexo o retorno da Contabilidade referente a ${evento.titulo}.`,
        '',
        evento.empresa_nome ? `Empresa: ${evento.empresa_nome}` : '',
        evento.funcionario_nome ? `Funcionário: ${evento.funcionario_nome}` : '',
        competence ? `Competência / referência: ${competence}` : '',
        `Documento: ${doc.arquivo_nome}`,
        '',
        'O PDF segue anexado para conferência e arquivamento no TOPAC RH PRO.',
        '',
        'Contabilidade',
      ].filter((line, index, list) => line !== '' || (index > 0 && list[index - 1] !== '')).join('\n');

      await postJson({
        action: 'send_email',
        portal,
        token,
        upload_id: doc.id,
        subject,
        body,
      });
      toast.success('E-mail reenviado com o PDF anexado.');
      await loadDocs();
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível reenviar o e-mail.');
    } finally {
      setRetrying('');
    }
  };

  const openDoc = async (doc: ProcessDocument) => {
    try {
      const data = await postJson({
        action: 'view',
        portal,
        token,
        upload_id: doc.id,
      });
      window.open(String(data.url || ''), '_blank', 'noopener,noreferrer');
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível abrir o PDF.');
    }
  };

  return (
    <section className="rounded-lg border border-violet-500/25 bg-violet-500/[.04] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-black text-white">PDF / Retorno da Contabilidade</div>
          <div className="mt-1 max-w-2xl text-[10px] leading-relaxed text-zinc-500">
            Mesmo fluxo dos pagamentos: anexe o PDF devolvido e envie pela plataforma. O retorno permanece vinculado à mesma conversa de e-mail deste processo.
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={loadingDocs}
          onClick={() => void loadDocs()}
          className="border-[#49335c] bg-[#090b10] text-zinc-300"
        >
          {loadingDocs ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-2 h-3.5 w-3.5" />}
          Atualizar
        </Button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        disabled={uploading}
        onChange={(event) => void upload(event.target.files?.[0])}
      />

      <Button
        type="button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        className="mt-3 bg-violet-600 text-white hover:bg-violet-500"
      >
        {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileUp className="mr-2 h-4 w-4" />}
        {uploading ? 'Subindo PDF...' : 'Subir PDF e responder'}
      </Button>

      <div className="mt-4 border-t border-white/[.06] pt-3">
        <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
          <FileText className="h-3.5 w-3.5" />
          PDFs deste processo ({docs.length})
        </div>

        {loadingDocs && !docs.length ? (
          <div className="flex items-center gap-2 py-2 text-[10px] text-zinc-500"><Loader2 className="h-3.5 w-3.5 animate-spin" />Carregando...</div>
        ) : docs.length ? (
          <div className="space-y-2">
            {docs.map(doc => (
              <div key={doc.id} className="flex items-center gap-3 rounded-md border border-[#2b2532] bg-[#05070a] p-2.5">
                <FileText className="h-4 w-4 shrink-0 text-violet-300" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[10px] font-bold text-zinc-200" title={doc.arquivo_nome}>{doc.arquivo_nome}</div>
                  <div className="mt-0.5 text-[9px] text-zinc-600">
                    {emailStatusLabel(doc.formalizacao_email_status)}
                    {doc.created_at ? ` · ${formatDateTime(doc.created_at)}` : ''}
                  </div>
                </div>
                {doc.formalizacao_email_status !== 'enviado' && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={retrying === doc.id}
                    onClick={() => void retryEmail(doc)}
                    className="h-8 border-amber-500/30 bg-amber-500/10 px-2.5 text-amber-200"
                  >
                    {retrying === doc.id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}
                    Enviar e-mail
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void openDoc(doc)}
                  className="h-8 border-[#49335c] bg-[#090b10] px-2.5 text-zinc-300"
                >
                  <Eye className="mr-1.5 h-3.5 w-3.5" />Abrir
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-[#34283f] bg-[#05070a] px-3 py-4 text-center text-[10px] text-zinc-600">
            Nenhum PDF devolvido neste processo ainda.
          </div>
        )}
      </div>
    </section>
  );
}
