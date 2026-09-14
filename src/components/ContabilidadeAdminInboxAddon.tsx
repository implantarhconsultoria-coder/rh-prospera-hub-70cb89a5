import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BadgeCheck, BellRing, CheckCircle2, FileText, Inbox, Loader2, RefreshCw, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';

type Upload = {
  id: string;
  empresa_id: string;
  tipo_documento: string;
  competencia?: string | null;
  funcionario_nome?: string | null;
  observacao?: string | null;
  arquivo_nome: string;
  tamanho_bytes?: number | null;
  status: string;
  formalizacao_email_status: string;
  formalizacao_email_em?: string | null;
  created_at: string;
  empresa?: { nome?: string; codigo?: string } | null;
  usuario?: { nome?: string; email?: string } | null;
};

type Revisao = {
  id: string;
  origem_tipo: string;
  origem_id: string;
  empresa_id: string;
  status: string;
  observacao?: string | null;
  revisor_nome?: string | null;
  revisado_em?: string | null;
  updated_at: string;
  empresa?: { nome?: string } | null;
};

const brDateTime = (value?: string | null) => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(d);
};

const typeLabel: Record<string,string> = {
  folha_processada: 'Folha processada',
  recibos_holerites: 'Recibos / Holerites',
  contrato: 'Contrato de trabalho',
  rescisao: 'Documentos de rescisão',
  ferias: 'Documentos de férias',
  retorno_folha: 'Retorno da contabilidade',
  outro: 'Outro documento',
};

const origemLabel: Record<string,string> = {
  atestado: 'Atestado / afastamento',
  admissao: 'Nova contratação',
  demissao: 'Demissão / rescisão',
  ferias: 'Férias',
  fechamento: 'Fechamento da folha',
  alerta: 'Alteração de salário/função',
};

