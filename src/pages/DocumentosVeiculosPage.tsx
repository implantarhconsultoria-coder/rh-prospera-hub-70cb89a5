import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import PdfDocumentViewer from '@/components/PdfDocumentViewer';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { extractPdfText, renderPdfPagesToDataUrls } from '@/lib/pdf';
import { Car, Upload, Trash2, Search, Eye, Sparkles, Loader2, Printer, Edit2, Save, X, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

interface Ativo {
  id: string;
  tipo: string;
  descricao: string;
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
  vencimento_ipva: string | null;
  vencimento_licenciamento: string | null;
}

type FilterType = 'todos' | 'ipva_vencer' | 'ipva_vencido' | 'lic_vencer' | 'lic_vencido';

const getAlertStatus = (dateStr: string | null): 'em_dia' | 'a_vencer' | 'vencido' | 'sem_data' => {
  if (!dateStr) return 'sem_data';
  const d = new Date(dateStr);
  const now = new Date();
  const diff = (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  if (diff < 0) return 'vencido';
  if (diff <= 30) return 'a_vencer';
  return 'em_dia';
};

const statusBadge = (s: string) => {
  if (s === 'em_dia') return <Badge className="text-[10px] bg-success text-success-foreground">Em dia</Badge>;
  if (s === 'a_vencer') return <Badge className="text-[10px] bg-warning text-warning-foreground">A vencer</Badge>;
  if (s === 'vencido') return <Badge className="text-[10px] bg-destructive text-destructive-foreground">Vencido</Badge>;
  return <Badge variant="outline" className="text-[10px]">—</Badge>;
};

const DocumentosVeiculosPage: React.FC = () => {
  const { session } = useApp();
  const [ativos, setAtivos] = useState<Ativo[]>([]);
  const [search, setSearch] = useState('');
  const [viewingPdf, setViewingPdf] = useState<{ url: string; descricao: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [filterType, setFilterType] = useState<FilterType>('todos');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Ativo>>({});

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

    if (error) {
      throw error;
    }

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
      try {
        extracted = await analyzeVehiclePdf(file, file.name);
      } catch {}

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
      descricao: a.descricao, placa: a.placa, patrimonio: a.patrimonio,
      renavam: a.renavam, chassi: a.chassi, empresa: a.empresa,
      ano_fabricacao: a.ano_fabricacao, ano_modelo: a.ano_modelo,
      vencimento_ipva: a.vencimento_ipva || '', vencimento_licenciamento: a.vencimento_licenciamento || '',
    });
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    const { error } = await supabase.from('ativos').update(editForm as any).eq('id', editingId);
    if (!error) {
      toast.success('Atualizado!');
      setEditingId(null);
      fetchAtivos();
    } else toast.error('Erro ao salvar');
  };

  const filtered = useMemo(() => {
    let list = ativos;
    if (search) {
      const q = search.toLowerCase();
        list = list.filter(a =>
        (a.descricao || '').toLowerCase().includes(q) ||
        (a.placa || '').toLowerCase().includes(q) ||
          (a.patrimonio || '').toLowerCase().includes(q) ||
          (a.renavam || '').toLowerCase().includes(q)
      );
    }
    if (filterType === 'ipva_vencer') list = list.filter(a => getAlertStatus(a.vencimento_ipva) === 'a_vencer');
    if (filterType === 'ipva_vencido') list = list.filter(a => getAlertStatus(a.vencimento_ipva) === 'vencido');
    if (filterType === 'lic_vencer') list = list.filter(a => getAlertStatus(a.vencimento_licenciamento) === 'a_vencer');
    if (filterType === 'lic_vencido') list = list.filter(a => getAlertStatus(a.vencimento_licenciamento) === 'vencido');
    return list;
  }, [ativos, search, filterType]);

  const alertCounts = useMemo(() => ({
    ipvaVencer: ativos.filter(a => getAlertStatus(a.vencimento_ipva) === 'a_vencer').length,
    ipvaVencido: ativos.filter(a => getAlertStatus(a.vencimento_ipva) === 'vencido').length,
    licVencer: ativos.filter(a => getAlertStatus(a.vencimento_licenciamento) === 'a_vencer').length,
    licVencido: ativos.filter(a => getAlertStatus(a.vencimento_licenciamento) === 'vencido').length,
  }), [ativos]);

  const handlePrintBatch = () => {
    if (filtered.length === 0) { toast.error('Nenhum veículo para imprimir'); return; }
    const printWin = window.open('', '_blank');
    if (!printWin) return;
    const rows = filtered.map(a => `<tr>
      <td style="padding:6px 8px;border:1px solid #ccc;font-size:11px">${a.descricao}</td>
      <td style="padding:6px 8px;border:1px solid #ccc;font-size:11px">${a.placa || '—'}</td>
      <td style="padding:6px 8px;border:1px solid #ccc;font-size:11px">${a.patrimonio || '—'}</td>
      <td style="padding:6px 8px;border:1px solid #ccc;font-size:11px">${a.renavam || '—'}</td>
      <td style="padding:6px 8px;border:1px solid #ccc;font-size:11px">${a.vencimento_ipva ? new Date(a.vencimento_ipva).toLocaleDateString('pt-BR') : '—'}</td>
      <td style="padding:6px 8px;border:1px solid #ccc;font-size:11px">${a.vencimento_licenciamento ? new Date(a.vencimento_licenciamento).toLocaleDateString('pt-BR') : '—'}</td>
      <td style="padding:6px 8px;border:1px solid #ccc;font-size:11px">${a.empresa}</td>
    </tr>`).join('');

    const filterLabel = filterType === 'todos' ? 'Todos os Veículos' :
      filterType === 'ipva_vencer' ? 'IPVA a Vencer' :
      filterType === 'ipva_vencido' ? 'IPVA Vencido' :
      filterType === 'lic_vencer' ? 'Licenciamento a Vencer' : 'Licenciamento Vencido';

    printWin.document.write(`<!DOCTYPE html><html><head><title>Documentos de Veículos</title>
    <style>@page{size:A4 landscape;margin:12mm}body{font-family:Arial,sans-serif;font-size:12px;color:#000}
    h1{font-size:16px;margin-bottom:4px}h2{font-size:12px;color:#666;margin-bottom:12px}
    table{width:100%;border-collapse:collapse}th{background:#f5f5f5;padding:6px 8px;border:1px solid #ccc;font-size:10px;text-transform:uppercase;text-align:left}
    .footer{margin-top:20px;text-align:center;font-size:9px;color:#999}
    </style></head><body>
    <h1>Documentos de Veículos — ${filterLabel}</h1>
    <h2>${filtered.length} veículo(s) • Gerado em ${new Date().toLocaleDateString('pt-BR')}</h2>
    <table><thead><tr><th>Descrição</th><th>Placa</th><th>Patrimônio</th><th>Renavam</th><th>Venc. IPVA</th><th>Venc. Licenciamento</th><th>Empresa</th></tr></thead>
    <tbody>${rows}</tbody></table>
    <div class="footer">Topac RH Multiempresa PRO</div>
    </body></html>`);
    printWin.document.close();
    setTimeout(() => printWin.print(), 400);
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="card-premium p-6 gradient-primary text-primary-foreground">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-primary-foreground/20 rounded-2xl flex items-center justify-center">
            <Car className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display">Documentos de Veículos</h1>
            <p className="text-primary-foreground/70 text-sm">Upload múltiplo de PDFs com leitura automática por IA • Alertas de IPVA e Licenciamento</p>
          </div>
        </div>
      </div>

      {/* Alertas */}
      {(alertCounts.ipvaVencido > 0 || alertCounts.licVencido > 0 || alertCounts.ipvaVencer > 0 || alertCounts.licVencer > 0) && (
        <div className="card-premium p-4 border-l-4 border-warning bg-warning/5 space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-warning" />
            <span className="text-sm font-bold text-foreground">Alertas de Documentação</span>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {alertCounts.ipvaVencido > 0 && (
              <button onClick={() => setFilterType('ipva_vencido')}
                className="px-2 py-1 rounded-full bg-destructive/10 text-destructive border border-destructive/30 hover:bg-destructive/20">
                {alertCounts.ipvaVencido} IPVA vencido(s)
              </button>
            )}
            {alertCounts.ipvaVencer > 0 && (
              <button onClick={() => setFilterType('ipva_vencer')}
                className="px-2 py-1 rounded-full bg-warning/10 text-warning border border-warning/30 hover:bg-warning/20">
                {alertCounts.ipvaVencer} IPVA a vencer
              </button>
            )}
            {alertCounts.licVencido > 0 && (
              <button onClick={() => setFilterType('lic_vencido')}
                className="px-2 py-1 rounded-full bg-destructive/10 text-destructive border border-destructive/30 hover:bg-destructive/20">
                {alertCounts.licVencido} Licenciamento vencido(s)
              </button>
            )}
            {alertCounts.licVencer > 0 && (
              <button onClick={() => setFilterType('lic_vencer')}
                className="px-2 py-1 rounded-full bg-warning/10 text-warning border border-warning/30 hover:bg-warning/20">
                {alertCounts.licVencer} Licenciamento a vencer
              </button>
            )}
          </div>
        </div>
      )}

      <div className="card-premium p-5 space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Search className="w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar por descrição, placa ou patrimônio..." value={search}
            onChange={e => setSearch(e.target.value)} className="flex-1 min-w-[200px]" />
          <select value={filterType} onChange={e => setFilterType(e.target.value as FilterType)}
            className="border rounded-lg px-3 py-2 text-sm bg-background text-foreground">
            <option value="todos">Todos</option>
            <option value="ipva_vencer">IPVA a Vencer</option>
            <option value="ipva_vencido">IPVA Vencido</option>
            <option value="lic_vencer">Lic. a Vencer</option>
            <option value="lic_vencido">Lic. Vencido</option>
          </select>
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
            <Printer className="w-4 h-4 mr-1" /> Imprimir Lote
          </Button>
        </div>
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Sparkles className="w-3 h-3" /> Ao subir PDFs, a IA tenta extrair placa, renavam, chassi e outros dados. Dados reaproveitados no Protocolo.
        </p>
      </div>

      {/* Inline edit form */}
      {editingId && (
        <div className="card-premium p-5 space-y-3 border-l-4 border-primary">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground">Editando Documento</h3>
            <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}><X className="w-4 h-4" /></Button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div><label className="text-xs text-muted-foreground block mb-1">Descrição</label>
              <Input value={editForm.descricao || ''} onChange={e => setEditForm({ ...editForm, descricao: e.target.value })} /></div>
            <div><label className="text-xs text-muted-foreground block mb-1">Placa</label>
              <Input value={editForm.placa || ''} onChange={e => setEditForm({ ...editForm, placa: e.target.value })} /></div>
            <div><label className="text-xs text-muted-foreground block mb-1">Patrimônio</label>
              <Input value={editForm.patrimonio || ''} onChange={e => setEditForm({ ...editForm, patrimonio: e.target.value })} /></div>
            <div><label className="text-xs text-muted-foreground block mb-1">Renavam</label>
              <Input value={editForm.renavam || ''} onChange={e => setEditForm({ ...editForm, renavam: e.target.value })} /></div>
            <div><label className="text-xs text-muted-foreground block mb-1">Chassi</label>
              <Input value={editForm.chassi || ''} onChange={e => setEditForm({ ...editForm, chassi: e.target.value })} /></div>
            <div><label className="text-xs text-muted-foreground block mb-1">Empresa</label>
              <Input value={editForm.empresa || ''} onChange={e => setEditForm({ ...editForm, empresa: e.target.value })} /></div>
            <div><label className="text-xs text-muted-foreground block mb-1">Venc. IPVA</label>
              <Input type="date" value={editForm.vencimento_ipva || ''} onChange={e => setEditForm({ ...editForm, vencimento_ipva: e.target.value })} /></div>
            <div><label className="text-xs text-muted-foreground block mb-1">Venc. Licenciamento</label>
              <Input type="date" value={editForm.vencimento_licenciamento || ''} onChange={e => setEditForm({ ...editForm, vencimento_licenciamento: e.target.value })} /></div>
          </div>
          <Button onClick={handleSaveEdit}><Save className="w-4 h-4 mr-1" /> Salvar</Button>
        </div>
      )}

      <div className="card-premium overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b bg-muted/50 sticky top-0 z-10">
            <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Descrição</th>
            <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Placa</th>
            <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Patrimônio</th>
            <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Renavam</th>
            <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">IPVA</th>
            <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Licenciamento</th>
            <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Empresa</th>
            <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">PDF</th>
            <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Ações</th>
          </tr></thead>
          <tbody>
            {filtered.map(a => (
              <tr key={a.id} className="border-b hover:bg-muted/20">
                <td className="px-3 py-2 text-xs font-medium">{a.descricao}</td>
                <td className="px-3 py-2 text-xs">{a.placa || '—'}</td>
                <td className="px-3 py-2 text-xs">{a.patrimonio || '—'}</td>
                <td className="px-3 py-2 text-xs">{a.renavam || '—'}</td>
                <td className="px-3 py-2">{statusBadge(getAlertStatus(a.vencimento_ipva))}</td>
                <td className="px-3 py-2">{statusBadge(getAlertStatus(a.vencimento_licenciamento))}</td>
                <td className="px-3 py-2 text-xs">{a.empresa}</td>
                <td className="px-3 py-2 text-xs">
                  {a.arquivo_url ? <button onClick={() => setViewingPdf({ url: a.arquivo_url, descricao: a.descricao })} className="text-primary hover:underline flex items-center gap-1 text-xs"><Eye className="w-3 h-3" />Ver</button> : '—'}
                </td>
                <td className="px-3 py-2 flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(a)}>
                    <Edit2 className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(a.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={9} className="text-center py-8 text-muted-foreground text-sm">Nenhum documento encontrado</td></tr>}
          </tbody>
        </table>
        <div className="p-3 text-xs text-muted-foreground border-t">{filtered.length} documento(s)</div>
      </div>

      {/* Internal PDF Viewer Modal */}
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
    </div>
  );
};

export default DocumentosVeiculosPage;
