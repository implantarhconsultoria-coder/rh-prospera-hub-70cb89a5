import { useEffect, useState } from 'react';
import { FileUp, Loader2, Send, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import ContabilidadeDashboardPage from './ContabilidadeDashboardPage';

type PortalKind = 'principal' | 'goiania';
type Empresa = { id: string; nome: string; codigo?: string; cnpj?: string };
type Sessao = { token: string; expira_em?: string; usuario?: { id?: string; nome?: string } };

const storageKey = (portal: PortalKind) => `topac_contabilidade_${portal}_session`;

const readSession = (portal: PortalKind): Sessao | null => {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(portal)) || 'null');
    if (!parsed?.token) return null;
    if (parsed.expira_em && Date.parse(parsed.expira_em) <= Date.now()) return null;
    return parsed;
  } catch { return null; }
};

const typeOptions = [
  ['folha_processada', 'Folha processada'],
  ['recibos_holerites', 'Recibos / Holerites'],
  ['contrato', 'Contrato de trabalho'],
  ['rescisao', 'Documentos de rescisão'],
  ['ferias', 'Documentos de férias'],
  ['retorno_folha', 'Outro retorno da folha'],
  ['outro', 'Outro documento'],
];

export default function ContabilidadePortalShell({ portal }: { portal: PortalKind }) {
  const [version, setVersion] = useState(0);
  return <>
    <ContabilidadeDashboardPage key={version} portal={portal} />
    <ContabilidadeUploadFab portal={portal} onComplete={() => setVersion((value) => value + 1)} />
  </>;
}

