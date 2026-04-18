import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, FileText, Package, Wallet, RefreshCw, Plus, Trash2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

const fmtBRL = (n: number) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtBR = (d?: string | null) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';

const ContratoDetailPage: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [contrato, setContrato] = useState<any>(null);
  const [equipamentos, setEquipamentos] = useState<any[]>([]);
  const [ativosDisponiveis, setAtivosDisponiveis] = useState<any[]>([]);
  const [faturas, setFaturas] = useState<any[]>([]);
  const [reajustes, setReajustes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [equipOpen, setEquipOpen] = useState(false);
  const [equipForm, setEquipForm] = useState<any>({ status: 'ativo', valor_unitario: 0 });

  const carregar = async () => {
    if (!id) return;
    setLoading(true);
    const [c, eq, fat, rj, at] = await Promise.all([
      supabase.from('contratos').select('*, clientes_fat(razao_social), empresas(nome)').eq('id', id).maybeSingle(),
      supabase.from('contrato_equipamentos').select('*, ativos(descricao, placa, patrimonio, tipo)').eq('contrato_id', id).order('created_at'),
      supabase.from('faturas').select('*').eq('contrato_id', id).order('data_emissao', { ascending: false }),
      supabase.from('reajustes').select('*').eq('contrato_id', id).order('data_aplicacao', { ascending: false }),
      supabase.from('ativos').select('id, descricao, placa, patrimonio, tipo, status').eq('status', 'ativo'),
    ]);
    setContrato(c.data);
    setEquipamentos(eq.data || []);
    setFaturas(fat.data || []);
    setReajustes(rj.data || []);
    setAtivosDisponiveis(at.data || []);
    setLoading(false);
  };
  useEffect(() => { carregar(); }, [id]);

  const adicionarEquip = async () => {
    if (!equipForm.ativo_id && !equipForm.descricao_livre) {
      toast.error('Escolha um ativo ou descreva o equipamento'); return;
    }
    const { error } = await supabase.from('contrato_equipamentos').insert({
      contrato_id: id,
      ativo_id: equipForm.ativo_id || null,
      descricao_livre: equipForm.descricao_livre || '',
      patrimonio: equipForm.patrimonio || '',
      placa: equipForm.placa || '',
      data_envio: equipForm.data_envio || null,
      data_retorno: equipForm.data_retorno || null,
      valor_unitario: Number(equipForm.valor_unitario) || 0,
      status: equipForm.status,
      observacao: equipForm.observacao || '',
    });
    if (error) return toast.error(error.message);
    toast.success('Equipamento vinculado');
    setEquipOpen(false); setEquipForm({ status: 'ativo', valor_unitario: 0 });
    carregar();
  };

  const removerEquip = async (eid: string) => {
    if (!confirm('Remover este equipamento do contrato?')) return;
    await supabase.from('contrato_equipamentos').delete().eq('id', eid);
    carregar();
  };

  if (loading) return <div className="p-6 text-muted-foreground">Carregando...</div>;
  if (!contrato) return <div className="p-6 text-muted-foreground">Contrato não encontrado.</div>;

  const totalEquip = equipamentos.filter(e => e.status === 'ativo').reduce((s, e) => s + Number(e.valor_unitario || 0), 0);

  return (
    <div className="space-y-4 animate-fade-in">
      <button onClick={() => navigate('/admin/faturamento/contratos')} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
        <ArrowLeft className="w-4 h-4" /> Voltar
      </button>

      <div className="card-premium p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold font-display">Contrato {contrato.numero}</h1>
            <p className="text-sm text-muted-foreground">{contrato.clientes_fat?.razao_social} • {contrato.empresas?.nome}</p>
          </div>
          <span className={`text-xs px-2 py-1 rounded-full ${contrato.status === 'ativo' ? 'bg-success/20 text-success' : 'bg-muted'}`}>{contrato.status}</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 text-sm">
          <div><p className="text-[10px] uppercase text-muted-foreground">Tipo</p><p className="font-medium">{contrato.tipo}</p></div>
          <div><p className="text-[10px] uppercase text-muted-foreground">Período</p><p className="font-medium">{fmtBR(contrato.data_inicio)} → {fmtBR(contrato.data_fim)}</p></div>
          <div><p className="text-[10px] uppercase text-muted-foreground">Regra</p><p className="font-medium">{contrato.regra_faturamento}</p></div>
          <div><p className="text-[10px] uppercase text-muted-foreground">Vencimento</p><p className="font-medium">Dia {contrato.dia_vencimento}</p></div>
          <div><p className="text-[10px] uppercase text-muted-foreground">Valor mensal</p><p className="font-bold text-primary">{fmtBRL(contrato.valor_mensal)}</p></div>
          <div><p className="text-[10px] uppercase text-muted-foreground">Soma equipamentos</p><p className="font-bold">{fmtBRL(totalEquip)}</p></div>
          <div><p className="text-[10px] uppercase text-muted-foreground">Reajuste</p><p className="font-medium">{contrato.indice_reajuste} ({Number(contrato.percentual_reajuste).toFixed(2)}%)</p></div>
          <div><p className="text-[10px] uppercase text-muted-foreground">Próximo reajuste</p><p className="font-medium">{fmtBR(contrato.proximo_reajuste)}</p></div>
        </div>
        {contrato.observacoes && <p className="mt-3 text-xs text-muted-foreground border-t border-border pt-3"><b>Obs:</b> {contrato.observacoes}</p>}
      </div>

      <Tabs defaultValue="equipamentos">
        <TabsList>
          <TabsTrigger value="equipamentos"><Package className="w-4 h-4 mr-1" />Equipamentos ({equipamentos.length})</TabsTrigger>
          <TabsTrigger value="faturas"><Wallet className="w-4 h-4 mr-1" />Faturas ({faturas.length})</TabsTrigger>
          <TabsTrigger value="reajustes"><RefreshCw className="w-4 h-4 mr-1" />Reajustes ({reajustes.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="equipamentos">
          <div className="flex justify-end mb-2">
            <button onClick={() => setEquipOpen(true)} className="btn-primary text-sm flex items-center gap-1"><Plus className="w-4 h-4" /> Vincular Equipamento</button>
          </div>
          <div className="card-premium overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase text-muted-foreground"><tr>
                <th className="text-left p-3">Descrição</th><th className="text-left p-3">Placa/Patrimônio</th><th className="text-left p-3">Envio → Retorno</th>
                <th className="text-right p-3">Valor</th><th className="text-left p-3">Status</th><th></th>
              </tr></thead>
              <tbody>
                {equipamentos.length === 0 ? <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">Nenhum equipamento vinculado.</td></tr> :
                  equipamentos.map(e => (
                    <tr key={e.id} className="border-t border-border">
                      <td className="p-3">{e.ativos?.descricao || e.descricao_livre || '—'}</td>
                      <td className="p-3 text-muted-foreground">{e.placa || e.ativos?.placa || e.patrimonio || e.ativos?.patrimonio || '—'}</td>
                      <td className="p-3 text-muted-foreground">{fmtBR(e.data_envio)} → {fmtBR(e.data_retorno)}</td>
                      <td className="p-3 text-right">{fmtBRL(e.valor_unitario)}</td>
                      <td className="p-3"><span className={`text-[10px] px-2 py-0.5 rounded-full ${e.status === 'ativo' ? 'bg-success/20 text-success' : 'bg-muted'}`}>{e.status}</span></td>
                      <td className="p-3 text-right"><button onClick={() => removerEquip(e.id)} className="p-1.5 hover:bg-destructive/10 text-destructive rounded"><Trash2 className="w-4 h-4" /></button></td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="faturas" className="card-premium p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase text-muted-foreground"><tr>
              <th className="text-left p-3">Nº</th><th className="text-left p-3">Competência</th><th className="text-left p-3">Vencimento</th>
              <th className="text-right p-3">Total</th><th className="text-left p-3">Status</th>
            </tr></thead>
            <tbody>
              {faturas.length === 0 ? <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">Nenhuma fatura.</td></tr> :
                faturas.map(f => (
                  <tr key={f.id} className="border-t border-border">
                    <td className="p-3 font-medium">{f.numero}</td>
                    <td className="p-3">{f.competencia}</td>
                    <td className="p-3">{fmtBR(f.data_vencimento)}</td>
                    <td className="p-3 text-right">{fmtBRL(f.total)}</td>
                    <td className="p-3"><span className="text-[10px] px-2 py-0.5 rounded-full bg-muted">{f.status}</span></td>
                  </tr>
                ))}
            </tbody>
          </table>
        </TabsContent>

        <TabsContent value="reajustes" className="card-premium p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase text-muted-foreground"><tr>
              <th className="text-left p-3">Data</th><th className="text-left p-3">Índice</th><th className="text-right p-3">%</th>
              <th className="text-right p-3">Valor anterior</th><th className="text-right p-3">Valor novo</th>
            </tr></thead>
            <tbody>
              {reajustes.length === 0 ? <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">Sem reajustes.</td></tr> :
                reajustes.map(r => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="p-3">{fmtBR(r.data_aplicacao)}</td>
                    <td className="p-3">{r.indice || '—'}</td>
                    <td className="p-3 text-right">{Number(r.percentual).toFixed(2)}%</td>
                    <td className="p-3 text-right">{fmtBRL(r.valor_anterior)}</td>
                    <td className="p-3 text-right font-semibold">{fmtBRL(r.valor_novo)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </TabsContent>
      </Tabs>

      <Dialog open={equipOpen} onOpenChange={setEquipOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Vincular Equipamento</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Ativo Cadastrado</Label>
              <select value={equipForm.ativo_id || ''} onChange={e => setEquipForm({ ...equipForm, ativo_id: e.target.value })} className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm">
                <option value="">— Sem ativo (descrição livre) —</option>
                {ativosDisponiveis.map(a => <option key={a.id} value={a.id}>{a.descricao} {a.placa && `(${a.placa})`} {a.patrimonio && `[${a.patrimonio}]`}</option>)}
              </select>
            </div>
            <div><Label>Descrição livre (se sem ativo)</Label><Input value={equipForm.descricao_livre || ''} onChange={e => setEquipForm({ ...equipForm, descricao_livre: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Placa</Label><Input value={equipForm.placa || ''} onChange={e => setEquipForm({ ...equipForm, placa: e.target.value })} /></div>
              <div><Label>Patrimônio</Label><Input value={equipForm.patrimonio || ''} onChange={e => setEquipForm({ ...equipForm, patrimonio: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Data Envio</Label><Input type="date" value={equipForm.data_envio || ''} onChange={e => setEquipForm({ ...equipForm, data_envio: e.target.value })} /></div>
              <div><Label>Data Retorno</Label><Input type="date" value={equipForm.data_retorno || ''} onChange={e => setEquipForm({ ...equipForm, data_retorno: e.target.value })} /></div>
            </div>
            <div><Label>Valor Unitário (R$)</Label><Input type="number" step="0.01" value={equipForm.valor_unitario} onChange={e => setEquipForm({ ...equipForm, valor_unitario: e.target.value })} /></div>
            <div><Label>Status</Label>
              <select value={equipForm.status} onChange={e => setEquipForm({ ...equipForm, status: e.target.value })} className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm">
                <option value="ativo">Ativo</option><option value="parado">Parado</option><option value="devolvido">Devolvido</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <button onClick={() => setEquipOpen(false)} className="btn-secondary">Cancelar</button>
            <button onClick={adicionarEquip} className="btn-primary">Vincular</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ContratoDetailPage;
