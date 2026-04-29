import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import { getFirstBusinessDayOfNextMonth, getNextCompetencia, formatCompetencia } from '@/lib/workingDays';
import { formatCurrency } from '@/lib/calculations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Bus, FileText, User, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { buildVTReportRows, sumBenefitRows } from '@/lib/benefitReports';
import { calcularDiasUteisBeneficio, formatFeriadoData, type DiasUteisBeneficio, diasUteisBrutos } from '@/lib/feriados';

const RelatorioVTPage: React.FC = () => {
  const { companies, employees, entries, getOrCreateEntries, addBenefitReport, getFechamento } = useApp();
  const navigate = useNavigate();
  const [selectedCompany, setSelectedCompany] = useState('');
  const [competencia, setCompetencia] = useState(new Date().toISOString().slice(0, 7));
  const [generated, setGenerated] = useState(false);
  const [feriadoInfo, setFeriadoInfo] = useState<DiasUteisBeneficio>({
    diasUteisBrutos: diasUteisBrutos(new Date().toISOString().slice(0, 7)),
    feriadosConsiderados: 0,
    diasUteisFinais: diasUteisBrutos(new Date().toISOString().slice(0, 7)),
    listaFeriados: [],
  });

  const company = companies.find(c => c.id === selectedCompany);
  const diasUteis = feriadoInfo.diasUteisFinais;
  const fechamento = getFechamento(selectedCompany, competencia);
  const dataFechamento = fechamento.dataFechamento || '';

  const recalcularFeriados = async () => {
    if (!company) {
      const brutos = diasUteisBrutos(competencia);
      setFeriadoInfo({ diasUteisBrutos: brutos, feriadosConsiderados: 0, diasUteisFinais: brutos, listaFeriados: [] });
      return;
    }
    const info = await calcularDiasUteisBeneficio(company.name, competencia, company.id);
    setFeriadoInfo(info);
    if (info.feriadosConsiderados === 0) {
      toast.message('Não há feriados cadastrados para esta competência/filial. Cadastre no Calendário de Feriados para o cálculo considerar.');
    }
  };

  useEffect(() => {
    recalcularFeriados();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompany, competencia]);

  const handleGenerate = () => {
    if (!selectedCompany) { toast.error('Selecione uma empresa'); return; }
    getOrCreateEntries(selectedCompany, competencia);
    setGenerated(true);
    toast.success('Relatório de VT gerado!');
  };

  const compEmps = employees.filter(e => e.companyId === selectedCompany && e.status === 'ativo' && e.categoria === 'operacional' && e.vtAtivo);
  const compEntries = entries.filter(e => e.companyId === selectedCompany && e.competencia === competencia);

  const rows = useMemo(() => {
    return buildVTReportRows(compEmps, compEntries, diasUteis);
  }, [compEmps, compEntries, diasUteis]);

  const totalFinal = useMemo(() => sumBenefitRows(rows), [rows]);

  const emissaoDate = getFirstBusinessDayOfNextMonth(competencia);

  const handlePrint = () => {
    addBenefitReport({ type: 'vt', companyId: selectedCompany, competencia });
    navigate(`/relatorio-vt-impressao?empresa=${selectedCompany}&competencia=${competencia}`);
  };

  const handlePrintIndividual = (employeeId: string) => {
    navigate(`/relatorio-beneficio-individual?empresa=${selectedCompany}&competencia=${competencia}&funcionario=${employeeId}&tipo=vt`);
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="card-premium p-6 gradient-primary text-primary-foreground">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-primary-foreground/20 rounded-2xl flex items-center justify-center">
            <Bus className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display">Relatório de VT</h1>
            <p className="text-primary-foreground/70 text-sm">Vale Transporte — cálculo diário por empresa</p>
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
        <span className="text-xs text-muted-foreground">
          Brutos: <strong className="text-foreground">{feriadoInfo.diasUteisBrutos}</strong> ·
          Feriados: <strong className="text-foreground">{feriadoInfo.feriadosConsiderados}</strong> ·
          Finais: <strong className="text-foreground">{feriadoInfo.diasUteisFinais}</strong>
        </span>
        <Button onClick={recalcularFeriados} variant="outline" size="sm">
          <RefreshCw className="w-4 h-4 mr-2" /> Recalcular com feriados
        </Button>
        <Button onClick={handleGenerate} className="gradient-accent text-accent-foreground font-semibold">
          <FileText className="w-4 h-4 mr-2" /> Gerar Relatório de VT
        </Button>
        {generated && (
          <Button onClick={handlePrint} variant="outline"><FileText className="w-4 h-4 mr-2" /> Imprimir / PDF</Button>
        )}
      </div>

      {generated && company && (
        <div className="card-premium p-5 overflow-x-auto">
          <div className="flex justify-between mb-4">
            <div>
              <h2 className="font-bold text-foreground">{company.name}</h2>
              <p className="text-xs text-muted-foreground">CNPJ: {company.cnpj}</p>
              <p className="text-sm font-semibold text-primary">
                Vale Transporte — Competência de apuração: {formatCompetencia(competencia)} —
                Competência de pagamento: {formatCompetencia(getNextCompetencia(competencia))}
              </p>
              <p className="text-xs text-muted-foreground">
                Dias úteis brutos: <strong>{feriadoInfo.diasUteisBrutos}</strong> ·
                Feriados considerados: <strong>{feriadoInfo.feriadosConsiderados}</strong> ·
                Dias úteis finais: <strong>{feriadoInfo.diasUteisFinais}</strong>
              </p>
              <p className="text-xs text-muted-foreground">
                Emissão: {emissaoDate}
                {dataFechamento ? ` — Fechamento: ${new Date(dataFechamento).toLocaleDateString('pt-BR')}` : ''}
              </p>
            </div>
            <div className="text-right text-sm">
              <p>Total Final: <strong className="text-success">{formatCurrency(totalFinal)}</strong></p>
            </div>
          </div>

          <div className="text-[11px] text-muted-foreground mb-3">
            Feriados considerados:{' '}
            {feriadoInfo.listaFeriados.length === 0
              ? 'nenhum'
              : feriadoInfo.listaFeriados.map(f => `${formatFeriadoData(f.data)} - ${f.nome}`).join(' · ')}
          </div>

          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/50">
                {['Nome', 'Função', 'VT/Dia', 'Dias Prev.', 'Desc.', 'Dias Finais', 'Valor Total', 'Motivo', ''].map(h => (
                  <th key={h} className="px-2 py-2 text-left font-medium text-muted-foreground uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.emp.id} className="border-b hover:bg-muted/20">
                  <td className="px-2 py-2 font-medium">{r.emp.name}</td>
                  <td className="px-2 py-2 text-muted-foreground">{r.emp.cargo}</td>
                  <td className="px-2 py-2">{formatCurrency(r.valorDiario)}</td>
                  <td className="px-2 py-2 text-center">{r.diasPrevistos}</td>
                  <td className="px-2 py-2 text-center text-destructive">{r.diasDescontados > 0 ? r.diasDescontados : '—'}</td>
                  <td className="px-2 py-2 text-center">{r.diasFinais}</td>
                  <td className="px-2 py-2 font-bold">{formatCurrency(r.valorTotal)}</td>
                  <td className="px-2 py-2 text-muted-foreground">{r.motivo || '—'}</td>
                  <td className="px-2 py-2">
                    <button onClick={() => handlePrintIndividual(r.emp.id)} title="Ficha individual" className="text-primary hover:text-primary/80">
                      <User className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t bg-muted/30 font-bold">
                <td colSpan={6} className="px-2 py-2">TOTAL</td>
                <td className="px-2 py-2">{formatCurrency(totalFinal)}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
};

export default RelatorioVTPage;
