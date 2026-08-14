import { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, Fuel, Printer, RefreshCw, Route, Timer, Users, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useApp } from '@/context/AppContext';
import { toast } from 'sonner';

const APP_OPERACIONAL_URL = 'https://746ce5953133175295.v2.appdeploy.ai/';
const todayLocal = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const monthStart = () => `${todayLocal().slice(0, 7)}-01`;

type Companion = { id: string; acompanhante_id: string; acompanhante_nome: string };
type FuelAuthorization = {
  id: string;
  app_request_id: string;
  funcionario_nome: string;
  empresa_nome?: string | null;
  filial?: string | null;
  placa?: string | null;
  combustivel?: string | null;
  posto_nome?: string | null;
  solicitado_em: string;
  status: 'pendente' | 'autorizado' | 'negado' | 'concluido';
  categoria: 'Abastecimento Normal' | 'Abastecimento Viagem';
  fora_expediente: boolean;
  fim_semana: boolean;
  tipo_hora_extra?: 'he50' | 'he100' | null;
  hora_extra_inicio?: string | null;
  hora_extra_fim?: string | null;
  hora_extra_minutos: number;
  autorizado_por_nome?: string | null;
  abastecimento_acompanhantes?: Companion[];
};

type ClosedOperation = {
  id: string;
  app_request_id?: string | null;
  mecanico_nome: string;
  empresa?: string | null;
  filial?: string | null;
  placa?: string | null;
  data: string;
  hora: string;
  combustivel?: string | null;
  valor: number;
  litros: number;
  posto_nome?: string | null;
  categoria_operacional?: string | null;
  fim_semana: boolean;
  fora_expediente: boolean;
  hora_extra_minutos: number;
  acompanhantes: Array<{ id?: string; nome?: string }>;
  status: string;
};

const dateTime = (value?: string | null) => value
  ? new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })
  : '—';
const dateBr = (value?: string | null) => value ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR') : '—';
const money = (value?: number | null) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const duration = (minutes?: number | null) => {
  const value = Math.max(0, Number(minutes || 0));
  const hours = Math.floor(value / 60);
  const mins = value % 60;
  return hours ? `${hours}h ${String(mins).padStart(2, '0')}min` : `${mins}min`;
};
const companionNames = (items?: Array<{ nome?: string }> | null) => items?.map((item) => item.nome).filter(Boolean).join(' · ') || '—';

