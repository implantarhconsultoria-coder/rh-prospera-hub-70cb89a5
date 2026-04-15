import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ClipboardList, MapPin, User, Wrench, CheckCircle2, Clock, Loader2, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useApp } from '@/context/AppContext';
import { useGeolocation } from '@/hooks/useGeolocation';
import { useVeiculoColaborador } from '@/hooks/useVeiculoColaborador';
import ConfirmacaoVisual from '@/components/ConfirmacaoVisual';
import { toast } from 'sonner';

const STATUS_LABELS: Record<string, string> = {
  pendente: 'Pendente',
  aceito: 'Aceito',
  em_deslocamento: 'Em deslocamento',
  no_local: 'No local',
  em_execucao: 'Em execução',
  concluido: 'Concluído',
};

const STATUS_COLORS: Record<string, string> = {
  pendente: 'bg-yellow-500/10 text-yellow-600',
  aceito: 'bg-blue-500/10 text-blue-600',
  em_deslocamento: 'bg-purple-500/10 text-purple-600',
  no_local: 'bg-indigo-500/10 text-indigo-600',
  em_execucao: 'bg-orange-500/10 text-orange-600',
  concluido: 'bg-green-500/10 text-green-600',
};

interface Chamado {
  id: string;
  cliente: string;
  local_servico: string;
  tipo_servico: string;
  itens_previstos: string;
  observacoes: string;
  info_adicional: string;
  status: string;
  created_at: string;
}

const ChamadosPage: React.FC = () => {
  const { session } = useApp();
  const { getLocation } = useGeolocation();
  const veiculo = useVeiculoColaborador();
  const [chamados, setChamados] = useState<Chamado[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmacao, setConfirmacao] = useState<{ titulo: string; detalhes: { label: string; valor: string }[] } | null>(null);

  const fetchChamados = async () => {
    const { data } = await supabase
      .from('chamados')
      .select('*')
      .eq('colaborador_id', session!.user.id)
      .order('created_at', { ascending: false });
    setChamados((data as Chamado[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchChamados();
    // Realtime
    const channel = supabase
      .channel('chamados-campo')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chamados', filter: `colaborador_id=eq.${session!.user.id}` }, () => fetchChamados())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session?.user?.id]);

  const updateStatus = async (id: string, newStatus: string, confirmTitle: string) => {
    setActionLoading(id);
    try {
      const geo = await getLocation();
      const updates: any = {
        status: newStatus,
        latitude: geo.latitude,
        longitude: geo.longitude,
        veiculo_id: veiculo.veiculo_id,
      };
      if (newStatus === 'aceito') updates.aceito_em = new Date().toISOString();
      if (newStatus === 'concluido') updates.concluido_em = new Date().toISOString();

      const { error } = await supabase.from('chamados').update(updates).eq('id', id);
      if (error) throw error;

      const chamado = chamados.find(c => c.id === id)!;
      setConfirmacao({
        titulo: confirmTitle,
        detalhes: [
          { label: 'Cliente', valor: chamado.cliente },
          { label: 'Local', valor: chamado.local_servico },
          { label: 'Serviço', valor: chamado.tipo_servico },
          { label: 'Status', valor: STATUS_LABELS[newStatus] },
          { label: 'Data/Hora', valor: new Date().toLocaleString('pt-BR') },
          ...(geo.latitude ? [{ label: 'Localização', valor: `${geo.latitude.toFixed(5)}, ${geo.longitude!.toFixed(5)}` }] : []),
        ],
      });
      fetchChamados();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao atualizar chamado');
    } finally {
      setActionLoading(null);
    }
  };

  const getNextAction = (status: string) => {
    switch (status) {
      case 'pendente': return { label: 'Aceitar Chamado', next: 'aceito', confirm: 'Chamado aceito com sucesso!' };
      case 'aceito': return { label: 'Em deslocamento', next: 'em_deslocamento', confirm: 'Deslocamento registrado!' };
      case 'em_deslocamento': return { label: 'Cheguei no local', next: 'no_local', confirm: 'Chegada registrada!' };
      case 'no_local': return { label: 'Iniciar execução', next: 'em_execucao', confirm: 'Execução iniciada!' };
      case 'em_execucao': return { label: 'Concluir chamado', next: 'concluido', confirm: 'Chamado concluído com sucesso!' };
      default: return null;
    }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  const selected = selectedId ? chamados.find(c => c.id === selectedId) : null;

  if (selected) {
    const action = getNextAction(selected.status);
    return (
      <div className="space-y-4">
        <Button variant="ghost" className="text-sm" onClick={() => setSelectedId(null)}>← Voltar</Button>
        <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-foreground">{selected.cliente}</h2>
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_COLORS[selected.status]}`}>
              {STATUS_LABELS[selected.status]}
            </span>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex gap-2"><MapPin className="w-4 h-4 text-muted-foreground mt-0.5" /><span className="text-foreground">{selected.local_servico}</span></div>
            <div className="flex gap-2"><Wrench className="w-4 h-4 text-muted-foreground mt-0.5" /><span className="text-foreground">{selected.tipo_servico}</span></div>
            {selected.itens_previstos && <div className="bg-muted/50 rounded-lg p-3"><p className="text-xs text-muted-foreground mb-1">Itens previstos</p><p className="text-foreground text-sm">{selected.itens_previstos}</p></div>}
            {selected.observacoes && <div className="bg-muted/50 rounded-lg p-3"><p className="text-xs text-muted-foreground mb-1">Observações</p><p className="text-foreground text-sm">{selected.observacoes}</p></div>}
            {selected.info_adicional && <div className="bg-muted/50 rounded-lg p-3"><p className="text-xs text-muted-foreground mb-1">Info adicional</p><p className="text-foreground text-sm">{selected.info_adicional}</p></div>}
          </div>
          {action && (
            <Button
              className="w-full h-14 text-base font-semibold rounded-xl"
              disabled={!!actionLoading}
              onClick={() => updateStatus(selected.id, action.next, action.confirm)}
            >
              {actionLoading === selected.id ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <ArrowRight className="w-5 h-5 mr-2" />}
              {action.label}
            </Button>
          )}
        </div>
        <ConfirmacaoVisual open={!!confirmacao} onClose={() => { setConfirmacao(null); setSelectedId(null); }} titulo={confirmacao?.titulo || ''} detalhes={confirmacao?.detalhes || []} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold font-display text-foreground">Meus Chamados</h2>
      {chamados.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhum chamado recebido</p>
        </div>
      ) : (
        chamados.map((c, i) => (
          <motion.button
            key={c.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
            onClick={() => setSelectedId(c.id)}
            className="w-full bg-card border border-border rounded-2xl p-4 text-left active:scale-[0.98] transition-transform"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-foreground text-sm">{c.cliente}</span>
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[c.status]}`}>
                {STATUS_LABELS[c.status]}
              </span>
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="w-3 h-3" />{c.local_servico}
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
              <Wrench className="w-3 h-3" />{c.tipo_servico}
            </div>
          </motion.button>
        ))
      )}
      <ConfirmacaoVisual open={!!confirmacao} onClose={() => setConfirmacao(null)} titulo={confirmacao?.titulo || ''} detalhes={confirmacao?.detalhes || []} />
    </div>
  );
};

export default ChamadosPage;
