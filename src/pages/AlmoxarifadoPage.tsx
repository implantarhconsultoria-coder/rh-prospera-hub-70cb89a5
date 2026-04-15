import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Package, Plus, ArrowDown, ArrowUp, Search, Trash2, Upload, FileText, Loader2, Truck, Clock, Download } from 'lucide-react';
import { toast } from 'sonner';

type Tab = 'estoque' | 'entrada' | 'saida' | 'carregamento' | 'relatorio';

interface Item {
  id: string; nome: string; categoria: string; codigo_sku: string; unidade: string;
  quantidade: number; valor_unitario: number; descricao: string; localizacao: string;
}

interface Entrada {
  id: string; item_id: string; quantidade: number; fornecedor: string;
  valor_unitario: number; valor_total: number; nota_fiscal_url: string;
  observacao: string; created_at: string;
}

interface Saida {
  id: string; item_id: string; quantidade: number; funcionario_nome: string;
  motivo: string; observacao: string; created_at: string;
}

const AlmoxarifadoPage: React.FC = () => {
  const { session, userRole } = useApp();
  const [tab, setTab] = useState<Tab>('estoque');
  const [itens, setItens] = useState<Item[]>([]);
  const [entradas, setEntradas] = useState<Entrada[]>([]);
  const [saidas, setSaidas] = useState<Saida[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [showNewItem, setShowNewItem] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Daily closing state
  const [fechamentoHoje, setFechamentoHoje] = useState(false);
  const [horaExtra, setHoraExtra] = useState(false);

  // New item form
  const [nomeItem, setNomeItem] = useState('');
  const [categoriaItem, setCategoriaItem] = useState('');
  const [unidadeItem, setUnidadeItem] = useState('un');
  const [localizacaoItem, setLocalizacaoItem] = useState('');

  // Entrada form
  const [entItemId, setEntItemId] = useState('');
  const [entQtd, setEntQtd] = useState(0);
  const [entFornecedor, setEntFornecedor] = useState('');
  const [entValorUnit, setEntValorUnit] = useState(0);
  const [entObs, setEntObs] = useState('');
  const [entNfFile, setEntNfFile] = useState<File | null>(null);

  // Saida form
  const [saiItemId, setSaiItemId] = useState('');
  const [saiQtd, setSaiQtd] = useState(0);
  const [saiFuncionario, setSaiFuncionario] = useState('');
  const [saiMotivo, setSaiMotivo] = useState('');
  const [saiObs, setSaiObs] = useState('');

  // Carregamento form
  const [carEquipe, setCarEquipe] = useState('');
  const [carVeiculo, setCarVeiculo] = useState('');
  const [carItens, setCarItens] = useState<{ item_id: string; qtd: number }[]>([]);

  const uid = session?.user?.id;

  const fetchAll = async () => {
    const [r1, r2, r3] = await Promise.all([
      supabase.from('almoxarifado_itens').select('*').order('nome'),
      supabase.from('almoxarifado_entradas').select('*').order('created_at', { ascending: false }),
      supabase.from('almoxarifado_saidas').select('*').order('created_at', { ascending: false }),
    ]);
    if (r1.data) setItens(r1.data as unknown as Item[]);
    if (r2.data) setEntradas(r2.data as unknown as Entrada[]);
    if (r3.data) setSaidas(r3.data as unknown as Saida[]);
  };

  useEffect(() => { fetchAll(); }, []);

  // Auto-close check at 17:30
  useEffect(() => {
    const checkClosing = () => {
      const now = new Date();
      if (now.getHours() >= 17 && now.getMinutes() >= 30 && !horaExtra) {
        setFechamentoHoje(true);
      }
    };
    checkClosing();
    const interval = setInterval(checkClosing, 60000);
    return () => clearInterval(interval);
  }, [horaExtra]);

  const handleNewItem = async () => {
    if (!nomeItem || !uid) return;
    const { error } = await supabase.from('almoxarifado_itens').insert({
      user_id: uid, nome: nomeItem, categoria: categoriaItem, unidade: unidadeItem,
      localizacao: localizacaoItem, quantidade: 0,
    } as any);
    if (error) { toast.error(error.message); return; }
    toast.success('Item cadastrado!');
    setNomeItem(''); setCategoriaItem(''); setLocalizacaoItem('');
    setShowNewItem(false);
    fetchAll();
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uid) return;
    setLoading(true);
    try {
      const text = await file.text();
      const lines = text.split('\n').filter(l => l.trim());
      const header = lines[0].split(/[;\t,]/).map(h => h.trim().toLowerCase());
      const nameIdx = header.findIndex(h => h.includes('nome') || h.includes('item') || h.includes('descri'));
      const catIdx = header.findIndex(h => h.includes('categ'));
      const unIdx = header.findIndex(h => h.includes('unid'));
      const qtdIdx = header.findIndex(h => h.includes('qtd') || h.includes('quant'));
      const valIdx = header.findIndex(h => h.includes('valor') || h.includes('preco') || h.includes('preço'));
      const locIdx = header.findIndex(h => h.includes('local'));

      let imported = 0;
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(/[;\t,]/).map(c => c.trim());
        const nome = nameIdx >= 0 ? cols[nameIdx] : cols[0];
        if (!nome) continue;
        await supabase.from('almoxarifado_itens').insert({
          user_id: uid,
          nome,
          categoria: catIdx >= 0 ? cols[catIdx] || '' : '',
          unidade: unIdx >= 0 ? cols[unIdx] || 'un' : 'un',
          quantidade: qtdIdx >= 0 ? Number(cols[qtdIdx]) || 0 : 0,
          valor_unitario: valIdx >= 0 ? Number(cols[valIdx]?.replace(',', '.')) || 0 : 0,
          localizacao: locIdx >= 0 ? cols[locIdx] || '' : '',
        } as any);
        imported++;
      }
      toast.success(`${imported} itens importados!`);
      fetchAll();
    } catch {
      toast.error('Erro ao importar planilha');
    }
    setLoading(false);
    setShowImport(false);
  };

  const handleEntrada = async () => {
    if (!entItemId || entQtd <= 0 || !uid) { toast.error('Preencha item e quantidade'); return; }
    if (fechamentoHoje && !horaExtra) { toast.error('Almoxarifado fechado. Ative hora extra para continuar.'); return; }
    setLoading(true);
    let nfUrl = '';
    if (entNfFile) {
      const path = `nf/${uid}/${Date.now()}-${entNfFile.name}`;
      const { error: ue } = await supabase.storage.from('documentos-ativos').upload(path, entNfFile);
      if (!ue) {
        const { data: u } = supabase.storage.from('documentos-ativos').getPublicUrl(path);
        nfUrl = u.publicUrl;
      }
    }
    const { error } = await supabase.from('almoxarifado_entradas').insert({
      user_id: uid, item_id: entItemId, quantidade: entQtd, fornecedor: entFornecedor,
      valor_unitario: entValorUnit, valor_total: entQtd * entValorUnit,
      nota_fiscal_url: nfUrl, observacao: entObs,
    } as any);
    if (error) { toast.error(error.message); setLoading(false); return; }
    const item = itens.find(i => i.id === entItemId);
    if (item) {
      await supabase.from('almoxarifado_itens').update({
        quantidade: item.quantidade + entQtd, valor_unitario: entValorUnit || item.valor_unitario,
      } as any).eq('id', entItemId);
    }
    toast.success('Entrada registrada!');
    setEntItemId(''); setEntQtd(0); setEntFornecedor(''); setEntValorUnit(0); setEntObs(''); setEntNfFile(null);
    setLoading(false);
    fetchAll();
  };

  const handleSaida = async () => {
    if (!saiItemId || saiQtd <= 0 || !saiFuncionario || !uid) { toast.error('Preencha todos os campos'); return; }
    if (fechamentoHoje && !horaExtra) { toast.error('Almoxarifado fechado. Ative hora extra para continuar.'); return; }
    const item = itens.find(i => i.id === saiItemId);
    if (item && saiQtd > item.quantidade) { toast.error('Estoque insuficiente!'); return; }
    setLoading(true);
    const { error } = await supabase.from('almoxarifado_saidas').insert({
      user_id: uid, item_id: saiItemId, quantidade: saiQtd,
      funcionario_nome: saiFuncionario, motivo: saiMotivo, observacao: saiObs,
    } as any);
    if (error) { toast.error(error.message); setLoading(false); return; }
    if (item) {
      await supabase.from('almoxarifado_itens').update({
        quantidade: Math.max(0, item.quantidade - saiQtd),
      } as any).eq('id', saiItemId);
    }
    toast.success('Saída registrada!');
    setSaiItemId(''); setSaiQtd(0); setSaiFuncionario(''); setSaiMotivo(''); setSaiObs('');
    setLoading(false);
    fetchAll();
  };

  const handleCarregamento = async () => {
    if (!carEquipe || !carVeiculo || carItens.length === 0 || !uid) { toast.error('Preencha equipe, veículo e itens'); return; }
    if (fechamentoHoje && !horaExtra) { toast.error('Almoxarifado fechado.'); return; }
    setLoading(true);
    for (const ci of carItens) {
      if (!ci.item_id || ci.qtd <= 0) continue;
      const item = itens.find(i => i.id === ci.item_id);
      if (!item || ci.qtd > item.quantidade) continue;
      await supabase.from('almoxarifado_saidas').insert({
        user_id: uid, item_id: ci.item_id, quantidade: ci.qtd,
        funcionario_nome: carEquipe, motivo: `Carregamento - ${carVeiculo}`, observacao: `Veículo: ${carVeiculo}`,
      } as any);
      await supabase.from('almoxarifado_itens').update({
        quantidade: Math.max(0, item.quantidade - ci.qtd),
      } as any).eq('id', ci.item_id);
    }
    toast.success('Carregamento registrado!');
    setCarEquipe(''); setCarVeiculo(''); setCarItens([]);
    setLoading(false);
    fetchAll();
  };

  const getItemName = (id: string) => itens.find(i => i.id === id)?.nome || '—';
  const filteredItens = itens.filter(i => i.nome.toLowerCase().includes(search.toLowerCase()));

  const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: 'estoque', label: 'Estoque', icon: Package },
    { key: 'entrada', label: 'Entrada', icon: ArrowDown },
    { key: 'saida', label: 'Saída', icon: ArrowUp },
    { key: 'carregamento', label: 'Carregamento', icon: Truck },
    { key: 'relatorio', label: 'Relatório', icon: FileText },
  ];

  const isAdmin = userRole === 'admin';

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="card-premium p-6 gradient-primary text-primary-foreground">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-primary-foreground/20 rounded-2xl flex items-center justify-center">
              <Package className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold font-display">Almoxarifado</h1>
              <p className="text-primary-foreground/70 text-sm">Controle de estoque, entradas, saídas e relatórios</p>
            </div>
          </div>
          <div className="flex items-center gap-3 print:hidden">
            {fechamentoHoje && (
              <div className="flex items-center gap-2 bg-destructive/20 px-3 py-1.5 rounded-lg">
                <Clock className="w-4 h-4" />
                <span className="text-xs font-medium">Fechado às 17:30</span>
                <label className="flex items-center gap-1 text-xs cursor-pointer">
                  <input type="checkbox" checked={horaExtra} onChange={e => setHoraExtra(e.target.checked)} className="rounded" />
                  Hora Extra
                </label>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="card-premium p-2 flex gap-1 flex-wrap print:hidden">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>
            <t.icon className="w-4 h-4" />{t.label}
          </button>
        ))}
      </div>

      {/* ESTOQUE */}
      {tab === 'estoque' && (
        <div className="card-premium p-5 space-y-4">
          <div className="flex items-center gap-3 flex-wrap print:hidden">
            <Search className="w-4 h-4 text-muted-foreground" />
            <Input placeholder="Buscar item..." value={search} onChange={e => setSearch(e.target.value)} className="flex-1 min-w-[200px]" />
            <Button size="sm" onClick={() => setShowNewItem(!showNewItem)}>
              <Plus className="w-4 h-4 mr-1" />{showNewItem ? 'Cancelar' : 'Novo Item'}
            </Button>
            {isAdmin && (
              <Button size="sm" variant="outline" onClick={() => setShowImport(!showImport)}>
                <Upload className="w-4 h-4 mr-1" />Importar Planilha
              </Button>
            )}
          </div>

          {showImport && (
            <div className="border rounded-lg p-4 bg-muted/20 print:hidden">
              <p className="text-xs text-muted-foreground mb-2">Envie um CSV/TXT com colunas: Nome, Categoria, Unidade, Quantidade, Valor, Localização</p>
              <input ref={fileRef} type="file" accept=".csv,.txt,.tsv" onChange={handleImport} className="text-xs" />
            </div>
          )}

          {showNewItem && (
            <div className="border rounded-lg p-4 bg-muted/20 grid grid-cols-1 md:grid-cols-4 gap-3 print:hidden">
              <div><label className="text-xs text-muted-foreground block mb-1">Nome *</label>
                <Input value={nomeItem} onChange={e => setNomeItem(e.target.value)} /></div>
              <div><label className="text-xs text-muted-foreground block mb-1">Categoria</label>
                <Input value={categoriaItem} onChange={e => setCategoriaItem(e.target.value)} /></div>
              <div><label className="text-xs text-muted-foreground block mb-1">Unidade</label>
                <Input value={unidadeItem} onChange={e => setUnidadeItem(e.target.value)} /></div>
              <div><label className="text-xs text-muted-foreground block mb-1">Localização</label>
                <Input value={localizacaoItem} onChange={e => setLocalizacaoItem(e.target.value)} /></div>
              <Button onClick={handleNewItem} className="md:col-span-4 w-fit">Cadastrar Item</Button>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-background"><tr className="border-b bg-muted/50">
                <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Nome</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Categoria</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Unid.</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Qtd.</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Valor Un.</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Local</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase print:hidden">Ações</th>
              </tr></thead>
              <tbody>
                {filteredItens.map(item => (
                  <tr key={item.id} className="border-b hover:bg-muted/20">
                    <td className="px-3 py-2 text-xs font-medium">{item.nome}</td>
                    <td className="px-3 py-2 text-xs">{item.categoria || '—'}</td>
                    <td className="px-3 py-2 text-xs">{item.unidade}</td>
                    <td className="px-3 py-2 text-xs">
                      <Badge variant={item.quantidade <= 0 ? 'destructive' : item.quantidade < 5 ? 'secondary' : 'default'}>
                        {item.quantidade}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-xs">R$ {(item.valor_unitario || 0).toFixed(2)}</td>
                    <td className="px-3 py-2 text-xs">{item.localizacao || '—'}</td>
                    <td className="px-3 py-2 print:hidden">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                        onClick={async () => { await supabase.from('almoxarifado_itens').delete().eq('id', item.id); fetchAll(); }}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {filteredItens.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-muted-foreground text-sm">Nenhum item</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ENTRADA */}
      {tab === 'entrada' && (
        <div className="card-premium p-5 space-y-4">
          <h2 className="text-sm font-bold text-foreground">Registrar Entrada</h2>
          {fechamentoHoje && !horaExtra && <p className="text-xs text-destructive font-medium">⚠ Almoxarifado fechado. Ative hora extra para registrar.</p>}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 print:hidden">
            <div><label className="text-xs text-muted-foreground block mb-1">Item *</label>
              <select value={entItemId} onChange={e => setEntItemId(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background text-foreground">
                <option value="">Selecione...</option>
                {itens.map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}
              </select></div>
            <div><label className="text-xs text-muted-foreground block mb-1">Quantidade *</label>
              <Input type="number" value={entQtd} onChange={e => setEntQtd(Number(e.target.value))} /></div>
            <div><label className="text-xs text-muted-foreground block mb-1">Fornecedor</label>
              <Input value={entFornecedor} onChange={e => setEntFornecedor(e.target.value)} /></div>
            <div><label className="text-xs text-muted-foreground block mb-1">Valor Unitário</label>
              <Input type="number" step="0.01" value={entValorUnit} onChange={e => setEntValorUnit(Number(e.target.value))} /></div>
            <div><label className="text-xs text-muted-foreground block mb-1">Observação</label>
              <Input value={entObs} onChange={e => setEntObs(e.target.value)} /></div>
            <div><label className="text-xs text-muted-foreground block mb-1">Nota Fiscal (PDF)</label>
              <input type="file" accept=".pdf" onChange={e => setEntNfFile(e.target.files?.[0] || null)} className="text-xs" /></div>
          </div>
          <Button onClick={handleEntrada} disabled={loading || (fechamentoHoje && !horaExtra)} className="print:hidden">
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ArrowDown className="w-4 h-4 mr-2" />}
            Registrar Entrada
          </Button>

          <h3 className="text-sm font-bold text-foreground mt-6">Histórico de Entradas</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-background"><tr className="border-b bg-muted/50">
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Data</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Item</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Qtd</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Fornecedor</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Valor Total</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">NF</th>
              </tr></thead>
              <tbody>
                {entradas.slice(0, 100).map(e => (
                  <tr key={e.id} className="border-b hover:bg-muted/20">
                    <td className="px-3 py-2 text-xs">{new Date(e.created_at).toLocaleString('pt-BR')}</td>
                    <td className="px-3 py-2 text-xs font-medium">{getItemName(e.item_id)}</td>
                    <td className="px-3 py-2 text-xs">{e.quantidade}</td>
                    <td className="px-3 py-2 text-xs">{e.fornecedor || '—'}</td>
                    <td className="px-3 py-2 text-xs">R$ {(e.valor_total || 0).toFixed(2)}</td>
                    <td className="px-3 py-2 text-xs">
                      {e.nota_fiscal_url ? <a href={e.nota_fiscal_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">Ver NF</a> : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SAIDA */}
      {tab === 'saida' && (
        <div className="card-premium p-5 space-y-4">
          <h2 className="text-sm font-bold text-foreground">Registrar Saída</h2>
          {fechamentoHoje && !horaExtra && <p className="text-xs text-destructive font-medium">⚠ Almoxarifado fechado. Ative hora extra para registrar.</p>}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 print:hidden">
            <div><label className="text-xs text-muted-foreground block mb-1">Item *</label>
              <select value={saiItemId} onChange={e => setSaiItemId(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background text-foreground">
                <option value="">Selecione...</option>
                {itens.map(i => <option key={i.id} value={i.id}>{i.nome} (estoque: {i.quantidade})</option>)}
              </select></div>
            <div><label className="text-xs text-muted-foreground block mb-1">Quantidade *</label>
              <Input type="number" value={saiQtd} onChange={e => setSaiQtd(Number(e.target.value))} /></div>
            <div><label className="text-xs text-muted-foreground block mb-1">Funcionário *</label>
              <Input value={saiFuncionario} onChange={e => setSaiFuncionario(e.target.value)} /></div>
            <div><label className="text-xs text-muted-foreground block mb-1">Motivo</label>
              <Input value={saiMotivo} onChange={e => setSaiMotivo(e.target.value)} /></div>
            <div><label className="text-xs text-muted-foreground block mb-1">Observação</label>
              <Input value={saiObs} onChange={e => setSaiObs(e.target.value)} /></div>
          </div>
          <Button onClick={handleSaida} disabled={loading || (fechamentoHoje && !horaExtra)} className="print:hidden">
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ArrowUp className="w-4 h-4 mr-2" />}
            Registrar Saída
          </Button>

          <h3 className="text-sm font-bold text-foreground mt-6">Histórico de Saídas</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-background"><tr className="border-b bg-muted/50">
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Data/Hora</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Item</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Qtd</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Funcionário</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Motivo</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Obs</th>
              </tr></thead>
              <tbody>
                {saidas.slice(0, 100).map(s => (
                  <tr key={s.id} className="border-b hover:bg-muted/20">
                    <td className="px-3 py-2 text-xs">{new Date(s.created_at).toLocaleString('pt-BR')}</td>
                    <td className="px-3 py-2 text-xs font-medium">{getItemName(s.item_id)}</td>
                    <td className="px-3 py-2 text-xs">{s.quantidade}</td>
                    <td className="px-3 py-2 text-xs">{s.funcionario_nome}</td>
                    <td className="px-3 py-2 text-xs">{s.motivo || '—'}</td>
                    <td className="px-3 py-2 text-xs">{s.observacao || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CARREGAMENTO */}
      {tab === 'carregamento' && (
        <div className="card-premium p-5 space-y-4">
          <h2 className="text-sm font-bold text-foreground">Carregamento de Carro / Equipe</h2>
          <p className="text-xs text-muted-foreground">Registre a saída de múltiplos itens para uma equipe/veículo de uma vez.</p>
          {fechamentoHoje && !horaExtra && <p className="text-xs text-destructive font-medium">⚠ Almoxarifado fechado.</p>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 print:hidden">
            <div><label className="text-xs text-muted-foreground block mb-1">Equipe / Responsável *</label>
              <Input value={carEquipe} onChange={e => setCarEquipe(e.target.value)} /></div>
            <div><label className="text-xs text-muted-foreground block mb-1">Veículo / Placa *</label>
              <Input value={carVeiculo} onChange={e => setCarVeiculo(e.target.value)} /></div>
          </div>

          <div className="space-y-2 print:hidden">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold">Itens do carregamento</h3>
              <Button size="sm" variant="outline" onClick={() => setCarItens([...carItens, { item_id: '', qtd: 0 }])}>
                <Plus className="w-3 h-3 mr-1" />Adicionar
              </Button>
            </div>
            {carItens.map((ci, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <select value={ci.item_id} onChange={e => {
                  const updated = [...carItens];
                  updated[idx].item_id = e.target.value;
                  setCarItens(updated);
                }} className="flex-1 border rounded-lg px-3 py-2 text-sm bg-background text-foreground">
                  <option value="">Selecione...</option>
                  {itens.map(i => <option key={i.id} value={i.id}>{i.nome} ({i.quantidade})</option>)}
                </select>
                <Input type="number" placeholder="Qtd" className="w-24"
                  value={ci.qtd} onChange={e => {
                    const updated = [...carItens];
                    updated[idx].qtd = Number(e.target.value);
                    setCarItens(updated);
                  }} />
                <Button size="icon" variant="ghost" className="text-destructive h-8 w-8"
                  onClick={() => setCarItens(carItens.filter((_, i) => i !== idx))}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
          <Button onClick={handleCarregamento} disabled={loading || (fechamentoHoje && !horaExtra)} className="print:hidden">
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Truck className="w-4 h-4 mr-2" />}
            Registrar Carregamento
          </Button>
        </div>
      )}

      {/* RELATÓRIO */}
      {tab === 'relatorio' && (
        <div className="card-premium p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground">Relatório Mensal de Estoque</h2>
            <Button size="sm" variant="outline" onClick={() => window.print()} className="print:hidden">
              <Download className="w-4 h-4 mr-1" />Imprimir
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-background"><tr className="border-b bg-muted/50">
                <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Item</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Estoque Atual</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Total Entradas</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Total Saídas</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Valor Estoque</th>
              </tr></thead>
              <tbody>
                {itens.map(item => {
                  const tEntradas = entradas.filter(e => e.item_id === item.id).reduce((s, e) => s + e.quantidade, 0);
                  const tSaidas = saidas.filter(s => s.item_id === item.id).reduce((s, e) => s + e.quantidade, 0);
                  return (
                    <tr key={item.id} className="border-b hover:bg-muted/20">
                      <td className="px-3 py-2 text-xs font-medium">{item.nome}</td>
                      <td className="px-3 py-2 text-xs">
                        <Badge variant={item.quantidade <= 0 ? 'destructive' : 'default'}>{item.quantidade} {item.unidade}</Badge>
                      </td>
                      <td className="px-3 py-2 text-xs text-green-600">+{tEntradas}</td>
                      <td className="px-3 py-2 text-xs text-red-600">-{tSaidas}</td>
                      <td className="px-3 py-2 text-xs">R$ {(item.quantidade * (item.valor_unitario || 0)).toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default AlmoxarifadoPage;
