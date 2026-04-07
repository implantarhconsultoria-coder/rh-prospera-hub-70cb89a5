import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '@/context/AppContext';
import { calcTotalFuncionario, calcHE50, calcHE100, calcFalta, calcAtraso, formatCurrency, formatDate } from '@/lib/calculations';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileText, Printer, Download, BarChart3, AlertTriangle, DollarSign, Clock, CreditCard } from 'lucide-react';
import { toast } from 'sonner';

const RelatorioPage: React.FC = () => {
  const { companies, employees, entries, getOrCreateEntries, getFechamento } = useApp();
  const [selectedCompany, setSelectedCompany] = useState('');
  const [competencia, setCompetencia] = useState(new Date().toISOString().slice(0, 7));
  const [generated, setGenerated] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  const company = companies.find(c => c.id === selectedCompany);
  const compEmps = employees.filter(e => e.companyId === selectedCompany && e.status === 'ativo' && e.categoria === 'operacional');
  const compEntries = entries.filter(e => e.companyId === selectedCompany && e.competencia === competencia);
  const fechamento = getFechamento(selectedCompany, competencia);

  let totalProventos = 0, totalDescontos = 0, totalLiquido = 0, totalBeneficios = 0, totalInsalubridade = 0, totalAdiantamentos = 0, totalHE = 0;
  const rows = compEmps.map(emp => {
    const entry = compEntries.find(e => e.employeeId === emp.id);
    if (!entry) return null;
    const calc = calcTotalFuncionario(emp, entry);
    const he50Val = calcHE50(emp.salarioBase, entry.he50);
    const he100Val = calcHE100(emp.salarioBase, entry.he100);
    const faltaVal = calcFalta(emp.salarioBase, entry.faltasDias);
    const atrasoVal = calcAtraso(emp.salarioBase, entry.atrasos);
    const insVal = entry.insalubridadeAplicada && emp.insalubridadeAtiva ? emp.insalubridadeValor : 0;
    const vrDias = entry.vrDias ?? 22;
    const vrVal = entry.vrAplicado && emp.vrAtivo ? emp.vrDiario * vrDias : 0;
    const vaVal = entry.vaAplicado && emp.vaAtivo ? emp.vaMensal : 0;
    const vtVal = entry.vtAplicado && emp.vtAtivo ? emp.vtValor : 0;

    totalProventos += calc.proventos; totalDescontos += calc.descontos; totalLiquido += calc.liquido;
    totalBeneficios += calc.beneficios; totalInsalubridade += insVal; totalAdiantamentos += entry.adiantamento;
    totalHE += he50Val + he100Val;

    return { emp, entry, calc, he50Val, he100Val, faltaVal, atrasoVal, insVal, vrVal, vaVal, vtVal };
  }).filter(Boolean);

  const divergencias = compEntries.filter(e => e.statusConferencia === 'divergente').length;

  const handleGenerate = () => {
    if (!selectedCompany) { toast.error('Selecione uma empresa'); return; }
    getOrCreateEntries(selectedCompany, competencia);
    setGenerated(true);
    toast.success('Relatório gerado com sucesso!');
  };

  const handlePrint = () => window.print();

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header card */}
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

      {/* Filters & Actions */}
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
          <Button onClick={handleGenerate} className="gradient-accent text-accent-foreground font-semibold px-6">
            <BarChart3 className="w-4 h-4 mr-2" /> Gerar Relatório
          </Button>
          {generated && (
            <>
              <Button onClick={handlePrint} variant="outline"><Printer className="w-4 h-4 mr-2" /> Imprimir</Button>
              <Button onClick={() => toast.info('Exportação PDF em desenvolvimento')} variant="outline"><Download className="w-4 h-4 mr-2" /> PDF</Button>
            </>
          )}
        </div>

        {/* Quick stats */}
        {generated && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { l: 'Consolidado Geral', v: formatCurrency(totalLiquido), icon: DollarSign, c: 'text-accent' },
              { l: 'Horas Extras', v: formatCurrency(totalHE), icon: Clock, c: 'text-primary' },
              { l: 'Descontos', v: formatCurrency(totalDescontos), icon: CreditCard, c: 'text-destructive' },
              { l: 'Adiantamentos', v: formatCurrency(totalAdiantamentos), icon: DollarSign, c: 'text-warning' },
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

      {/* Report body */}
      {generated && company && (
        <div ref={reportRef} className="card-premium p-6 space-y-6 print:shadow-none print:border-0">
          {/* Header */}
          <div className="border-b pb-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold font-display text-foreground">{company.name}</h2>
                <p className="text-sm text-muted-foreground">CNPJ: {company.cnpj}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Competência: {competencia}</p>
                <p className="text-sm text-muted-foreground">Emissão: {formatDate(new Date().toISOString())}</p>
                <Badge className={fechamento.status === 'fechado' ? 'bg-success text-success-foreground' : 'bg-warning text-warning-foreground'}>
                  {fechamento.status.replace('_', ' ')}
                </Badge>
              </div>
            </div>
          </div>

          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { l: 'Total Funcionários', v: compEmps.length },
              { l: 'Total Proventos', v: formatCurrency(totalProventos) },
              { l: 'Total Descontos', v: formatCurrency(totalDescontos) },
              { l: 'Total Líquido', v: formatCurrency(totalLiquido) },
              { l: 'Adiantamentos', v: formatCurrency(totalAdiantamentos) },
              { l: 'Insalubridade', v: formatCurrency(totalInsalubridade) },
              { l: 'Benefícios', v: formatCurrency(totalBeneficios) },
              { l: 'Divergências', v: divergencias },
            ].map((s, i) => (
              <div key={i} className="bg-muted/50 rounded-lg p-3 text-center">
                <p className="text-[10px] text-muted-foreground uppercase">{s.l}</p>
                <p className="text-sm font-bold font-display text-foreground">{s.v}</p>
              </div>
            ))}
          </div>

          {/* Detailed table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/50">
                  {['Nome','Função','Salário','Faltas','Atrasos','HE 50%','HE 100%','Adic.','Insal.','VR','VA','VT','Adiant.','Desc.','Total'].map(h => (
                    <th key={h} className="px-2 py-2 text-left font-medium text-muted-foreground uppercase whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r: any) => (
                  <tr key={r.emp.id} className="border-b">
                    <td className="px-2 py-2 font-medium whitespace-nowrap">{r.emp.name}</td>
                    <td className="px-2 py-2 text-muted-foreground whitespace-nowrap">{r.emp.cargo}</td>
                    <td className="px-2 py-2">{formatCurrency(r.emp.salarioBase)}</td>
                    <td className="px-2 py-2">{formatCurrency(r.faltaVal)}</td>
                    <td className="px-2 py-2">{formatCurrency(r.atrasoVal)}</td>
                    <td className="px-2 py-2">{formatCurrency(r.he50Val)}</td>
                    <td className="px-2 py-2">{formatCurrency(r.he100Val)}</td>
                    <td className="px-2 py-2">{formatCurrency(r.entry.adicionais)}</td>
                    <td className="px-2 py-2">{formatCurrency(r.insVal)}</td>
                    <td className="px-2 py-2">{formatCurrency(r.vrVal)}</td>
                    <td className="px-2 py-2">{formatCurrency(r.vaVal)}</td>
                    <td className="px-2 py-2">{formatCurrency(r.vtVal)}</td>
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
                  <td colSpan={2}></td>
                  <td colSpan={2} className="px-2 py-2">{formatCurrency(totalHE)}</td>
                  <td></td>
                  <td className="px-2 py-2">{formatCurrency(totalInsalubridade)}</td>
                  <td colSpan={3} className="px-2 py-2">{formatCurrency(totalBeneficios)}</td>
                  <td className="px-2 py-2">{formatCurrency(totalAdiantamentos)}</td>
                  <td className="px-2 py-2">{formatCurrency(totalDescontos)}</td>
                  <td className="px-2 py-2">{formatCurrency(totalLiquido)}</td>
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
