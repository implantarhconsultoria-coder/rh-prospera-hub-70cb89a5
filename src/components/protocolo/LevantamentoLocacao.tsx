import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRightLeft, Car, CheckCircle2, FileSpreadsheet, FileText, Loader2, PackageOpen, RefreshCw, Search, Truck, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { printDocumentInPage } from '@/lib/printInPage';
import { registrarAcao } from '@/lib/acoesLog';
import { toast } from 'sonner';

type CategoriaAtivo = 'veiculo' | 'compressor';
type StatusLocacao = 'ativo' | 'encerrado' | 'devolvido' | 'alterado';

type ProtocolRow = {
  id: string;
  empresa_origem?: string | null;
  empresa_destinataria?: string | null;
  local_canteiro?: string | null;
  responsavel_recebimento?: string | null;
  data_emissao: string;
  descricao_ativo?: string | null;
  placa?: string | null;
  renavam?: string | null;
  chassi?: string | null;
  patrimonio?: string | null;
  observacoes?: string | null;
  pdf_url?: string | null;
  ativo_id?: string | null;
  categoria_ativo?: CategoriaAtivo | null;
  status_locacao?: StatusLocacao | null;
  status_atualizado_em?: string | null;
  encerrado_em?: string | null;
  devolvido_em?: string | null;
  protocolo_lote_id?: string | null;
  created_at: string;
};

type FrotaAsset = {
  id: string;
  placa?: string | null;
  patrimonio?: string | null;
  vencimento_ipva?: string | null;
  vencimento_licenciamento?: string | null;
};

type AlertStatus = 'em_dia' | 'a_vencer' | 'vencido' | 'sem_data';

const normalizePlate = (value: unknown) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const normalizePatrimonio = (value: unknown) => String(value || '').toUpperCase().replace(/\s+/g, '').trim();
const escapeHtml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const formatDate = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('pt-BR');
};