function AuthorizationCenter() {
  const { userRoles } = useApp();
  const isAdmin = userRoles.includes('admin');
  const [rows, setRows] = useState<FuelAuthorization[]>([]);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState<string>('');

  const load = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from('abastecimento_autorizacoes')
      .select('*, abastecimento_acompanhantes(id, acompanhante_id, acompanhante_nome)')
      .order('solicitado_em', { ascending: false })
      .limit(80);
    if (error) toast.error('Falha ao carregar autorizações: ' + error.message);
    else setRows((data || []) as FuelAuthorization[]);
    setLoading(false);
  }, [isAdmin]);

  useEffect(() => {
    load();
    if (!isAdmin) return;
    const timer = window.setInterval(load, 15000);
    return () => window.clearInterval(timer);
  }, [load, isAdmin]);

  const decide = async (row: FuelAuthorization, decision: 'autorizar' | 'negar') => {
    if (!isAdmin) return;
    setActing(row.id);
    try {
      const { data, error } = await (supabase as any).rpc('topac_decidir_abastecimento', {
        p_id: row.id,
        p_decisao: decision,
      });
      if (error) throw error;
      const decided = Array.isArray(data) ? data[0] : data;
      if (decision === 'autorizar') {
        toast.success(decided?.categoria === 'Abastecimento Viagem'
          ? `Autorizado como Abastecimento Viagem${decided?.tipo_hora_extra ? ` · ${String(decided.tipo_hora_extra).toUpperCase()} iniciada` : ''}.`
          : 'Abastecimento autorizado.');
      } else toast.success('Solicitação negada.');
      await load();
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível registrar a decisão.');
    } finally {
      setActing('');
    }
  };

  const pending = useMemo(() => rows.filter((row) => row.status === 'pendente'), [rows]);
  const closed = useMemo(() => rows.filter((row) => row.status !== 'pendente').slice(0, 24), [rows]);

  if (!isAdmin) return null;

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4 no-print">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Fuel className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">Autorizações de abastecimento</h2>
            {pending.length > 0 && <Badge variant="destructive">{pending.length} pendente(s)</Badge>}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">O horário da autorização define automaticamente Viagem e o início da Hora Extra.</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar
        </Button>
      </div>

      {pending.length > 0 ? (
        <div className="grid gap-3 xl:grid-cols-2">
          {pending.map((row) => (
            <div key={row.id} className="rounded-xl border bg-background p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{row.funcionario_nome}</p>
                  <p className="text-xs text-muted-foreground">{row.empresa_nome || 'Empresa não identificada'} · {row.filial || 'Unidade'}</p>
                </div>
                <Badge variant="outline">Pendente</Badge>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <span><strong>Veículo:</strong> {row.placa || '—'}</span>
                <span><strong>Combustível:</strong> {row.combustivel || '—'}</span>
                <span className="col-span-2"><strong>Posto:</strong> {row.posto_nome || '—'}</span>
                <span className="col-span-2"><strong>Solicitado:</strong> {dateTime(row.solicitado_em)}</span>
                {(row.abastecimento_acompanhantes?.length || 0) > 0 && (
                  <span className="col-span-2"><strong>Acompanhante(s):</strong> {row.abastecimento_acompanhantes!.map((item) => item.acompanhante_nome).join(' · ')}</span>
                )}
              </div>
              <div className="mt-4 flex gap-2">
                <Button variant="destructive" size="sm" disabled={acting === row.id} onClick={() => decide(row, 'negar')}>Negar</Button>
                <Button size="sm" disabled={acting === row.id} onClick={() => decide(row, 'autorizar')}>Autorizar abastecimento</Button>
              </div>
            </div>
          ))}
        </div>
      ) : <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Nenhuma solicitação aguardando autorização.</p>}

      {closed.length > 0 && (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[950px] text-sm">
            <thead className="bg-muted/50 text-xs">
              <tr><th className="p-3 text-left">Mecânico</th><th className="p-3 text-left">Operação</th><th className="p-3 text-left">Categoria</th><th className="p-3 text-left">Hora Extra</th><th className="p-3 text-left">Acompanhantes</th><th className="p-3 text-left">Status</th></tr>
            </thead>
            <tbody className="divide-y">
              {closed.map((row) => (
                <tr key={row.id}>
                  <td className="p-3"><strong>{row.funcionario_nome}</strong><span className="block text-xs text-muted-foreground">{row.empresa_nome}</span></td>
                  <td className="p-3 text-xs">{row.placa || '—'} · {row.combustivel || '—'}<span className="block text-muted-foreground">{dateTime(row.solicitado_em)}</span></td>
                  <td className="p-3"><Badge variant={row.categoria === 'Abastecimento Viagem' ? 'destructive' : 'secondary'}>{row.categoria}</Badge>{row.fim_semana && <span className="ml-2 text-xs">Fim de semana</span>}</td>
                  <td className="p-3 text-xs">{row.tipo_hora_extra ? <><strong>{row.tipo_hora_extra.toUpperCase()}</strong><span className="block">{duration(row.hora_extra_minutos)}</span></> : 'Sem HE automática'}</td>
                  <td className="p-3 text-xs">{row.abastecimento_acompanhantes?.length ? row.abastecimento_acompanhantes.map((item) => item.acompanhante_nome).join(' · ') : '—'}</td>
                  <td className="p-3"><Badge variant="outline">{row.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function OperationalClosingReport() {
  const { userRoles } = useApp();
  const isAdmin = userRoles.includes('admin');
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayLocal());
  const [rows, setRows] = useState<ClosedOperation[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!isAdmin || !from || !to) return;
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from('abastecimentos')
      .select('id,app_request_id,mecanico_nome,empresa,filial,placa,data,hora,combustivel,valor,litros,posto_nome,categoria_operacional,fim_semana,fora_expediente,hora_extra_minutos,acompanhantes,status,excluido')
      .gte('data', from)
      .lte('data', to)
      .eq('excluido', false)
      .order('data', { ascending: true })
      .order('hora', { ascending: true });
    if (error) toast.error('Falha ao carregar fechamento operacional: ' + error.message);
    else setRows((data || []) as ClosedOperation[]);
    setLoading(false);
  }, [isAdmin, from, to]);

  useEffect(() => { load(); }, [load]);

  const travelRows = rows.filter((row) => row.categoria_operacional === 'Abastecimento Viagem');
  const overtimeMinutes = rows.reduce((sum, row) => sum + Number(row.hora_extra_minutos || 0), 0);
  const total = rows.reduce((sum, row) => sum + Number(row.valor || 0), 0);
  const uniqueCompanions = new Set(rows.flatMap((row) => (row.acompanhantes || []).map((item) => item.nome).filter(Boolean)));

  if (!isAdmin) return null;

  return (
    <section id="operational-close-print" className="space-y-4 rounded-xl border bg-card p-4">
      <style>{`@media print{body *{visibility:hidden!important}#operational-close-print,#operational-close-print *{visibility:visible!important}#operational-close-print{position:absolute;left:0;top:0;width:100%;background:#fff!important;color:#000!important;padding:8mm!important;border:0!important}#operational-close-print .no-print{display:none!important}#operational-close-print table{font-size:9px!important}#operational-close-print th,#operational-close-print td{color:#000!important;border-color:#bbb!important}}`}</style>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><Route className="h-5 w-5 text-primary" /><h2 className="font-semibold">Relatório de Fechamento Operacional</h2></div>
          <p className="mt-1 text-xs text-muted-foreground">Abastecimento, viagem, hora extra e acompanhantes consolidados para RH.</p>
        </div>
        <div className="no-print flex flex-wrap items-end gap-2">
          <label className="text-xs text-muted-foreground">De<Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="mt-1 w-36" /></label>
          <label className="text-xs text-muted-foreground">Até<Input type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} className="mt-1 w-36" /></label>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Atualizar</Button>
          <Button size="sm" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" />Imprimir / Salvar PDF</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <div className="rounded-lg border p-3"><span className="block text-xs text-muted-foreground">Operações</span><strong className="text-xl">{rows.length}</strong></div>
        <div className="rounded-lg border p-3"><span className="block text-xs text-muted-foreground">Viagens</span><strong className="text-xl">{travelRows.length}</strong></div>
        <div className="rounded-lg border p-3"><span className="block text-xs text-muted-foreground">Hora Extra</span><strong className="text-xl">{duration(overtimeMinutes)}</strong></div>
        <div className="rounded-lg border p-3"><span className="block text-xs text-muted-foreground">Acompanhantes</span><strong className="text-xl">{uniqueCompanions.size}</strong></div>
        <div className="rounded-lg border p-3"><span className="block text-xs text-muted-foreground">Abastecimento</span><strong className="text-xl">{money(total)}</strong></div>
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[1200px] text-xs">
          <thead className="bg-muted/50">
            <tr>
              <th className="p-2 text-left">Data / Hora</th><th className="p-2 text-left">Empresa</th><th className="p-2 text-left">Mecânico</th><th className="p-2 text-left">Veículo</th><th className="p-2 text-left">Abastecimento</th><th className="p-2 text-left">Categoria</th><th className="p-2 text-left">HE automática</th><th className="p-2 text-left">Acompanhantes</th><th className="p-2 text-right">Valor</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row) => {
              const heType = row.hora_extra_minutos > 0 ? (row.fim_semana ? 'HE100' : 'HE50') : null;
              return (
                <tr key={row.id}>
                  <td className="p-2 whitespace-nowrap">{dateBr(row.data)} · {String(row.hora || '').slice(0, 5)}</td>
                  <td className="p-2"><strong>{row.empresa || '—'}</strong><span className="block text-muted-foreground">{row.filial || ''}</span></td>
                  <td className="p-2 font-medium">{row.mecanico_nome}</td>
                  <td className="p-2">{row.placa || '—'}</td>
                  <td className="p-2">{row.combustivel || '—'} · {Number(row.litros || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} L<span className="block text-muted-foreground">{row.posto_nome || '—'}</span></td>
                  <td className="p-2"><Badge variant={row.categoria_operacional === 'Abastecimento Viagem' ? 'destructive' : 'secondary'}>{row.categoria_operacional || 'Abastecimento Normal'}</Badge>{row.fim_semana && <span className="block mt-1">Fim de semana</span>}</td>
                  <td className="p-2">{heType ? <><strong>{heType}</strong><span className="block">{duration(row.hora_extra_minutos)}</span><span className="block text-muted-foreground">Lançada na folha</span></> : '—'}</td>
                  <td className="p-2">{companionNames(row.acompanhantes)}</td>
                  <td className="p-2 text-right font-semibold">{money(row.valor)}</td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">Nenhuma operação concluída no período.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground">Hora Extra de abastecimento/viagem é registrada automaticamente em Movimento Diário e entra no fechamento da folha sem lançamento manual.</p>
    </section>
  );
}

export default function AppMecanicoAdminPage() {
  return (
    <div className="space-y-3">
      <AuthorizationCenter />
      <OperationalClosingReport />
      <div className="flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 no-print">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Wrench className="h-5 w-5" /></div>
          <div>
            <h1 className="font-semibold">App Operacional</h1>
            <p className="text-xs text-muted-foreground">Campo integrado ao controle de autorização, viagem e fechamento do RH.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="hidden items-center gap-1 lg:flex"><Route className="h-4 w-4" /> Viagem</span>
          <span className="hidden items-center gap-1 lg:flex"><Timer className="h-4 w-4" /> Hora Extra</span>
          <span className="hidden items-center gap-1 lg:flex"><Users className="h-4 w-4" /> Acompanhantes</span>
          <Button variant="outline" size="sm" asChild><a href={APP_OPERACIONAL_URL} target="_blank" rel="noreferrer"><ExternalLink className="mr-2 h-4 w-4" />Abrir em nova aba</a></Button>
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border bg-background no-print" style={{ height: 'calc(100vh - 185px)' }}>
        <iframe src={APP_OPERACIONAL_URL} title="TOPAC Operacional" className="h-full w-full border-0" allow="camera; geolocation; microphone; clipboard-read; clipboard-write" />
      </div>
    </div>
  );
}
