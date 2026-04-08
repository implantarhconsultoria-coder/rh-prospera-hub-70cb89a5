import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '@/context/AppContext';
import { calcTotalFuncionario, formatCurrency, calcFalta } from '@/lib/calculations';
import { getWorkingDays } from '@/lib/workingDays';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Save, Lock, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

const FechamentoPage: React.FC = () => {
  const { companies, employees, entries, getOrCreateEntries, updateEntry, getFechamento, updateFechamento } = useApp();
  const navigate = useNavigate();
  const [selectedCompany, setSelectedCompany] = useState(companies[0]?.id || '');
  const [competencia, setCompetencia] = useState(new Date().toISOString().slice(0, 7));

  const diasUteis = getWorkingDays(competencia);

  useEffect(() => {
    if (selectedCompany && competencia) getOrCreateEntries(selectedCompany, competencia);
  }, [selectedCompany, competencia]);

  const compEmps = employees.filter(e => e.companyId === selectedCompany && e.status === 'ativo' && e.categoria === 'operacional');
  const compEntries = entries.filter(e => e.companyId === selectedCompany && e.competencia === competencia);
  const fechamento = getFechamento(selectedCompany, competencia);

  const { totalProventos, totalDescontos, totalLiquido, totalBeneficios, totalInsalubridade, totalFaltaDias, totalFaltaVal } = useMemo(() => {
    let tP = 0, tD = 0, tL = 0, tB = 0, tI = 0, tFD = 0, tFV = 0;
    compEmps.forEach(emp => {
      const entry = compEntries.find(e => e.employeeId === emp.id);
      if (entry) {
        const c = calcTotalFuncionario(emp, entry, diasUteis);
        tP += c.proventos; tD += c.descontos; tL += c.liquido; tB += c.beneficios;
        tI += (entry.insalubridadeAplicada && emp.insalubridadeAtiva ? emp.insalubridadeValor : 0);
        tFD += entry.faltasDias; tFV += calcFalta(emp.salarioBase, entry.faltasDias);
      }
    });
    return { totalProventos: tP, totalDescontos: tD, totalLiquido: tL, totalBeneficios: tB, totalInsalubridade: tI, totalFaltaDias: tFD, totalFaltaVal: tFV };
  }, [compEmps, compEntries, diasUteis]);

  const statusColor = fechamento.status === 'fechado' ? 'bg-success text-success-foreground' : fechamento.status === 'em_conferencia' ? 'bg-warning text-warning-foreground' : 'bg-muted text-muted-foreground';

  return (
    <div className="space-y-5 animate-fade-in">
      <h1 className="text-2xl font-bold font-display text-foreground">Fechamento por Empresa</h1>

      <div className="card-premium p-4 flex flex-wrap gap-3 items-center">
        <select value={selectedCompany} onChange={e => setSelectedCompany(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm bg-background text-foreground">
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <Input type="month" value={competencia} onChange={e => setCompetencia(e.target.value)} className="w-48" />
        <span className="text-xs text-muted-foreground">Dias úteis: <strong className="text-foreground">{diasUteis}</strong></span>
        <Badge className={`${statusColor} ml-2`}>{fechamento.status.replace('_', ' ')}</Badge>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { l: 'Total Proventos', v: formatCurrency(totalProventos), c: 'text-success' },
          { l: 'Total Descontos', v: formatCurrency(totalDescontos), c: 'text-destructive' },
          { l: 'Total Benefícios', v: formatCurrency(totalBeneficios), c: 'text-primary' },
          { l: 'Líquido Estimado', v: formatCurrency(totalLiquido), c: 'text-accent' },
          { l: 'Insalubridade', v: formatCurrency(totalInsalubridade), c: 'text-foreground' },
          { l: 'Funcionários', v: String(compEmps.length), c: 'text-foreground' },
          { l: 'Faltas (dias)', v: `${totalFaltaDias}`, c: 'text-destructive' },
          { l: 'Desc. Faltas', v: formatCurrency(totalFaltaVal), c: 'text-destructive' },
        ].map((card, i) => (
          <div key={i} className="card-premium p-4 text-center">
            <p className="text-xs text-muted-foreground uppercase">{card.l}</p>
            <p className={`text-lg font-bold font-display ${card.c} mt-1`}>{card.v}</p>
          </div>
        ))}
      </div>

      {/* Employee table */}
      <div className="card-premium overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              {['Funcionário','Salário','Faltas','Atrasos','HE50','HE100','DSR','Adic.','Insal.','VR','VT','Desc.','Adiant.','Líquido'].map(h => (
                <th key={h} className="px-2 py-3 text-left text-xs font-medium text-muted-foreground uppercase whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {compEmps.map(emp => {
              const entry = compEntries.find(e => e.employeeId === emp.id);
              if (!entry) return null;
              const calc = calcTotalFuncionario(emp, entry, diasUteis);
              const update = (data: any) => updateEntry(emp.id, competencia, data);
              return (
                <tr key={emp.id} className="border-b hover:bg-muted/20">
                  <td className="px-2 py-2 font-medium whitespace-nowrap text-xs">{emp.name}</td>
                  <td className="px-2 py-2 text-xs">{formatCurrency(emp.salarioBase)}</td>
                  <td className="px-2 py-2"><Input type="number" value={entry.faltasDias} onChange={e => update({ faltasDias: Number(e.target.value) })} className="w-14 text-xs h-7" /></td>
                  <td className="px-2 py-2"><Input type="number" value={entry.atrasos} onChange={e => update({ atrasos: Number(e.target.value) })} className="w-14 text-xs h-7" /></td>
                  <td className="px-2 py-2"><Input type="number" value={entry.he50} onChange={e => update({ he50: Number(e.target.value) })} className="w-14 text-xs h-7" /></td>
                  <td className="px-2 py-2"><Input type="number" value={entry.he100} onChange={e => update({ he100: Number(e.target.value) })} className="w-14 text-xs h-7" /></td>
                  <td className="px-2 py-2"><Input type="number" value={entry.adicionais} onChange={e => update({ adicionais: Number(e.target.value) })} className="w-16 text-xs h-7" /></td>
                  <td className="px-2 py-2 text-xs">{formatCurrency(calc.dsrHE)}</td>
                  <td className="px-2 py-2 text-xs">{emp.insalubridadeAtiva ? formatCurrency(emp.insalubridadeValor) : '—'}</td>
                  <td className="px-2 py-2 text-xs">{entry.vrAplicado && emp.vrAtivo ? `${formatCurrency(calc.vrVal)} (${calc.vrDiasEfetivos}d)` : '—'}</td>
                  <td className="px-2 py-2 text-xs">{entry.vtAplicado && emp.vtAtivo ? formatCurrency(calc.vtVal) : '—'}</td>
                  <td className="px-2 py-2"><Input type="number" value={entry.descontosDiversos} onChange={e => update({ descontosDiversos: Number(e.target.value) })} className="w-16 text-xs h-7" /></td>
                  <td className="px-2 py-2"><Input type="number" value={entry.adiantamento} onChange={e => update({ adiantamento: Number(e.target.value) })} className="w-16 text-xs h-7" /></td>
                  <td className="px-2 py-2 font-bold text-xs">{formatCurrency(calc.liquido)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Actions */}
      <div className="card-premium p-4 space-y-3">
        <label className="text-xs text-muted-foreground">Observação do Fechamento</label>
        <textarea value={fechamento.observacoes}
          onChange={e => updateFechamento(selectedCompany, competencia, { observacoes: e.target.value })}
          className="w-full border rounded-lg px-3 py-2 text-sm bg-background text-foreground min-h-[60px]" placeholder="Observações gerais..." />
        <div className="flex gap-3 flex-wrap">
          <Button onClick={() => { updateFechamento(selectedCompany, competencia, { status: 'em_conferencia' }); toast.success('Fechamento salvo!'); }}
            className="gradient-primary text-primary-foreground"><Save className="w-4 h-4 mr-2" />Salvar Fechamento</Button>
          <Button onClick={() => { updateFechamento(selectedCompany, competencia, { status: 'fechado', dataFechamento: new Date().toISOString() }); toast.success('Fechamento marcado como fechado!'); }}
            variant="outline"><Lock className="w-4 h-4 mr-2" />Marcar como Fechado</Button>
          <Button onClick={() => navigate(`/relatorio-impressao?empresa=${selectedCompany}&competencia=${competencia}`)} variant="outline">
            <FileText className="w-4 h-4 mr-2" />Relatório para Impressão
          </Button>
        </div>
      </div>
    </div>
  );
};

export default FechamentoPage;
