import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, ArrowLeft, BadgeCheck, BellRing, BriefcaseBusiness, Building2,
  CalendarDays, CheckCircle2, ChevronRight, Clock3, FileHeart, FileText,
  FileUp, Loader2, LogOut, RefreshCw, Search, Send, UserPlus, UserRoundX,
  WalletCards,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';

type PortalKind = 'principal' | 'goiania';

type Evento = {
  origem_tipo: string;
  origem_id: string;
  empresa_id: string;
  empresa_nome: string;
  funcionario_id?: string | null;
  funcionario_nome: string;
  categoria: string;
  titulo: string;
  data_evento?: string;
  created_at: string;
  source_updated_at?: string;
  prioridade: string;
  documento_url?: string | null;
  documento_nome?: string | null;
  detalhes?: Record<string, any>;
  formalizado?: boolean;
  formalizado_em?: string | null;
  status: 'aguardando_analise' | 'conferido' | 'pendencia' | 'retificacao' | string;
  observacao?: string | null;
  revisor_nome?: string | null;
  revisado_em?: string | null;
};

type Empresa = { id: string; nome: string; codigo: string; cnpj?: string };
type Sessao = { token: string; expira_em?: string; usuario?: { id: string; nome: string; email?: string; portal?: string } };

type CategoryMeta = {
  label: string;
  short: string;
  icon: any;
  iconClass: string;
  note: string;
  emphasis?: boolean;
};

const storageKey = (portal: PortalKind) => `topac_contabilidade_${portal}_session`;
const accessPath = (portal: PortalKind) => portal === 'goiania' ? '/acesso-contabilidade-goiania' : '/acesso-contabilidade';

const brDateTime = (value?: string | null) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(d);
};

const brDate = (value?: string | null) => {
  if (!value) return '—';
  if (/^\d{2}\/\d{4}$/.test(value)) return value;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR').format(d);
};

const money = (value: unknown) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value ?? '—');
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
};

const labelStatus = (status: string) => ({
  aguardando_analise: 'Aguardando análise',
  conferido: 'Conferido',
  pendencia: 'Com pendência',
  retificacao: 'Retificação',
}[status] || status);

const statusClass = (status: string) => ({
  aguardando_analise: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
  conferido: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
  pendencia: 'border-rose-400/30 bg-rose-400/10 text-rose-300',
  retificacao: 'border-violet-400/30 bg-violet-400/10 text-violet-300',
}[status] || 'border-zinc-700 bg-zinc-800/50 text-zinc-300');

const categoryMeta: Record<string, CategoryMeta> = {
  admissao: {
    label: 'Novas contratações', short: 'Contratações', icon: UserPlus,
    iconClass: 'text-[#f4b400] bg-[#21180a] border-[#5a4411]',
    note: 'Análise individual obrigatória', emphasis: true,
  },
  demissao: {
    label: 'Demissões / Rescisões', short: 'Demissões', icon: UserRoundX,
    iconClass: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
    note: 'Desligamentos e retorno documental',
  },
  ferias: {
    label: 'Férias', short: 'Férias', icon: CalendarDays,
    iconClass: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
    note: 'Períodos, retorno e documentos',
  },
  atestado: {
    label: 'Atestados / Afastamentos', short: 'Atestados', icon: FileHeart,
    iconClass: 'text-amber-300 bg-amber-500/10 border-amber-500/20',
    note: 'PDF, data, período e conferência',
  },
  alteracao_salario: {
    label: 'Alterações salariais', short: 'Salários', icon: WalletCards,
    iconClass: 'text-[#b85cff] bg-[#1b1028] border-[#4d2469]',
    note: 'Análise individual obrigatória', emphasis: true,
  },
  alteracao_funcao: {
    label: 'Alterações de função', short: 'Funções', icon: BriefcaseBusiness,
    iconClass: 'text-fuchsia-400 bg-fuchsia-500/10 border-fuchsia-500/20',
    note: 'Análise individual obrigatória', emphasis: true,
  },
  fechamento: {
    label: 'Fechamentos', short: 'Fechamentos', icon: FileText,
    iconClass: 'text-[#9b32ff] bg-[#180d24] border-[#43205c]',
    note: 'Conferência, OK e retorno ao RH',
  },
};

const pendingStatuses = new Set(['aguardando_analise', 'retificacao', 'pendencia']);

