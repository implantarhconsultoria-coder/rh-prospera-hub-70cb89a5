import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { useApp } from '@/context/AppContext';
import { getWorkingDays, getFirstBusinessDayOfNextMonth } from '@/lib/workingDays';
import { useFeriados } from '@/hooks/useFeriados';
import { formatCurrency } from '@/lib/calculations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { UtensilsCrossed, FileText, User, Printer, Building2, Pencil, ShieldCheck, Eye, Upload, FileSpreadsheet } from 'lucide-react';
import RecibosPreviewModal from '@/components/RecibosPreviewModal';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { buildVRReportRows, sumBenefitRows, type BenefitReportRow } from '@/lib/benefitReports';
import { useRecibosCorrecoes } from '@/hooks/useRecibosCorrecoes';
import ReciboCorrecaoModal from '@/components/ReciboCorrecaoModal';

const ALL_COMPANIES = 'todas';
const MESES_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const competenciaPt = (c: string) => {
  const [y, m] = (c || '').split('-');
  const idx = Number(m) - 1;
  return idx >= 0 && idx < 12 ? `${MESES_PT[idx]} / ${y}` : c;
};

type ImportedVrRow = {
  nome: string;
  cargo: string;
  cpf: string;
  valorDiario: number;
  diasPrevistos: number;
  diasDescontados: number;
  diasFinais: number;
  valorTotal: number;
  motivo: string;
};

type VrBulkMode = 'sem_guincheiros' | 'todos' | 'somente_guincheiros';

