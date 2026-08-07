import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import { Building2, CalendarRange, Download, Fuel, History, Loader2, Mail, Pencil, Plus, Printer, QrCode } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import EmailPdfModal, { type EmailPdfDraft } from '@/components/EmailPdfModal';
import {
  buildConsolidatedFuelReport,
  buildKmReportGroups,
  formatDateBr,
  formatMoney,
  formatNumber,
  generateConsolidatedFuelPdf,
  generateDetailedFuelPdf,
  generateKmReportPdf,
  resolveFuelPeriod,
  type FuelReportRecord,
  type KmReportGroup,
  type KmReportRecord,
  type RegisteredCompany,
} from '@/lib/abastecimentoReports';
import { TOPAC_REPORT_CC } from '@/lib/emailPolicy';
import { toast } from 'sonner';

type Posto = {
  id: string;
  codigo: string;
  nome: string;
  unidade?: string | null;
  tipo_qr?: string | null;
  cnpj: string | null;
  endereco: string | null;
  telefone: string | null;
  observacao: string | null;
  status: string;
};

type PeriodMode = 'month' | 'year' | 'range';
type ReportMode = 'consolidado' | 'detalhado' | 'quilometragem';

const currentDate = new Date();
const currentMonth = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
const emptyPosto = { id: '', nome: '', cnpj: '', endereco: '', telefone: '', observacao: '' };

const escapeHtml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