function readSession(portal: PortalKind): Sessao | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(portal)) || 'null');
    if (!parsed?.token) return null;
    if (parsed.expira_em && Date.parse(parsed.expira_em) <= Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

const defaultUploadType = (categoria: string) => ({
  fechamento: 'folha_processada',
  admissao: 'contrato',
  demissao: 'rescisao',
  ferias: 'ferias',
  atestado: 'outro',
  alteracao_salario: 'outro',
  alteracao_funcao: 'outro',
}[categoria] || 'outro');

const uploadOptionsFor = (categoria: string): Array<[string, string]> => {
  if (categoria === 'fechamento') return [
    ['folha_processada', 'Folha processada'],
    ['recibos_holerites', 'Recibos / Holerites'],
    ['retorno_folha', 'Outro retorno da folha'],
  ];
  if (categoria === 'admissao') return [['contrato', 'Contrato de trabalho'], ['outro', 'Outro documento da admissão']];
  if (categoria === 'demissao') return [['rescisao', 'Documentos de rescisão'], ['outro', 'Outro documento da demissão']];
  if (categoria === 'ferias') return [['ferias', 'Documentos de férias'], ['outro', 'Outro documento das férias']];
  return [['outro', 'Documento de retorno']];
};

const uploadButtonLabel = (categoria: string) => ({
  fechamento: 'Enviar folha / recibos ao RH',
  admissao: 'Enviar documentos da admissão ao RH',
  demissao: 'Enviar documentos da rescisão ao RH',
  ferias: 'Enviar documentos de férias ao RH',
  atestado: 'Enviar retorno do atestado ao RH',
  alteracao_salario: 'Enviar documento da alteração ao RH',
  alteracao_funcao: 'Enviar documento da alteração ao RH',
}[categoria] || 'Enviar documento ao RH');

export default function ContabilidadeDashboardPage({ portal }: { portal: PortalKind }) {
  const navigate = useNavigate();
  const [sessao, setSessao] = useState<Sessao | null>(() => readSession(portal));
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [viewKey, setViewKey] = useState<string | null>(null);
  const [selecionado, setSelecionado] = useState<Evento | null>(null);
  const [empresaFiltro, setEmpresaFiltro] = useState('todas');
  const [busca, setBusca] = useState('');
  const [pendenciaTexto, setPendenciaTexto] = useState('');
  const [showIssueForm, setShowIssueForm] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadType, setUploadType] = useState('outro');
  const [uploadObs, setUploadObs] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const isGoiania = portal === 'goiania';

  const sair = useCallback(async () => {
    const s = readSession(portal);
    if (s?.token) {
      await supabase.rpc('contabilidade_portal_logout' as any, { p_token: s.token, p_portal: portal }).catch(() => null);
    }
    localStorage.removeItem(storageKey(portal));
    setSessao(null);
    navigate(accessPath(portal), { replace: true });
  }, [navigate, portal]);

  const carregar = useCallback(async (silent = false) => {
    const current = readSession(portal);
    if (!current?.token) {
      navigate(accessPath(portal), { replace: true });
      return;
    }
    if (!silent) setLoading(true);
    try {
      const { data, error } = await supabase.rpc('contabilidade_portal_dashboard_sessao' as any, {
        p_token: current.token,
        p_portal: portal,
      });
      const res = data as any;
      if (error || !res?.ok) {
        localStorage.removeItem(storageKey(portal));
        navigate(accessPath(portal), { replace: true });
        return;
      }
      setSessao({ ...current, usuario: res.usuario || current.usuario });
      setEventos(Array.isArray(res.eventos) ? res.eventos : []);
      setEmpresas(Array.isArray(res.empresas) ? res.empresas : []);
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível atualizar o dashboard.');
    } finally {
      setLoading(false);
    }
  }, [navigate, portal]);

  useEffect(() => { void carregar(); }, [carregar]);
  useEffect(() => {
    const timer = window.setInterval(() => void carregar(true), 60_000);
    return () => window.clearInterval(timer);
  }, [carregar]);

  const abrirLista = (key: string) => {
    setViewKey(key);
    setSelecionado(null);
    setEmpresaFiltro('todas');
    setBusca('');
    setUploadOpen(false);
    setShowIssueForm(false);
  };

  const abrirMovimento = (evento: Evento) => {
    setSelecionado(evento);
    setPendenciaTexto(evento.observacao || '');
    setShowIssueForm(false);
    setUploadOpen(false);
    setUploadType(defaultUploadType(evento.categoria));
    setUploadObs('');
    setUploadFile(null);
  };

  const fecharModal = () => {
    setViewKey(null);
    setSelecionado(null);
    setEmpresaFiltro('todas');
    setBusca('');
    setPendenciaTexto('');
    setShowIssueForm(false);
    setUploadOpen(false);
    setUploadFile(null);
  };

  const marcar = async (evento: Evento, status: 'conferido' | 'pendencia', observacao?: string) => {
    const current = readSession(portal);
    if (!current?.token) return sair();
    if (status === 'pendencia' && !String(observacao || '').trim()) {
      toast.error('Informe o que precisa ser corrigido.');
      return;
    }
    setUpdating(true);
    try {
      const { data, error } = await supabase.rpc('contabilidade_portal_revisar_sessao' as any, {
        p_token: current.token,
        p_portal: portal,
        p_origem_tipo: evento.origem_tipo,
        p_origem_id: evento.origem_id,
        p_status: status,
        p_observacao: observacao || null,
      });
      const res = data as any;
      if (error || !res?.ok) throw new Error('Não foi possível registrar a conferência.');
      const next: Evento = {
        ...evento,
        status,
        observacao: status === 'pendencia' ? (observacao || null) : null,
        revisor_nome: res.revisor_nome || sessao?.usuario?.nome || evento.revisor_nome,
        revisado_em: res.revisado_em || new Date().toISOString(),
      };
      setSelecionado(next);
      setEventos((prev) => prev.map((item) => item.origem_tipo === evento.origem_tipo && item.origem_id === evento.origem_id ? next : item));
      setShowIssueForm(false);
      setPendenciaTexto(status === 'pendencia' ? String(observacao || '') : '');
      toast.success(status === 'conferido' ? 'Conferência registrada. O retorno documental foi liberado.' : 'Pendência registrada para o RH.');
      await carregar(true);
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao salvar.');
    } finally {
      setUpdating(false);
    }
  };

  const pendentes = useMemo(() => eventos.filter((e) => pendingStatuses.has(e.status)), [eventos]);
  const hoje = useMemo(() => {
    const now = new Date();
    const ymd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    return eventos.filter((e) => String(e.created_at || '').slice(0, 10) === ymd).length;
  }, [eventos]);
  const conferidos = useMemo(() => eventos.filter((e) => e.status === 'conferido').length, [eventos]);
  const retificacoes = useMemo(() => eventos.filter((e) => e.status === 'retificacao').length, [eventos]);

  const categoryStats = useMemo(() => {
    const result: Record<string, { total: number; pending: number }> = {};
    Object.keys(categoryMeta).forEach((key) => { result[key] = { total: 0, pending: 0 }; });
    eventos.forEach((e) => {
      if (!result[e.categoria]) result[e.categoria] = { total: 0, pending: 0 };
      result[e.categoria].total += 1;
      if (pendingStatuses.has(e.status)) result[e.categoria].pending += 1;
    });
    return result;
  }, [eventos]);

  const listaBase = useMemo(() => {
    let list = eventos;
    if (viewKey?.startsWith('category:')) {
      const category = viewKey.slice('category:'.length);
      list = list.filter((e) => e.categoria === category);
    } else if (viewKey === 'pending') {
      list = list.filter((e) => pendingStatuses.has(e.status));
    } else if (viewKey === 'conferred') {
      list = list.filter((e) => e.status === 'conferido');
    } else if (viewKey === 'retifications') {
      list = list.filter((e) => e.status === 'retificacao');
    } else if (viewKey === 'today') {
      const now = new Date();
      const ymd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      list = list.filter((e) => String(e.created_at || '').slice(0, 10) === ymd);
    }
    return [...list].sort((a, b) => Date.parse(b.created_at || '0') - Date.parse(a.created_at || '0'));
  }, [eventos, viewKey]);

  const listaFiltrada = useMemo(() => {
    const term = busca.trim().toLowerCase();
    return listaBase.filter((e) => {
      if (empresaFiltro !== 'todas' && e.empresa_id !== empresaFiltro) return false;
      if (term && !`${e.funcionario_nome} ${e.empresa_nome} ${e.titulo} ${e.data_evento || ''}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [listaBase, empresaFiltro, busca]);

  const modalTitle = useMemo(() => {
    if (viewKey?.startsWith('category:')) return categoryMeta[viewKey.slice('category:'.length)]?.label || 'Movimentações';
    if (viewKey === 'pending') return 'Aguardando análise';
    if (viewKey === 'today') return 'Movimentações de hoje';
    if (viewKey === 'conferred') return 'Conferidos';
    if (viewKey === 'retifications') return 'Retificações';
    return 'Movimentações';
  }, [viewKey]);

  const detailRows = (e: Evento) => {
    const d = e.detalhes || {};
    if (e.categoria === 'atestado') return [
      ['Período', `${brDate(d.inicio)} até ${brDate(d.fim)}`], ['Dias', d.dias ?? '—'],
      ['Recebido pelo RH', brDateTime(d.recebido_em)], ['Registrado por', d.registrado_por || '—'],
    ];
    if (e.categoria === 'admissao') return [
      ['CPF', d.cpf || '—'], ['Admissão', brDate(d.admissao)], ['Função', d.funcao || '—'],
      ['Salário', d.salario != null ? money(d.salario) : '—'], ['Jornada', d.jornada || '—'], ['Benefícios', d.beneficios || '—'],
    ];
    if (e.categoria === 'demissao') return [
      ['CPF', d.cpf || '—'], ['Desligamento', brDate(d.desligamento)], ['Tipo', d.tipo || '—'],
      ['Motivo', d.motivo || '—'], ['Aviso prévio', d.aviso_previo || '—'], ['Função', d.cargo || '—'],
    ];
    if (e.categoria === 'ferias') return [
      ['Período', `${brDate(d.inicio)} até ${brDate(d.fim)}`], ['Retorno', brDate(d.retorno)],
      ['Dias', d.dias ?? '—'], ['Abono', d.abono ?? 0], ['Função', d.cargo || '—'], ['Registrado por', d.registrado_por || '—'],
    ];
    if (e.categoria === 'alteracao_salario') return [
      ['Salário anterior', money(d.salario_anterior)], ['Novo salário', money(d.salario_novo)],
      ['Função', d.cargo || '—'], ['Alterado em', brDateTime(d.data_registro)],
    ];
    if (e.categoria === 'alteracao_funcao') return [
      ['Função anterior', d.funcao_anterior || '—'], ['Nova função', d.funcao_nova || '—'],
      ['Salário atual', money(d.salario_atual)], ['Alterado em', brDateTime(d.data_registro)],
    ];
    if (e.categoria === 'fechamento') return [
      ['Competência', d.competencia || e.data_evento || '—'], ['Funcionários', d.total_funcionarios ?? '—'],
      ['Proventos', money(d.total_proventos)], ['Descontos', money(d.total_descontos)],
      ['Líquido', money(d.total_liquido)], ['Fechado por', d.fechado_por || '—'],
    ];
    return Object.entries(d).slice(0, 8).map(([k, v]) => [k.replaceAll('_', ' '), typeof v === 'object' ? JSON.stringify(v) : String(v ?? '—')]);
  };

  const competenciaSelecionada = () => {
    if (!selecionado) return '';
    const direct = String(selecionado.detalhes?.competencia || '').trim();
    if (direct) return direct;
    const raw = String(selecionado.data_evento || '');
    return /^\d{4}-\d{2}/.test(raw) ? raw.slice(0, 7) : '';
  };

  const enviarRetorno = async () => {
    const current = readSession(portal);
    if (!current?.token) return toast.error('Sua sessão expirou. Entre novamente.');
    if (!selecionado) return;
    if (selecionado.status !== 'conferido') return toast.error('Conclua a conferência antes de enviar o retorno ao RH.');
    if (!uploadFile) return toast.error('Selecione o PDF que deseja enviar.');
    if (!/\.pdf$/i.test(uploadFile.name) && uploadFile.type !== 'application/pdf') return toast.error('Envie somente arquivo PDF.');
    if (uploadFile.size > 50 * 1024 * 1024) return toast.error('O PDF pode ter no máximo 50 MB.');

    setUploadBusy(true);
    try {
      const prepareResponse = await fetch('/api/accounting-portal-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'prepare', portal, token: current.token,
          empresa_id: selecionado.empresa_id,
          arquivo_nome: uploadFile.name,
          tamanho_bytes: uploadFile.size,
        }),
      });
      const prepare = await prepareResponse.json();
      if (!prepareResponse.ok || !prepare?.ok) throw new Error(prepare?.error || 'Não foi possível preparar o envio.');

      const uploaded = await supabase.storage.from(prepare.bucket).uploadToSignedUrl(
        prepare.path,
        prepare.upload_token,
        uploadFile,
        { contentType: 'application/pdf' },
      );
      if (uploaded.error) throw uploaded.error;

      const context = `Retorno referente a ${selecionado.titulo} · ${selecionado.funcionario_nome || selecionado.empresa_nome}`;
      const finalizeResponse = await fetch('/api/accounting-portal-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'finalize', portal, token: current.token,
          empresa_id: selecionado.empresa_id,
          storage_path: prepare.path,
          arquivo_nome: uploadFile.name,
          tamanho_bytes: uploadFile.size,
          tipo_documento: uploadType,
          competencia: competenciaSelecionada() || null,
          funcionario_nome: selecionado.funcionario_nome || null,
          observacao: [context, uploadObs].filter(Boolean).join(' — '),
          origem_tipo: selecionado.origem_tipo,
          origem_id: selecionado.origem_id,
        }),
      });
      const finalized = await finalizeResponse.json();
      if (!finalizeResponse.ok || !finalized?.ok) throw new Error(finalized?.error || 'O arquivo subiu, mas o registro não foi concluído.');

      if (finalized.email_status === 'enviado') toast.success('Documento recebido pelo RH e formalizado por e-mail.');
      else if (finalized.email_status === 'aguardando_configuracao') toast.success('Documento recebido pelo RH. A formalização por e-mail ainda precisa ser configurada para este portal.');
      else toast.success('Documento recebido pelo RH e registrado na plataforma.');

      setUploadOpen(false);
      setUploadFile(null);
      setUploadObs('');
    } catch (error: any) {
      toast.error(error?.message || 'Erro ao enviar o documento.');
    } finally {
      setUploadBusy(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-[#020609] flex items-center justify-center text-zinc-300"><Loader2 className="w-8 h-8 animate-spin text-[#9b32ff]" /></div>;
  }

  return (
    <div className="min-h-screen bg-[#020609] text-zinc-100">
      <header className="sticky top-0 z-30 h-[62px] border-b border-[#24202c] bg-[#030609]/95 backdrop-blur-xl">
        <div className="mx-auto flex h-full max-w-[1680px] items-center gap-3 px-4 sm:px-5">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[7px] border border-[#7c2cff] bg-[#08070a] text-[25px] font-black leading-none text-[#f4b400] shadow-[0_0_20px_rgba(124,44,255,.16)]">T</div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-black tracking-[-.01em] text-white">TOPAC RH PRO</div>
            <div className="truncate text-[10px] font-semibold text-[#9b32ff]">Portal da Contabilidade {isGoiania ? '· Goiânia' : ''}</div>
          </div>
          <div className="hidden text-right md:block">
            <div className="text-[11px] font-semibold text-zinc-200">{sessao?.usuario?.nome || 'Contabilidade'}</div>
            <div className="mt-0.5 text-[9px] text-zinc-500">{isGoiania ? 'TOPAC Goiânia' : 'Matriz · Praia · LMT · ALQUI'}</div>
          </div>
          <button onClick={() => void carregar()} className="grid h-9 w-9 place-items-center rounded-md border border-[#2b2532] bg-[#080a0e] text-zinc-400 transition hover:border-[#7c2cff] hover:text-[#b85cff]" title="Atualizar"><RefreshCw className="h-4 w-4" /></button>
          <button onClick={sair} className="grid h-9 w-9 place-items-center rounded-md border border-[#2b2532] bg-[#080a0e] text-zinc-400 transition hover:border-rose-500/50 hover:text-rose-300" title="Sair"><LogOut className="h-4 w-4" /></button>
        </div>
      </header>

      <main className="mx-auto max-w-[1680px] p-4 sm:p-[18px]">
        <section className="overflow-hidden rounded-[10px] border border-[#2b2532] bg-[linear-gradient(110deg,#080a0f_0%,#0d0815_58%,#080a0f_100%)] px-5 py-5 shadow-[0_18px_60px_rgba(0,0,0,.24)] sm:px-7 sm:py-6">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[.18em] text-[#a855f7]">Visão operacional</div>
              <h1 className="mt-1 text-[25px] font-black tracking-[-.03em] text-white sm:text-[30px]">Portal da Contabilidade</h1>
              <p className="mt-1 max-w-2xl text-[12px] text-zinc-400">Acompanhe somente as movimentações do RH que precisam de conferência contábil. Os detalhes aparecem apenas quando você abrir um card.</p>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-zinc-500"><Clock3 className="h-3.5 w-3.5" />Atualização automática a cada 1 minuto</div>
          </div>
        </section>

        <section className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <SummaryCard icon={BellRing} label="Aguardando análise" value={pendentes.length} note="Somente itens realmente abertos" accent="text-[#f4b400]" onClick={() => abrirLista('pending')} />
          <SummaryCard icon={Clock3} label="Movimentações hoje" value={hoje} note="Entradas registradas hoje" accent="text-sky-400" onClick={() => abrirLista('today')} />
          <SummaryCard icon={CheckCircle2} label="Conferidos" value={conferidos} note="Com OK da contabilidade" accent="text-emerald-400" onClick={() => abrirLista('conferred')} />
          <SummaryCard icon={AlertTriangle} label="Retificações" value={retificacoes} note="Alteradas após uma conferência" accent="text-[#b85cff]" onClick={() => abrirLista('retifications')} />
        </section>

        <section className="mt-4 rounded-[10px] border border-[#24202c] bg-[#04070b] p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-[14px] font-black text-white">Movimentações do RH</h2>
              <p className="mt-1 text-[10px] text-zinc-500">Clique em um card para abrir somente aquele tipo de movimentação.</p>
            </div>
            <div className="hidden items-center gap-2 text-[10px] text-zinc-500 sm:flex"><Building2 className="h-3.5 w-3.5 text-[#9b32ff]" />{isGoiania ? '1 empresa liberada' : '4 empresas liberadas'}</div>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-7">
            {Object.entries(categoryMeta).map(([key, meta]) => {
              const Icon = meta.icon;
              const stats = categoryStats[key] || { total: 0, pending: 0 };
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => abrirLista(`category:${key}`)}
                  className={`group min-h-[154px] rounded-[8px] border bg-[#06090d] p-4 text-left transition hover:-translate-y-0.5 hover:border-[#6c2aa0] hover:bg-[#090b11] hover:shadow-[0_12px_35px_rgba(0,0,0,.32)] ${meta.emphasis && stats.pending > 0 ? 'border-[#6d5314] shadow-[inset_0_0_0_1px_rgba(244,180,0,.08)]' : 'border-[#28232e]'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className={`grid h-9 w-9 place-items-center rounded-[7px] border ${meta.iconClass}`}><Icon className="h-[18px] w-[18px]" /></div>
                    {stats.pending > 0 ? (
                      <span className="rounded-full border border-[#f4b400]/25 bg-[#f4b400]/10 px-2 py-0.5 text-[9px] font-bold text-[#f4b400]">{stats.pending} pendente{stats.pending === 1 ? '' : 's'}</span>
                    ) : (
                      <span className="rounded-full border border-emerald-400/15 bg-emerald-400/5 px-2 py-0.5 text-[9px] font-semibold text-emerald-400/80">Tudo certo</span>
                    )}
                  </div>
                  <div className="mt-4 text-[28px] font-black leading-none text-white">{stats.total}</div>
                  <div className="mt-2 text-[11px] font-bold leading-tight text-zinc-200">{meta.short}</div>
                  <div className={`mt-1.5 text-[9px] leading-snug ${meta.emphasis ? 'text-[#c79b2f]' : 'text-zinc-600'}`}>{meta.note}</div>
                </button>
              );
            })}
          </div>
        </section>
      </main>

      <Dialog open={!!viewKey} onOpenChange={(open) => { if (!open) fecharModal(); }}>
        <DialogContent className="max-h-[92vh] overflow-y-auto border-[#3a2849] bg-[#05080d] text-zinc-100 sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle className="pr-8 text-white">{selecionado ? selecionado.titulo : modalTitle}</DialogTitle>
          </DialogHeader>

          {!selecionado ? (
            <div className="space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row">
                <select value={empresaFiltro} onChange={(e) => setEmpresaFiltro(e.target.value)} className="h-10 rounded-md border border-[#302739] bg-[#090c11] px-3 text-sm text-zinc-200 outline-none sm:min-w-[210px]">
                  <option value="todas">Todas as empresas</option>
                  {empresas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
                </select>
                <div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" /><Input className="border-[#302739] bg-[#090c11] pl-9 text-zinc-100 placeholder:text-zinc-600" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar funcionário..." /></div>
              </div>

              {listaFiltrada.length === 0 ? (
                <div className="rounded-lg border border-[#28232e] bg-[#070a0e] py-14 text-center text-sm text-zinc-500">Nenhum item neste card.</div>
              ) : (
                <div className="grid gap-2">
                  {listaFiltrada.map((e) => {
                    const meta = categoryMeta[e.categoria] || { label: e.titulo, short: e.titulo, icon: FileText, iconClass: 'text-zinc-400 bg-zinc-800 border-zinc-700', note: '' };
                    const Icon = meta.icon;
                    return (
                      <button key={`${e.origem_tipo}-${e.origem_id}`} onClick={() => abrirMovimento(e)} className="flex w-full items-center gap-3 rounded-[8px] border border-[#28232e] bg-[#070a0e] p-3.5 text-left transition hover:border-[#63308a] hover:bg-[#0a0d12]">
                        <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-[7px] border ${meta.iconClass}`}><Icon className="h-[18px] w-[18px]" /></div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate text-[12px] font-bold text-zinc-100">{e.funcionario_nome || e.empresa_nome}</span>
                            {meta.emphasis && <span className="rounded-full border border-[#f4b400]/20 bg-[#f4b400]/10 px-2 py-0.5 text-[8px] font-bold uppercase tracking-wide text-[#f4b400]">Análise específica</span>}
                          </div>
                          <div className="mt-1 truncate text-[10px] text-zinc-500">{e.empresa_nome} · {e.data_evento ? brDate(e.data_evento) : brDateTime(e.created_at)}</div>
                        </div>
                        <span className={`hidden rounded-full border px-2.5 py-1 text-[9px] font-semibold sm:inline ${statusClass(e.status)}`}>{labelStatus(e.status)}</span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-zinc-600" />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <button onClick={() => { setSelecionado(null); setUploadOpen(false); setShowIssueForm(false); }} className="inline-flex items-center gap-2 text-[11px] font-semibold text-zinc-400 hover:text-white"><ArrowLeft className="h-4 w-4" />Voltar para a lista</button>

              <div className="rounded-[9px] border border-[#302739] bg-[#080b10] p-4">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                  <div>
                    <div className="text-[18px] font-black text-white">{selecionado.funcionario_nome || selecionado.empresa_nome}</div>
                    <div className="mt-1 text-[11px] text-zinc-500">{selecionado.empresa_nome} · registrado em {brDateTime(selecionado.created_at)}</div>
                  </div>
                  <span className={`w-fit rounded-full border px-2.5 py-1 text-[9px] font-semibold ${statusClass(selecionado.status)}`}>{labelStatus(selecionado.status)}</span>
                </div>
              </div>

              {selecionado.status === 'retificacao' && (
                <div className="flex gap-2 rounded-[8px] border border-violet-500/25 bg-violet-500/10 p-3 text-[11px] text-violet-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><div><strong>Informação alterada após a última conferência.</strong><div className="mt-1 text-violet-300/70">Analise novamente este movimento antes de dar novo OK.</div></div></div>
              )}

              <div className="grid gap-x-5 gap-y-3 sm:grid-cols-2">
                {detailRows(selecionado).map(([label, value], idx) => (
                  <div key={`${label}-${idx}`} className="border-b border-[#29242e] pb-2.5"><div className="text-[9px] font-bold uppercase tracking-[.09em] text-zinc-600">{label}</div><div className="mt-1 text-[12px] font-semibold text-zinc-200 break-words">{String(value)}</div></div>
                ))}
              </div>

              {(selecionado.documento_url || selecionado.detalhes?.aso_url) && (
                <div className="rounded-[8px] border border-[#302739] bg-[#080b10] p-3">
                  <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-zinc-500">Documentos para conferência</div>
                  <div className="flex flex-wrap gap-2">
                    {selecionado.documento_url && <Button variant="outline" className="border-[#49335c] bg-[#0b0d12] text-zinc-200 hover:bg-[#171020] hover:text-white" onClick={() => window.open(selecionado.documento_url!, '_blank', 'noopener,noreferrer')}><FileText className="mr-2 h-4 w-4" />{selecionado.documento_nome || 'Visualizar PDF'}</Button>}
                    {selecionado.detalhes?.aso_url && <Button variant="outline" className="border-[#49335c] bg-[#0b0d12] text-zinc-200 hover:bg-[#171020] hover:text-white" onClick={() => window.open(String(selecionado.detalhes?.aso_url), '_blank', 'noopener,noreferrer')}><FileText className="mr-2 h-4 w-4" />Visualizar ASO</Button>}
                  </div>
                </div>
              )}

              <div className="grid gap-3 rounded-[8px] border border-[#2b2532] bg-[#070a0e] p-3 text-[11px] sm:grid-cols-3">
                <div><div className="text-zinc-600">Última atualização</div><div className="mt-1 font-semibold text-zinc-300">{brDateTime(selecionado.source_updated_at)}</div></div>
                <div><div className="text-zinc-600">Última conferência</div><div className="mt-1 font-semibold text-zinc-300">{selecionado.revisor_nome ? `${selecionado.revisor_nome} · ${brDateTime(selecionado.revisado_em)}` : 'Ainda não conferido'}</div></div>
                <div><div className="text-zinc-600">Formalização por e-mail</div><div className="mt-1 font-semibold text-zinc-300">{selecionado.formalizado ? `Sim · ${brDateTime(selecionado.formalizado_em)}` : 'Ainda não formalizado'}</div></div>
              </div>

              {selecionado.observacao && selecionado.status === 'pendencia' && (
                <div className="rounded-[8px] border border-rose-500/25 bg-rose-500/10 p-3 text-[11px] text-rose-200"><strong>Pendência registrada:</strong><div className="mt-1">{selecionado.observacao}</div></div>
              )}

              {selecionado.status !== 'conferido' ? (
                <div className="border-t border-[#2b2532] pt-4">
                  {showIssueForm && (
                    <div className="mb-3">
                      <label className="text-[11px] font-semibold text-zinc-300">Descreva o que o RH precisa corrigir:</label>
                      <textarea value={pendenciaTexto} onChange={(e) => setPendenciaTexto(e.target.value)} className="mt-2 min-h-[86px] w-full rounded-md border border-[#3a2b45] bg-[#090c11] px-3 py-2 text-sm text-zinc-100 outline-none focus:border-[#7c2cff]" placeholder="Ex.: conferir data de admissão, ajustar salário informado..." />
                    </div>
                  )}
                  <div className="flex flex-col-reverse justify-end gap-2 sm:flex-row">
                    {showIssueForm ? (
                      <Button variant="outline" disabled={updating} className="border-rose-500/30 bg-rose-500/5 text-rose-300 hover:bg-rose-500/10 hover:text-rose-200" onClick={() => void marcar(selecionado, 'pendencia', pendenciaTexto)}><AlertTriangle className="mr-2 h-4 w-4" />Registrar pendência</Button>
                    ) : (
                      <Button variant="outline" disabled={updating} className="border-[#49335c] bg-[#0b0d12] text-zinc-300 hover:bg-[#171020] hover:text-white" onClick={() => setShowIssueForm(true)}><AlertTriangle className="mr-2 h-4 w-4" />Apontar pendência</Button>
                    )}
                    <Button disabled={updating} onClick={() => void marcar(selecionado, 'conferido')} className="bg-emerald-600 text-white hover:bg-emerald-500">{updating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}Conferido / OK</Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 border-t border-[#2b2532] pt-4">
                  <div className="flex gap-2 rounded-[8px] border border-emerald-500/20 bg-emerald-500/8 p-3 text-[11px] text-emerald-200"><BadgeCheck className="h-4 w-4 shrink-0" /><div><strong>Conferência concluída.</strong><div className="mt-0.5 text-emerald-300/70">Agora, se houver documento de retorno deste movimento, ele pode ser enviado diretamente ao RH.</div></div></div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                    <Button variant="outline" className="border-[#49335c] bg-[#0b0d12] text-zinc-300 hover:bg-[#171020] hover:text-white" onClick={() => setShowIssueForm(true)}>Apontar correção</Button>
                    <Button className="bg-[#6d28d9] text-white hover:bg-[#7c3aed]" onClick={() => setUploadOpen((value) => !value)}><FileUp className="mr-2 h-4 w-4" />{uploadButtonLabel(selecionado.categoria)}</Button>
                  </div>

                  {showIssueForm && (
                    <div className="rounded-[8px] border border-rose-500/20 bg-rose-500/5 p-3">
                      <label className="text-[11px] font-semibold text-zinc-300">Encontrou algo depois do OK? Registre a correção:</label>
                      <textarea value={pendenciaTexto} onChange={(e) => setPendenciaTexto(e.target.value)} className="mt-2 min-h-[80px] w-full rounded-md border border-[#3a2b45] bg-[#090c11] px-3 py-2 text-sm text-zinc-100 outline-none focus:border-[#7c2cff]" />
                      <div className="mt-2 flex justify-end"><Button disabled={updating} variant="outline" className="border-rose-500/30 text-rose-300" onClick={() => void marcar(selecionado, 'pendencia', pendenciaTexto)}><AlertTriangle className="mr-2 h-4 w-4" />Registrar correção</Button></div>
                    </div>
                  )}

                  {uploadOpen && (
                    <div className="rounded-[9px] border border-[#4c2b64] bg-[#0a0b11] p-4">
                      <div className="mb-3"><div className="text-[12px] font-bold text-white">Retorno para o RH</div><div className="mt-1 text-[10px] text-zinc-500">O PDF entra direto na plataforma. A formalização por e-mail acontece após o registro, quando configurada.</div></div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="text-[10px] font-semibold text-zinc-400">Tipo de retorno</label>
                          <select value={uploadType} onChange={(e) => setUploadType(e.target.value)} className="mt-1 h-10 w-full rounded-md border border-[#34283e] bg-[#080b10] px-3 text-sm text-zinc-200">
                            {uploadOptionsFor(selecionado.categoria).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-zinc-400">Competência / referência</label>
                          <div className="mt-1 flex h-10 items-center rounded-md border border-[#34283e] bg-[#080b10] px-3 text-sm text-zinc-300">{competenciaSelecionada() || 'Conforme movimento'}</div>
                        </div>
                        <div className="sm:col-span-2">
                          <label className="text-[10px] font-semibold text-zinc-400">PDF</label>
                          <input type="file" accept="application/pdf,.pdf" onChange={(e) => setUploadFile(e.target.files?.[0] || null)} className="mt-1 block w-full rounded-md border border-[#34283e] bg-[#080b10] p-2 text-xs text-zinc-400 file:mr-3 file:rounded-md file:border-0 file:bg-[#241632] file:px-3 file:py-1.5 file:font-semibold file:text-[#c56cff]" />
                          {uploadFile && <div className="mt-1 text-[9px] text-zinc-500">{uploadFile.name} · {(uploadFile.size / 1024 / 1024).toFixed(2).replace('.', ',')} MB</div>}
                        </div>
                        <div className="sm:col-span-2">
                          <label className="text-[10px] font-semibold text-zinc-400">Observação</label>
                          <textarea value={uploadObs} onChange={(e) => setUploadObs(e.target.value)} className="mt-1 min-h-[70px] w-full rounded-md border border-[#34283e] bg-[#080b10] px-3 py-2 text-sm text-zinc-100 outline-none focus:border-[#7c2cff]" placeholder="Opcional" />
                        </div>
                      </div>
                      <div className="mt-3 flex justify-end gap-2">
                        <Button variant="outline" disabled={uploadBusy} className="border-[#49335c] bg-[#0b0d12] text-zinc-300" onClick={() => { setUploadOpen(false); setUploadFile(null); }}>Cancelar</Button>
                        <Button disabled={uploadBusy || !uploadFile} className="bg-[#6d28d9] text-white hover:bg-[#7c3aed]" onClick={() => void enviarRetorno()}>{uploadBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}Enviar para o RH</Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, note, accent, onClick }: { icon: any; label: string; value: number; note: string; accent: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="group min-h-[112px] rounded-[8px] border border-[#28232e] bg-[#05080d] p-4 text-left transition hover:-translate-y-0.5 hover:border-[#62308a] hover:bg-[#080a10] hover:shadow-[0_12px_35px_rgba(0,0,0,.30)] sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <div><div className="text-[10px] font-semibold uppercase tracking-[.05em] text-zinc-500">{label}</div><div className="mt-2 text-[30px] font-black leading-none text-white">{value}</div></div>
        <Icon className={`h-[18px] w-[18px] ${accent}`} />
      </div>
      <div className="mt-3 text-[9px] text-zinc-600 group-hover:text-zinc-500">{note}</div>
    </button>
  );
}