const normalizeHeader = (value: unknown) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const parseNumber = (value: unknown) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const text = String(value || '').trim();
  if (!text) return 0;
  const normalized = text
    .replace(/R\$|r\$/g, '')
    .replace(/[^0-9,.-]/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const roundCurrency = (value: number) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const pickValue = (row: Record<string, unknown>, names: string[]) => {
  const normalized = Object.entries(row).map(([key, value]) => ({ key: normalizeHeader(key), value }));
  for (const name of names.map(normalizeHeader)) {
    const exact = normalized.find(item => item.key === name);
    if (exact) return exact.value;
    const loose = normalized.find(item => item.key.includes(name) || name.includes(item.key));
    if (loose) return loose.value;
  }
  return '';
};

const buildImportedVrRows = (rawRows: Array<Record<string, unknown>>) => rawRows
  .map((raw) => {
    const nome = String(pickValue(raw, ['nome', 'funcionario', 'colaborador', 'empregado']) || '').trim();
    const cargo = String(pickValue(raw, ['cargo', 'funcao', 'função', 'setor']) || '').trim();
    const cpf = String(pickValue(raw, ['cpf', 'documento']) || '').trim();
    const valorDiario = parseNumber(pickValue(raw, ['vr dia', 'valor diario', 'valor diário', 'valor unitario', 'valor unitário', 'diaria', 'diária']));
    const diasPrevistos = parseNumber(pickValue(raw, ['dias previstos', 'dias uteis', 'dias úteis', 'dias vr', 'dias']));
    const diasDescontados = parseNumber(pickValue(raw, ['dias descontados', 'descontos', 'faltas', 'desc']));
    const diasFinaisInformado = parseNumber(pickValue(raw, ['dias finais', 'dias pagos', 'dias considerados', 'qtd dias', 'quantidade']));
    const totalInformado = parseNumber(pickValue(raw, ['valor total', 'total', 'total vr', 'valor vr']));
    const diasFinais = diasFinaisInformado || Math.max(0, diasPrevistos - diasDescontados);
    const valorTotal = totalInformado || roundCurrency(valorDiario * diasFinais);
    const motivo = String(pickValue(raw, ['motivo', 'observacao', 'observação', 'obs']) || '').trim();
    return { nome, cargo, cpf, valorDiario, diasPrevistos, diasDescontados, diasFinais, valorTotal, motivo };
  })
  .filter(row => row.nome || row.valorTotal > 0);

const parseDelimitedText = (text: string) => {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (!lines.length) return [] as Array<Record<string, unknown>>;
  const delimiters = [';', '\t', ','];
  const delimiter = delimiters
    .map(item => ({ item, count: lines[0].split(item).length }))
    .sort((a, b) => b.count - a.count)[0]?.item || ';';
  const first = lines[0].split(delimiter).map(cell => cell.trim());
  const hasHeader = first.some(cell => ['nome', 'funcionario', 'colaborador', 'vr', 'valor', 'dias', 'total'].some(term => normalizeHeader(cell).includes(term)));
  const headers = hasHeader ? first : ['Nome', 'Cargo', 'VR Dia', 'Dias Finais', 'Valor Total', 'Motivo'];
  const dataLines = hasHeader ? lines.slice(1) : lines;
  return dataLines.map(line => {
    const cells = line.split(delimiter).map(cell => cell.trim());
    return headers.reduce<Record<string, unknown>>((acc, header, index) => {
      acc[header || `coluna_${index + 1}`] = cells[index] || '';
      return acc;
    }, {});
  });
};

const escapeHtml = (value: string) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/\"/g, '&quot;')
  .replace(/'/g, '&#039;');

const printImportedVrRows = ({ rows, fileName, competencia }: { rows: ImportedVrRow[]; fileName: string; competencia: string }) => {
  const total = rows.reduce((sum, row) => sum + row.valorTotal, 0);
  const win = window.open('', '_blank');
  if (!win) {
    toast.error('Não foi possível abrir a impressão. Libere pop-ups para o TOPAC.');
    return;
  }
  win.document.write(`<!doctype html><html lang=\"pt-BR\"><head><meta charset=\"utf-8\" />
    <title>Relatório VR importado</title>
    <style>
      @page { size: A4; margin: 12mm; }
      body { font-family: Arial, sans-serif; color: #111; padding: 12px; }
      header { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #111; padding-bottom: 12px; margin-bottom: 16px; }
      h1 { font-size: 18px; margin: 0 0 4px; }
      p { margin: 0; font-size: 11px; color: #555; }
      table { width: 100%; border-collapse: collapse; font-size: 10px; }
      th, td { border: 1px solid #bbb; padding: 5px 6px; text-align: left; }
      th { background: #e5e7eb; font-size: 9px; text-transform: uppercase; }
      td.num, th.num { text-align: right; }
      tfoot td { font-weight: 700; background: #f3f4f6; }
    </style></head><body>
    <header>
      <div><h1>RELATÓRIO DE VALE REFEIÇÃO - IMPORTADO</h1><p>Arquivo: ${escapeHtml(fileName || '-')}</p></div>
      <div style=\"text-align:right\"><p>Competência: ${escapeHtml(competenciaPt(competencia))}</p><p>Registros: ${rows.length}</p><p>Emitido em ${new Date().toLocaleString('pt-BR')}</p></div>
    </header>
    <table><thead><tr><th>Nome</th><th>Função</th><th>CPF</th><th class=\"num\">VR/Dia</th><th class=\"num\">Dias Prev.</th><th class=\"num\">Desc.</th><th class=\"num\">Dias Finais</th><th class=\"num\">Valor Total</th><th>Motivo</th></tr></thead><tbody>
      ${rows.map(row => `<tr><td>${escapeHtml(row.nome)}</td><td>${escapeHtml(row.cargo)}</td><td>${escapeHtml(row.cpf)}</td><td class=\"num\">${formatCurrency(row.valorDiario)}</td><td class=\"num\">${row.diasPrevistos || ''}</td><td class=\"num\">${row.diasDescontados || ''}</td><td class=\"num\">${row.diasFinais || ''}</td><td class=\"num\"><strong>${formatCurrency(row.valorTotal)}</strong></td><td>${escapeHtml(row.motivo || '-')}</td></tr>`).join('')}
    </tbody><tfoot><tr><td colspan=\"7\">TOTAL</td><td class=\"num\">${formatCurrency(total)}</td><td></td></tr></tfoot></table>
  </body></html>`);
  win.document.close();
  win.focus();
  window.setTimeout(() => win.print(), 500);
};

const normalizeSearchText = (value: unknown) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();

const isGuincheiroEmployee = (employee: { name?: string; cargo?: string; setorGhe?: string; observacoes?: string; [key: string]: unknown }) => {
  const text = normalizeSearchText([
    employee.cargo,
    employee.setorGhe,
    employee.observacoes,
    employee.name,
  ].join(' '));
  return text.includes('guincheir') || text.includes('motorista guincho') || /\bguincho\b/.test(text);
};

const RelatorioVRPage: React.FC = () => {
  const { companies, employees, entries, getOrCreateEntries, addBenefitReport, getFechamento, userRoles, updateEmployee, refreshData } = useApp();
  const isAdmin = userRoles?.includes('admin');
  const correcoes = useRecibosCorrecoes({ tipo: 'vr', competencia: undefined });
  const [editingRow, setEditingRow] = useState<BenefitReportRow | null>(null);
  const navigate = useNavigate();
  const [selectedCompany, setSelectedCompany] = useState('');
  const [competencia, setCompetencia] = useState(new Date().toISOString().slice(0, 7));
  const [generated, setGenerated] = useState(false);
  const [selectedEmployees, setSelectedEmployees] = useState<Set<string>>(new Set());
  const [multiCompanies, setMultiCompanies] = useState<Set<string>>(new Set());
  const [formato, setFormato] = useState<'vr' | 'ambos'>('vr');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewRows, setPreviewRows] = useState<BenefitReportRow[]>([]);
  const [importFileName, setImportFileName] = useState('');
  const [importRows, setImportRows] = useState<ImportedVrRow[]>([]);
  const [vrBulkValue, setVrBulkValue] = useState('31,00');
  const [vrBulkCompany, setVrBulkCompany] = useState(ALL_COMPANIES);
  const [vrBulkMode, setVrBulkMode] = useState<VrBulkMode>('sem_guincheiros');
  const [updatingVr, setUpdatingVr] = useState(false);

  const [competenciaEmpresa, setCompetenciaEmpresa] = useState(new Date().toISOString().slice(0, 7));
  const [diasUteisManual, setDiasUteisManual] = useState('');
  const [diasUteisEmpresaManual, setDiasUteisEmpresaManual] = useState('');
  const [dataPagamentoManual, setDataPagamentoManual] = useState('');
  const [dataPagamentoEmpresaManual, setDataPagamentoEmpresaManual] = useState('');

  const isAllCompanies = selectedCompany === ALL_COMPANIES;
  const reportCompanyIds = useMemo(
    () => isAllCompanies ? companies.map(c => c.id) : (selectedCompany ? [selectedCompany] : []),
    [companies, isAllCompanies, selectedCompany],
  );
  const companyNameById = useMemo(() => new Map<string, string>(companies.map(c => [c.id, c.name])), [companies]);

  const { datas: feriadosDatas } = useFeriados(competencia, isAllCompanies ? undefined : selectedCompany);
  const diasUteisCalculado = getWorkingDays(competencia, feriadosDatas);
  const diasUteis = Number(diasUteisManual) > 0 ? Number(diasUteisManual) : diasUteisCalculado;
  const diasUteisEmpresa = Number(diasUteisEmpresaManual) > 0 ? Number(diasUteisEmpresaManual) : undefined;
  const fechamento = isAllCompanies ? { dataFechamento: '' } : getFechamento(selectedCompany, competencia);
  const dataFechamento = fechamento.dataFechamento || '';

  const handleGenerate = () => {
    if (!selectedCompany) { toast.error('Selecione uma empresa'); return; }
    reportCompanyIds.forEach(companyId => getOrCreateEntries(companyId, competencia));
    setGenerated(true);
    setSelectedEmployees(new Set());
    toast.success(isAllCompanies ? 'Relatório de VR de todas as empresas gerado!' : 'Relatório de VR gerado!');
  };

  const handleAtualizarVrValor = async () => {
    if (!isAdmin) {
      toast.error('Apenas administrador pode atualizar VR em lote.');
      return;
    }
    const valor = roundCurrency(parseNumber(vrBulkValue));
    if (valor <= 0) {
      toast.error('Informe um valor de VR maior que zero.');
      return;
    }
    const scopedEmployees = employees.filter(emp => {
      if (emp.status !== 'ativo' || !emp.vrAtivo) return false;
      return vrBulkCompany === ALL_COMPANIES || emp.companyId === vrBulkCompany;
    });
    const targets = scopedEmployees.filter(emp => {
      const guincheiro = isGuincheiroEmployee(emp);
      if (vrBulkMode === 'sem_guincheiros') return !guincheiro;
      if (vrBulkMode === 'somente_guincheiros') return guincheiro;
      return true;
    });
    if (targets.length === 0) {
      toast.info('Nenhum funcionário ativo com VR encontrado para esse filtro.');
      return;
    }

    setUpdatingVr(true);
    try {
      await Promise.all(targets.map(emp => Promise.resolve(updateEmployee(emp.id, { vrDiario: valor }))));
      await refreshData();
      setGenerated(false);
      const empresaLabel = vrBulkCompany === ALL_COMPANIES
        ? 'todas as empresas'
        : (companies.find(c => c.id === vrBulkCompany)?.name || 'empresa selecionada');
      const modoLabel = vrBulkMode === 'sem_guincheiros'
        ? 'exceto guincheiros'
        : vrBulkMode === 'somente_guincheiros'
          ? 'somente guincheiros'
          : 'todos com VR ativo';
      toast.success(`VR atualizado para ${formatCurrency(valor)} em ${targets.length} funcionário(s) de ${empresaLabel} (${modoLabel}).`);
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível atualizar o VR em lote.');
    } finally {
      setUpdatingVr(false);
    }
  };

  const handleImportVrFile = async (file?: File | null) => {
    if (!file) return;
    try {
      const lower = file.name.toLowerCase();
      let rawRows: Array<Record<string, unknown>> = [];
      if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
        const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
        const firstSheet = workbook.SheetNames[0];
        rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[firstSheet], { defval: '' });
      } else {
        rawRows = parseDelimitedText(await file.text());
      }
      const parsed = buildImportedVrRows(rawRows);
      if (!parsed.length) {
        toast.error('Não encontrei linhas de VR no arquivo. Confira se existe coluna de nome e valor/dias.');
        return;
      }
      setImportFileName(file.name);
      setImportRows(parsed);
      toast.success(`${parsed.length} linha(s) importada(s) do arquivo de VR.`);
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível ler o arquivo de VR.');
    }
  };

  const compEmps = employees
    .filter(e => reportCompanyIds.includes(e.companyId) && e.status === 'ativo')
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const compEntries = entries.filter(e => reportCompanyIds.includes(e.companyId) && e.competencia === competencia);
  const company = isAllCompanies ? undefined : companies.find(c => c.id === selectedCompany);

  const rawRows = useMemo(() => buildVRReportRows(compEmps, compEntries, diasUteis), [compEmps, compEntries, diasUteis]);
  const rows = useMemo<BenefitReportRow[]>(() => rawRows.map(r => {
    const correctionCompanyId = isAllCompanies ? r.emp.companyId : selectedCompany;
    const c = correcoes.findFor('vr', correctionCompanyId, r.emp.id, competencia);
    if (!c) return r;
    return {
      ...r,
      valorDiario: Number(c.valor_diario_corrigido ?? r.valorDiario),
      diasFinais: Number(c.dias_finais_corrigido ?? r.diasFinais),
      valorTotal: Number(c.valor_total_corrigido ?? r.valorTotal),
      corrigido: true,
      correcaoMotivo: c.motivo,
      correcaoObservacao: c.observacao,
    };
  }), [rawRows, correcoes, selectedCompany, competencia, isAllCompanies]);
  const totalFinal = useMemo(() => sumBenefitRows(rows), [rows]);
  const importTotal = useMemo(() => roundCurrency(importRows.reduce((sum, row) => sum + row.valorTotal, 0)), [importRows]);
  const emissaoDate = new Date().toLocaleDateString('pt-BR');
  const pagamentoDate = getFirstBusinessDayOfNextMonth(competencia);

  const handlePrintRelatorio = () => {
    if (!selectedCompany) { toast.error('Selecione uma empresa'); return; }
    reportCompanyIds.forEach(companyId => addBenefitReport({ type: 'vr', companyId, competencia }));
    const params = new URLSearchParams(isAllCompanies
      ? { empresas: ALL_COMPANIES, competencia }
      : { empresa: selectedCompany, competencia },
    );
    if (Number(diasUteisManual) > 0) params.set('diasUteis', String(Number(diasUteisManual)));
    navigate(`/relatorio-vr-impressao?${params.toString()}`);
  };

  const goRecibos = (empresas: string[], funcionarios?: string[], formatoOverride?: 'vr' | 'vt' | 'ambos') => {
    const empresasLimpas = empresas.map(s => (s || '').trim()).filter(Boolean);
    if (empresasLimpas.length === 0) { toast.error('Selecione uma empresa antes de gerar recibos'); return; }
    if (!competencia) { toast.error('Selecione a competência'); return; }
    const params = new URLSearchParams({ formato: formatoOverride || formato, competencia, empresas: empresasLimpas.join(',') });
    if (Number(diasUteisManual) > 0) params.set('diasUteis', String(Number(diasUteisManual)));
    if (dataPagamentoManual) params.set('dataPagamento', dataPagamentoManual);
    if (funcionarios && funcionarios.length) params.set('funcionarios', funcionarios.join(','));
    window.open(`/recibos-beneficio?${params.toString()}`, '_blank');
  };

  const handleReciboIndividual = (empId: string) => goRecibos([selectedCompany], [empId]);
  const handleRecibosSelecionados = () => {
    if (selectedEmployees.size === 0) { toast.error('Selecione ao menos um funcionário'); return; }
    goRecibos([selectedCompany], Array.from(selectedEmployees));
  };
  const handleRecibosEmpresa = () => goRecibos([selectedCompany]);
  const handleRecibosTodasEmpresas = () => {
    if (!competenciaEmpresa) { toast.error('Selecione a competência'); return; }
    companies.forEach(c => getOrCreateEntries(c.id, competenciaEmpresa));
    const params = new URLSearchParams({ formato, competencia: competenciaEmpresa, empresas: companies.map(c => c.id).join(',') });
    if (diasUteisEmpresa) params.set('diasUteis', String(diasUteisEmpresa));
    if (dataPagamentoEmpresaManual) params.set('dataPagamento', dataPagamentoEmpresaManual);
    window.open(`/recibos-beneficio?${params.toString()}`, '_blank');
  };
  const handleRecibosEmpresasSelecionadas = () => {
    if (multiCompanies.size === 0) { toast.error('Selecione ao menos uma empresa'); return; }
    if (!competenciaEmpresa) { toast.error('Selecione a competência'); return; }
    Array.from(multiCompanies).forEach(cid => getOrCreateEntries(cid, competenciaEmpresa));
    const params = new URLSearchParams({ formato, competencia: competenciaEmpresa, empresas: Array.from(multiCompanies).join(',') });
    if (diasUteisEmpresa) params.set('diasUteis', String(diasUteisEmpresa));
    if (dataPagamentoEmpresaManual) params.set('dataPagamento', dataPagamentoEmpresaManual);
    window.open(`/recibos-beneficio?${params.toString()}`, '_blank');
  };

  const toggleEmp = (id: string) => {
    setSelectedEmployees(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };
  const toggleAllEmps = () => {
    setSelectedEmployees(prev => prev.size === rows.length ? new Set() : new Set(rows.map(r => r.emp.id)));
  };
  const toggleCompany = (id: string) => {
    setMultiCompanies(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="card-premium p-6 gradient-primary text-primary-foreground">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-primary-foreground/20 rounded-2xl flex items-center justify-center">
            <UtensilsCrossed className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display">Relatório & Recibos de VR</h1>
            <p className="text-primary-foreground/70 text-sm">Vale Refeição — relatório consolidado e emissão de recibos individuais</p>
          </div>
        </div>
      </div>

      <div className="card-premium p-5 flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Empresa</label>
          <select value={selectedCompany} onChange={e => { setSelectedCompany(e.target.value); setGenerated(false); }}
            className="border rounded-lg px-3 py-2 text-sm bg-background text-foreground min-w-[200px]">
            <option value="">Selecionar Empresa</option>
            <option value={ALL_COMPANIES}>Todas as empresas</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Competência</label>
          <Input type="month" value={competencia} onChange={e => { setCompetencia(e.target.value); setGenerated(false); }} className="w-48" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Formato dos recibos</label>
          <select value={formato} onChange={(e) => setFormato(e.target.value as 'vr' | 'ambos')} className="border rounded-lg px-3 py-2 text-sm bg-background text-foreground">
            <option value="vr">Somente VR</option>
            <option value="ambos">VR + VT na mesma folha</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Dias uteis pagos (opcional)</label>
          <Input type="number" min="1" step="1" value={diasUteisManual}
            onChange={e => { setDiasUteisManual(e.target.value); setGenerated(false); }}
            placeholder={String(diasUteisCalculado)} className="w-32" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Data pagamento (opcional)</label>
          <Input type="date" value={dataPagamentoManual} onChange={e => setDataPagamentoManual(e.target.value)} className="w-40" />
        </div>
        <span className="text-xs text-muted-foreground">Dias uteis: <strong className="text-foreground">{diasUteis}</strong>{diasUteisManual ? ' (manual)' : ''}</span>
        <Button onClick={handleGenerate} className="gradient-accent text-accent-foreground font-semibold">
          <FileText className="w-4 h-4 mr-2" /> Gerar Relatório
        </Button>
      </div>

      {isAdmin && (
        <div className="card-premium p-5 space-y-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-1 h-5 w-5 text-primary" />
            <div>
              <h3 className="font-semibold text-sm">Atualização de valor do VR</h3>
              <p className="text-xs text-muted-foreground">Atualize o VR diario por empresa ou para todas, mantendo guincheiros separados quando necessario.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Valor diário</label>
              <Input value={vrBulkValue} onChange={e => setVrBulkValue(e.target.value)} placeholder="31,00" className="w-32" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Empresa</label>
              <select value={vrBulkCompany} onChange={e => setVrBulkCompany(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm bg-background text-foreground min-w-[220px]">
                <option value={ALL_COMPANIES}>Todas as empresas</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Funcionários</label>
              <select value={vrBulkMode} onChange={e => setVrBulkMode(e.target.value as VrBulkMode)}
                className="border rounded-lg px-3 py-2 text-sm bg-background text-foreground min-w-[220px]">
                <option value="sem_guincheiros">Todos, exceto guincheiros</option>
                <option value="todos">Todos com VR ativo</option>
                <option value="somente_guincheiros">Somente guincheiros</option>
              </select>
            </div>
            <Button type="button" onClick={handleAtualizarVrValor} disabled={updatingVr} variant="outline" className="font-semibold">
              {updatingVr ? 'Atualizando VR...' : 'Atualizar valor do VR'}
            </Button>
          </div>
        </div>
      )}

      <div className="card-premium p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <FileSpreadsheet className="mt-1 h-5 w-5 text-primary" />
            <div>
              <h3 className="font-semibold text-sm">Importar VR por XLSX/TXT</h3>
              <p className="text-xs text-muted-foreground">Aceita XLSX, XLS, CSV ou TXT com colunas: Nome, Cargo/Função, VR Dia, Dias, Descontos/Faltas, Valor Total e Motivo.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex cursor-pointer items-center rounded-md border border-border px-3 py-2 text-sm hover:bg-muted">
              <Upload className="mr-2 h-4 w-4" /> Escolher arquivo
              <input type="file" accept=".xlsx,.xls,.csv,.txt,text/plain" className="hidden" onChange={(e) => handleImportVrFile(e.target.files?.[0])} />
            </label>
            <Button type="button" variant="outline" size="sm" disabled={!importRows.length} onClick={() => printImportedVrRows({ rows: importRows, fileName: importFileName, competencia })}>
              <Printer className="mr-2 h-4 w-4" /> Imprimir importado / PDF
            </Button>
            {importRows.length > 0 && (
              <Button type="button" variant="ghost" size="sm" onClick={() => { setImportRows([]); setImportFileName(''); }}>
                Limpar
              </Button>
            )}
          </div>
        </div>
        {importRows.length > 0 && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
              <span className="truncate">Arquivo: <strong>{importFileName}</strong></span>
              <span>Total importado: <strong className="text-success">{formatCurrency(importTotal)}</strong> · {importRows.length} linha(s)</span>
            </div>
            <div className="max-h-72 overflow-auto rounded-lg border border-border">
              <table className="w-full min-w-[860px] text-xs">
                <thead className="bg-muted/50 text-muted-foreground uppercase">
                  <tr>
                    {['Nome','Função','CPF','VR/Dia','Dias Prev.','Desc.','Dias Finais','Valor Total','Motivo'].map(h => <th key={h} className="px-2 py-2 text-left">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {importRows.map((row, index) => (
                    <tr key={`${row.nome}-${index}`} className="border-t border-border">
                      <td className="px-2 py-2 font-medium">{row.nome || '—'}</td>
                      <td className="px-2 py-2 text-muted-foreground">{row.cargo || '—'}</td>
                      <td className="px-2 py-2 text-muted-foreground">{row.cpf || '—'}</td>
                      <td className="px-2 py-2">{formatCurrency(row.valorDiario)}</td>
                      <td className="px-2 py-2 text-center">{row.diasPrevistos || '—'}</td>
                      <td className="px-2 py-2 text-center text-destructive">{row.diasDescontados || '—'}</td>
                      <td className="px-2 py-2 text-center">{row.diasFinais || '—'}</td>
                      <td className="px-2 py-2 font-bold">{formatCurrency(row.valorTotal)}</td>
                      <td className="px-2 py-2 text-muted-foreground">{row.motivo || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Recibos em massa por empresa(s) — sempre disponíveis */}
      <div className="card-premium p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm">Recibos por empresa</h3>
        </div>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Competência (mês)</label>
            <Input type="month" value={competenciaEmpresa} onChange={e => setCompetenciaEmpresa(e.target.value)} className="w-44" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Dias pagos (opcional)</label>
            <Input type="number" min="1" step="1" value={diasUteisEmpresaManual}
              onChange={e => setDiasUteisEmpresaManual(e.target.value)}
              placeholder="auto" className="w-28" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Data pagamento</label>
            <Input type="date" value={dataPagamentoEmpresaManual} onChange={e => setDataPagamentoEmpresaManual(e.target.value)} className="w-40" />
          </div>
          <Button onClick={handleRecibosTodasEmpresas} variant="outline" size="sm">
            <Printer className="w-4 h-4 mr-2" /> Recibos de todas as empresas
          </Button>
          <Button onClick={handleRecibosEmpresasSelecionadas} variant="outline" size="sm" disabled={multiCompanies.size === 0}>
            <Printer className="w-4 h-4 mr-2" /> Recibos das empresas selecionadas ({multiCompanies.size})
          </Button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-40 overflow-y-auto border rounded-lg p-3">
          {companies.map(c => (
            <label key={c.id} className="flex items-center gap-2 text-xs cursor-pointer">
              <Checkbox checked={multiCompanies.has(c.id)} onCheckedChange={() => toggleCompany(c.id)} />
              <span className="truncate">{c.name}</span>
            </label>
          ))}
        </div>
      </div>

      {generated && (company || isAllCompanies) && (
        <div className="card-premium p-5 overflow-x-auto space-y-3">
          <div className="flex flex-wrap justify-between gap-3">
            <div>
              <h2 className="font-bold text-foreground">{isAllCompanies ? 'Todas as empresas' : company?.name}</h2>
              <p className="text-xs text-muted-foreground">
                {isAllCompanies ? `${companies.length} empresas` : `CNPJ: ${company?.cnpj}`} — Competência: {competenciaPt(competencia)} — Dias úteis: {diasUteis}
              </p>
              <p className="text-xs text-muted-foreground">
                Emissão: {emissaoDate} — Pagamento previsto: {pagamentoDate}
                {dataFechamento ? ` — Fechamento: ${new Date(dataFechamento).toLocaleDateString('pt-BR')}` : ''}
              </p>
            </div>
            <div className="text-right text-sm">
              <p>Total Final: <strong className="text-success">{formatCurrency(totalFinal)}</strong></p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 items-center border-t pt-3">
            <span className="text-xs font-semibold text-muted-foreground mr-2">RELATÓRIO:</span>
            <Button onClick={handlePrintRelatorio} variant="default" size="sm">
              <Printer className="w-4 h-4 mr-2" /> {isAllCompanies ? 'Imprimir relatório de todas / PDF' : 'Imprimir / PDF do Relatório'}
            </Button>
            {!isAllCompanies && (
              <>
                <span className="text-xs font-semibold text-muted-foreground ml-4 mr-2">RECIBOS:</span>
                <Button onClick={handleRecibosEmpresa} size="sm" variant="outline">
                  <FileText className="w-4 h-4 mr-2" /> Recibos da empresa
                </Button>
                <Button onClick={handleRecibosSelecionados} size="sm" variant="outline" disabled={selectedEmployees.size === 0}>
                  <FileText className="w-4 h-4 mr-2" /> Recibos selecionados ({selectedEmployees.size})
                </Button>
                <Button
                  onClick={() => {
                    const base = selectedEmployees.size > 0 ? rows.filter(r => selectedEmployees.has(r.emp.id)) : rows;
                    if (base.length === 0) { toast.error('Sem dados para pré-visualizar'); return; }
                    setPreviewRows(base);
                    setPreviewOpen(true);
                  }}
                  size="sm"
                  variant="secondary"
                >
                  <Eye className="w-4 h-4 mr-2" /> Pré-visualizar recibos
                </Button>
              </>
            )}
          </div>

          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-2 py-2 text-left">
                  {!isAllCompanies && <Checkbox checked={selectedEmployees.size === rows.length && rows.length > 0} onCheckedChange={toggleAllEmps} />}
                </th>
                {(isAllCompanies ? ['Empresa', 'Nome', 'Função', 'VR/Dia', 'Dias Prev.', 'Desc.', 'Dias Finais', 'Valor Total', 'Motivo', ''] : ['Nome', 'Função', 'VR/Dia', 'Dias Prev.', 'Desc.', 'Dias Finais', 'Valor Total', 'Motivo', '']).map(h => (
                  <th key={h} className="px-2 py-2 text-left font-medium text-muted-foreground uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={`${r.emp.companyId}-${r.emp.id}`} className="border-b hover:bg-muted/20">
                  <td className="px-2 py-2">
                    {!isAllCompanies && <Checkbox checked={selectedEmployees.has(r.emp.id)} onCheckedChange={() => toggleEmp(r.emp.id)} />}
                  </td>
                  {isAllCompanies && <td className="px-2 py-2 text-muted-foreground">{companyNameById.get(r.emp.companyId) || '—'}</td>}
                  <td className="px-2 py-2 font-medium">
                    <div className="flex items-center gap-2">
                      <span>{r.emp.name}</span>
                      {r.corrigido && (
                        <Badge variant="secondary" className="text-[9px] gap-1" title={r.correcaoMotivo || ''}>
                          <ShieldCheck className="w-3 h-3" /> Corrigido
                        </Badge>
                      )}
                    </div>
                    {r.corrigido && r.correcaoMotivo && (
                      <p className="text-[10px] text-muted-foreground italic">{r.correcaoMotivo}</p>
                    )}
                  </td>
                  <td className="px-2 py-2 text-muted-foreground">{r.emp.cargo}</td>
                  <td className="px-2 py-2">{formatCurrency(r.valorDiario)}</td>
                  <td className="px-2 py-2 text-center">{r.diasPrevistos}</td>
                  <td className="px-2 py-2 text-center text-destructive">{r.diasDescontados > 0 ? r.diasDescontados : '—'}</td>
                  <td className="px-2 py-2 text-center">{r.diasFinais}</td>
                  <td className="px-2 py-2 font-bold">{formatCurrency(r.valorTotal)}</td>
                  <td className="px-2 py-2 text-muted-foreground">{r.motivo || '—'}</td>
                  <td className="px-2 py-2 flex gap-2">
                    {!isAllCompanies && (
                      <button onClick={() => handleReciboIndividual(r.emp.id)} title="Imprimir recibo individual" className="text-primary hover:text-primary/80">
                        <Printer className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {isAdmin && !isAllCompanies && (
                      <button onClick={() => setEditingRow(r)} title="Corrigir recibo" className="text-amber-600 hover:text-amber-700">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {!isAllCompanies && (
                      <button onClick={() => navigate(`/relatorio-beneficio-individual?empresa=${selectedCompany}&competencia=${competencia}&funcionario=${r.emp.id}`)} title="Ficha individual" className="text-muted-foreground hover:text-foreground">
                        <User className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t bg-muted/30 font-bold">
                <td colSpan={isAllCompanies ? 8 : 7} className="px-2 py-2">TOTAL</td>
                <td className="px-2 py-2">{formatCurrency(totalFinal)}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <RecibosPreviewModal
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        tipo="vr"
        company={company}
        competencia={competencia}
        rows={previewRows}
        onPrint={() => {
          setPreviewOpen(false);
          const ids = previewRows.length === rows.length ? undefined : previewRows.map(r => r.emp.id);
          goRecibos([selectedCompany], ids, 'vr');
        }}
      />

      <ReciboCorrecaoModal
        open={!!editingRow}
        onOpenChange={(o) => !o && setEditingRow(null)}
        tipo="vr"
        companyId={selectedCompany}
        companyName={company?.name || ''}
        competencia={competencia}
        row={editingRow}
        existing={editingRow ? correcoes.findFor('vr', selectedCompany, editingRow.emp.id, competencia) : undefined}
        defaultDataPagamento={pagamentoDate}
        onSave={correcoes.upsert}
        onRemove={correcoes.remove}
      />
    </div>
  );
};

export default RelatorioVRPage;
