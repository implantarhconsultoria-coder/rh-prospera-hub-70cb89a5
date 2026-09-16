import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Eye, FileUp, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type PortalKind = 'principal' | 'goiania';
type VacationDocType = 'ferias_aviso' | 'ferias_recibo';
type VacationDocument = {
  id: string;
  tipo_documento: VacationDocType;
  arquivo_nome: string;
  tamanho_bytes?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type Props = {
  portal: PortalKind;
  token: string;
  confirmed: boolean;
  evento: {
    origem_id: string;
    empresa_id: string;
    funcionario_nome: string;
    inicio?: string | null;
  };
};

const DOC_META: Record<VacationDocType, { label: string; note: string }> = {
  ferias_aviso: {
    label: 'Aviso de férias',
    note: 'PDF oficial devolvido pela contabilidade.',
  },
  ferias_recibo: {
    label: 'Recibo de férias',
    note: 'Recibo / demonstrativo das férias processadas.',
  },
};

const formatDateTime = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
};

const api = async (body: Record<string, unknown>) => {
  const response = await fetch('/api/accounting-vacation-documents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.ok) throw new Error(data?.message || data?.error || 'Não foi possível concluir a operação.');
  return data;
};

export default function ContabilidadeVacationDocuments({ portal, token, confirmed, evento }: Props) {
  const [docs, setDocs] = useState<Partial<Record<VacationDocType, VacationDocument>>>({});
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<VacationDocType | null>(null);
  const inputRefs = useRef<Partial<Record<VacationDocType, HTMLInputElement | null>>>({});

  const load = useCallback(async () => {
    if (!token || !evento.origem_id || !evento.empresa_id) return;
    setLoading(true);
    try {
      const data = await api({
        action: 'list',
        portal,
        token,
        empresa_id: evento.empresa_id,
        origem_id: evento.origem_id,
      });
      setDocs(data.documentos || {});
    } catch (error: any) {
      console.error('[ferias-documentos-contabilidade][list]', error);
      toast.error('Não foi possível carregar os PDFs de férias.');
    } finally {
      setLoading(false);
    }
  }, [evento.empresa_id, evento.origem_id, portal, token]);

  useEffect(() => { void load(); }, [load]);

  const total = useMemo(() => Number(!!docs.ferias_aviso) + Number(!!docs.ferias_recibo), [docs]);

  const upload = async (type: VacationDocType, file?: File | null) => {
    if (!file) return;
    if (!confirmed) return toast.error('Confirme primeiro o pedido de férias.');
    if (!(file.type === 'application/pdf' || /\.pdf$/i.test(file.name))) return toast.error('Selecione um arquivo PDF.');
    if (file.size <= 0 || file.size > 50 * 1024 * 1024) return toast.error('O PDF deve ter até 50 MB.');

    setUploading(type);
    try {
      const prepared = await api({
        action: 'prepare',
        portal,
        token,
        empresa_id: evento.empresa_id,
        origem_id: evento.origem_id,
        tipo_documento: type,
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

      await api({
        action: 'finalize',
        portal,
        token,
        empresa_id: evento.empresa_id,
        origem_id: evento.origem_id,
        tipo_documento: type,
        arquivo_nome: file.name,
        tamanho_bytes: file.size,
        storage_path: prepared.path,
        competencia: String(evento.inicio || '').slice(0, 7) || null,
      });

      toast.success(`${DOC_META[type].label} anexado ao pedido de férias.`);
      await load();
    } catch (error: any) {
      console.error('[ferias-documentos-contabilidade][upload]', error);
      toast.error(error?.message || 'Não foi possível anexar o PDF.');
    } finally {
      setUploading(null);
      const input = inputRefs.current[type];
      if (input) input.value = '';
    }
  };

  const open = async (doc?: VacationDocument) => {
    if (!doc) return;
    try {
      const data = await api({ action: 'view', portal, token, upload_id: doc.id });
      window.open(String(data.url || ''), '_blank', 'noopener,noreferrer');
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível abrir o PDF.');
    }
  };

  return (
    <section className="rounded-lg border border-[#3a2849] bg-[#080a0f] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-black text-white">Documentos devolvidos pela contabilidade</div>
          <div className="mt-1 text-[10px] text-zinc-500">Depois da confirmação, anexe o aviso e o recibo em PDF. Os arquivos ficam vinculados a este pedido.</div>
        </div>
        <div className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${total === 2 ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/30 bg-amber-500/10 text-amber-300'}`}>{total}/2 anexados</div>
      </div>

      {!confirmed && <div className="mt-3 rounded-md border border-amber-500/20 bg-amber-500/[.05] p-3 text-[11px] text-amber-200">Confirme o pedido de férias para liberar o envio dos PDFs.</div>}

      {loading ? (
        <div className="mt-4 flex items-center gap-2 text-xs text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" />Carregando documentos...</div>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {(Object.keys(DOC_META) as VacationDocType[]).map(type => {
            const meta = DOC_META[type];
            const doc = docs[type];
            const busy = uploading === type;
            return <div key={type} className="rounded-lg border border-[#2b2532] bg-[#05070a] p-3">
              <div className="flex items-start gap-3">
                <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-md border ${doc ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300' : 'border-[#49335c] bg-[#120b18] text-[#b85cff]'}`}>
                  {doc ? <CheckCircle2 className="h-4 w-4" /> : <FileUp className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] font-black text-white">{meta.label}</div>
                  <div className="mt-0.5 text-[9px] text-zinc-500">{meta.note}</div>
                  {doc && <div className="mt-2 truncate text-[10px] font-semibold text-zinc-300" title={doc.arquivo_nome}>{doc.arquivo_nome}</div>}
                  {doc?.created_at && <div className="mt-0.5 text-[9px] text-zinc-600">Enviado em {formatDateTime(doc.created_at)}</div>}
                </div>
              </div>

              <input
                ref={el => { inputRefs.current[type] = el; }}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                disabled={!confirmed || busy}
                onChange={event => void upload(type, event.target.files?.[0])}
              />

              <div className="mt-3 flex flex-wrap gap-2">
                {doc && <Button size="sm" variant="outline" disabled={busy} onClick={() => void open(doc)} className="border-[#49335c] bg-[#090b10] text-zinc-200"><Eye className="mr-2 h-3.5 w-3.5" />Abrir PDF</Button>}
                <Button size="sm" disabled={!confirmed || busy} onClick={() => inputRefs.current[type]?.click()} className="bg-[#7c2cff] text-white hover:bg-[#8d43ff]">
                  {busy ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <FileUp className="mr-2 h-3.5 w-3.5" />}
                  {doc ? 'Substituir PDF' : 'Enviar PDF'}
                </Button>
              </div>
            </div>;
          })}
        </div>
      )}
    </section>
  );
}
