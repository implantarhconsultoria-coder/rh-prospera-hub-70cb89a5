import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ClipboardList, MapPin, Wrench, Loader2, ArrowRight, Package, Plus, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useTecnicoApp } from '@/context/TecnicoAppContext';
import { getBrowserLocation } from '@/lib/browserGeo';
import ConfirmacaoVisual from '@/components/ConfirmacaoVisual';
import { toast } from 'sonner';

interface ItemEstoque { id: string; nome_item: string; quantidade: number; unidade: string; }
interface ItemSelecionado { item_id: string; nome_item: string; quantidade: number; max: number; }

const STATUS_LABELS: Record<string, string> = {
  pendente: 'Pendente', aceito: 'Aceito', em_deslocamento: 'Em deslocamento',
  no_local: 'No local', em_execucao: 'Em execução', concluido: 'Concluído',
};
const STATUS_COLORS: Record<string, string> = {
  pendente: 'bg-yellow-500/15 text-yellow-300', aceito: 'bg-blue-500/15 text-blue-300',
  em_deslocamento: 'bg-purple-500/15 text-purple-300', no_local: 'bg-indigo-500/15 text-indigo-300',
  em_execucao: 'bg-orange-500/15 text-orange-300', concluido: 'bg-green-500/15 text-green-300',
};

interface Chamado {
  id: string; cliente: string; local_servico: string; tipo_servico: string;
  itens_previstos: string; observacoes: string; info_adicional: string;
  status: string; created_at: string;
}

