import React, { useState, useMemo } from 'react';
import { useApp } from '@/context/AppContext';
import { calcTotalFuncionario, calcHE50, calcHE100, calcFalta, calcAtraso, formatCurrency, formatDate } from '@/lib/calculations';
import { getWorkingDays } from '@/lib/workingDays';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileText, Printer, Download, BarChart3, AlertTriangle, DollarSign, Clock, CreditCard } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

const RelatorioPage: React.FC = () => {
  const { companies, employees, entries, getOrCreateEntries, getFechamento } = useApp();
  const navigate = useNavigate();
  const [selectedCompany, setSelectedCompany] = useState('');
  const [competencia, setCompetencia] = useState(new Date().toISOString().slice(0, 7));
  const [generated, setGenerated] = useState(false);

  const company = companies.find(c => c.id === selectedCompany);
  const diasUteis = getWorkingDays(competencia);
  const compEmps = employees.filter(e => e.companyId === selectedCompany && e.status === 'ativo' && e.categoria === 'operacional');
  const compEntries = entries.filter(e => e.companyId === selectedCompany && e.competencia === competencia);
  const fechamento = getFechamento(selectedCompany, competencia);

  const { rows, totals } = useMemo(() => {
    let tProv = 0, tDesc = 0, tLiq = 0, tBen = 0, tIns = 0, tHE = 0, tAdiant = 0, tFaltaDias = 0, tFaltaVal = 0;
    const r = compEmps.map(emp => {
      const entry = compEntries.find(e => e.employeeId === emp.id);
      if (!entry) return null;
      const calc = calcTotalFuncionario(emp, entry, diasUteis);
      const he50Val = calcHE50(emp.salarioBase, entry.he50);
      const he100Val = calcHE100(emp.salarioBase, entry.he100);
      const faltaVal = calcFalta(emp.salarioBase, entry.faltasDias);
      const atrasoVal = calcAtraso(emp.salarioBase, entry.atrasos);
      const insVal = entry.insalubridadeAplicada && emp.insalubridadeAtiva ? emp.insalubridadeValor : 0;

      tProv += calc.proventos; tDesc += calc.descontos; tLiq += calc.liquido;
      tBen += calc.beneficios; tIns += insVal; tHE += he50Val + he100Val;
      tAdiant += entry.adiantamento; tFaltaDias += entry.faltasDias; tFaltaVal += faltaVal;

      return { emp, entry, calc, he50Val, he100Val, faltaVal, atrasoVal, insVal };
    }).filter(Boolean) as any[];

    return {
      rows: r,
      totals: { proventos: tProv, descontos: tDesc, liquido: tLiq, beneficios: tBen, insalubridade: tIns, he: tHE, adiantamentos: tAdiant, faltaDias: tFaltaDias, faltaVal: tFaltaVal },
    };
  }, [compEmps, compEntries, diasUteis]);

  const divergencias = compEntries.filter(e => e.statusConferencia === 'divergente').length;

  const handleGenerate = () => {
    if (!selectedCompany) { toast.error('Selecione uma empresa'); return; }
    getOrCreateEntries(selectedCompany, competencia);
    setGenerated(true);
    toast.success('Relatório gerado com sucesso!');
  };

  const openPrintVersion = () => {
    const url = `/relatorio-impressao?empresa=${selectedCompany}&competencia=${competencia}`;
    navigate(url);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="card-premium p-6 gradient-primary text-primary-foreground">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-primary-foreground/20 rounded-2xl flex items-center justify-center">
            <FileText className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display">Relatório de Fechamento por Empresa</h1>
            <p className="text-primary-foreground/70 text-sm">Gere, visualize e exporte o relatório consolidado</p>
          </div>
        </div>
      </div>

      <div className="card-premium p-5 space-y-4">
        <div className="flex flex-wrap gap-3 items-end">
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
          <div className="text-xs text-muted-foreground self-center">
            Dias úteis: <strong className="text-foreground">{diasUteis}</strong>
          </div>
          <Button onClick={handleGenerate} className="gradient-accent text-accent-foreground font-semibold px-6">
            <BarChart3 className="w-4 h-4 mr-2" /> Gerar Relatório
          </Button>
          {generated && (
            <>
              <Button onClick={openPrintVersion} variant="outline"><Printer className="w-4 h-4 mr-2" /> Imprimir / PDF</Button>
            </>
          )}
        </div>

        {generated && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { l: 'Consolidado Geral', v: formatCurrency(totals.liquido), icon: DollarSign, c: 'text-accent' },
              { l: 'Horas Extras', v: formatCurrency(totals.he), icon: Clock, c: 'text-primary' },
              { l: 'Descontos', v: formatCurrency(totals.descontos), icon: CreditCard, c: 'text-destructive' },
              { l: 'Adiantamentos', v: formatCurrency(totals.adiantamentos), icon: DollarSign, c: 'text-warning' },
              { l: 'Divergências', v: divergencias, icon: AlertTriangle, c: divergencias > 0 ? 'text-destructive' : 'text-success' },
            ].map((s, i) => (
              <div key={i} className="card-premium p-4 text-center">
                <s.icon className={`w-5 h-5 mx-auto mb-1 ${s.c}`} />
                <p className="text-[10px] text-muted-foreground uppercase">{s.l}</p>
                <p className={`text-sm font-bold font-display ${s.c}`}>{s.v}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {generated && company && (
        <div className="card-premium p-6 space-y-6">
          <div className="border-b pb-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold font-display text-foreground">{company.name}</h2>
                <p className="text-sm text-muted-foreground">CNPJ: {company.cnpj}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Competência: {competencia}</p>
                <p className="text-sm text-muted-foreground">Dias úteis: {diasUteis}</p>
                <p className="text-sm text-muted-foreground">Emissão: {formatDate(new Date().toISOString())}</p>
                <Badge className={fechamento.status === 'fechado' ? 'bg-success text-success-foreground' : 'bg-warning text-warning-foreground'}>
                  {fechamento.status.replace('_', ' ')}
                </Badge>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { l: 'Total Funcionários', v: compEmps.length },
              { l: 'Total Proventos', v: formatCurrency(totals.proventos) },
              { l: 'Total Descontos', v: formatCurrency(totals.descontos) },
              { l: 'Total Líquido', v: formatCurrency(totals.liquido) },
              { l: 'Benefícios', v: formatCurrency(totals.beneficios) },
              { l: 'Insalubridade', v: formatCurrency(totals.insalubridade) },
              { l: 'Faltas (dias)', v: `${totals.faltaDias} dias` },
              { l: 'Desc. Faltas', v: formatCurrency(totals.faltaVal) },
            ].map((s, i) => (
              <div key={i} className="bg-muted/50 rounded-lg p-3 text-center">
                <p className="text-[10px] text-muted-foreground uppercase">{s.l}</p>
                <p className="text-sm font-bold font-display text-foreground">{s.v}</p>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/50">
                  {['Nome','Cargo','Salário','HE 50%','HE 100%','Adic.','Insal.','VR','VT','Faltas','Adiant.','Desc.','Líquido'].map(h => (
                    <th key={h} className="px-2 py-2 text-left font-medium text-muted-foreground uppercase whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r: any) => (
                  <tr key={r.emp.id} className="border-b hover:bg-muted/20">
                    <td className="px-2 py-2 font-medium whitespace-nowrap">{r.emp.name}</td>
                    <td className="px-2 py-2 text-muted-foreground whitespace-nowrap">{r.emp.cargo}</td>
                    <td className="px-2 py-2">{formatCurrency(r.emp.salarioBase)}</td>
                    <td className="px-2 py-2">{formatCurrency(r.he50Val)}</td>
                    <td className="px-2 py-2">{formatCurrency(r.he100Val)}</td>
                    <td className="px-2 py-2">{formatCurrency(r.entry.adicionais)}</td>
                    <td className="px-2 py-2">{formatCurrency(r.insVal)}</td>
                    <td className="px-2 py-2">{formatCurrency(r.calc.vrVal)}</td>
                    <td className="px-2 py-2">{formatCurrency(r.calc.vtVal)}</td>
                    <td className="px-2 py-2">{r.entry.faltasDias > 0 ? `${r.entry.faltasDias}d — ${formatCurrency(r.faltaVal)}` : '—'}</td>
                    <td className="px-2 py-2">{formatCurrency(r.entry.adiantamento)}</td>
                    <td className="px-2 py-2">{formatCurrency(r.entry.descontosDiversos)}</td>
                    <td className="px-2 py-2 font-bold">{formatCurrency(r.calc.liquido)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 bg-muted/30 font-bold">
                  <td colSpan={2} className="px-2 py-2">TOTAIS</td>
                  <td className="px-2 py-2">{formatCurrency(compEmps.reduce((s, e) => s + e.salarioBase, 0))}</td>
                  <td colSpan={2} className="px-2 py-2">{formatCurrency(totals.he)}</td>
                  <td></td>
                  <td className="px-2 py-2">{formatCurrency(totals.insalubridade)}</td>
                  <td colSpan={2} className="px-2 py-2">{formatCurrency(totals.beneficios)}</td>
                  <td className="px-2 py-2">{formatCurrency(totals.faltaVal)}</td>
                  <td className="px-2 py-2">{formatCurrency(totals.adiantamentos)}</td>
                  <td className="px-2 py-2">{formatCurrency(totals.descontos)}</td>
                  <td className="px-2 py-2">{formatCurrency(totals.liquido)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="text-center text-xs text-muted-foreground pt-4 border-t">
            ImplantaRH ConsultoriaPRO — Topac RH Multiempresa PRO — Relatório gerado em {formatDate(new Date().toISOString())}
          </div>
        </div>
      )}
    </div>
  );
};

export default RelatorioPage;
