import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, Loader2, Search, ShieldCheck, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import OperadorCodeDialog from '@/components/OperadorCodeDialog';
import { toast } from 'sonner';

const rpc = supabase as unknown as {
  rpc: (name: string, args?: Record<string, unknown>) => Promise<{ data: any; error: { message?: string } | null }>;
};

type Status = 'sim' | 'nao' | 'pendente';
type Row = {
  id: string;
  ativo_id?: string | null;
  placa: string;
  status: Status;
  motivo?: string | null;
  origem?: string | null;
  atualizado_por_nome?: string | null;
  atualizado_em?: string | null;
  descricao?: string | null;
  patrimonio?: string | null;
  empresa?: string | null;
};

const STATUS = {
  sim: {
    label: 'SIM',
    text: 'Disponível para iniciar locação',
    className: 'border-emerald-400/40 bg-emerald-500/10 text-emerald-700',
    icon: CheckCircle2,
  },
  nao: {
    label: 'NÃO',
    text: 'Indisponível / em locação',
    className: 'border-red-400/40 bg-red-500/10 text-red-700',
    icon: XCircle,
  },
  pendente: {
    label: 'PENDENTE',
    text: 'Aguardando confirmação',
    className: 'border-amber-400/40 bg-amber-500/10 text-amber-700',
    icon: Clock3,
  },
} as const;

const OperacionalDisponibilidadePlacas: React.FC = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [busca, setBusca] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Row | null>(null);
  const [nextStatus, setNextStatus] = useState<Status>('pendente');
  const [motivo, setMotivo] = useState('');
  const [codigoOpen, setCodigoOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    const { data, error } = await rpc.rpc('operacional_consultar_placas', { p_busca: busca.trim() || null });
    setLoading(false);
    if (error || !data?.ok) {
      toast.error(data?.error || error?.message || 'Não foi possível consultar disponibilidade.');
      setRows([]);
      return;
    }
    setRows((data.placas || []) as Row[]);
  }, [busca]);

  useEffect(() => {
    const timer = window.setTimeout(() => void carregar(), 250);
    return () => window.clearTimeout(timer);
  }, [carregar]);

  const counts = useMemo(() => ({
    sim: rows.filter((r) => r.status === 'sim').length,
    nao: rows.filter((r) => r.status === 'nao').length,
    pendente: rows.filter((r) => r.status === 'pendente').length,
  }), [rows]);

  const abrirAjuste = (row: Row) => {
    setSelected(row);
    setNextStatus(row.status);
    setMotivo('');
  };

  const confirmarAjuste = () => {
    if (!selected) return;
    if (motivo.trim().length < 3) return toast.error('Informe o motivo da alteração.');
    setCodigoOpen(true);
  };

  const salvarAjuste = async (codigo: string) => {
    if (!selected) return;
    setSaving(true);
    const { data, error } = await rpc.rpc('operacional_definir_disponibilidade', {
      p_codigo_operador: codigo,
      p_placa: selected.placa,
      p_status: nextStatus,
      p_motivo: motivo.trim(),
    });
    setSaving(false);
    if (error || !data?.ok) {
      toast.error(data?.error || error?.message || 'Código inválido ou alteração não autorizada.');
      return;
    }
    toast.success(`Disponibilidade da placa ${selected.placa} registrada por ${data.operador}.`);
    setCodigoOpen(false);
    setSelected(null);
    setMotivo('');
    await carregar();
  };

  const iniciarLocacao = (row: Row) => {
    if (row.status !== 'sim') return;
    navigate(`/operacional/protocolo?acao=locacao&placa=${encodeURIComponent(row.placa)}`);
  };

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border bg-card p-5">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-black">DISPONIBILIDADE DE PLACAS</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Consulta operacional. Documentos, IPVA e licenciamento não ficam disponíveis nesta tela.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2"><b className="block text-lg">{counts.sim}</b>SIM</div>
            <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2"><b className="block text-lg">{counts.nao}</b>NÃO</div>
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2"><b className="block text-lg">{counts.pendente}</b>PENDENTE</div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-xl border px-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(event) => setBusca(event.target.value.toUpperCase())}
            placeholder="Digite placa, patrimônio ou descrição..."
            className="border-0 shadow-none focus-visible:ring-0"
          />
        </div>
      </section>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Nenhuma placa encontrada.</div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {rows.map((row) => {
            const cfg = STATUS[row.status] || STATUS.pendente;
            const Icon = cfg.icon;
            return (
              <div key={row.id} className="rounded-2xl border bg-card p-4">
                <div className="flex items-start gap-3">
                  <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl border ${cfg.className}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-lg font-black">{row.placa}</span>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${cfg.className}`}>{cfg.label}</span>
                    </div>
                    <p className="mt-1 text-sm font-semibold">{row.descricao || 'Veículo'}</p>
                    <p className="text-xs text-muted-foreground">{row.patrimonio ? `Patrimônio ${row.patrimonio}` : 'Sem patrimônio informado'}</p>
                    <p className="mt-2 text-xs text-muted-foreground">{cfg.text}</p>
                    {row.motivo && <p className="mt-1 text-[11px] text-muted-foreground">Último registro: {row.motivo}</p>}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => abrirAjuste(row)}>
                    <ShieldCheck className="mr-1 h-4 w-4" /> Atualizar situação
                  </Button>
                  {row.status === 'sim' && (
                    <Button size="sm" onClick={() => iniciarLocacao(row)}>
                      Iniciar locação
                    </Button>
                  )}
                </div>

                {selected?.id === row.id && (
                  <div className="mt-4 space-y-3 rounded-xl border bg-muted/20 p-3">
                    <div className="flex items-center gap-2 text-xs font-bold">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      Alteração controlada: motivo + código do operador serão registrados.
                    </div>
                    <Select value={nextStatus} onValueChange={(value) => setNextStatus(value as Status)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sim">SIM — disponível</SelectItem>
                        <SelectItem value="nao">NÃO — indisponível</SelectItem>
                        <SelectItem value="pendente">PENDENTE — aguardando conferência</SelectItem>
                      </SelectContent>
                    </Select>
                    <Textarea
                      value={motivo}
                      onChange={(event) => setMotivo(event.target.value)}
                      placeholder="Motivo obrigatório da alteração..."
                      rows={2}
                    />
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>Cancelar</Button>
                      <Button size="sm" onClick={confirmarAjuste}>Confirmar com código</Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <OperadorCodeDialog
        open={codigoOpen}
        onOpenChange={setCodigoOpen}
        loading={saving}
        title="Confirmar alteração da disponibilidade"
        description="Informe seu código individual. Status, motivo, operador, data e hora serão preservados no histórico."
        onConfirm={salvarAjuste}
      />
    </div>
  );
};

export default OperacionalDisponibilidadePlacas;
