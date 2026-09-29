import { useRef, useState } from 'react';
import { FileUp, Loader2 } from 'lucide-react';
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

const documentTypeFor = (event: ProcessEvent) => {
  if (event.categoria === 'demissao') return 'rescisao';
  if (event.categoria === 'ferias') return 'ferias';
  if (event.categoria === 'admissao') return 'contrato';
  return 'outro';
};

const competenceFor = (event: ProcessEvent) => {
  const detail = String(event.detalhes?.competencia || '').trim();
  if (/^\d{4}-\d{2}$/.test(detail)) return detail;
  const direct = String(event.data_evento || event.created_at || '').slice(0, 7);
  return /^\d{4}-\d{2}$/.test(direct) ? direct : null;
};

const postJson = async (body: Record<string, unknown>) => {
  const response = await fetch('/api/accounting-portal-upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.ok) {
    throw new Error(data?.message || data?.error || 'Não foi possível concluir o retorno à TOPAC.');
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

      await postJson({
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
        defer_email: true,
      });

      toast.success('PDF anexado. Revise o e-mail de retorno para concluir o envio.');
    } catch (error: any) {
      console.error('[contabilidade-process-return]', error);
      toast.error(error?.message || 'Não foi possível preparar o retorno.');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <section className="rounded-lg border border-violet-500/20 bg-violet-500/[.035] p-4">
      <div className="text-xs font-black text-white">Retorno / documento final</div>
      <div className="mt-1 text-[10px] leading-relaxed text-zinc-500">
        Anexe o PDF devolvido. O sistema abre o e-mail já vinculado à mesma conversa iniciada pelo RH.
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
        {uploading ? 'Preparando retorno...' : 'Anexar PDF e responder'}
      </Button>
    </section>
  );
}