function ContabilidadeUploadFab({ portal, onComplete }: { portal: PortalKind; onComplete: () => void }) {
  const [open, setOpen] = useState(false);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [empresaId, setEmpresaId] = useState('');
  const [tipo, setTipo] = useState('folha_processada');
  const [competencia, setCompetencia] = useState(new Date().toISOString().slice(0, 7));
  const [funcionario, setFuncionario] = useState('');
  const [observacao, setObservacao] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const load = async () => {
      const session = readSession(portal);
      if (!session?.token) return;
      const { data, error } = await supabase.rpc('contabilidade_portal_empresas_sessao' as any, {
        p_token: session.token,
        p_portal: portal,
      });
      if (error) return toast.error('Não foi possível carregar as empresas liberadas.');
      const list = Array.isArray(data) ? data as Empresa[] : [];
      setEmpresas(list);
      if (!empresaId && list[0]?.id) setEmpresaId(list[0].id);
    };
    void load();
  }, [open, portal, empresaId]);

  const reset = () => {
    setFile(null);
    setFuncionario('');
    setObservacao('');
    setTipo('folha_processada');
  };

  const enviar = async () => {
    const session = readSession(portal);
    if (!session?.token) return toast.error('Sua sessão expirou. Entre novamente.');
    if (!empresaId) return toast.error('Selecione a empresa.');
    if (!file) return toast.error('Selecione o PDF que deseja enviar.');
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') return toast.error('Envie somente arquivo PDF.');
    if (file.size > 50 * 1024 * 1024) return toast.error('O PDF pode ter no máximo 50 MB.');

    setBusy(true);
    try {
      const prepareResponse = await fetch('/api/accounting-portal-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'prepare', portal, token: session.token,
          empresa_id: empresaId, arquivo_nome: file.name, tamanho_bytes: file.size,
        }),
      });
      const prepare = await prepareResponse.json();
      if (!prepareResponse.ok || !prepare?.ok) throw new Error(prepare?.error || 'Não foi possível preparar o envio.');

      const uploaded = await supabase.storage.from(prepare.bucket).uploadToSignedUrl(
        prepare.path,
        prepare.upload_token,
        file,
        { contentType: 'application/pdf' },
      );
      if (uploaded.error) throw uploaded.error;

      const finalizeResponse = await fetch('/api/accounting-portal-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'finalize', portal, token: session.token,
          empresa_id: empresaId, storage_path: prepare.path,
          arquivo_nome: file.name, tamanho_bytes: file.size,
          tipo_documento: tipo, competencia: competencia || null,
          funcionario_nome: funcionario || null, observacao: observacao || null,
        }),
      });
      const finalized = await finalizeResponse.json();
      if (!finalizeResponse.ok || !finalized?.ok) throw new Error(finalized?.error || 'O arquivo subiu, mas o registro não foi concluído.');

      if (finalized.email_status === 'enviado') {
        toast.success('Documento recebido pelo RH e formalizado por e-mail.');
      } else if (finalized.email_status === 'aguardando_configuracao') {
        toast.success('Documento recebido pelo RH. O e-mail de formalização ainda precisa ser configurado para este portal.');
      } else {
        toast.success('Documento recebido pelo RH. A formalização por e-mail ficou registrada para reprocessamento.');
      }
      setOpen(false);
      reset();
      onComplete();
    } catch (error: any) {
      toast.error(error?.message || 'Erro ao enviar o documento.');
    } finally {
      setBusy(false);
    }
  };

  return <>
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="fixed z-40 bottom-5 right-5 sm:bottom-7 sm:right-7 flex items-center gap-2 rounded-full bg-indigo-600 text-white shadow-2xl px-5 py-3.5 font-semibold text-sm hover:bg-indigo-700 transition"
    >
      <FileUp className="w-5 h-5" />
      <span className="hidden sm:inline">Enviar documentos para o RH</span>
      <span className="sm:hidden">Enviar PDF</span>
    </button>

    <Dialog open={open} onOpenChange={(value) => !busy && setOpen(value)}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader><DialogTitle>Enviar documento diretamente para o RH</DialogTitle></DialogHeader>
        <p className="text-sm text-slate-500">O PDF entra na plataforma imediatamente. Depois do registro, o sistema formaliza a operação por e-mail quando o destinatário do portal estiver configurado.</p>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="text-sm font-semibold">Empresa</label>
            <select className="mt-1 h-10 w-full rounded-md border bg-white px-3 text-sm" value={empresaId} onChange={(e) => setEmpresaId(e.target.value)}>
              {empresas.map((empresa) => <option key={empresa.id} value={empresa.id}>{empresa.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm font-semibold">Tipo do documento</label>
            <select className="mt-1 h-10 w-full rounded-md border bg-white px-3 text-sm" value={tipo} onChange={(e) => setTipo(e.target.value)}>
              {typeOptions.map(([value,label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm font-semibold">Competência</label>
            <Input className="mt-1" type="month" value={competencia} onChange={(e) => setCompetencia(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="text-sm font-semibold">Funcionário, se o documento for individual</label>
            <Input className="mt-1" value={funcionario} onChange={(e) => setFuncionario(e.target.value)} placeholder="Opcional" />
          </div>
          <div className="sm:col-span-2">
            <label className="text-sm font-semibold">Observação</label>
            <textarea className="mt-1 min-h-[80px] w-full rounded-md border bg-white px-3 py-2 text-sm" value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Opcional" />
          </div>
          <div className="sm:col-span-2">
            <label className="text-sm font-semibold">PDF</label>
            <input className="mt-1 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:font-semibold" type="file" accept="application/pdf,.pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            {file && <div className="mt-2 flex items-center justify-between rounded-lg border bg-slate-50 px-3 py-2 text-xs"><span className="truncate">{file.name} · {(file.size/1024/1024).toFixed(2).replace('.',',')} MB</span><button onClick={() => setFile(null)}><X className="w-4 h-4" /></button></div>}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>Cancelar</Button>
          <Button disabled={busy || !file || !empresaId} onClick={() => void enviar()} className="bg-indigo-600 hover:bg-indigo-700">
            {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
            Enviar para o RH
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  </>;
}
