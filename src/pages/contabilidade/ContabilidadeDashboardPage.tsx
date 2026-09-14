import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, BadgeCheck, BellRing, BriefcaseBusiness, Building2, CalendarDays,
  CheckCircle2, ChevronRight, Clock3, FileHeart, FileText, Loader2, LogOut,
  RefreshCw, Search, UserPlus, UserRoundX, WalletCards,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
  aguardando_analise: 'bg-amber-50 text-amber-800 border-amber-200',
  conferido: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  pendencia: 'bg-rose-50 text-rose-800 border-rose-200',
  retificacao: 'bg-violet-50 text-violet-800 border-violet-200',
}[status] || 'bg-slate-50 text-slate-700 border-slate-200');

const categoryMeta: Record<string, { label: string; icon: any; className: string }> = {
  admissao: { label: 'Novas contratações', icon: UserPlus, className: 'bg-blue-50 text-blue-700' },
  demissao: { label: 'Demissões', icon: UserRoundX, className: 'bg-rose-50 text-rose-700' },
  ferias: { label: 'Férias', icon: CalendarDays, className: 'bg-cyan-50 text-cyan-700' },
  atestado: { label: 'Atestados', icon: FileHeart, className: 'bg-amber-50 text-amber-700' },
  alteracao_salario: { label: 'Alterações salariais', icon: WalletCards, className: 'bg-violet-50 text-violet-700' },
  alteracao_funcao: { label: 'Alterações de função', icon: BriefcaseBusiness, className: 'bg-fuchsia-50 text-fuchsia-700' },
  fechamento: { label: 'Fechamentos', icon: FileText, className: 'bg-slate-100 text-slate-700' },
};

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

const importantCategories = new Set(['admissao', 'demissao', 'alteracao_salario', 'alteracao_funcao', 'fechamento']);