const MecanicoChamadosPage: React.FC = () => {
  const { call } = useTecnicoApp();
  const [chamados, setChamados] = useState<Chamado[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showItensDialog, setShowItensDialog] = useState(false);
  const [estoque, setEstoque] = useState<ItemEstoque[]>([]);
  const [itensConsumo, setItensConsumo] = useState<ItemSelecionado[]>([]);
  const [confirmacao, setConfirmacao] = useState<{ titulo: string; detalhes: { label: string; valor: string }[] } | null>(null);

  const fetchChamados = async () => {
    try {
      const r: any = await call('listar_chamados');
      setChamados(r.chamados || []);
    } catch { /* noop */ }
    setLoading(false);
  };

  useEffect(() => {
    fetchChamados();
    const t = setInterval(fetchChamados, 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateStatus = async (id: string, status: string, titulo: string, itens?: ItemSelecionado[]) => {
    setActionLoading(id);
    try {
      const geo = await getBrowserLocation();
      const c = chamados.find((x) => x.id === id)!;
      await call('atualizar_chamado', {
        id, status, latitude: geo.latitude, longitude: geo.longitude,
        itens: itens?.map((i) => ({ item_id: i.item_id, nome_item: i.nome_item, quantidade: i.quantidade })) || [],
      });
      setConfirmacao({
        titulo,
        detalhes: [
          { label: 'Cliente', valor: c.cliente },
          { label: 'Local', valor: c.local_servico },
          { label: 'Serviço', valor: c.tipo_servico },
          { label: 'Status', valor: STATUS_LABELS[status] },
          { label: 'Data/Hora', valor: new Date().toLocaleString('pt-BR') },
          ...(geo.latitude ? [{ label: 'Localização', valor: `${geo.latitude.toFixed(5)}, ${geo.longitude!.toFixed(5)}` }] : []),
        ],
      });
      fetchChamados();
    } catch (e: any) { toast.error(e.message || 'Erro ao atualizar'); }
    finally { setActionLoading(null); }
  };

  const abrirDialogItens = async () => {
    try {
      const r: any = await call('listar_estoque');
      setEstoque(r.itens || []);
      setItensConsumo([]);
      setShowItensDialog(true);
    } catch (e: any) { toast.error(e.message || 'Erro ao carregar estoque'); }
  };

  const toggleItem = (item: ItemEstoque) => {
    setItensConsumo((prev) => {
      const ex = prev.find((p) => p.item_id === item.id);
      if (ex) return prev.filter((p) => p.item_id !== item.id);
      return [...prev, { item_id: item.id, nome_item: item.nome_item, quantidade: 1, max: item.quantidade }];
    });
  };
  const ajustarQtd = (id: string, delta: number) => {
    setItensConsumo((prev) => prev.map((p) =>
      p.item_id === id ? { ...p, quantidade: Math.max(1, Math.min(p.max, p.quantidade + delta)) } : p,
    ));
  };

  const concluirComItens = async () => {
    if (!selectedId) return;
    setShowItensDialog(false);
    await updateStatus(selectedId, 'concluido', 'Chamado concluído com sucesso!', itensConsumo);
  };

  const getNextAction = (status: string) => {
    switch (status) {
      case 'pendente': return { label: 'Aceitar Chamado', next: 'aceito', confirm: 'Chamado aceito!', isConcluir: false };
      case 'aceito': return { label: 'Em deslocamento', next: 'em_deslocamento', confirm: 'Deslocamento registrado!', isConcluir: false };
      case 'em_deslocamento': return { label: 'Cheguei no local', next: 'no_local', confirm: 'Chegada registrada!', isConcluir: false };
      case 'no_local': return { label: 'Iniciar execução', next: 'em_execucao', confirm: 'Execução iniciada!', isConcluir: false };
      case 'em_execucao': return { label: 'Concluir chamado', next: 'concluido', confirm: 'Chamado concluído!', isConcluir: true };
      default: return null;
    }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  const selected = selectedId ? chamados.find((c) => c.id === selectedId) : null;

  if (selected) {
    const action = getNextAction(selected.status);
    return (
      <div className="space-y-4">
        <Button variant="ghost" className="text-sm text-white/70 hover:text-white hover:bg-white/10" onClick={() => setSelectedId(null)}>← Voltar</Button>
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">{selected.cliente}</h2>
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_COLORS[selected.status]}`}>
              {STATUS_LABELS[selected.status]}
            </span>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex gap-2"><MapPin className="w-4 h-4 text-white/60 mt-0.5" /><span className="text-white">{selected.local_servico}</span></div>
            <div className="flex gap-2"><Wrench className="w-4 h-4 text-white/60 mt-0.5" /><span className="text-white">{selected.tipo_servico}</span></div>
            {selected.itens_previstos && <div className="bg-white/5 rounded-lg p-3"><p className="text-xs text-white/60 mb-1">Itens previstos</p><p className="text-white text-sm">{selected.itens_previstos}</p></div>}
            {selected.observacoes && <div className="bg-white/5 rounded-lg p-3"><p className="text-xs text-white/60 mb-1">Observações</p><p className="text-white text-sm">{selected.observacoes}</p></div>}
            {selected.info_adicional && <div className="bg-white/5 rounded-lg p-3"><p className="text-xs text-white/60 mb-1">Info adicional</p><p className="text-white text-sm">{selected.info_adicional}</p></div>}
          </div>
          {action && (
            <Button
              className="w-full h-14 text-base font-semibold rounded-xl"
              disabled={!!actionLoading}
              onClick={() => action.isConcluir ? abrirDialogItens() : updateStatus(selected.id, action.next, action.confirm)}
            >
              {actionLoading === selected.id ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <ArrowRight className="w-5 h-5 mr-2" />}
              {action.label}
            </Button>
          )}
        </div>

        <Dialog open={showItensDialog} onOpenChange={setShowItensDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Package className="w-5 h-5" />Itens utilizados</DialogTitle>
            </DialogHeader>
            <p className="text-xs text-muted-foreground">Selecione os itens consumidos. A baixa será automática.</p>
            <div className="max-h-72 overflow-y-auto space-y-2">
              {estoque.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-6">Nenhum item no estoque</p>
              ) : estoque.map((item) => {
                const sel = itensConsumo.find((i) => i.item_id === item.id);
                const disabled = item.quantidade <= 0 && !sel;
                return (
                  <div key={item.id} className={`border rounded-lg p-2.5 ${sel ? 'border-primary bg-primary/5' : 'border-border'} ${disabled ? 'opacity-50' : ''}`}>
                    <div className="flex items-center justify-between gap-2">
                      <button onClick={() => !disabled && toggleItem(item)} disabled={disabled} className="flex-1 text-left">
                        <p className="text-sm font-medium">{item.nome_item}</p>
                        <p className="text-[10px] text-muted-foreground">Disponível: {item.quantidade} {item.unidade}</p>
                      </button>
                      {sel && (
                        <div className="flex items-center gap-1">
                          <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => ajustarQtd(item.id, -1)}><Minus className="w-3 h-3" /></Button>
                          <span className="text-sm font-bold w-7 text-center">{sel.quantidade}</span>
                          <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => ajustarQtd(item.id, 1)}><Plus className="w-3 h-3" /></Button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" className="w-full sm:w-auto" onClick={() => { setItensConsumo([]); concluirComItens(); }}>Concluir sem itens</Button>
              <Button className="w-full sm:w-auto" onClick={concluirComItens}>Concluir e dar baixa</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <ConfirmacaoVisual open={!!confirmacao} onClose={() => { setConfirmacao(null); setSelectedId(null); }} titulo={confirmacao?.titulo || ''} detalhes={confirmacao?.detalhes || []} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold font-display text-white">Meus Chamados</h2>
      {chamados.length === 0 ? (
        <div className="text-center py-12 text-white/60">
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
            className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-left active:scale-[0.98] transition-transform"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-white text-sm">{c.cliente}</span>
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[c.status]}`}>
                {STATUS_LABELS[c.status]}
              </span>
            </div>
            <div className="flex items-center gap-1 text-xs text-white/60"><MapPin className="w-3 h-3" />{c.local_servico}</div>
            <div className="flex items-center gap-1 text-xs text-white/60 mt-1"><Wrench className="w-3 h-3" />{c.tipo_servico}</div>
          </motion.button>
        ))
      )}
      <ConfirmacaoVisual open={!!confirmacao} onClose={() => setConfirmacao(null)} titulo={confirmacao?.titulo || ''} detalhes={confirmacao?.detalhes || []} />
    </div>
  );
};

export default MecanicoChamadosPage;
