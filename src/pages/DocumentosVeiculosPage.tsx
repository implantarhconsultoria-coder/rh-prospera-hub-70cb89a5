import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import PdfDocumentViewer from '@/components/PdfDocumentViewer';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { extractPdfText, renderPdfPagesToDataUrls } from '@/lib/pdf';
import {
  Car, Upload, Trash2, Search, Eye, Sparkles, Loader2, Printer, Edit2,
  Save, X, AlertTriangle, FileCheck2, FileWarning, CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import { printDocumentInPage } from '@/lib/printInPage';

interface Ativo {
  id: string;
  tipo: string;
  descricao: string;
  marca?: string;
  placa: string;
  patrimonio: string;
  empresa: string;
  arquivo_url: string;
  observacao: string;
  status: string;
  renavam: string;
  chassi: string;
  ano_fabricacao: string;
  ano_modelo: string;
  responsavel_atual?: string;
  vencimento_ipva: string | null;
  vencimento_licenciamento: string | null;
  ipva_valor?: number;
  ipva_status?: string;
  ipva_arquivo_url?: string;
  ipva_comprovante_url?: string;
  ipva_data_pagamento?: string | null;
  ipva_observacao?: string;
  lic_valor?: number;
  lic_status?: string;
  lic_arquivo_url?: string;
  lic_comprovante_url?: string;
  lic_data_pagamento?: string | null;
  lic_observacao?: string;
  seguro_vencimento?: string | null;
  seguro_valor?: number;
  seguro_arquivo_url?: string;
  seguro_comprovante_url?: string;
}

type FilterType = 'todos' | 'ipva_vencer' | 'ipva_vencido' | 'lic_vencer' | 'lic_vencido' | 'tudo_ok' | 'compr_falta' | 'mes';

type DocStatus = 'ok' | 'pendente' | 'vencido' | 'comprovante_falta' | 'sem_data';

const computeDocStatus = (vencimento: string | null | undefined, comprovanteUrl: string | undefined): DocStatus => {
  if (!vencimento) return 'sem_data';
  const venc = new Date(vencimento + 'T12:00:00');
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const venceu = venc.getTime() < hoje.getTime();
  if (comprovanteUrl) return 'ok';
  if (venceu) return 'vencido';
  return 'pendente';
};

const docBadge = (s: DocStatus) => {
  if (s === 'ok') return <Badge className="text-[10px] bg-success text-success-foreground">OK</Badge>;
  if (s === 'pendente') return <Badge className="text-[10px] bg-warning text-warning-foreground">Pendente</Badge>;
  if (s === 'vencido') return <Badge className="text-[10px] bg-destructive text-destructive-foreground">Vencido</Badge>;
  if (s === 'comprovante_falta') return <Badge className="text-[10px] bg-warning text-warning-foreground">Sem comprovante</Badge>;
  return <Badge variant="outline" className="text-[10px]">—</Badge>;
};

const overallStatus = (a: Ativo): { label: string; cor: string } => {
  const ipva = computeDocStatus(a.vencimento_ipva, a.ipva_comprovante_url);
  const lic = computeDocStatus(a.vencimento_licenciamento, a.lic_comprovante_url);
  if (ipva === 'vencido' || lic === 'vencido') return { label: 'Vencido', cor: 'bg-destructive text-destructive-foreground' };
  if (ipva === 'pendente' || lic === 'pendente') return { label: 'Pendente', cor: 'bg-warning text-warning-foreground' };
  if (ipva === 'ok' && lic === 'ok') return { label: 'Tudo OK', cor: 'bg-success text-success-foreground' };
  return { label: 'Sem dados', cor: 'bg-muted text-muted-foreground' };
};

const DocumentosVeiculosPage: React.FC = () => {
  const { session } = useApp();
  const [ativos, setAtivos] = useState<Ativo[]>([]);
  const [search, setSearch] = useState('');
  const [viewingPdf, setViewingPdf] = useState<{ url: string; descricao: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [filterType, setFilterType] = useState<FilterType>('todos');
  const [filterMonth, setFilterMonth] = useState<string>(new Date().toISOString().slice(0, 7));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Ativo>>({});
  const [docPanelId, setDocPanelId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkDeleting(true);
    const alvos = ativos.filter(a => ids.includes(a.id));
    const { error } = await supabase.from('ativos').delete().in('id', ids);
    if (error) {
      toast.error('Erro ao excluir: ' + error.message);
      setBulkDeleting(false);
      return;
    }
    try {
      await supabase.from('acoes_log').insert(
        alvos.map(a => ({
          user_id: session?.user?.id || null,
          modulo: 'documentos-veiculos',
          acao: 'exclusao_lote',
          descricao: `Excluído veículo ${a.descricao || ''} ${a.placa ? '(' + a.placa + ')' : ''}`.trim(),
          referencia_id: a.id,
        })) as any
      );
    } catch {}
    toast.success(`${ids.length} veículo(s) excluído(s)`);
    setSelectedIds(new Set());
    setBulkDeleteOpen(false);
    setBulkDeleting(false);
    fetchAtivos();
  };

  const fetchAtivos = async () => {
    const { data, error } = await supabase.from('ativos').select('*').eq('tipo', 'veiculo').order('created_at', { ascending: false });
    if (!error && data) setAtivos(data as unknown as Ativo[]);
  };

  useEffect(() => { fetchAtivos(); }, []);

  const analyzeVehiclePdf = async (source: File | Uint8Array, fileName: string) => {
    const bytes = source instanceof File ? new Uint8Array(await source.arrayBuffer()) : source;
    const extractedText = await extractPdfText(bytes).catch(() => '');
    const { pageUrls } = await renderPdfPagesToDataUrls(bytes, 1.15, 2);
    const { data, error } = await supabase.functions.invoke('parse-text', {
      body: {
        text: `Arquivo: ${fileName}\n\n${extractedText}`.trim(),
        images: pageUrls,
        type: 'documento_veiculo',
      },
    });
    if (error) throw error;
    return data?.data ?? {};
  };

  const handleMultiUpload = async (files: FileList) => {
    if (!session?.user?.id) { toast.error('Faça login primeiro'); return; }
    setUploading(true);
    let success = 0;
    for (const file of Array.from(files)) {
      const ext = file.name.split('.').pop();
      const path = `${session.user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: uploadError } = await supabase.storage.from('documentos-ativos').upload(path, file);
      if (uploadError) { toast.error(`Erro no upload de ${file.name}`); continue; }
      const { data: urlData } = supabase.storage.from('documentos-ativos').getPublicUrl(path);
      const arquivo_url = urlData.publicUrl;

      let extracted: any = {};
      try { extracted = await analyzeVehiclePdf(file, file.name); } catch {}

      const { error } = await supabase.from('ativos').insert({
        user_id: session.user.id,
        tipo: 'veiculo',
        descricao: extracted.descricao || file.name.replace(/\.[^/.]+$/, ''),
        placa: extracted.placa || '',
        patrimonio: extracted.patrimonio || '',
        empresa: extracted.empresa || 'TOPAC MATRIZ',
        observacao: extracted.observacao || '',
        arquivo_url,
        renavam: extracted.renavam || '',
        chassi: extracted.chassi || '',
        ano_fabricacao: extracted.ano_fabricacao || '',
        ano_modelo: extracted.ano_modelo || '',
        status: 'ativo',
      } as any);
      if (!error) success++;
    }
    if (success > 0) {
      toast.success(`${success} documento(s) cadastrado(s)!`);
      fetchAtivos();
    }
    setUploading(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('ativos').delete().eq('id', id);
    if (!error) { toast.success('Removido'); fetchAtivos(); }
  };

  const handleEdit = (a: Ativo) => {
    setEditingId(a.id);
    setEditForm({
      descricao: a.descricao, marca: a.marca || '', placa: a.placa, patrimonio: a.patrimonio,
      renavam: a.renavam, chassi: a.chassi, empresa: a.empresa,
      ano_fabricacao: a.ano_fabricacao, ano_modelo: a.ano_modelo,
      responsavel_atual: a.responsavel_atual || '',
      vencimento_ipva: a.vencimento_ipva || '', vencimento_licenciamento: a.vencimento_licenciamento || '',
      observacao: a.observacao,
    });
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    const { error } = await supabase.from('ativos').update(editForm as any).eq('id', editingId);
    if (!error) { toast.success('Atualizado!'); setEditingId(null); fetchAtivos(); }
    else toast.error('Erro ao salvar');
  };

  // --- Documento (IPVA / Licenc) — upload e gestão ---
  const uploadParaAtivo = async (ativoId: string, prefixo: string, file: File): Promise<string> => {
    const ext = file.name.split('.').pop();
    const path = `${session?.user?.id}/${ativoId}/${prefixo}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('documentos-ativos').upload(path, file);
    if (error) { toast.error('Falha no upload'); return ''; }
    const { data } = supabase.storage.from('documentos-ativos').getPublicUrl(path);
    return data.publicUrl;
  };

  const updateAtivoFields = async (id: string, patch: Partial<Ativo>) => {
    const { error } = await supabase.from('ativos').update(patch as any).eq('id', id);
    if (error) { toast.error('Erro: ' + error.message); return false; }
    fetchAtivos();
    return true;
  };

  // --- Cálculos de filtros e alertas ---
  const filtered = useMemo(() => {
    let list = ativos;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(a =>
        (a.descricao || '').toLowerCase().includes(q) ||
        (a.placa || '').toLowerCase().includes(q) ||
        (a.patrimonio || '').toLowerCase().includes(q) ||
        (a.renavam || '').toLowerCase().includes(q) ||
        (a.empresa || '').toLowerCase().includes(q)
      );
    }
    const ipvaSt = (a: Ativo) => computeDocStatus(a.vencimento_ipva, a.ipva_comprovante_url);
    const licSt = (a: Ativo) => computeDocStatus(a.vencimento_licenciamento, a.lic_comprovante_url);

    if (filterType === 'ipva_vencer') list = list.filter(a => ipvaSt(a) === 'pendente');
    if (filterType === 'ipva_vencido') list = list.filter(a => ipvaSt(a) === 'vencido');
    if (filterType === 'lic_vencer') list = list.filter(a => licSt(a) === 'pendente');
    if (filterType === 'lic_vencido') list = list.filter(a => licSt(a) === 'vencido');
    if (filterType === 'tudo_ok') list = list.filter(a => ipvaSt(a) === 'ok' && licSt(a) === 'ok');
    if (filterType === 'compr_falta') list = list.filter(a =>
      (a.vencimento_ipva && !a.ipva_comprovante_url) || (a.vencimento_licenciamento && !a.lic_comprovante_url)
    );
    if (filterType === 'mes') {
      list = list.filter(a => {
        const matches = (d?: string | null) => !!d && d.slice(0, 7) === filterMonth;
        return matches(a.vencimento_ipva) || matches(a.vencimento_licenciamento) || matches(a.seguro_vencimento || null);
      });
    }
    return list;
  }, [ativos, search, filterType, filterMonth]);

  const alertCounts = useMemo(() => ({
    ipvaPend: ativos.filter(a => computeDocStatus(a.vencimento_ipva, a.ipva_comprovante_url) === 'pendente').length,
    ipvaVencido: ativos.filter(a => computeDocStatus(a.vencimento_ipva, a.ipva_comprovante_url) === 'vencido').length,
    licPend: ativos.filter(a => computeDocStatus(a.vencimento_licenciamento, a.lic_comprovante_url) === 'pendente').length,
    licVencido: ativos.filter(a => computeDocStatus(a.vencimento_licenciamento, a.lic_comprovante_url) === 'vencido').length,
    comprFalta: ativos.filter(a =>
      (a.vencimento_ipva && !a.ipva_comprovante_url) || (a.vencimento_licenciamento && !a.lic_comprovante_url)
    ).length,
    tudoOk: ativos.filter(a =>
      computeDocStatus(a.vencimento_ipva, a.ipva_comprovante_url) === 'ok' &&
      computeDocStatus(a.vencimento_licenciamento, a.lic_comprovante_url) === 'ok'
    ).length,
  }), [ativos]);

  const handlePrintBatch = () => {
    if (filtered.length === 0) { toast.error('Nenhum veículo para imprimir'); return; }
    const rows = filtered.map(a => {
      const ipvaSt = computeDocStatus(a.vencimento_ipva, a.ipva_comprovante_url);
      const licSt = computeDocStatus(a.vencimento_licenciamento, a.lic_comprovante_url);
      const ov = overallStatus(a);
      return `<tr>
        <td style="padding:6px 8px;border:1px solid #ccc;font-size:11px">${a.empresa || '—'}</td>
        <td style="padding:6px 8px;border:1px solid #ccc;font-size:11px">${a.placa || '—'}</td>
        <td style="padding:6px 8px;border:1px solid #ccc;font-size:11px">${a.descricao}</td>
        <td style="padding:6px 8px;border:1px solid #ccc;font-size:11px">${a.vencimento_ipva ? new Date(a.vencimento_ipva).toLocaleDateString('pt-BR') : '—'}</td>
        <td style="padding:6px 8px;border:1px solid #ccc;font-size:11px">${(a.ipva_valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
        <td style="padding:6px 8px;border:1px solid #ccc;font-size:11px">IPVA: ${ipvaSt.toUpperCase()}</td>
        <td style="padding:6px 8px;border:1px solid #ccc;font-size:11px">${a.vencimento_licenciamento ? new Date(a.vencimento_licenciamento).toLocaleDateString('pt-BR') : '—'}</td>
        <td style="padding:6px 8px;border:1px solid #ccc;font-size:11px">${(a.lic_valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
        <td style="padding:6px 8px;border:1px solid #ccc;font-size:11px">LIC: ${licSt.toUpperCase()}</td>
        <td style="padding:6px 8px;border:1px solid #ccc;font-size:11px">Compr.: ${(a.ipva_comprovante_url ? 'I✓' : 'I✗')} ${(a.lic_comprovante_url ? 'L✓' : 'L✗')}</td>
        <td style="padding:6px 8px;border:1px solid #ccc;font-size:11px"><b>${ov.label}</b></td>
        <td style="padding:6px 8px;border:1px solid #ccc;font-size:11px">${a.responsavel_atual || '—'}</td>
      </tr>`;
    }).join('');

    const filterLabel = filterType === 'mes'
      ? `Vencimentos no mês ${filterMonth}`
      : filterType === 'todos' ? 'Todos os Veículos'
      : filterType === 'ipva_vencer' ? 'IPVA Pendente'
      : filterType === 'ipva_vencido' ? 'IPVA Vencido'
      : filterType === 'lic_vencer' ? 'Licenciamento Pendente'
      : filterType === 'lic_vencido' ? 'Licenciamento Vencido'
      : filterType === 'tudo_ok' ? 'Veículos com tudo OK'
      : 'Comprovante faltando';

    const html = `<!DOCTYPE html><html><head><title>Documentos de Veículos</title>
    <style>@page{size:A4 landscape;margin:10mm}body{font-family:Arial,sans-serif;font-size:11px;color:#000}
    h1{font-size:16px;margin:0 0 4px 0}h2{font-size:11px;color:#666;margin:0 0 12px 0}
    table{width:100%;border-collapse:collapse}th{background:#f5f5f5;padding:6px 8px;border:1px solid #ccc;font-size:10px;text-transform:uppercase;text-align:left}
    </style></head><body>
    <h1>Documentos de Veículos — ${filterLabel}</h1>
    <h2>${filtered.length} veículo(s) • Gerado em ${new Date().toLocaleDateString('pt-BR')}</h2>
    <table><thead><tr>
      <th>Empresa</th><th>Placa</th><th>Veículo</th>
      <th>Venc. IPVA</th><th>Valor IPVA</th><th>Status IPVA</th>
      <th>Venc. Lic.</th><th>Valor Lic.</th><th>Status Lic.</th>
      <th>Comprovantes</th><th>Status Geral</th><th>Responsável</th>
    </tr></thead><tbody>${rows}</tbody></table>
    </body></html>`;
    printDocumentInPage(html);
  };

  const docPanelAtivo = docPanelId ? ativos.find(a => a.id === docPanelId) : null;

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="card-premium p-6 gradient-primary text-primary-foreground">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-primary-foreground/20 rounded-2xl flex items-center justify-center">
            <Car className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display">Documentos de Veículos</h1>
            <p className="text-primary-foreground/70 text-sm">IPVA, Licenciamento, Seguro e CRLV — alertas, comprovantes e impressão por mês</p>
          </div>
        </div>
      </div>

      {/* Painel de status */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {[
          { l: 'Tudo OK', v: alertCounts.tudoOk, cor: 'border-success', icon: CheckCircle2, click: () => setFilterType('tudo_ok') },
          { l: 'Comprovante faltando', v: alertCounts.comprFalta, cor: 'border-warning', icon: FileWarning, click: () => setFilterType('compr_falta') },
          { l: 'IPVA pendente', v: alertCounts.ipvaPend, cor: 'border-warning', icon: AlertTriangle, click: () => setFilterType('ipva_vencer') },
          { l: 'IPVA vencido', v: alertCounts.ipvaVencido, cor: 'border-destructive', icon: AlertTriangle, click: () => setFilterType('ipva_vencido') },
          { l: 'Lic. pendente', v: alertCounts.licPend, cor: 'border-warning', icon: AlertTriangle, click: () => setFilterType('lic_vencer') },
          { l: 'Lic. vencido', v: alertCounts.licVencido, cor: 'border-destructive', icon: AlertTriangle, click: () => setFilterType('lic_vencido') },
        ].map((c, i) => (
          <button key={i} onClick={c.click}
            className={`card-premium p-3 text-left border-l-4 ${c.cor} hover:bg-muted/30 transition`}>
            <div className="flex items-center gap-1 text-[10px] uppercase font-semibold text-muted-foreground">
              <c.icon className="w-3 h-3" />{c.l}
            </div>
            <p className="text-xl font-bold mt-1">{c.v}</p>
          </button>
        ))}
      </div>

      <div className="card-premium p-5 space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Search className="w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar por descrição, placa, empresa..." value={search}
            onChange={e => setSearch(e.target.value)} className="flex-1 min-w-[200px]" />
          <select value={filterType} onChange={e => setFilterType(e.target.value as FilterType)}
            className="border rounded-lg px-3 py-2 text-sm bg-background text-foreground">
            <option value="todos">Todos</option>
            <option value="mes">Vencimentos do mês</option>
            <option value="ipva_vencer">IPVA Pendente</option>
            <option value="ipva_vencido">IPVA Vencido</option>
            <option value="lic_vencer">Lic. Pendente</option>
            <option value="lic_vencido">Lic. Vencido</option>
            <option value="compr_falta">Comprovante faltando</option>
            <option value="tudo_ok">Tudo OK</option>
          </select>
          {filterType === 'mes' && (
            <Input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)} className="w-44" />
          )}
          <label className="flex items-center gap-2 cursor-pointer">
            <Button size="sm" disabled={uploading} asChild>
              <span>
                {uploading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />}
                {uploading ? 'Enviando...' : 'Upload PDFs'}
              </span>
            </Button>
            <input type="file" accept=".pdf" multiple className="hidden"
              onChange={e => e.target.files && e.target.files.length > 0 && handleMultiUpload(e.target.files)} />
          </label>
          <Button size="sm" variant="outline" onClick={handlePrintBatch}>
            <Printer className="w-4 h-4 mr-1" /> {filterType === 'mes' ? `Imprimir vencimentos ${filterMonth}` : 'Imprimir Lote'}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Sparkles className="w-3 h-3" /> Use "Vencimentos do mês" + Imprimir para gerar relatório do mês selecionado.
        </p>
      </div>

      {/* Inline edit form */}
      {editingId && (
        <div className="card-premium p-5 space-y-3 border-l-4 border-primary">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground">Editando Veículo</h3>
            <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}><X className="w-4 h-4" /></Button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              ['descricao', 'Modelo'], ['marca', 'Marca'], ['placa', 'Placa'], ['patrimonio', 'Patrimônio'],
              ['renavam', 'Renavam'], ['chassi', 'Chassi'], ['empresa', 'Empresa/Filial'], ['responsavel_atual', 'Responsável'],
              ['ano_fabricacao', 'Ano Fab.'], ['ano_modelo', 'Ano Modelo'],
            ].map(([k, l]) => (
              <div key={k}>
                <label className="text-xs text-muted-foreground block mb-1">{l}</label>
                <Input value={(editForm as any)[k] || ''} onChange={e => setEditForm({ ...editForm, [k]: e.target.value })} />
              </div>
            ))}
            <div><label className="text-xs text-muted-foreground block mb-1">Venc. IPVA</label>
              <Input type="date" value={(editForm.vencimento_ipva as string) || ''} onChange={e => setEditForm({ ...editForm, vencimento_ipva: e.target.value })} /></div>
            <div><label className="text-xs text-muted-foreground block mb-1">Venc. Licenciamento</label>
              <Input type="date" value={(editForm.vencimento_licenciamento as string) || ''} onChange={e => setEditForm({ ...editForm, vencimento_licenciamento: e.target.value })} /></div>
            <div className="col-span-full">
              <label className="text-xs text-muted-foreground block mb-1">Observações</label>
              <textarea value={editForm.observacao || ''} onChange={e => setEditForm({ ...editForm, observacao: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background text-foreground min-h-[60px]" />
            </div>
          </div>
          <Button onClick={handleSaveEdit}><Save className="w-4 h-4 mr-1" /> Salvar</Button>
        </div>
      )}

      {selectedIds.size > 0 && (
        <div className="card-premium p-3 flex items-center justify-between border-l-4 border-destructive bg-destructive/5">
          <div className="text-sm font-medium">
            {selectedIds.size} selecionado(s)
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setSelectedIds(new Set())}>
              <X className="w-4 h-4 mr-1" /> Limpar
            </Button>
            <Button size="sm" variant="destructive" onClick={() => setBulkDeleteOpen(true)}>
              <Trash2 className="w-4 h-4 mr-1" /> Excluir selecionados
            </Button>
          </div>
        </div>
      )}

      <div className="card-premium overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b bg-muted/50 sticky top-0 z-10">
            <th className="px-3 py-3 w-8">
              <input
                type="checkbox"
                aria-label="Selecionar todos"
                checked={filtered.length > 0 && filtered.every(a => selectedIds.has(a.id))}
                onChange={(e) => {
                  setSelectedIds(prev => {
                    const n = new Set(prev);
                    if (e.target.checked) filtered.forEach(a => n.add(a.id));
                    else filtered.forEach(a => n.delete(a.id));
                    return n;
                  });
                }}
              />
            </th>
            <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Veículo</th>
            <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Placa</th>
            <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Empresa</th>
            <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">IPVA</th>
            <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Licenc.</th>
            <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Status Geral</th>
            <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Ações</th>
          </tr></thead>
          <tbody>
            {filtered.map(a => {
              const ipvaSt = computeDocStatus(a.vencimento_ipva, a.ipva_comprovante_url);
              const licSt = computeDocStatus(a.vencimento_licenciamento, a.lic_comprovante_url);
              const ov = overallStatus(a);
              return (
                <tr key={a.id} className="border-b hover:bg-muted/20">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label={`Selecionar ${a.descricao}`}
                      checked={selectedIds.has(a.id)}
                      onChange={() => toggleSelect(a.id)}
                    />
                  </td>
                  <td className="px-3 py-2 text-xs font-medium">
                    <div>{a.descricao}</div>
                    <div className="text-[10px] text-muted-foreground">{a.marca || ''} {a.ano_modelo || ''}</div>
                  </td>
                  <td className="px-3 py-2 text-xs">{a.placa || '—'}</td>
                  <td className="px-3 py-2 text-xs">{a.empresa || '—'}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col gap-0.5">
                      {docBadge(ipvaSt)}
                      <span className="text-[10px] text-muted-foreground">{a.vencimento_ipva ? new Date(a.vencimento_ipva).toLocaleDateString('pt-BR') : '—'}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col gap-0.5">
                      {docBadge(licSt)}
                      <span className="text-[10px] text-muted-foreground">{a.vencimento_licenciamento ? new Date(a.vencimento_licenciamento).toLocaleDateString('pt-BR') : '—'}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2"><Badge className={`text-[10px] ${ov.cor}`}>{ov.label}</Badge></td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" title="Gerenciar documentos"
                        onClick={() => setDocPanelId(a.id)}>
                        <FileCheck2 className="w-3.5 h-3.5" />
                      </Button>
                      {a.arquivo_url && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Ver PDF principal"
                          onClick={() => setViewingPdf({ url: a.arquivo_url, descricao: a.descricao })}>
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-7 w-7" title="Editar" onClick={() => handleEdit(a)}>
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="Excluir">
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir veículo?</AlertDialogTitle>
                            <AlertDialogDescription>{a.descricao} {a.placa ? `(${a.placa})` : ''} — esta ação não pode ser desfeita.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(a.id)} className="bg-destructive">Excluir</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && <tr><td colSpan={8} className="text-center py-8 text-muted-foreground text-sm">Nenhum documento encontrado</td></tr>}
          </tbody>
        </table>
        <div className="p-3 text-xs text-muted-foreground border-t">{filtered.length} veículo(s)</div>
      </div>

      {/* PDF Viewer Modal */}
      <Dialog open={!!viewingPdf} onOpenChange={(open) => !open && setViewingPdf(null)}>
        <DialogContent className="max-w-6xl overflow-hidden p-0 sm:max-w-6xl">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle className="text-base">{viewingPdf?.descricao || 'Documento do veículo'}</DialogTitle>
          </DialogHeader>
          <div className="px-6 pb-6">
            <PdfDocumentViewer sourceUrl={viewingPdf?.url} title={viewingPdf?.descricao || 'Documento do veículo'} />
          </div>
        </DialogContent>
      </Dialog>

      {/* Painel detalhado de docs do veículo */}
      <Dialog open={!!docPanelId} onOpenChange={(o) => !o && setDocPanelId(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Documentos — {docPanelAtivo?.descricao} {docPanelAtivo?.placa ? `(${docPanelAtivo.placa})` : ''}</DialogTitle>
          </DialogHeader>
          {docPanelAtivo && (
            <div className="space-y-4 max-h-[70vh] overflow-y-auto">
              {(['ipva', 'lic'] as const).map((tipo) => {
                const isIpva = tipo === 'ipva';
                const titulo = isIpva ? 'IPVA' : 'Licenciamento';
                const venc = isIpva ? docPanelAtivo.vencimento_ipva : docPanelAtivo.vencimento_licenciamento;
                const valor = (isIpva ? docPanelAtivo.ipva_valor : docPanelAtivo.lic_valor) || 0;
                const arq = isIpva ? docPanelAtivo.ipva_arquivo_url : docPanelAtivo.lic_arquivo_url;
                const compr = isIpva ? docPanelAtivo.ipva_comprovante_url : docPanelAtivo.lic_comprovante_url;
                const dataPg = isIpva ? docPanelAtivo.ipva_data_pagamento : docPanelAtivo.lic_data_pagamento;
                const obs = isIpva ? docPanelAtivo.ipva_observacao : docPanelAtivo.lic_observacao;
                const status = computeDocStatus(venc, compr || undefined);

                const fieldVenc = isIpva ? 'vencimento_ipva' : 'vencimento_licenciamento';
                const fieldValor = isIpva ? 'ipva_valor' : 'lic_valor';
                const fieldArq = isIpva ? 'ipva_arquivo_url' : 'lic_arquivo_url';
                const fieldCompr = isIpva ? 'ipva_comprovante_url' : 'lic_comprovante_url';
                const fieldDataPg = isIpva ? 'ipva_data_pagamento' : 'lic_data_pagamento';
                const fieldObs = isIpva ? 'ipva_observacao' : 'lic_observacao';

                return (
                  <div key={tipo} className="card-premium p-4 space-y-3 border-l-4 border-primary">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-sm">{titulo}</h4>
                      {docBadge(status)}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      <div>
                        <label className="text-xs text-muted-foreground block mb-1">Vencimento</label>
                        <Input type="date" defaultValue={venc || ''}
                          onBlur={e => updateAtivoFields(docPanelAtivo.id, { [fieldVenc]: e.target.value || null } as any)} />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground block mb-1">Valor (R$)</label>
                        <Input type="number" step="0.01" defaultValue={valor}
                          onBlur={e => updateAtivoFields(docPanelAtivo.id, { [fieldValor]: Number(e.target.value || 0) } as any)} />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground block mb-1">Data de Pagamento</label>
                        <Input type="date" defaultValue={dataPg || ''}
                          onBlur={e => updateAtivoFields(docPanelAtivo.id, { [fieldDataPg]: e.target.value || null } as any)} />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <label className="text-xs text-muted-foreground block">Documento / Cobrança</label>
                        <div className="flex gap-2">
                          {arq ? (
                            <>
                              <Button size="sm" variant="outline" onClick={() => setViewingPdf({ url: arq, descricao: `${titulo} — ${docPanelAtivo.descricao}` })}>
                                <Eye className="w-3.5 h-3.5 mr-1" /> Ver
                              </Button>
                              <Button size="sm" variant="outline" className="text-destructive"
                                onClick={() => updateAtivoFields(docPanelAtivo.id, { [fieldArq]: '' } as any)}>
                                <Trash2 className="w-3.5 h-3.5 mr-1" /> Remover
                              </Button>
                            </>
                          ) : <span className="text-xs text-warning">Documento não anexado</span>}
                          <label>
                            <Button size="sm" asChild><span><Upload className="w-3.5 h-3.5 mr-1" /> Subir</span></Button>
                            <input type="file" accept=".pdf,image/*" className="hidden"
                              onChange={async (e) => {
                                const f = e.target.files?.[0]; if (!f) return;
                                const url = await uploadParaAtivo(docPanelAtivo.id, `${tipo}-doc`, f);
                                if (url) updateAtivoFields(docPanelAtivo.id, { [fieldArq]: url } as any);
                              }} />
                          </label>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs text-muted-foreground block">Comprovante de Pagamento</label>
                        <div className="flex gap-2">
                          {compr ? (
                            <>
                              <Button size="sm" variant="outline" onClick={() => setViewingPdf({ url: compr, descricao: `Comprovante ${titulo}` })}>
                                <Eye className="w-3.5 h-3.5 mr-1" /> Ver
                              </Button>
                              <Button size="sm" variant="outline" className="text-destructive"
                                onClick={() => updateAtivoFields(docPanelAtivo.id, { [fieldCompr]: '' } as any)}>
                                <Trash2 className="w-3.5 h-3.5 mr-1" /> Remover
                              </Button>
                            </>
                          ) : <span className="text-xs text-warning">Comprovante pendente</span>}
                          <label>
                            <Button size="sm" asChild><span><Upload className="w-3.5 h-3.5 mr-1" /> Subir</span></Button>
                            <input type="file" accept=".pdf,image/*" className="hidden"
                              onChange={async (e) => {
                                const f = e.target.files?.[0]; if (!f) return;
                                const url = await uploadParaAtivo(docPanelAtivo.id, `${tipo}-compr`, f);
                                if (url) {
                                  await updateAtivoFields(docPanelAtivo.id, {
                                    [fieldCompr]: url,
                                    [fieldDataPg]: dataPg || new Date().toISOString().slice(0, 10),
                                  } as any);
                                  toast.success('Comprovante anexado — status: Regularizado');
                                }
                              }} />
                          </label>
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">Observação</label>
                      <textarea defaultValue={obs || ''} onBlur={e => updateAtivoFields(docPanelAtivo.id, { [fieldObs]: e.target.value } as any)}
                        className="w-full border rounded-lg px-3 py-2 text-sm bg-background text-foreground min-h-[50px]" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setDocPanelId(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação de exclusão em lote */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {selectedIds.size} veículo(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação removerá permanentemente os registros selecionados e será registrada na auditoria. Não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} disabled={bulkDeleting} className="bg-destructive">
              {bulkDeleting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Trash2 className="w-4 h-4 mr-1" />}
              Excluir selecionados
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default DocumentosVeiculosPage;