export default function CombustivelQRAdminPage() {
  const navigate = useNavigate();
  const [postos, setPostos] = useState<Posto[]>([]);
  const [companies, setCompanies] = useState<RegisteredCompany[]>([]);
  const [records, setRecords] = useState<FuelReportRecord[]>([]);
  const [kmRecords, setKmRecords] = useState<KmReportRecord[]>([]);
  const [loadingBase, setLoadingBase] = useState(true);
  const [loadingReport, setLoadingReport] = useState(false);
  const [periodMode, setPeriodMode] = useState<PeriodMode>('month');
  const [month, setMonth] = useState(currentMonth);
  const [year, setYear] = useState(String(currentDate.getFullYear()));
  const [startDate, setStartDate] = useState(`${currentMonth}-01`);
  const [endDate, setEndDate] = useState(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).toISOString().slice(0, 10));
  const [companyFilter, setCompanyFilter] = useState('todas');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [search, setSearch] = useState('');
  const [loadedPeriodLabel, setLoadedPeriodLabel] = useState('');
  const [loadedSuffix, setLoadedSuffix] = useState(currentMonth);
  const [postoDialog, setPostoDialog] = useState(false);
  const [postoDraft, setPostoDraft] = useState(emptyPosto);
  const [qrPosto, setQrPosto] = useState<Posto | null>(null);
  const [qrUrl, setQrUrl] = useState('');
  const [emailDraft, setEmailDraft] = useState<EmailPdfDraft | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);

  const loadBase = useCallback(async () => {
    setLoadingBase(true);
    const [postosResult, companiesResult] = await Promise.all([
      supabase.from('postos_combustivel' as any).select('*').is('deleted_at', null).order('unidade').order('codigo'),
      supabase.from('empresas').select('id,nome,razao_social,cnpj,status').order('nome'),
    ]);
    if (postosResult.error) toast.error(`Postos: ${postosResult.error.message}`);
    if (companiesResult.error) toast.error(`Empresas: ${companiesResult.error.message}`);
    setPostos(((postosResult.data as any[]) || []) as Posto[]);
    setCompanies(((companiesResult.data as any[]) || []) as RegisteredCompany[]);
    setLoadingBase(false);
  }, []);

  const loadReport = useCallback(async () => {
    const period = resolveFuelPeriod({ mode: periodMode, month, year, startDate, endDate });
    if (!period.startDate || !period.endDate) return toast.error('Informe o período completo.');
    if (period.endDate < period.startDate) return toast.error('A data final não pode ser anterior à inicial.');
    setLoadingReport(true);
    const [fuelResult, kmResult] = await Promise.all([
      supabase.rpc('relatorio_abastecimento_periodo' as any, {
        p_data_inicio: period.startDate,
        p_data_fim: period.endDate,
      }),
      supabase.rpc('relatorio_quilometragem_periodo' as any, {
        p_data_inicio: period.startDate,
        p_data_fim: period.endDate,
      }),
    ]);
    setLoadingReport(false);
    if (fuelResult.error || kmResult.error) {
      toast.error(fuelResult.error?.message || kmResult.error?.message || 'Não foi possível consultar os relatórios operacionais.');
      return;
    }
    const rows = ((fuelResult.data as unknown[]) || []).map((item) => (typeof item === 'string' ? JSON.parse(item) : item)) as FuelReportRecord[];
    const kmRows = ((kmResult.data as unknown[]) || []).map((item) => (typeof item === 'string' ? JSON.parse(item) : item)) as KmReportRecord[];
    setRecords(rows);
    setKmRecords(kmRows);
    setLoadedPeriodLabel(period.label);
    setLoadedSuffix(`${period.startDate}_${period.endDate}`);
    toast.success(`${rows.length} abastecimento(s) e ${kmRows.length} leitura(s) de KM localizados.`);
  }, [periodMode, month, year, startDate, endDate]);

  useEffect(() => { void loadBase(); }, [loadBase]);
  useEffect(() => { void loadReport(); }, [loadReport]);

  const filteredRecords = useMemo(() => records.filter((record) => {
    if (companyFilter !== 'todas' && record.empresa_id !== companyFilter) return false;
    if (statusFilter !== 'todos' && record.status !== statusFilter) return false;
    if (search.trim()) {
      const term = search.trim().toLowerCase();
      const haystack = `${record.funcionario_nome} ${record.empresa_nome} ${record.empresa || ''} ${record.placa || ''} ${record.posto_nome || ''}`.toLowerCase();
      if (!haystack.includes(term)) return false;
    }
    return true;
  }), [records, companyFilter, statusFilter, search]);

  const filteredKmRecords = useMemo(() => kmRecords.filter((record) => {
    if (companyFilter !== 'todas' && record.empresa_id !== companyFilter) return false;
    if (statusFilter !== 'todos' && record.status !== statusFilter) return false;
    if (search.trim()) {
      const term = search.trim().toLowerCase();
      const haystack = `${record.funcionario_nome} ${record.empresa_nome} ${record.empresa || ''} ${record.filial || ''} ${record.placa} ${record.motivo_rota}`.toLowerCase();
      if (!haystack.includes(term)) return false;
    }
    return true;
  }), [kmRecords, companyFilter, statusFilter, search]);

  const consolidated = useMemo(() => buildConsolidatedFuelReport(filteredRecords, companies), [filteredRecords, companies]);
  const kmGroups = useMemo(() => buildKmReportGroups(filteredKmRecords), [filteredKmRecords]);
  const generalTotals = useMemo(() => ({
    quantity: filteredRecords.length,
    value: filteredRecords.reduce((sum, record) => sum + Number(record.valor || 0), 0),
    liters: filteredRecords.reduce((sum, record) => sum + Number(record.litros || 0), 0),
  }), [filteredRecords]);
  const kmTotals = useMemo(() => ({
    records: filteredKmRecords.length,
    groups: kmGroups.length,
    kilometers: kmGroups.reduce((sum, group) => sum + group.totalRodado, 0),
  }), [filteredKmRecords.length, kmGroups]);

  const openPdf = (mode: ReportMode, download = false) => {
    if (mode === 'quilometragem' && !kmGroups.length) return toast.error('Não há dados de quilometragem no filtro atual.');
    if (mode !== 'quilometragem' && !filteredRecords.length) return toast.error('Não há dados no filtro atual.');
    const pdf = mode === 'consolidado'
      ? generateConsolidatedFuelPdf(consolidated, loadedPeriodLabel, loadedSuffix)
      : mode === 'detalhado'
        ? generateDetailedFuelPdf(filteredRecords, loadedPeriodLabel, loadedSuffix)
        : generateKmReportPdf(kmGroups, loadedPeriodLabel, loadedSuffix);
    const url = URL.createObjectURL(pdf.blob);
    if (download) {
      const link = document.createElement('a');
      link.href = url;
      link.download = pdf.fileName;
      link.click();
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 120000);
  };

  const prepareEmail = (mode: ReportMode) => {
    if (mode === 'quilometragem' && !kmGroups.length) return toast.error('Não há dados de quilometragem no filtro atual.');
    if (mode !== 'quilometragem' && !filteredRecords.length) return toast.error('Não há dados no filtro atual.');
    const pdf = mode === 'consolidado'
      ? generateConsolidatedFuelPdf(consolidated, loadedPeriodLabel, loadedSuffix)
      : mode === 'detalhado'
        ? generateDetailedFuelPdf(filteredRecords, loadedPeriodLabel, loadedSuffix)
        : generateKmReportPdf(kmGroups, loadedPeriodLabel, loadedSuffix);
    const title = mode === 'consolidado'
      ? 'Relatório Consolidado de Abastecimentos'
      : mode === 'detalhado'
        ? 'Relatório Detalhado de Abastecimentos'
        : 'Relatório Corporativo de Quilometragem';
    setEmailDraft({
      to: [],
      cc: [...TOPAC_REPORT_CC],
      subject: `${title} — ${loadedPeriodLabel}`,
      body: [
        'Prezados,',
        '',
        `Encaminho, em anexo, o ${title.toLowerCase()} referente ao período ${loadedPeriodLabel}.`,
        '',
        mode === 'consolidado'
          ? 'O documento está organizado por empresa e apresenta, para cada funcionário, a quantidade de abastecimentos e o valor total abastecido, além dos totais gerais de cada empresa.'
          : mode === 'detalhado'
            ? 'O documento apresenta os registros individuais dos abastecimentos localizados no período selecionado.'
            : 'O documento está separado por colaborador e placa, com sequência completa de KM inicial, KM final, total rodado e motivo ou rota.',
        '',
        'Permanecemos à disposição para eventuais conferências.',
      ].join('\n'),
      attachmentBlob: pdf.blob,
      attachmentName: pdf.fileName,
      moduleOrigin: mode === 'quilometragem' ? 'relatorio-quilometragem' : `relatorio-abastecimentos-${mode}`,
      documentName: pdf.fileName,
    });
    setEmailOpen(true);
  };

  const exportDetailedCsv = () => {
    if (!filteredRecords.length) return;
    const columns = ['Data', 'Hora', 'Empresa', 'Funcionario', 'Placa', 'Posto', 'Combustivel', 'Litros', 'Valor', 'KM', 'Status'];
    const rows = filteredRecords.map((record) => [
      formatDateBr(record.data), String(record.hora || '').slice(0, 5), record.empresa_nome, record.funcionario_nome,
      record.placa || '', record.posto_nome || '', record.combustivel || '', Number(record.litros || 0).toFixed(2),
      Number(record.valor || 0).toFixed(2), record.km_atual ?? '', record.status || '',
    ]);
    const csv = [columns, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Relatorio_Detalhado_Abastecimentos_${loadedSuffix}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportKmCsv = () => {
    if (!filteredKmRecords.length) return;
    const columns = ['Empresa', 'Colaborador', 'Data', 'Hora', 'Placa', 'KM Inicial', 'KM Final', 'Total rodado', 'Motivo/Rota', 'Origem do cálculo'];
    const rows = filteredKmRecords.map((record) => [
      record.empresa_nome || record.empresa || record.filial || '',
      record.funcionario_nome,
      formatDateBr(record.data),
      String(record.hora || '').slice(0, 5),
      record.placa,
      record.km_inicial ?? '',
      record.km_final ?? '',
      record.total_rodado ?? '',
      record.motivo_rota || '',
      record.fonte_km,
    ]);
    const csv = [columns, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Relatorio_Quilometragem_${loadedSuffix}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const savePosto = async () => {
    if (!postoDraft.nome.trim()) return toast.error('Informe o nome do posto.');
    const { data, error } = await supabase.rpc('admin_posto_combustivel_upsert' as any, {
      p_id: postoDraft.id || null,
      p_nome: postoDraft.nome,
      p_cnpj: postoDraft.cnpj,
      p_endereco: postoDraft.endereco,
      p_telefone: postoDraft.telefone,
    });
    const response = data as any;
    if (error || !response?.ok) return toast.error(response?.error || error?.message || 'Não foi possível salvar o posto.');
    if (postoDraft.id) await supabase.from('postos_combustivel' as any).update({ observacao: postoDraft.observacao }).eq('id', postoDraft.id);
    toast.success(postoDraft.id ? 'Posto atualizado.' : 'Posto criado.');
    setPostoDialog(false);
    await loadBase();
  };

  const togglePosto = async (posto: Posto) => {
    const { data, error } = await supabase.rpc('admin_posto_combustivel_toggle' as any, { p_id: posto.id, p_bloquear: posto.status === 'ativo' });
    if (error || !(data as any)?.ok) return toast.error(error?.message || 'Não foi possível alterar o posto.');
    await loadBase();
  };

  const showQr = async (posto: Posto) => {
    setQrPosto(posto);
    setQrUrl(await QRCode.toDataURL(`${window.location.origin}/acesso-mecanico?qr=${encodeURIComponent(posto.codigo)}`, { width: 480, margin: 2 }));
  };

  const printQr = () => {
    if (!qrPosto || !qrUrl) return;
    const popup = window.open('', '_blank');
    if (!popup) return;
    popup.document.write(`<html><head><title>QR ${escapeHtml(qrPosto.nome)}</title><style>body{font-family:Arial;text-align:center;padding:30px;color:#111}img{width:380px}.name{font-size:20px;font-weight:700}.code{font-family:monospace;margin-top:8px}</style></head><body><div class="name">${escapeHtml(qrPosto.nome)}</div><img src="${qrUrl}"/><div class="code">${escapeHtml(qrPosto.codigo)}</div></body></html>`);
    popup.document.close();
    popup.focus();
    setTimeout(() => popup.print(), 250);
  };

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3"><Fuel className="h-7 w-7 text-amber-600" /><div><h1 className="text-2xl font-bold">Central de Abastecimentos</h1><p className="text-sm text-muted-foreground">Relatórios executivos separados do Aplicativo dos Mecânicos.</p></div></div>
        <Button variant="outline" onClick={() => navigate('/admin/funcionarios')}><Building2 className="mr-2 h-4 w-4" /> Dados bancários dos funcionários</Button>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><CalendarRange className="h-5 w-5" /> Período e filtros</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <div><Label>Tipo de período</Label><Select value={periodMode} onValueChange={(value) => setPeriodMode(value as PeriodMode)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="month">Mês</SelectItem><SelectItem value="year">Ano</SelectItem><SelectItem value="range">Intervalo de datas</SelectItem></SelectContent></Select></div>
            {periodMode === 'month' && <div><Label>Mês</Label><Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></div>}
            {periodMode === 'year' && <div><Label>Ano</Label><Input type="number" min="2000" max="2100" value={year} onChange={(e) => setYear(e.target.value)} /></div>}
            {periodMode === 'range' && <><div><Label>Data inicial</Label><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div><div><Label>Data final</Label><Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div></>}
            <div><Label>Empresa</Label><Select value={companyFilter} onValueChange={setCompanyFilter}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todas">Todas</SelectItem>{companies.filter((company) => company.status !== 'inativa').map((company) => <SelectItem key={company.id} value={company.id}>{company.nome}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Status</Label><Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos</SelectItem><SelectItem value="concluido">Concluído</SelectItem><SelectItem value="pendente">Pendente</SelectItem><SelectItem value="cancelado">Cancelado</SelectItem></SelectContent></Select></div>
            <div><Label>Buscar</Label><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Funcionário, placa ou posto" /></div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => void loadReport()} disabled={loadingReport}>{loadingReport ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <History className="mr-2 h-4 w-4" />} Consultar período</Button>
            {loadedPeriodLabel && <span className="text-xs text-muted-foreground">Consulta carregada: {loadedPeriodLabel}</span>}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="consolidado">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="consolidado">Relatório Consolidado</TabsTrigger>
          <TabsTrigger value="detalhado">Relatório Detalhado</TabsTrigger>
          <TabsTrigger value="quilometragem">Relatório de KM</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
          <TabsTrigger value="qrcodes">QR Codes dos postos</TabsTrigger>
        </TabsList>

        <TabsContent value="consolidado">
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3"><CardTitle>Relatório Consolidado</CardTitle><div className="flex gap-2"><Button variant="outline" onClick={() => openPdf('consolidado')} disabled={!filteredRecords.length}><Printer className="mr-2 h-4 w-4" /> Visualizar PDF</Button><Button variant="outline" onClick={() => openPdf('consolidado', true)} disabled={!filteredRecords.length}><Download className="mr-2 h-4 w-4" /> Baixar</Button><Button onClick={() => prepareEmail('consolidado')} disabled={!filteredRecords.length}><Mail className="mr-2 h-4 w-4" /> Enviar</Button></div></CardHeader>
            <CardContent className="space-y-5">
              {loadingReport ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div> : consolidated.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">Nenhum abastecimento localizado.</p> : consolidated.map((company) => (
                <div key={company.empresaId} className="overflow-hidden rounded-lg border">
                  <div className="flex flex-wrap justify-between gap-2 bg-muted/40 px-4 py-3"><div><div className="font-semibold">{company.nome}</div>{(company.razaoSocial || company.cnpj) && <div className="text-xs text-muted-foreground">{[company.razaoSocial, company.cnpj && `CNPJ ${company.cnpj}`].filter(Boolean).join(' — ')}</div>}</div><div className="text-right text-sm"><div>{company.quantidadeTotal} abastecimento(s)</div><div className="font-semibold">{formatMoney(company.valorTotal)}</div></div></div>
                  <Table><TableHeader><TableRow><TableHead>Funcionário</TableHead><TableHead className="text-right">Quantidade de abastecimentos</TableHead><TableHead className="text-right">Valor total abastecido</TableHead></TableRow></TableHeader><TableBody>{company.funcionarios.map((employee) => <TableRow key={employee.funcionarioId}><TableCell>{employee.nome}</TableCell><TableCell className="text-right">{employee.quantidade}</TableCell><TableCell className="text-right font-medium">{formatMoney(employee.valorTotal)}</TableCell></TableRow>)}<TableRow className="bg-muted/30 font-semibold"><TableCell>Total da empresa</TableCell><TableCell className="text-right">{company.quantidadeTotal}</TableCell><TableCell className="text-right">{formatMoney(company.valorTotal)}</TableCell></TableRow></TableBody></Table>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="detalhado">
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3"><CardTitle>Relatório Detalhado</CardTitle><div className="flex gap-2"><Button variant="outline" onClick={exportDetailedCsv} disabled={!filteredRecords.length}>CSV</Button><Button variant="outline" onClick={() => openPdf('detalhado')} disabled={!filteredRecords.length}><Printer className="mr-2 h-4 w-4" /> Visualizar PDF</Button><Button onClick={() => prepareEmail('detalhado')} disabled={!filteredRecords.length}><Mail className="mr-2 h-4 w-4" /> Enviar</Button></div></CardHeader>
            <CardContent><DetailedTable records={filteredRecords} /></CardContent>
          </Card>
        </TabsContent>


        <TabsContent value="quilometragem">
          <Card>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>Relatório Corporativo de Quilometragem</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">Separado por colaborador e veículo, sem cortes na sequência.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={exportKmCsv} disabled={!filteredKmRecords.length}>CSV</Button>
                <Button variant="outline" onClick={() => openPdf('quilometragem')} disabled={!kmGroups.length}><Printer className="mr-2 h-4 w-4" /> Visualizar PDF</Button>
                <Button variant="outline" onClick={() => openPdf('quilometragem', true)} disabled={!kmGroups.length}><Download className="mr-2 h-4 w-4" /> Baixar</Button>
                <Button onClick={() => prepareEmail('quilometragem')} disabled={!kmGroups.length}><Mail className="mr-2 h-4 w-4" /> Enviar</Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Registros completos</div><div className="text-xl font-bold">{kmTotals.records}</div></div>
                <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Colaborador/veículo</div><div className="text-xl font-bold">{kmTotals.groups}</div></div>
                <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Total calculado</div><div className="text-xl font-bold">{formatNumber(kmTotals.kilometers, 0)} km</div></div>
              </div>
              {loadingReport ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div> : <KmReportView groups={kmGroups} />}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="historico">
          <Card><CardHeader><CardTitle>Histórico do período consultado</CardTitle></CardHeader><CardContent><div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3"><div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Abastecimentos</div><div className="text-xl font-bold">{generalTotals.quantity}</div></div><div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Litros</div><div className="text-xl font-bold">{formatNumber(generalTotals.liters)}</div></div><div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Valor</div><div className="text-xl font-bold">{formatMoney(generalTotals.value)}</div></div></div><DetailedTable records={filteredRecords} /></CardContent></Card>
        </TabsContent>

        <TabsContent value="qrcodes">
          <Card><CardHeader className="flex-row items-center justify-between"><CardTitle>Postos cadastrados</CardTitle><Button onClick={() => { setPostoDraft(emptyPosto); setPostoDialog(true); }}><Plus className="mr-2 h-4 w-4" /> Novo posto</Button></CardHeader><CardContent>{loadingBase ? <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div> : <Table><TableHeader><TableRow><TableHead>Posto</TableHead><TableHead>CNPJ</TableHead><TableHead>Endereço</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader><TableBody>{postos.map((posto) => <TableRow key={posto.id}><TableCell><div className="font-medium">{posto.nome}</div><code className="text-xs text-muted-foreground">{posto.codigo}</code></TableCell><TableCell>{posto.cnpj || '-'}</TableCell><TableCell>{posto.endereco || '-'}</TableCell><TableCell><Badge variant={posto.status === 'ativo' ? 'default' : 'destructive'}>{posto.status}</Badge></TableCell><TableCell className="text-right"><Button size="icon" variant="ghost" onClick={() => void showQr(posto)}><QrCode className="h-4 w-4" /></Button><Button size="icon" variant="ghost" onClick={() => { setPostoDraft({ id: posto.id, nome: posto.nome, cnpj: posto.cnpj || '', endereco: posto.endereco || '', telefone: posto.telefone || '', observacao: posto.observacao || '' }); setPostoDialog(true); }}><Pencil className="h-4 w-4" /></Button><Button size="sm" variant="outline" onClick={() => void togglePosto(posto)}>{posto.status === 'ativo' ? 'Bloquear' : 'Liberar'}</Button></TableCell></TableRow>)}</TableBody></Table>}</CardContent></Card>
        </TabsContent>
      </Tabs>

      <Dialog open={postoDialog} onOpenChange={setPostoDialog}><DialogContent><DialogHeader><DialogTitle>{postoDraft.id ? 'Editar posto' : 'Novo posto'}</DialogTitle></DialogHeader><div className="space-y-3"><div><Label>Nome</Label><Input value={postoDraft.nome} onChange={(e) => setPostoDraft({ ...postoDraft, nome: e.target.value })} /></div><div><Label>CNPJ</Label><Input value={postoDraft.cnpj} onChange={(e) => setPostoDraft({ ...postoDraft, cnpj: e.target.value })} /></div><div><Label>Endereço</Label><Input value={postoDraft.endereco} onChange={(e) => setPostoDraft({ ...postoDraft, endereco: e.target.value })} /></div><div><Label>Telefone</Label><Input value={postoDraft.telefone} onChange={(e) => setPostoDraft({ ...postoDraft, telefone: e.target.value })} /></div><div><Label>Observação</Label><Input value={postoDraft.observacao} onChange={(e) => setPostoDraft({ ...postoDraft, observacao: e.target.value })} /></div><Button className="w-full" onClick={() => void savePosto()}>Salvar</Button></div></DialogContent></Dialog>

      <Dialog open={!!qrPosto} onOpenChange={(open) => !open && setQrPosto(null)}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>{qrPosto?.nome}</DialogTitle></DialogHeader>{qrUrl && <img src={qrUrl} alt="QR Code" className="w-full" />}<Button onClick={printQr}><Printer className="mr-2 h-4 w-4" /> Imprimir QR</Button></DialogContent></Dialog>

      <EmailPdfModal open={emailOpen} onOpenChange={setEmailOpen} draft={emailDraft} />
    </div>
  );
}



const KmReportView = ({ groups }: { groups: KmReportGroup[] }) => {
  if (!groups.length) return <p className="py-10 text-center text-sm text-muted-foreground">Nenhum registro de quilometragem localizado.</p>;

  return <div className="space-y-6">{groups.map((group) => (
    <section key={group.groupKey} className="break-inside-avoid overflow-hidden rounded-xl border bg-background shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 bg-slate-50 px-4 py-3 dark:bg-slate-900/40">
        <div><div className="font-semibold">{group.funcionarioNome}</div><div className="text-xs text-muted-foreground">{group.empresaNome}</div></div>
        <div className="text-right"><div className="text-sm font-bold">PLACA {group.placa}</div><div className="text-xs text-muted-foreground">{group.records.length} registro(s)</div></div>
      </div>
      <div className="overflow-x-auto">
        <Table className="min-w-[980px] table-fixed">
          <TableHeader><TableRow><TableHead className="w-[130px]">Data</TableHead><TableHead className="w-[100px]">Placa</TableHead><TableHead className="w-[120px] text-right">KM Inicial</TableHead><TableHead className="w-[120px] text-right">KM Final</TableHead><TableHead className="w-[130px] text-right">Total rodado</TableHead><TableHead>Motivo / Rota</TableHead></TableRow></TableHeader>
          <TableBody>{group.records.map((record) => <TableRow key={record.id}>
            <TableCell className="whitespace-nowrap align-top">{formatDateBr(record.data)} {String(record.hora || '').slice(0, 5)}</TableCell>
            <TableCell className="align-top font-medium">{record.placa}</TableCell>
            <TableCell className="align-top text-right">{record.km_inicial == null ? '-' : formatNumber(record.km_inicial, 0)}</TableCell>
            <TableCell className="align-top text-right">{record.km_final == null ? '-' : formatNumber(record.km_final, 0)}</TableCell>
            <TableCell className="align-top text-right font-medium">{record.total_rodado == null ? '-' : `${formatNumber(record.total_rodado, 0)} km`}</TableCell>
            <TableCell className="whitespace-normal break-words align-top leading-relaxed">{record.motivo_rota || 'Não informado'}{record.fonte_km === 'inconsistente' && <div className="mt-1 text-xs font-medium text-destructive">Leitura inferior ao KM anterior — revisão necessária.</div>}{record.fonte_km === 'sem_base' && <div className="mt-1 text-xs text-muted-foreground">Primeira leitura disponível do veículo.</div>}</TableCell>
          </TableRow>)}<TableRow className="bg-muted/30 font-semibold"><TableCell colSpan={5}>Total rodado no grupo</TableCell><TableCell className="text-right">{formatNumber(group.totalRodado, 0)} km</TableCell></TableRow></TableBody>
        </Table>
      </div>
    </section>
  ))}</div>;
};

const DetailedTable = ({ records }: { records: FuelReportRecord[] }) => {
  if (!records.length) return <p className="py-10 text-center text-sm text-muted-foreground">Nenhum abastecimento localizado.</p>;
  return <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Empresa</TableHead><TableHead>Funcionário</TableHead><TableHead>Placa</TableHead><TableHead>Posto</TableHead><TableHead>Combustível</TableHead><TableHead className="text-right">Litros</TableHead><TableHead className="text-right">Valor</TableHead><TableHead className="text-right">KM</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{records.map((record) => <TableRow key={record.id}><TableCell className="whitespace-nowrap">{formatDateBr(record.data)} {String(record.hora || '').slice(0, 5)}</TableCell><TableCell>{record.empresa_nome || record.empresa || record.filial || '-'}</TableCell><TableCell>{record.funcionario_nome}</TableCell><TableCell>{record.placa || '-'}</TableCell><TableCell>{record.posto_nome || '-'}</TableCell><TableCell>{record.combustivel || '-'}</TableCell><TableCell className="text-right">{formatNumber(record.litros)}</TableCell><TableCell className="text-right font-medium">{formatMoney(record.valor)}</TableCell><TableCell className="text-right">{record.km_atual == null ? '-' : formatNumber(record.km_atual, 0)}</TableCell><TableCell><Badge variant={record.status === 'cancelado' ? 'destructive' : 'secondary'}>{record.status || '-'}</Badge></TableCell></TableRow>)}</TableBody></Table></div>;
};
