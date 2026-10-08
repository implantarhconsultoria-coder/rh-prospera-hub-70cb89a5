import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronRight, FileCheck2, RefreshCw, UserPlus, Users } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import FechamentoPage from '@/pages/FechamentoPage';

type PreCadastro = {
  id: string;
  status: string;
  nome?: string | null;
  cpf?: string | null;
  empresa_nome?: string | null;
  funcao?: string | null;
  data_admissao?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

type StageKey = 'pre-cadastro' | 'validacao' | 'contabilidade';

const STAGES: Array<{
  key: StageKey;
  title: string;
  subtitle: string;
  statuses: string[];
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    key: 'pre-cadastro',
    title: '1. Pré-cadastro',
    subtitle: 'Somente cadastros ainda em preenchimento',
    statuses: ['cadastro_em_preenchimento'],
    icon: UserPlus,
  },
  {
    key: 'validacao',
    title: '2. Validar documentos',
    subtitle: 'Cadastro enviado e aguardando conferência',
    statuses: ['aguardando_validacao'],
    icon: FileCheck2,
  },
  {
    key: 'contabilidade',
    title: '3. Cadastro oficial',
    subtitle: 'Documentação completa pronta para finalizar',
    statuses: ['documentacao_completa'],
    icon: CheckCircle2,
  },
];

const CentralContabilidadePage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [records, setRecords] = useState<PreCadastro[]>([]);
  const [stage, setStage] = useState<StageKey>('pre-cadastro');
  const [loading, setLoading] = useState(true);
  const [completedCount, setCompletedCount] = useState(0);

  const loadQueue = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [{ data, error }, { count, error: countError }] = await Promise.all([
        (supabase as any)
          .from('pre_cadastros_admissionais')
          .select('id,status,nome,cpf,empresa_nome,funcao,data_admissao,updated_at,created_at')
          .in('status', ['cadastro_em_preenchimento', 'aguardando_validacao', 'documentacao_completa'])
          .order('updated_at', { ascending: false }),
        (supabase as any)
          .from('pre_cadastros_admissionais')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'cadastro_oficial'),
      ]);
      if (error) throw error;
      if (countError) throw countError;
      setRecords((data || []) as PreCadastro[]);
      setCompletedCount(Number(count || 0));
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível carregar o fluxo da contabilidade.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadQueue(); }, [loadQueue]);

  useEffect(() => {
    const channel = supabase
      .channel('central-contabilidade-pre-cadastro')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pre_cadastros_admissionais' }, () => void loadQueue(true))
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [loadQueue]);

  const activeStage = STAGES.find(item => item.key === stage) || STAGES[0];
  const stageRecords = useMemo(
    () => records.filter(record => activeStage.statuses.includes(String(record.status || ''))),
    [records, activeStage],
  );

  const countFor = (key: StageKey) => {
    const config = STAGES.find(item => item.key === key);
    return records.filter(record => config?.statuses.includes(String(record.status || ''))).length;
  };

  const totalPending = records.length;

  // Esta rota sempre usou a mesma página da Central. Mantém o acesso ao fechamento
  // sem misturar o fechamento operacional com a fila sequencial de admissões.
  if (location.pathname === '/admin/apontamento-inteligente') return <FechamentoPage />;

  return (
    <div className="space-y-5 pb-12">
      <div className="rounded-2xl border border-purple-500/30 bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-400">Central da Contabilidade</p>
            <h1 className="mt-1 text-2xl font-bold">Fluxo admissional</h1>
            <p className="mt-1 text-sm text-muted-foreground">Uma pessoa, uma etapa. Ao avançar, ela sai automaticamente da etapa anterior.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="rounded-xl border border-border bg-background/60 px-4 py-2 text-sm">
              <span className="text-muted-foreground">Pendentes: </span><strong>{totalPending}</strong>
            </div>
            <Button variant="outline" size="sm" onClick={() => void loadQueue()} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {STAGES.map((item, index) => {
          const Icon = item.icon;
          const selected = item.key === stage;
          return (
            <React.Fragment key={item.key}>
              <button
                type="button"
                onClick={() => setStage(item.key)}
                className={`rounded-2xl border p-4 text-left transition ${selected ? 'border-amber-400/70 bg-amber-400/10' : 'border-border bg-card hover:border-purple-400/40'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className={`rounded-xl p-2.5 ${selected ? 'bg-amber-400/15 text-amber-300' : 'bg-purple-500/10 text-purple-300'}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${selected ? 'bg-amber-400 text-black' : 'bg-muted text-foreground'}`}>
                    {countFor(item.key)}
                  </span>
                </div>
                <h2 className="mt-3 font-semibold">{item.title}</h2>
                <p className="mt-1 text-xs text-muted-foreground">{item.subtitle}</p>
              </button>
              {index < STAGES.length - 1 ? <ChevronRight className="hidden" /> : null}
            </React.Fragment>
          );
        })}
      </div>

      <div className="rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 className="font-semibold">{activeStage.title}</h2>
            <p className="text-xs text-muted-foreground">{activeStage.subtitle}</p>
          </div>
          <span className="text-xs text-muted-foreground">{stageRecords.length} na fila</span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Carregando fila...</div>
        ) : stageRecords.length === 0 ? (
          <div className="p-10 text-center">
            <CheckCircle2 className="mx-auto h-9 w-9 text-emerald-400" />
            <p className="mt-3 font-medium">Nenhuma pendência nesta etapa.</p>
            <p className="mt-1 text-xs text-muted-foreground">Quando um processo avançar, a fila é atualizada automaticamente.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {stageRecords.map(record => (
              <div key={record.id} className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="truncate">{record.nome || 'Sem nome informado'}</strong>
                    {record.empresa_nome ? <span className="rounded-md bg-purple-500/10 px-2 py-0.5 text-xs text-purple-200">{record.empresa_nome}</span> : null}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {record.funcao ? <span>{record.funcao}</span> : null}
                    {record.cpf ? <span>CPF {record.cpf}</span> : null}
                    {record.data_admissao ? <span>Admissão {new Date(`${record.data_admissao}T12:00:00`).toLocaleDateString('pt-BR')}</span> : null}
                  </div>
                </div>
                <Button size="sm" onClick={() => navigate('/admin/pre-cadastro-admissional')} className="shrink-0 bg-amber-400 text-black hover:bg-amber-300">
                  Abrir processo <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-2"><Users className="h-4 w-4 text-emerald-400" /> Concluídos não ficam acumulados nesta tela.</div>
        <span>{completedCount} processo(s) já finalizado(s) preservado(s) no histórico.</span>
      </div>
    </div>
  );
};

export default CentralContabilidadePage;
