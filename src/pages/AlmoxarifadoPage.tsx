import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Package, Plus, ArrowDown, ArrowUp, Search, Trash2, Upload, FileText, Loader2, Truck, Clock, Download, Printer, CheckCircle, X, Settings2, History } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import AlmoxarifadoCargaTab from '@/components/AlmoxarifadoCargaTab';
import * as XLSX from 'xlsx';

// Detecta nomes corrompidos vindos de importação binária ou linhas inválidas
const INVALID_NAME_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFD]/;
const isValidItemName = (n: unknown): n is string => {
  if (typeof n !== 'string') return false;
  const t = n.trim();
  if (!t || t.length > 200) return false;
  if (INVALID_NAME_RE.test(t)) return false;
  if (!/[A-Za-z0-9]/.test(t)) return false;
  return true;
};

type Tab = 'estoque' | 'entrada' | 'saida' | 'carregamento' | 'carga' | 'fechamento' | 'relatorio';

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
  const { session, userRole, employees } = useApp();
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
  const [diaFechado, setDiaFechado] = useState(false);
  const [fichaFuncionario, setFichaFuncionario] = useState<string | null>(null);

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
  const [saiFuncionarioSearch, setSaiFuncionarioSearch] = useState('');
  const [showFuncSuggestions, setShowFuncSuggestions] = useState(false);
  const [saiMotivo, setSaiMotivo] = useState('');
  const [saiObs, setSaiObs] = useState('');
  const funcSearchRef = useRef<HTMLDivElement>(null);

  // Carregamento form
  const [carEquipe, setCarEquipe] = useState('');
  const [carVeiculo, setCarVeiculo] = useState('');
  const [carItens, setCarItens] = useState<{ item_id: string; qtd: number }[]>([]);

  // Ajuste rápido modal
  const [ajusteOpen, setAjusteOpen] = useState(false);
  const [ajusteItem, setAjusteItem] = useState<Item | null>(null);
  const [ajusteTipo, setAjusteTipo] = useState<'entrada_rapida' | 'saida_rapida' | 'ajuste'>('ajuste');
  const [ajusteQtd, setAjusteQtd] = useState<string>('');
  const [ajusteMotivo, setAjusteMotivo] = useState('');
  const [ajusteObs, setAjusteObs] = useState('');
  const [historicoOpen, setHistoricoOpen] = useState(false);
  const [historicoItem, setHistoricoItem] = useState<Item | null>(null);
  const [historicoAjustes, setHistoricoAjustes] = useState<any[]>([]);

  const uid = session?.user?.id;

  // Employee autocomplete filtering
  const activeEmployees = useMemo(() =>
    employees.filter(e => e.status === 'ativo'),
    [employees]
  );

  const filteredEmployees = useMemo(() => {
    if (!saiFuncionarioSearch || saiFuncionarioSearch.length < 2) return [];
    const q = saiFuncionarioSearch.toLowerCase();
    return activeEmployees.filter(e => e.name.toLowerCase().includes(q)).slice(0, 8);
  }, [saiFuncionarioSearch, activeEmployees]);

  // Click outside to close suggestions
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (funcSearchRef.current && !funcSearchRef.current.contains(e.target as Node)) {
        setShowFuncSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

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

  // Today's withdrawals grouped by employee
  const todayStr = new Date().toISOString().slice(0, 10);
  const saidasHoje = useMemo(() =>
    saidas.filter(s => s.created_at.slice(0, 10) === todayStr),
    [saidas, todayStr]
  );

  const saidasPorFuncionario = useMemo(() => {
    const map = new Map<string, Saida[]>();
    saidasHoje.forEach(s => {
      const list = map.get(s.funcionario_nome) || [];
      list.push(s);
      map.set(s.funcionario_nome, list);
    });
    return map;
  }, [saidasHoje]);

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

    const name = file.name.toLowerCase();
    const ext = name.split('.').pop() || '';
    const allowedExt = ['xlsx', 'xls', 'csv'];
    if (!allowedExt.includes(ext)) {
      toast.error('Arquivo inválido. Envie uma planilha XLSX, XLS ou CSV no modelo correto.');
      if (fileRef.current) fileRef.current.value = '';
      return;
    }

    setLoading(true);
    try {
      const buf = await file.arrayBuffer();
      let wb: XLSX.WorkBook;
      try {
        wb = XLSX.read(buf, { type: 'array' });
      } catch {
        toast.error('Arquivo inválido. Envie uma planilha XLSX, XLS ou CSV no modelo correto.');
        setLoading(false);
        if (fileRef.current) fileRef.current.value = '';
        return;
      }
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) {
        toast.error('Planilha vazia ou ilegível.');
        setLoading(false);
        if (fileRef.current) fileRef.current.value = '';
        return;
      }
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '', raw: false });
      if (!rows.length) {
        toast.error('Planilha sem linhas de dados.');
        setLoading(false);
        if (fileRef.current) fileRef.current.value = '';
        return;
      }

      // Normaliza headers
      const norm = (s: string) => s.toString().trim().toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const headers = Object.keys(rows[0]).map(norm);
      const findKey = (orig: string[], match: (h: string) => boolean) => {
        const idx = headers.findIndex(match);
        return idx >= 0 ? orig[idx] : null;
      };
      const origKeys = Object.keys(rows[0]);
      const kNome = findKey(origKeys, h => h === 'item' || h.includes('nome'));
      const kDesc = findKey(origKeys, h => h.includes('descri'));
      const kCat = findKey(origKeys, h => h.includes('categ'));
      const kUn = findKey(origKeys, h => h.includes('unid'));
      const kQtd = findKey(origKeys, h => h.includes('quant') || h === 'qtd');
      const kMin = findKey(origKeys, h => h.includes('minim'));
      const kLoc = findKey(origKeys, h => h.includes('local'));
      const kEmp = findKey(origKeys, h => h.includes('empresa') || h.includes('filial'));
      const kObs = findKey(origKeys, h => h.includes('observ'));

      if (!kNome) {
        toast.error('Cabeçalho inválido. Colunas obrigatórias: item, descrição, categoria, unidade, quantidade, estoque mínimo, localização, empresa/filial, observações.');
        setLoading(false);
        if (fileRef.current) fileRef.current.value = '';
        return;
      }

      const toInsert: any[] = [];
      let invalid = 0;
      for (const row of rows) {
        const nome = String(row[kNome] ?? '').trim();
        if (!isValidItemName(nome)) { invalid++; continue; }
        toInsert.push({
          user_id: uid,
          nome,
          descricao: kDesc ? String(row[kDesc] ?? '').trim().slice(0, 500) : '',
          categoria: kCat ? String(row[kCat] ?? '').trim().slice(0, 100) : '',
          unidade: kUn ? (String(row[kUn] ?? '').trim().slice(0, 20) || 'un') : 'un',
          quantidade: kQtd ? (Number(String(row[kQtd] ?? '0').replace(',', '.')) || 0) : 0,
          valor_unitario: 0,
          localizacao: kLoc ? String(row[kLoc] ?? '').trim().slice(0, 100) : '',
        });
      }

      if (!toInsert.length) {
        toast.error('Nenhuma linha válida encontrada na planilha.');
        setLoading(false);
        if (fileRef.current) fileRef.current.value = '';
        return;
      }

      // Insere em lote
      const { error } = await supabase.from('almoxarifado_itens').insert(toInsert as any);
      if (error) {
        toast.error('Erro ao importar: ' + error.message);
      } else {
        toast.success(`${toInsert.length} itens importados${invalid ? ` (${invalid} linhas inválidas ignoradas)` : ''}.`);
        fetchAll();
      }
    } catch {
      toast.error('Arquivo inválido. Envie uma planilha XLSX, XLS ou CSV no modelo correto.');
    }
    setLoading(false);
    setShowImport(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleLimparInvalidos = async () => {
    if (!confirm('Remover todos os registros corrompidos/inválidos do estoque? Itens válidos serão mantidos.')) return;
    setLoading(true);
    const { data, error } = await supabase.from('almoxarifado_itens').select('id, nome');
    if (error || !data) { toast.error('Erro ao listar itens'); setLoading(false); return; }
    const badIds = data.filter(r => !isValidItemName(r.nome)).map(r => r.id);
    if (!badIds.length) { toast.success('Nenhum registro inválido encontrado.'); setLoading(false); return; }
    const { error: delErr } = await supabase.from('almoxarifado_itens').delete().in('id', badIds);
    if (delErr) toast.error('Erro ao remover: ' + delErr.message);
    else toast.success(`${badIds.length} registros inválidos removidos.`);
    fetchAll();
    setLoading(false);
  };


  const handleEntrada = async () => {
    if (!entItemId || entQtd <= 0 || !uid) { toast.error('Preencha item e quantidade'); return; }
    if (diaFechado) { toast.error('Dia já fechado. Abra um novo dia para registrar.'); return; }
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
    if (diaFechado) { toast.error('Dia já fechado.'); return; }
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
    setSaiItemId(''); setSaiQtd(0); setSaiFuncionario(''); setSaiFuncionarioSearch(''); setSaiMotivo(''); setSaiObs('');
    setLoading(false);
    fetchAll();
  };

  const handleCarregamento = async () => {
    if (!carEquipe || !carVeiculo || carItens.length === 0 || !uid) { toast.error('Preencha equipe, veículo e itens'); return; }
    if (diaFechado) { toast.error('Dia já fechado.'); return; }
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

  const abrirAjuste = (item: Item, tipo: 'entrada_rapida' | 'saida_rapida' | 'ajuste') => {
    setAjusteItem(item);
    setAjusteTipo(tipo);
    setAjusteQtd(tipo === 'ajuste' ? String(item.quantidade) : '');
    setAjusteMotivo('');
    setAjusteObs('');
    setAjusteOpen(true);
  };

  const confirmarAjuste = async () => {
    if (!ajusteItem || !uid) return;
    const qtdNum = Number(ajusteQtd);
    if (isNaN(qtdNum) || qtdNum < 0) { toast.error('Quantidade inválida'); return; }
    if (ajusteTipo === 'ajuste' && !ajusteMotivo.trim()) {
      toast.error('Informe o motivo do ajuste manual'); return;
    }
    const anterior = ajusteItem.quantidade;
    let nova = anterior;
    if (ajusteTipo === 'entrada_rapida') nova = anterior + qtdNum;
    else if (ajusteTipo === 'saida_rapida') nova = Math.max(0, anterior - qtdNum);
    else nova = qtdNum;

    setLoading(true);
    const usuarioNome = session?.user?.email || 'Usuário';
    const { error: errAj } = await supabase.from('almoxarifado_ajustes').insert({
      item_id: ajusteItem.id, user_id: uid, usuario_nome: usuarioNome,
      tipo_movimentacao: ajusteTipo, quantidade_anterior: anterior,
      quantidade_nova: nova, diferenca: nova - anterior,
      motivo: ajusteMotivo, observacao: ajusteObs,
    } as any);
    if (errAj) { toast.error(errAj.message); setLoading(false); return; }

    const { error: errUp } = await supabase.from('almoxarifado_itens')
      .update({ quantidade: nova } as any).eq('id', ajusteItem.id);
    if (errUp) { toast.error(errUp.message); setLoading(false); return; }

    toast.success(`Estoque atualizado: ${anterior} → ${nova}`);
    setAjusteOpen(false);
    setLoading(false);
    fetchAll();
  };

  const abrirHistorico = async (item: Item) => {
    setHistoricoItem(item);
    setHistoricoOpen(true);
    const { data } = await supabase.from('almoxarifado_ajustes')
      .select('*').eq('item_id', item.id).order('created_at', { ascending: false }).limit(50);
    setHistoricoAjustes(data || []);
  };

  const handleFecharDia = () => {
    if (saidasHoje.length === 0) {
      toast.error('Nenhuma saída registrada hoje para fechar.');
      return;
    }
    setDiaFechado(true);
    setTab('fechamento');
    toast.success('Dia fechado! Fichas geradas por funcionário.');
  };

  const handleImprimirFicha = (funcNome: string) => {
    setFichaFuncionario(funcNome);
    setTimeout(() => window.print(), 300);
  };

  const handleImprimirTodas = () => {
    setFichaFuncionario(null);
    setTab('fechamento');
    setTimeout(() => window.print(), 300);
  };

  const getItemName = (id: string) => itens.find(i => i.id === id)?.nome || '—';
  const filteredItens = itens
    .filter(i => isValidItemName(i.nome))
    .filter(i => i.nome.toLowerCase().includes(search.toLowerCase()));

  const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: 'estoque', label: 'Estoque', icon: Package },
    { key: 'entrada', label: 'Entrada', icon: ArrowDown },
    { key: 'saida', label: 'Saída', icon: ArrowUp },
    { key: 'carregamento', label: 'Carregamento', icon: Truck },
    { key: 'carga', label: 'Carga (Carro)', icon: Truck },
    { key: 'fechamento', label: 'Fechamento', icon: CheckCircle },
    { key: 'relatorio', label: 'Relatório', icon: FileText },
  ];

  const isAdmin = userRole === 'admin';
  const isDayBlocked = diaFechado || (fechamentoHoje && !horaExtra);

  // Render individual employee ficha for print
  const renderFicha = (funcNome: string, funcSaidas: Saida[]) => (
    <div key={funcNome} className="ficha-funcionario mb-8 break-after-page">
      <div className="border-2 border-foreground/20 rounded-lg p-6">
        <div className="text-center border-b pb-3 mb-4">
          <h2 className="text-lg font-bold">FICHA DE RETIRADA — ALMOXARIFADO</h2>
          <p className="text-sm text-muted-foreground">Data: {new Date().toLocaleDateString('pt-BR')}</p>
        </div>
        <div className="mb-4">
          <p className="text-sm"><strong>Funcionário:</strong> {funcNome}</p>
          <p className="text-sm"><strong>Total de itens retirados:</strong> {funcSaidas.length}</p>
        </div>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b-2 border-foreground/30">
              <th className="px-2 py-2 text-left text-xs font-bold">Hora</th>
              <th className="px-2 py-2 text-left text-xs font-bold">Item</th>
              <th className="px-2 py-2 text-left text-xs font-bold">Qtd</th>
              <th className="px-2 py-2 text-left text-xs font-bold">Motivo</th>
              <th className="px-2 py-2 text-left text-xs font-bold">Obs</th>
            </tr>
          </thead>
          <tbody>
            {funcSaidas.map(s => (
              <tr key={s.id} className="border-b border-foreground/10">
                <td className="px-2 py-1.5 text-xs">{new Date(s.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</td>
                <td className="px-2 py-1.5 text-xs font-medium">{getItemName(s.item_id)}</td>
                <td className="px-2 py-1.5 text-xs">{s.quantidade}</td>
                <td className="px-2 py-1.5 text-xs">{s.motivo || '—'}</td>
                <td className="px-2 py-1.5 text-xs">{s.observacao || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-8 flex justify-between border-t pt-4">
          <div className="text-xs">
            <p>_________________________________</p>
            <p className="mt-1">Assinatura do Funcionário</p>
          </div>
          <div className="text-xs">
            <p>_________________________________</p>
            <p className="mt-1">Responsável Almoxarifado</p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Print-only area: fichas */}
      <div className="hidden print:block">
        {fichaFuncionario ? (
          saidasPorFuncionario.has(fichaFuncionario) &&
          renderFicha(fichaFuncionario, saidasPorFuncionario.get(fichaFuncionario)!)
        ) : (
          tab === 'fechamento' && Array.from(saidasPorFuncionario.entries()).map(([nome, lista]) =>
            renderFicha(nome, lista)
          )
        )}
      </div>

      {/* Screen content */}
      <div className="print:hidden">
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
            <div className="flex items-center gap-3">
              {/* Day status */}
              {diaFechado ? (
                <div className="flex items-center gap-2 bg-green-600/30 px-3 py-1.5 rounded-lg">
                  <CheckCircle className="w-4 h-4" />
                  <span className="text-xs font-medium">Dia fechado</span>
                  <Button size="sm" variant="ghost" className="text-xs h-6 px-2" onClick={() => setDiaFechado(false)}>
                    Reabrir
                  </Button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 bg-primary-foreground/10 px-3 py-1.5 rounded-lg">
                    <Clock className="w-4 h-4" />
                    <span className="text-xs font-medium">Dia aberto — {saidasHoje.length} saída(s) hoje</span>
                  </div>
                  {fechamentoHoje && (
                    <div className="flex items-center gap-2 bg-destructive/20 px-3 py-1.5 rounded-lg">
                      <span className="text-xs font-medium">17:30 — Fechamento automático</span>
                      <label className="flex items-center gap-1 text-xs cursor-pointer">
                        <input type="checkbox" checked={horaExtra} onChange={e => setHoraExtra(e.target.checked)} className="rounded" />
                        Hora Extra
                      </label>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="card-premium p-2 flex gap-1 flex-wrap mt-5">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>
              <t.icon className="w-4 h-4" />{t.label}
              {t.key === 'fechamento' && saidasHoje.length > 0 && (
                <Badge variant="secondary" className="ml-1 text-[10px] h-5">{saidasPorFuncionario.size}</Badge>
              )}
            </button>
          ))}
        </div>

        {/* ESTOQUE */}
        {tab === 'estoque' && (
          <div className="card-premium p-5 space-y-4 mt-5">
            <div className="flex items-center gap-3 flex-wrap">
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
              {isAdmin && (
                <Button size="sm" variant="outline" onClick={handleLimparInvalidos}>
                  <Trash2 className="w-4 h-4 mr-1" />Limpar registros inválidos
                </Button>
              )}
            </div>

            {showImport && (
              <div className="border rounded-lg p-4 bg-muted/20 space-y-2">
                <p className="text-xs text-muted-foreground">
                  Envie XLSX, XLS ou CSV com as colunas: <strong>item, descrição, categoria, unidade, quantidade, estoque mínimo, localização, empresa/filial, observações</strong>.
                </p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                  onChange={handleImport}
                  className="text-xs"
                />
              </div>
            )}

            {showNewItem && (
              <div className="border rounded-lg p-4 bg-muted/20 grid grid-cols-1 md:grid-cols-4 gap-3">
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
                  <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Ações</th>
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
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <Button variant="outline" size="icon" className="h-7 w-7 text-green-600" title="Entrada rápida"
                            onClick={() => abrirAjuste(item, 'entrada_rapida')}>
                            <ArrowDown className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="outline" size="icon" className="h-7 w-7 text-orange-600" title="Saída rápida"
                            onClick={() => abrirAjuste(item, 'saida_rapida')}>
                            <ArrowUp className="w-3.5 h-3.5" />
                          </Button>
                          {isAdmin && (
                            <Button variant="outline" size="icon" className="h-7 w-7" title="Ajuste manual (admin)"
                              onClick={() => abrirAjuste(item, 'ajuste')}>
                              <Settings2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="Histórico"
                            onClick={() => abrirHistorico(item)}>
                            <History className="w-3.5 h-3.5" />
                          </Button>
                          {isAdmin && (
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="Excluir"
                              onClick={async () => { await supabase.from('almoxarifado_itens').delete().eq('id', item.id); fetchAll(); }}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
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
          <div className="card-premium p-5 space-y-4 mt-5">
            <h2 className="text-sm font-bold text-foreground">Registrar Entrada</h2>
            {isDayBlocked && <p className="text-xs text-destructive font-medium">⚠ Almoxarifado fechado. {diaFechado ? 'Reabra o dia para registrar.' : 'Ative hora extra para continuar.'}</p>}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
            <Button onClick={handleEntrada} disabled={loading || isDayBlocked}>
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
          <div className="card-premium p-5 space-y-4 mt-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-foreground">Registrar Saída</h2>
              {!diaFechado && saidasHoje.length > 0 && (
                <Button size="sm" variant="outline" onClick={handleFecharDia}>
                  <CheckCircle className="w-4 h-4 mr-1" />Fechar Dia
                </Button>
              )}
            </div>
            {isDayBlocked && <p className="text-xs text-destructive font-medium">⚠ {diaFechado ? 'Dia fechado. Reabra para registrar.' : 'Almoxarifado fechado. Ative hora extra.'}</p>}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div><label className="text-xs text-muted-foreground block mb-1">Item *</label>
                <select value={saiItemId} onChange={e => setSaiItemId(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-background text-foreground">
                  <option value="">Selecione...</option>
                  {itens.map(i => <option key={i.id} value={i.id}>{i.nome} (estoque: {i.quantidade})</option>)}
                </select></div>
              <div><label className="text-xs text-muted-foreground block mb-1">Quantidade *</label>
                <Input type="number" value={saiQtd} onChange={e => setSaiQtd(Number(e.target.value))} /></div>
              <div ref={funcSearchRef} className="relative">
                <label className="text-xs text-muted-foreground block mb-1">Funcionário *</label>
                <Input
                  value={saiFuncionarioSearch}
                  onChange={e => {
                    setSaiFuncionarioSearch(e.target.value);
                    setSaiFuncionario('');
                    setShowFuncSuggestions(true);
                  }}
                  onFocus={() => saiFuncionarioSearch.length >= 2 && setShowFuncSuggestions(true)}
                  placeholder="Digite o nome..."
                  className={saiFuncionario ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : ''}
                />
                {saiFuncionario && (
                  <button onClick={() => { setSaiFuncionario(''); setSaiFuncionarioSearch(''); }}
                    className="absolute right-2 top-7 text-muted-foreground hover:text-foreground">
                    <X className="w-4 h-4" />
                  </button>
                )}
                {showFuncSuggestions && filteredEmployees.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-background border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {filteredEmployees.map(emp => (
                      <button key={emp.id} className="w-full px-3 py-2 text-left text-xs hover:bg-muted flex items-center justify-between"
                        onClick={() => {
                          setSaiFuncionario(emp.name);
                          setSaiFuncionarioSearch(emp.name);
                          setShowFuncSuggestions(false);
                        }}>
                        <span className="font-medium">{emp.name}</span>
                        <span className="text-muted-foreground text-[10px]">{emp.cargo}</span>
                      </button>
                    ))}
                  </div>
                )}
                {showFuncSuggestions && saiFuncionarioSearch.length >= 2 && filteredEmployees.length === 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-background border rounded-lg shadow-lg p-3 text-xs text-muted-foreground">
                    Nenhum funcionário encontrado
                  </div>
                )}
              </div>
              <div><label className="text-xs text-muted-foreground block mb-1">Motivo</label>
                <Input value={saiMotivo} onChange={e => setSaiMotivo(e.target.value)} /></div>
              <div><label className="text-xs text-muted-foreground block mb-1">Observação</label>
                <Input value={saiObs} onChange={e => setSaiObs(e.target.value)} /></div>
            </div>
            <Button onClick={handleSaida} disabled={loading || isDayBlocked || !saiFuncionario}>
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ArrowUp className="w-4 h-4 mr-2" />}
              Registrar Saída
            </Button>

            {/* Today's withdrawals */}
            {saidasHoje.length > 0 && (
              <>
                <h3 className="text-sm font-bold text-foreground mt-6">Saídas de Hoje ({saidasHoje.length})</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-background"><tr className="border-b bg-muted/50">
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Hora</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Item</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Qtd</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Funcionário</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Motivo</th>
                    </tr></thead>
                    <tbody>
                      {saidasHoje.map(s => (
                        <tr key={s.id} className="border-b hover:bg-muted/20">
                          <td className="px-3 py-2 text-xs">{new Date(s.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</td>
                          <td className="px-3 py-2 text-xs font-medium">{getItemName(s.item_id)}</td>
                          <td className="px-3 py-2 text-xs">{s.quantidade}</td>
                          <td className="px-3 py-2 text-xs">{s.funcionario_nome}</td>
                          <td className="px-3 py-2 text-xs">{s.motivo || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <h3 className="text-sm font-bold text-foreground mt-6">Histórico Geral de Saídas</h3>
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
          <div className="card-premium p-5 space-y-4 mt-5">
            <h2 className="text-sm font-bold text-foreground">Carregamento de Carro / Equipe</h2>
            <p className="text-xs text-muted-foreground">Registre a saída de múltiplos itens para uma equipe/veículo de uma vez.</p>
            {isDayBlocked && <p className="text-xs text-destructive font-medium">⚠ Almoxarifado fechado.</p>}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div><label className="text-xs text-muted-foreground block mb-1">Equipe / Responsável *</label>
                <Input value={carEquipe} onChange={e => setCarEquipe(e.target.value)} /></div>
              <div><label className="text-xs text-muted-foreground block mb-1">Veículo / Placa *</label>
                <Input value={carVeiculo} onChange={e => setCarVeiculo(e.target.value)} /></div>
            </div>

            <div className="space-y-2">
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
            <Button onClick={handleCarregamento} disabled={loading || isDayBlocked}>
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Truck className="w-4 h-4 mr-2" />}
              Registrar Carregamento
            </Button>
          </div>
        )}

        {/* CARGA (Carro) — registra/confere, NÃO mexe no estoque */}
        {tab === 'carga' && <div className="mt-5"><AlmoxarifadoCargaTab /></div>}

        {/* FECHAMENTO */}
        {tab === 'fechamento' && (
          <div className="card-premium p-5 space-y-4 mt-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-foreground">Fechamento do Dia — {new Date().toLocaleDateString('pt-BR')}</h2>
              <div className="flex items-center gap-2">
                {!diaFechado && saidasHoje.length > 0 && (
                  <Button size="sm" onClick={handleFecharDia}>
                    <CheckCircle className="w-4 h-4 mr-1" />Fechar Dia
                  </Button>
                )}
                {diaFechado && saidasPorFuncionario.size > 0 && (
                  <Button size="sm" variant="outline" onClick={handleImprimirTodas}>
                    <Printer className="w-4 h-4 mr-1" />Imprimir Todas as Fichas
                  </Button>
                )}
              </div>
            </div>

            {saidasHoje.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma saída registrada hoje.</p>
            ) : (
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  {diaFechado
                    ? `Dia fechado. ${saidasPorFuncionario.size} ficha(s) gerada(s) — prontas para impressão e arquivamento.`
                    : `${saidasHoje.length} saída(s) acumulada(s) de ${saidasPorFuncionario.size} funcionário(s). Feche o dia para gerar as fichas.`
                  }
                </p>

                {Array.from(saidasPorFuncionario.entries()).map(([funcNome, funcSaidas]) => (
                  <div key={funcNome} className="border rounded-lg p-4 bg-muted/10">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="text-sm font-bold">{funcNome}</h3>
                        <p className="text-xs text-muted-foreground">{funcSaidas.length} item(ns) retirado(s)</p>
                      </div>
                      {diaFechado && (
                        <Button size="sm" variant="outline" onClick={() => handleImprimirFicha(funcNome)}>
                          <Printer className="w-4 h-4 mr-1" />Imprimir Ficha
                        </Button>
                      )}
                    </div>
                    <table className="w-full text-sm">
                      <thead><tr className="border-b bg-muted/30">
                        <th className="px-2 py-1.5 text-left text-xs font-medium text-muted-foreground">Hora</th>
                        <th className="px-2 py-1.5 text-left text-xs font-medium text-muted-foreground">Item</th>
                        <th className="px-2 py-1.5 text-left text-xs font-medium text-muted-foreground">Qtd</th>
                        <th className="px-2 py-1.5 text-left text-xs font-medium text-muted-foreground">Motivo</th>
                        <th className="px-2 py-1.5 text-left text-xs font-medium text-muted-foreground">Obs</th>
                      </tr></thead>
                      <tbody>
                        {funcSaidas.map(s => (
                          <tr key={s.id} className="border-b border-muted/20">
                            <td className="px-2 py-1.5 text-xs">{new Date(s.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</td>
                            <td className="px-2 py-1.5 text-xs font-medium">{getItemName(s.item_id)}</td>
                            <td className="px-2 py-1.5 text-xs">{s.quantidade}</td>
                            <td className="px-2 py-1.5 text-xs">{s.motivo || '—'}</td>
                            <td className="px-2 py-1.5 text-xs">{s.observacao || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* RELATÓRIO */}
        {tab === 'relatorio' && (
          <div className="card-premium p-5 space-y-4 mt-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-foreground">Relatório Mensal de Estoque</h2>
              <Button size="sm" variant="outline" onClick={() => window.print()}>
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

      {/* Modal Ajuste */}
      <Dialog open={ajusteOpen} onOpenChange={setAjusteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {ajusteTipo === 'entrada_rapida' && 'Lançar Entrada'}
              {ajusteTipo === 'saida_rapida' && 'Lançar Saída'}
              {ajusteTipo === 'ajuste' && 'Ajuste Manual de Estoque'}
            </DialogTitle>
          </DialogHeader>
          {ajusteItem && (
            <div className="space-y-3">
              <div className="bg-muted/40 p-3 rounded-lg">
                <p className="text-sm font-bold">{ajusteItem.nome}</p>
                <p className="text-xs text-muted-foreground">
                  Estoque atual: <span className="font-bold text-foreground">{ajusteItem.quantidade} {ajusteItem.unidade}</span>
                </p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">
                  {ajusteTipo === 'ajuste' ? 'Nova quantidade *' : 'Quantidade *'}
                </label>
                <Input type="number" min={0} value={ajusteQtd} onChange={e => setAjusteQtd(e.target.value)} autoFocus />
                {ajusteTipo !== 'ajuste' && ajusteQtd && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Saldo após: <span className="font-bold text-foreground">
                      {ajusteTipo === 'entrada_rapida'
                        ? ajusteItem.quantidade + Number(ajusteQtd)
                        : Math.max(0, ajusteItem.quantidade - Number(ajusteQtd))} {ajusteItem.unidade}
                    </span>
                  </p>
                )}
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">
                  Motivo {ajusteTipo === 'ajuste' && '*'}
                </label>
                <Input value={ajusteMotivo} onChange={e => setAjusteMotivo(e.target.value)}
                  placeholder={ajusteTipo === 'ajuste' ? 'Ex: Inventário, correção de divergência' : 'Opcional'} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Observação</label>
                <Textarea value={ajusteObs} onChange={e => setAjusteObs(e.target.value)} rows={2} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAjusteOpen(false)}>Cancelar</Button>
            <Button onClick={confirmarAjuste} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Histórico */}
      <Dialog open={historicoOpen} onOpenChange={setHistoricoOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Histórico de movimentações — {historicoItem?.nome}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            {historicoAjustes.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhuma movimentação registrada</p>
            ) : (
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-background border-b">
                  <tr>
                    <th className="px-2 py-2 text-left">Data/Hora</th>
                    <th className="px-2 py-2 text-left">Tipo</th>
                    <th className="px-2 py-2 text-left">Anterior</th>
                    <th className="px-2 py-2 text-left">Nova</th>
                    <th className="px-2 py-2 text-left">Δ</th>
                    <th className="px-2 py-2 text-left">Usuário</th>
                    <th className="px-2 py-2 text-left">Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {historicoAjustes.map(a => (
                    <tr key={a.id} className="border-b">
                      <td className="px-2 py-1.5">{new Date(a.created_at).toLocaleString('pt-BR')}</td>
                      <td className="px-2 py-1.5">
                        <Badge variant="outline" className="text-[10px]">
                          {a.tipo_movimentacao === 'entrada_rapida' ? 'Entrada' :
                           a.tipo_movimentacao === 'saida_rapida' ? 'Saída' :
                           a.tipo_movimentacao === 'ajuste' ? 'Ajuste' : a.tipo_movimentacao}
                        </Badge>
                      </td>
                      <td className="px-2 py-1.5">{a.quantidade_anterior}</td>
                      <td className="px-2 py-1.5 font-bold">{a.quantidade_nova}</td>
                      <td className={`px-2 py-1.5 font-bold ${a.diferenca > 0 ? 'text-green-600' : a.diferenca < 0 ? 'text-red-600' : ''}`}>
                        {a.diferenca > 0 ? '+' : ''}{a.diferenca}
                      </td>
                      <td className="px-2 py-1.5">{a.usuario_nome}</td>
                      <td className="px-2 py-1.5">{a.motivo || a.observacao || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AlmoxarifadoPage;
