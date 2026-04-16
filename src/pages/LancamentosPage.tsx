import React, { useState, useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import { formatCurrency, calcHE50, calcHE100, calcFalta, calcAtraso, calcAdiantamento } from '@/lib/calculations';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Save } from 'lucide-react';
import { toast } from 'sonner';

const LancamentosPage: React.FC = () => {
  const { companies, employees, getOrCreateEntries, updateEntry, entries } = useApp();
  const [selectedCompany, setSelectedCompany] = useState(companies[0]?.id || '');
  const [competencia, setCompetencia] = useState(new Date().toISOString().slice(0, 7));

  useEffect(() => {
    if (selectedCompany && competencia) {
      const created = getOrCreateEntries(selectedCompany, competencia);
      // Auto-fill adiantamento (40%) for entries that have 0
      const compEmpsLocal = employees.filter(e => e.companyId === selectedCompany && e.status === 'ativo' && e.categoria === 'operacional');
      compEmpsLocal.forEach(emp => {
        const entry = created.find(e => e.employeeId === emp.id);
        if (entry && entry.adiantamento === 0) {
          updateEntry(emp.id, competencia, { adiantamento: Math.round(emp.salarioBase * 0.4 * 100) / 100 });
        }
      });
    }
  }, [selectedCompany, competencia]);

  const compEntries = entries.filter(e => e.companyId === selectedCompany && e.competencia === competencia);
  const compEmps = employees.filter(e => e.companyId === selectedCompany && e.status === 'ativo' && e.categoria === 'operacional');

  return (
    <div className="space-y-5 animate-fade-in">
      <h1 className="text-2xl font-bold font-display text-foreground">Lançamentos Mensais</h1>

      <div className="card-premium p-4 flex flex-wrap gap-3 items-center">
        <select value={selectedCompany} onChange={e => setSelectedCompany(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm bg-background text-foreground">
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <Input type="month" value={competencia} onChange={e => setCompetencia(e.target.value)} className="w-48" />
        <Button onClick={() => toast.success('Lançamentos salvos!')} className="gradient-primary text-primary-foreground ml-auto">
          <Save className="w-4 h-4 mr-2" /> Salvar Lançamentos
        </Button>
      </div>

      <div className="card-premium overflow-x-auto overflow-y-auto max-h-[calc(100vh-220px)]" style={{ overflowX: 'scroll' }}>
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="border-b bg-muted">
              {['Funcionário','Cargo','Salário','Faltas (dias)','Atrasos (h)','HE 50%','HE 100%','Adicionais','Descontos','Adiant.','Insal.','Status','Obs'].map(h => (
                <th key={h} className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {compEmps.map(emp => {
              const entry = compEntries.find(e => e.employeeId === emp.id);
              if (!entry) return null;
              const update = (data: any) => updateEntry(emp.id, competencia, data);
              return (
                <tr key={emp.id} className="border-b hover:bg-muted/20">
                  <td className="px-3 py-2 font-medium whitespace-nowrap">{emp.name}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{emp.cargo}</td>
                  <td className="px-3 py-2 text-xs">{formatCurrency(emp.salarioBase)}</td>
                  <td className="px-3 py-2"><Input type="number" value={entry.faltasDias} onChange={e => update({ faltasDias: Number(e.target.value) })} className="w-16 text-xs h-8" /></td>
                  <td className="px-3 py-2"><Input type="number" value={entry.atrasos} onChange={e => update({ atrasos: Number(e.target.value) })} className="w-16 text-xs h-8" /></td>
                  <td className="px-3 py-2"><Input type="number" value={entry.he50} onChange={e => update({ he50: Number(e.target.value) })} className="w-16 text-xs h-8" /></td>
                  <td className="px-3 py-2"><Input type="number" value={entry.he100} onChange={e => update({ he100: Number(e.target.value) })} className="w-16 text-xs h-8" /></td>
                  <td className="px-3 py-2"><Input type="number" value={entry.adicionais} onChange={e => update({ adicionais: Number(e.target.value) })} className="w-20 text-xs h-8" /></td>
                  <td className="px-3 py-2"><Input type="number" value={entry.descontosDiversos} onChange={e => update({ descontosDiversos: Number(e.target.value) })} className="w-20 text-xs h-8" /></td>
                  <td className="px-3 py-2 text-xs">{formatCurrency(Math.round(emp.salarioBase * 0.4 * 100) / 100)}</td>
                  <td className="px-3 py-2 text-xs">{emp.insalubridadeAtiva ? formatCurrency(emp.insalubridadeValor) : '—'}</td>
                  <td className="px-3 py-2">
                    <select value={entry.statusConferencia} onChange={e => update({ statusConferencia: e.target.value })}
                      className="border rounded px-1.5 py-1 text-xs bg-background text-foreground">
                      <option value="pendente">Pendente</option>
                      <option value="conferido">Conferido</option>
                      <option value="divergente">Divergente</option>
                    </select>
                  </td>
                  <td className="px-3 py-2"><Input value={entry.observacoes} onChange={e => update({ observacoes: e.target.value })} className="w-24 text-xs h-8" placeholder="..." /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default LancamentosPage;
