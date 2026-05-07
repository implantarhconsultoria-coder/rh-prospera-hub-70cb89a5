import React, { useState, useMemo } from 'react';
import { useApp } from '@/context/AppContext';
import { getWorkingDays, getFirstBusinessDayOfNextMonth } from '@/lib/workingDays';
import { useFeriados } from '@/hooks/useFeriados';
import { formatCurrency } from '@/lib/calculations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Bus, FileText, User, Printer, Building2, Pencil, ShieldCheck, Eye } from 'lucide-react';
import RecibosPreviewModal from '@/components/RecibosPreviewModal';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { buildVTReportRows, sumBenefitRows, type BenefitReportRow } from '@/lib/benefitReports';
import { useRecibosCorrecoes } from '@/hooks/useRecibosCorrecoes';
import ReciboCorrecaoModal from '@/components/ReciboCorrecaoModal';

const MESES_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const competenciaPt = (c: string) => {
  const [y, m] = (c || '').split('-');
  const idx = Number(m) - 1;
  return idx >= 0 && idx < 12 ? `${MESES_PT[idx]} / ${y}` : c;
};

const RelatorioVTPage: React.FC = () => {
  const { companies, employees, entries, getOrCreateEntries, addBenefitReport, getFechamento, userRoles } = useApp();
  const isAdmin = userRoles?.includes('admin');
  const correcoes = useRecibosCorrecoes({ tipo: 'vt' });
  const [editingRow, setEditingRow] = useState<BenefitReportRow | null>(null);
  const navigate = useNavigate();
  const [selectedCompany, setSelectedCompany] = useState('');
  const [competencia, setCompetencia] = useState(new Date().toISOString().slice(0, 7));
  const [generated, setGenerated] = useState(false);
  const [selectedEmployees, setSelectedEmployees] = useState<Set<string>>(new Set());
  const [multiCompanies, setMultiCompanies] = useState<Set<string>>(new Set());
  const [formato, setFormato] = useState<'vt' | 'ambos'>('vt');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewRows, setPreviewRows] = useState<BenefitReportRow[]>([]);
  const [competenciaEmpresa, setCompetenciaEmpresa] = useState(new Date().toISOString().slice(0, 7));

  const { datas: feriadosDatas } = useFeriados(competencia, selectedCompany);
  const diasUteis = getWorkingDays(competencia, feriadosDatas);
  const fechamento = getFechamento(selectedCompany, competencia);
  const dataFechamento = fechamento.dataFechamento || '';

  const handleGenerate = () => {
    if (!selectedCompany) { toast.error('Selecione uma empresa'); return; }
    getOrCreateEntries(selectedCompany, competencia);
    setGenerated(true);
    setSelectedEmployees(new Set());
    toast.success('Relatório de VT gerado!');
  };

  const compEmps = employees.filter(e => e.companyId === selectedCompany && e.status === 'ativo' && e.categoria === 'operacional' && e.vtAtivo);
  const compEntries = entries.filter(e => e.companyId === selectedCompany && e.competencia === competencia);
  const company = companies.find(c => c.id === selectedCompany);

  const rawRows = useMemo(() => buildVTReportRows(compEmps, compEntries, diasUteis), [compEmps, compEntries, diasUteis]);
  const rows = useMemo<BenefitReportRow[]>(() => rawRows.map(r => {
    const c = correcoes.findFor('vt', selectedCompany, r.emp.id, competencia);
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
  }), [rawRows, correcoes, selectedCompany, competencia]);
  const totalFinal = useMemo(() => sumBenefitRows(rows), [rows]);
  const emissaoDate = new Date().toLocaleDateString('pt-BR');
  const pagamentoDate = getFirstBusinessDayOfNextMonth(competencia);

  const handlePrintRelatorio = () => {
    addBenefitReport({ type: 'vt', companyId: selectedCompany, competencia });
    navigate(`/relatorio-vt-impressao?empresa=${selectedCompany}&competencia=${competencia}`);
  };

  const handlePrintConsolidadoTodas = () => {
    if (!competenciaEmpresa) { toast.error('Selecione a competência'); return; }
    companies.forEach(c => getOrCreateEntries(c.id, competenciaEmpresa));
    const ids = companies.map(c => c.id).join(',');
    window.open(`/relatorio-vt-impressao?empresas=${ids}&competencia=${competenciaEmpresa}`, '_blank');
  };

  const handlePrintConsolidadoSelecionadas = () => {
    if (multiCompanies.size === 0) { toast.error('Selecione ao menos uma empresa'); return; }
    if (!competenciaEmpresa) { toast.error('Selecione a competência'); return; }
    Array.from(multiCompanies).forEach(cid => getOrCreateEntries(cid, competenciaEmpresa));
    const ids = Array.from(multiCompanies).join(',');
    window.open(`/relatorio-vt-impressao?empresas=${ids}&competencia=${competenciaEmpresa}`, '_blank');
  };

  const goRecibos = (empresas: string[], funcionarios?: string[], formatoOverride?: 'vr' | 'vt' | 'ambos') => {
    const empresasLimpas = empresas.map(s => (s || '').trim()).filter(Boolean);
    if (empresasLimpas.length === 0) { toast.error('Selecione uma empresa antes de gerar recibos'); return; }
    if (!competencia) { toast.error('Selecione a competência'); return; }
    const params = new URLSearchParams({ formato: formatoOverride || formato, competencia, empresas: empresasLimpas.join(',') });
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
    window.open(`/recibos-beneficio?${params.toString()}`, '_blank');
  };
  const handleRecibosEmpresasSelecionadas = () => {
    if (multiCompanies.size === 0) { toast.error('Selecione ao menos uma empresa'); return; }
    if (!competenciaEmpresa) { toast.error('Selecione a competência'); return; }
    Array.from(multiCompanies).forEach(cid => getOrCreateEntries(cid, competenciaEmpresa));
    const params = new URLSearchParams({ formato, competencia: competenciaEmpresa, empresas: Array.from(multiCompanies).join(',') });
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
            <Bus className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display">Relatório & Recibos de VT</h1>
            <p className="text-primary-foreground/70 text-sm">Vale Transporte — relatório consolidado e emissão de recibos individuais</p>
          </div>
        </div>
      </div>

      <div className="card-premium p-5 flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Empresa</label>
          <select value={selectedCompany} onChange={e => { setSelectedCompany(e.target.value); setGenerated(false); }}
            className="border rounded-lg px-3 py-2 text-sm bg-background text-foreground min-w-[200px]">
            <option value="">Selecionar Empresa</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Competência</label>
          <Input type="month" value={competencia} onChange={e => { setCompetencia(e.target.value); setGenerated(false); }} className="w-48" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Formato dos recibos</label>
          <select value={formato} onChange={(e) => setFormato(e.target.value as 'vt' | 'ambos')} className="border rounded-lg px-3 py-2 text-sm bg-background text-foreground">
            <option value="vt">Somente VT</option>
            <option value="ambos">VR + VT na mesma folha</option>
          </select>
        </div>
        <span className="text-xs text-muted-foreground">Dias úteis: <strong className="text-foreground">{diasUteis}</strong></span>
        <Button onClick={handleGenerate} className="gradient-accent text-accent-foreground font-semibold">
          <FileText className="w-4 h-4 mr-2" /> Gerar Relatório
        </Button>
      </div>

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
          <Button onClick={handleRecibosTodasEmpresas} variant="outline" size="sm">
            <Printer className="w-4 h-4 mr-2" /> Recibos de todas as empresas
          </Button>
          <Button onClick={handleRecibosEmpresasSelecionadas} variant="outline" size="sm" disabled={multiCompanies.size === 0}>
            <Printer className="w-4 h-4 mr-2" /> Recibos das empresas selecionadas ({multiCompanies.size})
          </Button>
          <Button onClick={handlePrintConsolidadoTodas} size="sm">
            <Printer className="w-4 h-4 mr-2" /> Relatório consolidado (todas)
          </Button>
          <Button onClick={handlePrintConsolidadoSelecionadas} size="sm" disabled={multiCompanies.size === 0}>
            <Printer className="w-4 h-4 mr-2" /> Relatório consolidado (selecionadas)
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

      {generated && company && (
        <div className="card-premium p-5 overflow-x-auto space-y-3">
          <div className="flex flex-wrap justify-between gap-3">
            <div>
              <h2 className="font-bold text-foreground">{company.name}</h2>
              <p className="text-xs text-muted-foreground">CNPJ: {company.cnpj} — Competência: {competenciaPt(competencia)} — Dias úteis: {diasUteis}</p>
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
              <Printer className="w-4 h-4 mr-2" /> Imprimir / PDF do Relatório
            </Button>
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
          </div>

          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-2 py-2 text-left">
                  <Checkbox checked={selectedEmployees.size === rows.length && rows.length > 0} onCheckedChange={toggleAllEmps} />
                </th>
                {['Nome', 'Função', 'VT/Dia', 'Dias Prev.', 'Desc.', 'Dias Finais', 'Valor Total', 'Motivo', ''].map(h => (
                  <th key={h} className="px-2 py-2 text-left font-medium text-muted-foreground uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.emp.id} className="border-b hover:bg-muted/20">
                  <td className="px-2 py-2">
                    <Checkbox checked={selectedEmployees.has(r.emp.id)} onCheckedChange={() => toggleEmp(r.emp.id)} />
                  </td>
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
                    <button onClick={() => handleReciboIndividual(r.emp.id)} title="Imprimir recibo individual" className="text-primary hover:text-primary/80">
                      <Printer className="w-3.5 h-3.5" />
                    </button>
                    {isAdmin && (
                      <button onClick={() => setEditingRow(r)} title="Corrigir recibo" className="text-amber-600 hover:text-amber-700">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button onClick={() => navigate(`/relatorio-beneficio-individual?empresa=${selectedCompany}&competencia=${competencia}&funcionario=${r.emp.id}`)} title="Ficha individual" className="text-muted-foreground hover:text-foreground">
                      <User className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t bg-muted/30 font-bold">
                <td colSpan={7} className="px-2 py-2">TOTAL</td>
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
        tipo="vt"
        company={company}
        competencia={competencia}
        rows={previewRows}
        onPrint={() => {
          setPreviewOpen(false);
          const ids = previewRows.length === rows.length ? undefined : previewRows.map(r => r.emp.id);
          goRecibos([selectedCompany], ids, 'vt');
        }}
      />

      <ReciboCorrecaoModal
        open={!!editingRow}
        onOpenChange={(o) => !o && setEditingRow(null)}
        tipo="vt"
        companyId={selectedCompany}
        companyName={company?.name || ''}
        competencia={competencia}
        row={editingRow}
        existing={editingRow ? correcoes.findFor('vt', selectedCompany, editingRow.emp.id, competencia) : undefined}
        defaultDataPagamento={pagamentoDate}
        onSave={correcoes.upsert}
        onRemove={correcoes.remove}
      />
    </div>
  );
};

export default RelatorioVTPage;
