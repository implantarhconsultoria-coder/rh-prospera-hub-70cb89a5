import React, { useState, useMemo } from 'react';
import { useApp } from '@/context/AppContext';
import { formatDate, formatCurrency } from '@/lib/calculations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { History, FileText, Search, Filter } from 'lucide-react';

type FilterType = 'todos' | 'epi' | 'uniforme' | 'vr' | 'vt';

const HistoricoPage: React.FC = () => {
  const { companies, employees, deliveries, benefitReports } = useApp();
  const [filterType, setFilterType] = useState<FilterType>('todos');
  const [filterCompany, setFilterCompany] = useState('');
  const [filterEmployee, setFilterEmployee] = useState('');
  const [filterPeriodStart, setFilterPeriodStart] = useState('');
  const [filterPeriodEnd, setFilterPeriodEnd] = useState('');

  const records = useMemo(() => {
    const items: Array<{
      id: string;
      type: 'epi' | 'uniforme' | 'vr' | 'vt';
      date: string;
      companyId: string;
      employeeId?: string;
      competencia?: string;
      description: string;
      printUrl: string;
    }> = [];

    deliveries.forEach(d => {
      items.push({
        id: d.id,
        type: d.type,
        date: d.date,
        companyId: d.companyId,
        employeeId: d.employeeId,
        description: `${d.items.length} item(ns) — ${d.responsavel}`,
        printUrl: `/entrega-impressao?id=${d.id}`,
      });
    });

    benefitReports.forEach(r => {
      items.push({
        id: r.id,
        type: r.type,
        date: r.createdAt,
        companyId: r.companyId,
        competencia: r.competencia,
        description: `Competência: ${r.competencia}`,
        printUrl: r.type === 'vr'
          ? `/relatorio-vr-impressao?empresa=${r.companyId}&competencia=${r.competencia}`
          : `/relatorio-vt-impressao?empresa=${r.companyId}&competencia=${r.competencia}`,
      });
    });

    return items
      .filter(i => filterType === 'todos' || i.type === filterType)
      .filter(i => !filterCompany || i.companyId === filterCompany)
      .filter(i => {
        if (!filterEmployee) return true;
        if (!i.employeeId) return false;
        const emp = employees.find(e => e.id === i.employeeId);
        return emp?.name.toLowerCase().includes(filterEmployee.toLowerCase());
      })
      .filter(i => {
        if (filterPeriodStart && i.date < filterPeriodStart) return false;
        if (filterPeriodEnd && i.date > filterPeriodEnd) return false;
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [deliveries, benefitReports, filterType, filterCompany, filterEmployee, filterPeriodStart, filterPeriodEnd, employees]);

  const typeLabel = (t: string) => {
    switch (t) {
      case 'epi': return 'EPI';
      case 'uniforme': return 'Uniforme';
      case 'vr': return 'VR';
      case 'vt': return 'VT';
      default: return t;
    }
  };

  const typeBadgeClass = (t: string) => {
    switch (t) {
      case 'epi': return 'bg-primary/10 text-primary';
      case 'uniforme': return 'bg-accent/10 text-accent-foreground';
      case 'vr': return 'bg-success/10 text-success';
      case 'vt': return 'bg-warning/10 text-warning';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="card-premium p-6 gradient-primary text-primary-foreground">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-primary-foreground/20 rounded-2xl flex items-center justify-center">
            <History className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display">Histórico</h1>
            <p className="text-primary-foreground/70 text-sm">Entregas de EPI, Uniformes e Relatórios de VR/VT</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card-premium p-5 space-y-3">
        <div className="flex items-center gap-2 mb-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">Filtros</span>
        </div>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Tipo</label>
            <select value={filterType} onChange={e => setFilterType(e.target.value as FilterType)}
              className="border rounded-lg px-3 py-2 text-sm bg-background text-foreground">
              <option value="todos">Todos</option>
              <option value="epi">EPI</option>
              <option value="uniforme">Uniforme</option>
              <option value="vr">VR</option>
              <option value="vt">VT</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Empresa</label>
            <select value={filterCompany} onChange={e => setFilterCompany(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm bg-background text-foreground">
              <option value="">Todas</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Funcionário</label>
            <Input placeholder="Nome..." value={filterEmployee} onChange={e => setFilterEmployee(e.target.value)} className="w-48" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">De</label>
            <Input type="date" value={filterPeriodStart} onChange={e => setFilterPeriodStart(e.target.value)} className="w-40" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Até</label>
            <Input type="date" value={filterPeriodEnd} onChange={e => setFilterPeriodEnd(e.target.value)} className="w-40" />
          </div>
        </div>
      </div>

      {/* Records */}
      <div className="card-premium overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              {['Tipo', 'Data', 'Empresa', 'Funcionário', 'Descrição', 'Ações'].map(h => (
                <th key={h} className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {records.length === 0 && (
              <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">Nenhum registro encontrado</td></tr>
            )}
            {records.map(r => {
              const emp = r.employeeId ? employees.find(e => e.id === r.employeeId) : null;
              const co = companies.find(c => c.id === r.companyId);
              return (
                <tr key={r.id} className="border-b hover:bg-muted/20">
                  <td className="px-3 py-2"><Badge className={typeBadgeClass(r.type)}>{typeLabel(r.type)}</Badge></td>
                  <td className="px-3 py-2 text-xs">{formatDate(r.date)}</td>
                  <td className="px-3 py-2 text-xs">{co?.name || '—'}</td>
                  <td className="px-3 py-2 text-xs font-medium">{emp?.name || '—'}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{r.description}</td>
                  <td className="px-3 py-2">
                    <Button size="sm" variant="ghost" onClick={() => window.open(r.printUrl, '_blank')}>
                      <FileText className="w-4 h-4 mr-1" /> Reimprimir
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default HistoricoPage;