export default function ContabilidadeDashboardPage({ portal }: { portal: PortalKind }) {
  const navigate = useNavigate();
  const [sessao, setSessao] = useState<Sessao | null>(() => readSession(portal));
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [empresaFiltro, setEmpresaFiltro] = useState('todas');
  const [categoriaFiltro, setCategoriaFiltro] = useState('todas');
  const [busca, setBusca] = useState('');
  const [selecionado, setSelecionado] = useState<Evento | null>(null);
  const [pendenciaTexto, setPendenciaTexto] = useState('');
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

  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    const timer = window.setInterval(() => carregar(true), 60_000);
    return () => window.clearInterval(timer);
  }, [carregar]);

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
      toast.success(status === 'conferido' ? 'Conferência registrada.' : 'Pendência devolvida ao RH.');
      setSelecionado(null);
      setPendenciaTexto('');
      await carregar(true);
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao salvar.');
    } finally {
      setUpdating(false);
    }
  };

  const filtrados = useMemo(() => {
    const term = busca.trim().toLowerCase();
    return eventos.filter((e) => {
      if (empresaFiltro !== 'todas' && e.empresa_id !== empresaFiltro) return false;
      if (categoriaFiltro !== 'todas' && e.categoria !== categoriaFiltro) return false;
      if (term && !`${e.funcionario_nome} ${e.empresa_nome} ${e.titulo} ${e.data_evento || ''}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [eventos, empresaFiltro, categoriaFiltro, busca]);

  const pendentes = useMemo(() => eventos.filter((e) => ['aguardando_analise', 'retificacao', 'pendencia'].includes(e.status)), [eventos]);
  const atencao = useMemo(() => pendentes.filter((e) => importantCategories.has(e.categoria) || e.prioridade === 'critica').slice(0, 8), [pendentes]);
  const hoje = useMemo(() => {
    const now = new Date();
    const ymd = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    return eventos.filter((e) => String(e.created_at || '').slice(0,10) === ymd).length;
  }, [eventos]);
  const conferidos = useMemo(() => eventos.filter((e) => e.status === 'conferido').length, [eventos]);
  const retificacoes = useMemo(() => eventos.filter((e) => e.status === 'retificacao').length, [eventos]);

  const categoryCounts = useMemo(() => {
    const result: Record<string, number> = {};
    for (const e of eventos) result[e.categoria] = (result[e.categoria] || 0) + 1;
    return result;
  }, [eventos]);

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
      ['Salário anterior', money(d.salario_anterior)], ['Novo salário', money(d.salario_novo)], ['Função', d.cargo || '—'], ['Alterado em', brDateTime(d.data_registro)],
    ];
    if (e.categoria === 'alteracao_funcao') return [
      ['Função anterior', d.funcao_anterior || '—'], ['Nova função', d.funcao_nova || '—'], ['Salário atual', money(d.salario_atual)], ['Alterado em', brDateTime(d.data_registro)],
    ];
    if (e.categoria === 'fechamento') return [
      ['Competência', d.competencia || e.data_evento || '—'], ['Funcionários', d.total_funcionarios ?? '—'],
      ['Proventos', money(d.total_proventos)], ['Descontos', money(d.total_descontos)], ['Líquido', money(d.total_liquido)], ['Fechado por', d.fechado_por || '—'],
    ];
    return Object.entries(d).slice(0,8).map(([k,v]) => [k.replaceAll('_',' '), typeof v === 'object' ? JSON.stringify(v) : String(v ?? '—')]);
  };

  if (loading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-slate-700" /></div>;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-30 bg-slate-950 text-white border-b border-slate-800">
        <div className="max-w-[1500px] mx-auto px-4 lg:px-6 h-16 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center"><Building2 className="w-5 h-5" /></div>
          <div className="min-w-0 flex-1">
            <div className="font-bold text-sm sm:text-base truncate">Portal da Contabilidade {isGoiania ? '· Goiânia' : ''}</div>
            <div className="text-[11px] text-slate-400 truncate">{sessao?.usuario?.nome || 'Contabilidade'} · {isGoiania ? 'TOPAC Goiânia' : 'Matriz · Praia · LMT · ALQUI'}</div>
          </div>
          <Button variant="ghost" size="sm" className="text-slate-300 hover:text-white hover:bg-white/10" onClick={() => carregar()}><RefreshCw className="w-4 h-4 sm:mr-2" /><span className="hidden sm:inline">Atualizar</span></Button>
          <Button variant="ghost" size="sm" className="text-slate-300 hover:text-white hover:bg-white/10" onClick={sair}><LogOut className="w-4 h-4 sm:mr-2" /><span className="hidden sm:inline">Sair</span></Button>
        </div>
      </header>

      <main className="max-w-[1500px] mx-auto p-4 lg:p-6 space-y-6">
        <section>
          <div className="flex items-end justify-between gap-3 mb-4">
            <div><p className="text-xs uppercase tracking-[.18em] text-slate-500 font-semibold">Visão geral</p><h1 className="text-2xl font-bold mt-1">Acompanhamento do RH</h1></div>
            <div className="hidden md:flex items-center gap-2 text-xs text-slate-500"><Clock3 className="w-4 h-4" />Atualização automática a cada 1 minuto</div>
          </div>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            <SummaryCard icon={BellRing} label="Aguardando análise" value={pendentes.length} note="Itens que precisam de atenção" accent="text-amber-600" />
            <SummaryCard icon={Clock3} label="Movimentações hoje" value={hoje} note="Entradas registradas hoje" accent="text-blue-600" />
            <SummaryCard icon={CheckCircle2} label="Conferidos" value={conferidos} note="Com OK da contabilidade" accent="text-emerald-600" />
            <SummaryCard icon={AlertTriangle} label="Retificações" value={retificacoes} note="Mudaram após conferência" accent="text-violet-600" />
          </div>
        </section>

        <section className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-7 gap-3">
          {Object.entries(categoryMeta).map(([key, meta]) => {
            const Icon = meta.icon;
            return <button key={key} onClick={() => setCategoriaFiltro(categoriaFiltro === key ? 'todas' : key)} className={`text-left rounded-2xl border bg-white p-4 transition hover:shadow-md ${categoriaFiltro === key ? 'ring-2 ring-slate-900' : ''}`}>
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${meta.className}`}><Icon className="w-5 h-5" /></div>
              <div className="text-2xl font-bold mt-3">{categoryCounts[key] || 0}</div>
              <div className="text-xs text-slate-500 leading-tight mt-1">{meta.label}</div>
            </button>;
          })}
        </section>

        {atencao.length > 0 && (
          <section className="rounded-2xl bg-slate-950 text-white overflow-hidden shadow-xl">
            <div className="p-5 border-b border-white/10 flex items-center justify-between gap-3">
              <div><div className="flex items-center gap-2 font-bold"><BellRing className="w-5 h-5 text-amber-400" />Precisa da sua atenção</div><p className="text-xs text-slate-400 mt-1">Novas admissões, alterações, demissões, fechamento e retificações.</p></div>
              <span className="px-3 py-1 rounded-full bg-amber-400 text-slate-950 text-xs font-bold">{atencao.length}</span>
            </div>
            <div className="divide-y divide-white/10">
              {atencao.map((e) => <button key={`${e.origem_tipo}-${e.origem_id}`} onClick={() => setSelecionado(e)} className="w-full p-4 sm:px-5 text-left hover:bg-white/5 flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                <div className="flex-1 min-w-0"><div className="font-semibold truncate">{e.titulo} · {e.funcionario_nome}</div><div className="text-xs text-slate-400 truncate">{e.empresa_nome} · registrado {brDateTime(e.created_at)}</div></div>
                <span className={`hidden sm:inline px-2.5 py-1 rounded-full border text-[11px] font-semibold ${e.status === 'retificacao' ? 'border-violet-400/40 text-violet-300 bg-violet-400/10' : 'border-amber-400/30 text-amber-300 bg-amber-400/10'}`}>{labelStatus(e.status)}</span>
                <ChevronRight className="w-4 h-4 text-slate-500" />
              </button>)}
            </div>
          </section>
        )}

        <section className="bg-white border rounded-2xl overflow-hidden shadow-sm">
          <div className="p-4 lg:p-5 border-b flex flex-col lg:flex-row lg:items-center gap-3">
            <div className="flex-1"><h2 className="font-bold text-lg">Movimentações</h2><p className="text-xs text-slate-500">Tudo que o RH disponibilizou para acompanhamento da contabilidade.</p></div>
            <div className="flex flex-col sm:flex-row gap-2">
              <select value={empresaFiltro} onChange={(e) => setEmpresaFiltro(e.target.value)} className="h-10 rounded-md border bg-white px-3 text-sm min-w-[190px]">
                <option value="todas">Todas as empresas</option>
                {empresas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
              </select>
              <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" /><Input className="pl-9 sm:w-[260px]" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar funcionário..." /></div>
            </div>
          </div>

          {filtrados.length === 0 ? <div className="py-16 text-center text-sm text-slate-500">Nenhuma movimentação encontrada.</div> : (
            <div className="divide-y">
              {filtrados.map((e) => {
                const meta = categoryMeta[e.categoria] || { label: e.titulo, icon: FileText, className: 'bg-slate-100 text-slate-600' };
                const Icon = meta.icon;
                return <button key={`${e.origem_tipo}-${e.origem_id}`} onClick={() => { setSelecionado(e); setPendenciaTexto(e.observacao || ''); }} className="w-full p-4 lg:px-5 text-left hover:bg-slate-50 transition flex items-center gap-3 sm:gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${meta.className}`}><Icon className="w-5 h-5" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap"><span className="font-semibold truncate max-w-full">{e.funcionario_nome || e.titulo}</span>{e.formalizado && <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-700 bg-blue-50 rounded-full px-2 py-0.5"><BadgeCheck className="w-3 h-3" />Formalizado por e-mail</span>}</div>
                    <div className="text-xs text-slate-500 mt-1 truncate">{e.titulo} · {e.empresa_nome} · {e.data_evento ? brDate(e.data_evento) : brDateTime(e.created_at)}</div>
                  </div>
                  <div className="hidden md:block text-right"><div className={`inline-flex px-2.5 py-1 rounded-full border text-[11px] font-semibold ${statusClass(e.status)}`}>{labelStatus(e.status)}</div><div className="text-[10px] text-slate-400 mt-1">{brDateTime(e.created_at)}</div></div>
                  <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                </button>;
              })}
            </div>
          )}
        </section>
      </main>

      <Dialog open={!!selecionado} onOpenChange={(open) => { if (!open) { setSelecionado(null); setPendenciaTexto(''); } }}>
        <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto">
          {selecionado && <>
            <DialogHeader><DialogTitle className="pr-8">{selecionado.titulo}</DialogTitle></DialogHeader>
            <div className="flex items-start justify-between gap-3 rounded-xl bg-slate-50 border p-4">
              <div><div className="font-bold text-lg">{selecionado.funcionario_nome}</div><div className="text-sm text-slate-500">{selecionado.empresa_nome}</div></div>
              <span className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold ${statusClass(selecionado.status)}`}>{labelStatus(selecionado.status)}</span>
            </div>

            {selecionado.status === 'retificacao' && <div className="rounded-xl border border-violet-200 bg-violet-50 text-violet-900 p-3 text-sm flex gap-2"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /><div><strong>Informação alterada após a última conferência.</strong><div className="text-xs mt-1">Analise novamente este funcionário antes de dar novo OK.</div></div></div>}

            <div className="grid sm:grid-cols-2 gap-x-5 gap-y-3">
              {detailRows(selecionado).map(([label, value], idx) => <div key={`${label}-${idx}`} className="border-b pb-2"><div className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">{label}</div><div className="text-sm font-medium mt-1 break-words">{String(value)}</div></div>)}
            </div>

            <div className="rounded-xl border p-4 grid sm:grid-cols-2 gap-3 text-sm">
              <div><div className="text-xs text-slate-400">Registrado no TOPAC RH PRO</div><div className="font-medium mt-1">{brDateTime(selecionado.created_at)}</div></div>
              <div><div className="text-xs text-slate-400">Última atualização</div><div className="font-medium mt-1">{brDateTime(selecionado.source_updated_at)}</div></div>
              {selecionado.revisor_nome && <div><div className="text-xs text-slate-400">Última conferência</div><div className="font-medium mt-1">{selecionado.revisor_nome} · {brDateTime(selecionado.revisado_em)}</div></div>}
              <div><div className="text-xs text-slate-400">Formalização por e-mail</div><div className="font-medium mt-1">{selecionado.formalizado ? `Sim · ${brDateTime(selecionado.formalizado_em)}` : 'Ainda não formalizado'}</div></div>
            </div>

            {(selecionado.documento_url || selecionado.detalhes?.aso_url) && <div className="flex flex-wrap gap-2">
              {selecionado.documento_url && <Button variant="outline" onClick={() => window.open(selecionado.documento_url!, '_blank', 'noopener,noreferrer')}><FileText className="w-4 h-4 mr-2" />{selecionado.documento_nome || 'Visualizar PDF'}</Button>}
              {selecionado.detalhes?.aso_url && <Button variant="outline" onClick={() => window.open(String(selecionado.detalhes?.aso_url), '_blank', 'noopener,noreferrer')}><FileText className="w-4 h-4 mr-2" />Visualizar ASO</Button>}
            </div>}

            {selecionado.observacao && <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-sm"><strong>Pendência registrada:</strong><div className="mt-1">{selecionado.observacao}</div></div>}

            <div className="border-t pt-4">
              <label className="text-sm font-semibold">Se houver algo errado, descreva para o RH corrigir:</label>
              <textarea value={pendenciaTexto} onChange={(e) => setPendenciaTexto(e.target.value)} className="mt-2 min-h-[90px] w-full rounded-md border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/20" placeholder="Ex.: conferir data de admissão, ajustar salário informado..." />
              <div className="mt-3 flex flex-col-reverse sm:flex-row justify-end gap-2">
                <Button variant="outline" disabled={updating} onClick={() => marcar(selecionado, 'pendencia', pendenciaTexto)}><AlertTriangle className="w-4 h-4 mr-2" />Devolver com pendência</Button>
                <Button disabled={updating} onClick={() => marcar(selecionado, 'conferido')} className="bg-emerald-600 hover:bg-emerald-700">{updating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}Conferido / OK</Button>
              </div>
            </div>
          </>}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, note, accent }: { icon: any; label: string; value: number; note: string; accent: string }) {
  return <Card className="rounded-2xl"><CardContent className="p-4 sm:p-5"><div className="flex items-start justify-between gap-2"><div><div className="text-xs text-slate-500 font-medium">{label}</div><div className="text-3xl font-bold mt-2">{value}</div></div><Icon className={`w-5 h-5 ${accent}`} /></div><div className="text-[11px] text-slate-400 mt-3">{note}</div></CardContent></Card>;
}