export default function ContabilidadeAdminInboxAddon() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [revisoes, setRevisoes] = useState<Revisao[]>([]);
  const [tab, setTab] = useState<'documentos'|'conferencias'>('documentos');

  const carregar = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [u, r] = await Promise.all([
        supabase
          .from('contabilidade_portal_uploads')
          .select('id,empresa_id,tipo_documento,competencia,funcionario_nome,observacao,arquivo_nome,tamanho_bytes,status,formalizacao_email_status,formalizacao_email_em,created_at,empresa:empresas(nome,codigo),usuario:contabilidade_portal_usuarios(nome,email)')
          .order('created_at', { ascending: false })
          .limit(100),
        supabase
          .from('contabilidade_portal_revisoes')
          .select('id,origem_tipo,origem_id,empresa_id,status,observacao,revisor_nome,revisado_em,updated_at,empresa:empresas(nome)')
          .order('updated_at', { ascending: false })
          .limit(100),
      ]);
      if (u.error) throw u.error;
      if (r.error) throw r.error;
      setUploads((u.data || []) as any);
      setRevisoes((r.data || []) as any);
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível carregar a Central da Contabilidade.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void carregar();
  }, [open, carregar]);

  useEffect(() => {
    const timer = window.setInterval(() => { if (open) void carregar(true); }, 60_000);
    return () => window.clearInterval(timer);
  }, [open, carregar]);

  const hoje = useMemo(() => {
    const now = new Date();
    const ymd = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    return uploads.filter((u) => u.created_at.slice(0,10) === ymd).length;
  }, [uploads]);

  const pendencias = useMemo(() => revisoes.filter((r) => r.status === 'pendencia').length, [revisoes]);
  const emailsFalha = useMemo(() => uploads.filter((u) => !['enviado','pendente','processando'].includes(u.formalizacao_email_status)).length, [uploads]);

  const abrirPdf = async (upload: Upload) => {
    try {
      const { data: auth } = await supabase.auth.getSession();
      const token = auth.session?.access_token;
      if (!token) throw new Error('Sessão administrativa não encontrada.');
      const response = await fetch('/api/accounting-portal-admin-view', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ upload_id: upload.id }),
      });
      const body = await response.json();
      if (!response.ok || !body?.ok || !body?.url) throw new Error(body?.error || 'Não foi possível abrir o PDF.');
      window.open(body.url, '_blank', 'noopener,noreferrer');
    } catch (error: any) {
      toast.error(error?.message || 'Erro ao abrir documento.');
    }
  };

  return <>
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="no-print fixed z-[45] bottom-5 left-[292px] flex items-center gap-2 rounded-full border border-[#6d28d9] bg-[#100918] px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_50px_rgba(0,0,0,.55),0_0_25px_rgba(124,44,255,.18)] hover:bg-[#1a0d28] transition"
      title="Central da Contabilidade"
    >
      <Inbox className="h-5 w-5 text-[#f4b400]" />
      <span>Central da Contabilidade</span>
      {(hoje + pendencias) > 0 && <span className="grid min-w-6 h-6 place-items-center rounded-full bg-[#7c2cff] px-1 text-[11px] font-bold">{hoje + pendencias}</span>}
    </button>

    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-hidden bg-[#05070b] border-[#38234c] text-zinc-100 p-0">
        <DialogHeader className="p-5 pb-4 border-b border-[#27202d]">
          <div className="flex items-center justify-between gap-3 pr-8">
            <div><DialogTitle className="text-xl">Central da Contabilidade</DialogTitle><p className="text-xs text-zinc-500 mt-1">Retornos enviados pela contabilidade e confirmações feitas no portal.</p></div>
            <Button size="sm" variant="outline" onClick={() => void carregar()} disabled={loading} className="border-[#3b3241] bg-[#0a0d12] text-zinc-300"><RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />Atualizar</Button>
          </div>
        </DialogHeader>

        <div className="p-5 overflow-y-auto">
          <div className="grid grid-cols-3 gap-3 mb-5">
            <MiniCard label="Documentos hoje" value={hoje} icon={FileText} />
            <MiniCard label="Pendências devolvidas" value={pendencias} icon={AlertTriangle} />
            <MiniCard label="Falha de formalização" value={emailsFalha} icon={BellRing} />
          </div>

          <div className="flex gap-2 mb-4">
            <button onClick={() => setTab('documentos')} className={`rounded-lg px-3 py-2 text-sm font-semibold ${tab === 'documentos' ? 'bg-[#7c2cff] text-white' : 'bg-[#101218] text-zinc-400'}`}>Documentos recebidos ({uploads.length})</button>
            <button onClick={() => setTab('conferencias')} className={`rounded-lg px-3 py-2 text-sm font-semibold ${tab === 'conferencias' ? 'bg-[#7c2cff] text-white' : 'bg-[#101218] text-zinc-400'}`}>Conferências ({revisoes.length})</button>
          </div>

          {loading ? <div className="py-16 flex items-center justify-center gap-2 text-zinc-400"><Loader2 className="h-5 w-5 animate-spin" />Carregando...</div> : tab === 'documentos' ? (
            <div className="space-y-2">
              {uploads.length === 0 && <Empty text="Nenhum documento enviado pelo portal ainda." />}
              {uploads.map((u) => <div key={u.id} className="rounded-xl border border-[#252a33] bg-[#080b10] p-4 flex items-start gap-4">
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-[#15101d] text-[#f4b400]"><FileText className="h-5 w-5" /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><span className="font-semibold truncate">{u.arquivo_nome}</span>{u.formalizacao_email_status === 'enviado' && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-300"><BadgeCheck className="h-3 w-3" />E-mail formalizado</span>}</div>
                  <div className="mt-1 text-xs text-zinc-500">{u.empresa?.nome || 'Empresa'} · {typeLabel[u.tipo_documento] || u.tipo_documento}{u.competencia ? ` · ${u.competencia}` : ''}</div>
                  <div className="mt-2 text-xs text-zinc-400">Enviado por <b>{u.usuario?.nome || 'Contabilidade'}</b> em {brDateTime(u.created_at)}</div>
                  {u.funcionario_nome && <div className="text-xs text-zinc-400 mt-1">Funcionário: {u.funcionario_nome}</div>}
                  {u.observacao && <div className="text-xs text-zinc-300 mt-2 rounded-lg bg-white/[.03] border border-white/[.05] p-2">{u.observacao}</div>}
                </div>
                <Button size="sm" variant="outline" className="border-[#3b3241] bg-[#0b0e13]" onClick={() => void abrirPdf(u)}>Abrir PDF</Button>
              </div>)}
            </div>
          ) : (
            <div className="space-y-2">
              {revisoes.length === 0 && <Empty text="Nenhuma conferência registrada pela contabilidade ainda." />}
              {revisoes.map((r) => <div key={r.id} className="rounded-xl border border-[#252a33] bg-[#080b10] p-4 flex items-start gap-4">
                <div className={`grid h-10 w-10 place-items-center rounded-lg ${r.status === 'pendencia' ? 'bg-rose-500/10 text-rose-300' : 'bg-emerald-500/10 text-emerald-300'}`}>{r.status === 'pendencia' ? <AlertTriangle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold">{origemLabel[r.origem_tipo] || r.origem_tipo} · {r.empresa?.nome || 'Empresa'}</div>
                  <div className="text-xs text-zinc-500 mt-1">{r.status === 'pendencia' ? 'Devolvido com pendência' : 'Conferido / OK'} por <b>{r.revisor_nome || 'Contabilidade'}</b> · {brDateTime(r.revisado_em || r.updated_at)}</div>
                  {r.observacao && <div className="mt-2 rounded-lg border border-rose-500/20 bg-rose-500/5 p-2 text-xs text-rose-100">{r.observacao}</div>}
                </div>
              </div>)}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  </>;
}

function MiniCard({ label, value, icon: Icon }: { label: string; value: number; icon: any }) {
  return <div className="rounded-xl border border-[#252a33] bg-[#080b10] p-3"><div className="flex items-center justify-between"><span className="text-[11px] text-zinc-500">{label}</span><Icon className="h-4 w-4 text-[#a855f7]" /></div><div className="text-2xl font-bold mt-2">{value}</div></div>;
}

function Empty({ text }: { text: string }) {
  return <div className="py-14 text-center text-sm text-zinc-500">{text}</div>;
}
