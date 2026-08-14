import { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, Fuel, RefreshCw, Route, Timer, Users, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useApp } from '@/context/AppContext';
import { toast } from 'sonner';

const APP_OPERACIONAL_URL = 'https://746ce5953133175295.v2.appdeploy.ai/';

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

const dateTime = (value?: string | null) => value
  ? new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })
  : '—';

const duration = (minutes?: number | null) => {
  const value = Math.max(0, Number(minutes || 0));
  const hours = Math.floor(value / 60);
  const mins = value % 60;
  return hours ? `${hours}h ${String(mins).padStart(2, '0')}min` : `${mins}min`;
};

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
    <section className="space-y-3 rounded-xl border bg-card p-4">
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
                  <p className="text-xs text-muted-foreground">{row.empresa_nome || 'Empresa não identificada'} · {row.filial || 'Unidade'} </p>
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

export default function AppMecanicoAdminPage() {
  return (
    <div className="space-y-3">
      <AuthorizationCenter />
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
      <div className="overflow-hidden rounded-xl border bg-background" style={{ height: 'calc(100vh - 185px)' }}>
        <iframe src={APP_OPERACIONAL_URL} title="TOPAC Operacional" className="h-full w-full border-0" allow="camera; geolocation; microphone; clipboard-read; clipboard-write" />
      </div>
    </div>
  );
}