const getAlertStatus = (dateStr?: string | null): AlertStatus => {
  if (!dateStr) return 'sem_data';
  const due = new Date(`${dateStr.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(due.getTime())) return 'sem_data';
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const diff = Math.ceil((due.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return 'vencido';
  if (diff <= 30) return 'a_vencer';
  return 'em_dia';
};

const alertLabel: Record<AlertStatus, string> = {
  em_dia: 'EM DIA',
  a_vencer: 'A VENCER',
  vencido: 'VENCIDO',
  sem_data: 'SEM DATA',
};

const statusLabel: Record<StatusLocacao, string> = {
  ativo: 'ATIVO',
  encerrado: 'ENCERRADO',
  devolvido: 'DEVOLVIDO',
  alterado: 'ALTERADO / TROCA',
};

const categoryLabel: Record<CategoriaAtivo, string> = {
  veiculo: 'VEÍCULOS',
  compressor: 'COMPRESSORES',
};

const statusClasses: Record<StatusLocacao, string> = {
  ativo: 'border-emerald-400/35 bg-emerald-500/10 text-emerald-300',
  encerrado: 'border-slate-400/35 bg-slate-500/10 text-slate-300',
  devolvido: 'border-blue-400/35 bg-blue-500/10 text-blue-300',
  alterado: 'border-amber-400/35 bg-amber-500/10 text-amber-300',
};

const alertClasses: Record<AlertStatus, string> = {
  em_dia: 'border-emerald-400/35 bg-emerald-500/10 text-emerald-300',
  a_vencer: 'border-amber-400/35 bg-amber-500/10 text-amber-300',
  vencido: 'border-red-400/35 bg-red-500/10 text-red-300',
  sem_data: 'border-border bg-muted/20 text-muted-foreground',
};

const LevantamentoLocacao: React.FC = () => {
  const navigate = useNavigate();
  const [history, setHistory] = useState<ProtocolRow[]>([]);
  const [assets, setAssets] = useState<FrotaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState('');
  const [categoria, setCategoria] = useState<CategoriaAtivo>('veiculo');
  const [status, setStatus] = useState<StatusLocacao>('ativo');
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [protocolsRes, assetsRes] = await Promise.all([
        supabase
          .from('protocolos_documentos' as any)
          .select('id,empresa_origem,empresa_destinataria,local_canteiro,responsavel_recebimento,data_emissao,descricao_ativo,placa,renavam,chassi,patrimonio,observacoes,pdf_url,ativo_id,categoria_ativo,status_locacao,status_atualizado_em,encerrado_em,devolvido_em,protocolo_lote_id,created_at')
          .order('created_at', { ascending: false })
          .limit(5000),
        supabase
          .from('ativos')
          .select('id,placa,patrimonio,vencimento_ipva,vencimento_licenciamento')
          .in('tipo', ['veiculo', 'equipamento']),
      ]);

      if (protocolsRes.error) throw protocolsRes.error;
      if (assetsRes.error) throw assetsRes.error;
      setHistory(((protocolsRes.data as unknown as ProtocolRow[]) || []));
      setAssets(((assetsRes.data as unknown as FrotaAsset[]) || []));
    } catch (error: any) {
      toast.error(`Não foi possível carregar o levantamento: ${error?.message || error}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const assetMap = useMemo(() => {
    const map = new Map<string, FrotaAsset>();
    assets.forEach((asset) => {
      map.set(`id:${asset.id}`, asset);
      const plate = normalizePlate(asset.placa);
      if (plate) map.set(`placa:${plate}`, asset);
      const patrimonio = normalizePatrimonio(asset.patrimonio);
      if (patrimonio) map.set(`pat:${patrimonio}`, asset);
    });
    return map;
  }, [assets]);

  const keyOf = (row: ProtocolRow) => {
    if (row.ativo_id) return `id:${row.ativo_id}`;
    const plate = normalizePlate(row.placa);
    if (plate) return `placa:${plate}`;
    const patrimonio = normalizePatrimonio(row.patrimonio);
    if (patrimonio) return `pat:${patrimonio}`;
    return `registro:${row.id}`;
  };

  const currentRows = useMemo(() => {
    const latest = new Map<string, ProtocolRow>();
    history.forEach((row) => {
      const key = keyOf(row);
      if (!latest.has(key)) latest.set(key, row);
    });
    return Array.from(latest.values());
  }, [history]);

  const getAsset = (row: ProtocolRow) => {
    if (row.ativo_id && assetMap.has(`id:${row.ativo_id}`)) return assetMap.get(`id:${row.ativo_id}`) || null;
    const plate = normalizePlate(row.placa);
    if (plate && assetMap.has(`placa:${plate}`)) return assetMap.get(`placa:${plate}`) || null;
    const patrimonio = normalizePatrimonio(row.patrimonio);
    if (patrimonio && assetMap.has(`pat:${patrimonio}`)) return assetMap.get(`pat:${patrimonio}`) || null;
    return null;
  };

  const inferCategory = (row: ProtocolRow): CategoriaAtivo => row.categoria_ativo || (normalizePlate(row.placa) ? 'veiculo' : 'compressor');
  const inferStatus = (row: ProtocolRow): StatusLocacao => row.status_locacao || 'ativo';

  const counts = useMemo(() => {
    const base = currentRows.filter((row) => inferCategory(row) === categoria);
    return {
      ativo: base.filter((row) => inferStatus(row) === 'ativo').length,
      encerrado: base.filter((row) => inferStatus(row) === 'encerrado').length,
      devolvido: base.filter((row) => inferStatus(row) === 'devolvido').length,
      alterado: base.filter((row) => inferStatus(row) === 'alterado').length,
    };
  }, [currentRows, categoria]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('pt-BR');
    return currentRows
      .filter((row) => inferCategory(row) === categoria && inferStatus(row) === status)
      .filter((row) => {
        if (!q) return true;
        return [row.empresa_destinataria, row.local_canteiro, row.placa, row.patrimonio, row.descricao_ativo, row.responsavel_recebimento]
          .some((value) => String(value || '').toLocaleLowerCase('pt-BR').includes(q));
      })
      .sort((a, b) => `${b.data_emissao}|${b.created_at}`.localeCompare(`${a.data_emissao}|${a.created_at}`));
  }, [currentRows, categoria, status, search]);

  const updateStatus = async (row: ProtocolRow, nextStatus: StatusLocacao) => {
    if (inferStatus(row) === nextStatus) return;
    setUpdatingId(row.id);
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      status_locacao: nextStatus,
      status_atualizado_em: now,
      encerrado_em: nextStatus === 'encerrado' ? now : null,
      devolvido_em: nextStatus === 'devolvido' ? now : null,
    };

    try {
      const { error } = await supabase.from('protocolos_documentos' as any).update(patch as any).eq('id', row.id);
      if (error) throw error;

      setHistory((current) => current.map((item) => item.id === row.id ? { ...item, ...patch } as ProtocolRow : item));
      await registrarAcao({
        modulo: 'protocolo',
        entidade: 'protocolos_documentos',
        entidadeId: row.id,
        acao: 'alterou',
        antes: { status_locacao: inferStatus(row) },
        depois: { status_locacao: nextStatus },
        observacao: `Situação da locação alterada para ${statusLabel[nextStatus]}.`,
      });
      toast.success(`Locação marcada como ${statusLabel[nextStatus]}.`);
    } catch (error: any) {
      toast.error(`Não foi possível atualizar a locação: ${error?.message || error}`);
    } finally {
      setUpdatingId('');
    }
  };

  const buildCurrentExportRows = (rows: ProtocolRow[]) => rows.map((row) => {
    const asset = getAsset(row);
    const ipva = getAlertStatus(asset?.vencimento_ipva);
    const lic = getAlertStatus(asset?.vencimento_licenciamento);
    return {
      'Data de Liberação': formatDate(row.data_emissao),
      'Cliente / Empresa': row.empresa_destinataria || '',
      'Canteiro': row.local_canteiro || '',
      'Categoria': categoryLabel[inferCategory(row)],
      'Ativo / Descrição': row.descricao_ativo || '',
      'Placa': row.placa || '',
      'Patrimônio': row.patrimonio || '',
      'Situação da Locação': statusLabel[inferStatus(row)],
      'Venc. IPVA': asset?.vencimento_ipva ? formatDate(asset.vencimento_ipva) : '',
      'Status IPVA': inferCategory(row) === 'veiculo' ? alertLabel[ipva] : '',
      'Venc. Licenciamento': asset?.vencimento_licenciamento ? formatDate(asset.vencimento_licenciamento) : '',
      'Status Licenciamento': inferCategory(row) === 'veiculo' ? alertLabel[lic] : '',
      'Responsável': row.responsavel_recebimento || '',
      'Observações': row.observacoes || '',
    };
  });

  const exportExcel = () => {
    if (!currentRows.length) {
      toast.error('Não há protocolos salvos para exportar.');
      return;
    }

    const workbook = XLSX.utils.book_new();
    const currentFiltered = currentRows
      .filter((row) => inferCategory(row) === categoria && inferStatus(row) === status)
      .sort((a, b) => `${a.data_emissao}|${a.created_at}`.localeCompare(`${b.data_emissao}|${b.created_at}`));
    const allHistory = [...history]
      .sort((a, b) => `${a.data_emissao}|${a.created_at}`.localeCompare(`${b.data_emissao}|${b.created_at}`))
      .map((row) => ({
        'Data de Liberação': formatDate(row.data_emissao),
        'Cliente / Empresa': row.empresa_destinataria || '',
        'Canteiro': row.local_canteiro || '',
        'Categoria': categoryLabel[inferCategory(row)],
        'Ativo / Descrição': row.descricao_ativo || '',
        'Placa': row.placa || '',
        'Patrimônio': row.patrimonio || '',
        'Situação': statusLabel[inferStatus(row)],
        'Responsável': row.responsavel_recebimento || '',
        'Observações': row.observacoes || '',
        'Criado em': new Date(row.created_at).toLocaleString('pt-BR'),
        'ID Protocolo': row.id,
      }));
    const licensingRows = currentRows
      .filter((row) => inferCategory(row) === 'veiculo')
      .sort((a, b) => `${a.data_emissao}|${a.created_at}`.localeCompare(`${b.data_emissao}|${b.created_at}`))
      .map((row) => {
        const asset = getAsset(row);
        return {
          'Placa': row.placa || '',
          'Patrimônio': row.patrimonio || '',
          'Cliente / Empresa': row.empresa_destinataria || '',
          'Canteiro': row.local_canteiro || '',
          'Data de Liberação': formatDate(row.data_emissao),
          'Situação Locação': statusLabel[inferStatus(row)],
          'Venc. IPVA': asset?.vencimento_ipva ? formatDate(asset.vencimento_ipva) : '',
          'Status IPVA': alertLabel[getAlertStatus(asset?.vencimento_ipva)],
          'Venc. Licenciamento': asset?.vencimento_licenciamento ? formatDate(asset.vencimento_licenciamento) : '',
          'Status Licenciamento': alertLabel[getAlertStatus(asset?.vencimento_licenciamento)],
        };
      });

    const currentSheet = XLSX.utils.json_to_sheet(buildCurrentExportRows(currentFiltered));
    const historySheet = XLSX.utils.json_to_sheet(allHistory);
    const licensingSheet = XLSX.utils.json_to_sheet(licensingRows);
    currentSheet['!cols'] = [14, 28, 24, 16, 28, 12, 14, 22, 14, 18, 20, 22, 22, 45].map((wch) => ({ wch }));
    historySheet['!cols'] = [14, 28, 24, 16, 28, 12, 14, 22, 22, 45, 20, 38].map((wch) => ({ wch }));
    licensingSheet['!cols'] = [12, 14, 28, 24, 14, 22, 14, 18, 20, 22].map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(workbook, currentSheet, 'Levantamento Atual');
    XLSX.utils.book_append_sheet(workbook, historySheet, 'Historico Protocolos');
    XLSX.utils.book_append_sheet(workbook, licensingSheet, 'Licenciamento');

    const today = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `Levantamento_Locacao_TOPAC_${categoria}_${status}_${today}.xlsx`);
    toast.success('Excel gerado com levantamento atual, histórico completo e licenciamento.');
  };

  const exportPdf = () => {
    if (!filteredRows.length) {
      toast.error('Não há registros neste filtro para gerar o relatório.');
      return;
    }

    const rowsHtml = filteredRows.map((row) => {
      const asset = getAsset(row);
      const ipva = getAlertStatus(asset?.vencimento_ipva);
      const lic = getAlertStatus(asset?.vencimento_licenciamento);
      return `<tr>
        <td>${escapeHtml(formatDate(row.data_emissao))}</td>
        <td>${escapeHtml(row.empresa_destinataria || '—')}</td>
        <td>${escapeHtml(row.local_canteiro || '—')}</td>
        <td>${escapeHtml(row.descricao_ativo || '—')}</td>
        <td>${escapeHtml(row.placa || '—')}</td>
        <td>${escapeHtml(row.patrimonio || '—')}</td>
        <td>${escapeHtml(statusLabel[inferStatus(row)])}</td>
        ${categoria === 'veiculo' ? `<td>${escapeHtml(alertLabel[ipva])}</td><td>${escapeHtml(alertLabel[lic])}</td>` : ''}
      </tr>`;
    }).join('');

    const extraHeaders = categoria === 'veiculo' ? '<th>IPVA</th><th>LICENCIAMENTO</th>' : '';
    const html = `<!doctype html><html><head><meta charset="utf-8"/><title>Levantamento de Locação TOPAC</title><style>
      @page{size:A4 landscape;margin:8mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#111;margin:0}h1{font-size:18px;margin:0 0 4px}.meta{font-size:10px;color:#555;margin-bottom:14px}table{width:100%;border-collapse:collapse;font-size:8.5px}th,td{border:1px solid #bbb;padding:5px 6px;text-align:left;vertical-align:top}th{background:#eee;font-weight:700}tr{break-inside:avoid}.footer{margin-top:10px;font-size:9px;color:#555}
    </style></head><body><h1>LEVANTAMENTO DE LOCAÇÃO — ${escapeHtml(categoryLabel[categoria])}</h1><div class="meta">Situação: ${escapeHtml(statusLabel[status])} · Gerado em ${escapeHtml(new Date().toLocaleString('pt-BR'))} · ${filteredRows.length} registro(s)</div><table><thead><tr><th>DATA LIBERAÇÃO</th><th>CLIENTE / EMPRESA</th><th>CANTEIRO</th><th>ATIVO</th><th>PLACA</th><th>PATRIMÔNIO</th><th>SITUAÇÃO</th>${extraHeaders}</tr></thead><tbody>${rowsHtml}</tbody></table><div class="footer">Fonte: protocolos salvos no TOPAC RH PRO. Para veículos, a sinalização de IPVA/Licenciamento utiliza o cadastro da Frota.</div></body></html>`;
    printDocumentInPage(html);
  };

  const renderAlertBadge = (value?: string | null) => {
    const alert = getAlertStatus(value);
    return <Badge variant="outline" className={`text-[10px] ${alertClasses[alert]}`}>{alertLabel[alert]}</Badge>;
  };

  const statusTabs: Array<{ key: StatusLocacao; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { key: 'ativo', label: 'Ativos', icon: CheckCircle2 },
    { key: 'encerrado', label: 'Encerrados', icon: XCircle },
    { key: 'devolvido', label: 'Devolvidos', icon: PackageOpen },
    { key: 'alterado', label: 'Alterados / Troca', icon: ArrowRightLeft },
  ];

  return (
    <div className="space-y-4">
      <section className="card-premium p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-extrabold text-foreground">Levantamento de Locação</h2>
            <p className="mt-1 text-xs text-muted-foreground">Situação atual consolidada pelos protocolos. O histórico completo permanece arquivado e sai no Excel.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Atualizar</Button>
            <Button variant="outline" size="sm" onClick={exportExcel}><FileSpreadsheet className="mr-2 h-4 w-4" />Excel</Button>
            <Button variant="outline" size="sm" onClick={exportPdf}><FileText className="mr-2 h-4 w-4" />PDF</Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button onClick={() => setCategoria('veiculo')} className={`rounded-xl border p-4 text-left transition ${categoria === 'veiculo' ? 'border-primary bg-primary/10 ring-1 ring-primary/30' : 'border-border bg-muted/10 hover:bg-muted/20'}`}>
            <div className="flex items-center justify-between"><span className="flex items-center gap-2 font-bold"><Car className="h-5 w-5" />Veículos</span><Badge variant="outline">{currentRows.filter((row) => inferCategory(row) === 'veiculo').length}</Badge></div>
            <p className="mt-1 text-[11px] text-muted-foreground">Placa, patrimônio e sinalização de IPVA/Licenciamento.</p>
          </button>
          <button onClick={() => setCategoria('compressor')} className={`rounded-xl border p-4 text-left transition ${categoria === 'compressor' ? 'border-primary bg-primary/10 ring-1 ring-primary/30' : 'border-border bg-muted/10 hover:bg-muted/20'}`}>
            <div className="flex items-center justify-between"><span className="flex items-center gap-2 font-bold"><Truck className="h-5 w-5" />Compressores</span><Badge variant="outline">{currentRows.filter((row) => inferCategory(row) === 'compressor').length}</Badge></div>
            <p className="mt-1 text-[11px] text-muted-foreground">Controle por patrimônio, cliente, canteiro e situação da locação.</p>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
          {statusTabs.map((tab) => {
            const Icon = tab.icon;
            return <button key={tab.key} onClick={() => setStatus(tab.key)} className={`rounded-xl border px-3 py-3 text-left transition ${status === tab.key ? statusClasses[tab.key] : 'border-border bg-muted/10 hover:bg-muted/20'}`}><div className="flex items-center justify-between gap-2"><span className="flex items-center gap-2 text-xs font-bold"><Icon className="h-4 w-4" />{tab.label}</span><strong className="text-lg">{counts[tab.key]}</strong></div></button>;
          })}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[260px] flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar cliente, canteiro, placa ou patrimônio..." className="pl-9" /></div>
          {categoria === 'veiculo' && <Button variant="outline" onClick={() => navigate('/admin/documentos-ativos')}><Car className="mr-2 h-4 w-4" />Abrir Frota / IPVA</Button>}
        </div>
      </section>

      <section className="card-premium overflow-hidden">
        {loading ? (
          <div className="flex min-h-52 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Carregando protocolos...</div>
        ) : filteredRows.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Nenhum registro em {categoryLabel[categoria]} / {statusLabel[status]}.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] text-sm">
              <thead className="bg-muted/50"><tr>
                <th className="px-3 py-3 text-left text-xs uppercase text-muted-foreground">Data Liberação</th>
                <th className="px-3 py-3 text-left text-xs uppercase text-muted-foreground">Cliente / Empresa</th>
                <th className="px-3 py-3 text-left text-xs uppercase text-muted-foreground">Canteiro</th>
                <th className="px-3 py-3 text-left text-xs uppercase text-muted-foreground">Ativo</th>
                <th className="px-3 py-3 text-left text-xs uppercase text-muted-foreground">Placa</th>
                <th className="px-3 py-3 text-left text-xs uppercase text-muted-foreground">Patrimônio</th>
                {categoria === 'veiculo' && <><th className="px-3 py-3 text-left text-xs uppercase text-muted-foreground">IPVA</th><th className="px-3 py-3 text-left text-xs uppercase text-muted-foreground">Licenciamento</th></>}
                <th className="px-3 py-3 text-left text-xs uppercase text-muted-foreground">Situação</th>
                <th className="px-3 py-3 text-left text-xs uppercase text-muted-foreground">Alterar situação</th>
              </tr></thead>
              <tbody>{filteredRows.map((row) => {
                const asset = getAsset(row);
                const rowStatus = inferStatus(row);
                return <tr key={row.id} className="border-t border-border/70 hover:bg-muted/10">
                  <td className="px-3 py-3 whitespace-nowrap">{formatDate(row.data_emissao)}</td>
                  <td className="px-3 py-3 font-semibold">{row.empresa_destinataria || '—'}</td>
                  <td className="px-3 py-3">{row.local_canteiro || '—'}</td>
                  <td className="px-3 py-3 max-w-[240px]">{row.descricao_ativo || '—'}</td>
                  <td className="px-3 py-3 font-mono font-semibold">{row.placa || '—'}</td>
                  <td className="px-3 py-3 font-semibold">{row.patrimonio || '—'}</td>
                  {categoria === 'veiculo' && <><td className="px-3 py-3">{renderAlertBadge(asset?.vencimento_ipva)}<div className="mt-1 text-[10px] text-muted-foreground">{formatDate(asset?.vencimento_ipva)}</div></td><td className="px-3 py-3">{renderAlertBadge(asset?.vencimento_licenciamento)}<div className="mt-1 text-[10px] text-muted-foreground">{formatDate(asset?.vencimento_licenciamento)}</div></td></>}
                  <td className="px-3 py-3"><Badge variant="outline" className={statusClasses[rowStatus]}>{statusLabel[rowStatus]}</Badge></td>
                  <td className="px-3 py-3">
                    <select value={rowStatus} disabled={updatingId === row.id} onChange={(event) => void updateStatus(row, event.target.value as StatusLocacao)} className="h-9 rounded-lg border border-border bg-background px-2 text-xs text-foreground outline-none focus:border-primary">
                      <option value="ativo">Ativo</option><option value="encerrado">Encerrado</option><option value="devolvido">Devolvido</option><option value="alterado">Alterado / Troca</option>
                    </select>
                  </td>
                </tr>;
              })}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};

export default LevantamentoLocacao;
