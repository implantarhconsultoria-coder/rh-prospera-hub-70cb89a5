import React, { useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { formatDate } from '@/lib/calculations';
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

  const normalize = (value: string) =>
    (value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();

  const matchesEmployeeQuickSearch = (name: string, query: string) => {
    const q = normalize(query);
    if (!q) return true;
    const n = normalize(name);
    const words = n.split(/\s+/).filter(Boolean);
    const initials = words.map((word) => word[0]).join('');
    return (
      n.includes(q) ||
      initials.startsWith(q) ||
      words.some((word) => word.startsWith(q)) ||
      words.some((word, index) => `${word}${words[index + 1] || ''}`.startsWith(q))
    );
  };

  const employeeSuggestions = useMemo(() => {
    if (!filterEmployee.trim()) return [];
    return employees
      .filter((emp) => (!filterCompany || emp.companyId === filterCompany) && matchesEmployeeQuickSearch(emp.name, filterEmployee))
      .slice(0, 8);
  }, [employees, filterCompany, filterEmployee]);

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

    deliveries.forEach((delivery) => {
      items.push({
        id: delivery.id,
        type: delivery.type,
        date: delivery.date,
        companyId: delivery.companyId,
        employeeId: delivery.employeeId,
        description: `${delivery.items.length} item(ns) - ${delivery.responsavel}`,
        printUrl: `/entrega-impressao?id=${delivery.id}`,
      });
    });

    benefitReports.forEach((report) => {
      items.push({
        id: report.id,
        type: report.type,
        date: report.createdAt,
        companyId: report.companyId,
        competencia: report.competencia,
        description: `Competencia: ${report.competencia}`,
        printUrl: report.type === 'vr'
          ? `/relatorio-vr-impressao?empresa=${report.companyId}&competencia=${report.competencia}`
          : `/relatorio-vt-impressao?empresa=${report.companyId}&competencia=${report.competencia}`,
      });
    });

    return items
      .filter((item) => filterType === 'todos' || item.type === filterType)
      .filter((item) => !filterCompany || item.companyId === filterCompany)
      .filter((item) => {
        if (!filterEmployee.trim()) return true;
        if (!item.employeeId) return false;
        const emp = employees.find((e) => e.id === item.employeeId);
        return emp ? matchesEmployeeQuickSearch(emp.name, filterEmployee) : false;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [deliveries, benefitReports, filterType, filterCompany, filterEmployee, employees]);

  const groupedRecords = useMemo(() => {
    return records.reduce((acc, record) => {
      const key = record.date?.slice(0, 10) || 'sem-data';
      if (!acc[key]) acc[key] = [];
      acc[key].push(record);
      return acc;
    }, {} as Record<string, typeof records>);
  }, [records]);

  const groupedDates = useMemo(() => Object.keys(groupedRecords).sort((a, b) => b.localeCompare(a)), [groupedRecords]);

  const typeLabel = (type: string) => {
    switch (type) {
      case 'epi': return 'EPI';
      case 'uniforme': return 'Uniforme';
      case 'vr': return 'VR';
      case 'vt': return 'VT';
      default: return type;
    }
  };

  const typeBadgeClass = (type: string) => {
    switch (type) {
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
            <h1 className="text-2xl font-bold font-display">Historico</h1>
            <p className="text-primary-foreground/70 text-sm">Entregas de EPI, Uniformes e Relatorios de VR/VT</p>
          </div>
        </div>
      </div>

      <div className="card-premium p-5 space-y-3">
        <div className="flex items-center gap-2 mb-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">Filtros</span>
        </div>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Tipo de historico</label>
            <select value={filterType} onChange={event => setFilterType(event.target.value as FilterType)}
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
            <select value={filterCompany} onChange={event => setFilterCompany(event.target.value)}
              className="border rounded-lg px-3 py-2 text-sm bg-background text-foreground min-w-[220px]">
              <option value="">Todas</option>
              {companies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}
            </select>
          </div>
          <div className="relative">
            <label className="text-xs text-muted-foreground block mb-1">Pesquisa rapida funcionario</label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Iniciais ou nome..."
                value={filterEmployee}
                onChange={event => setFilterEmployee(event.target.value)}
                className="w-60 pl-9"
              />
            </div>
            {employeeSuggestions.length > 0 && (
              <div className="absolute z-20 mt-1 w-80 rounded-lg border bg-popover shadow-lg overflow-hidden">
                {employeeSuggestions.map(emp => (
                  <button
                    key={emp.id}
                    type="button"
                    onClick={() => setFilterEmployee(emp.name)}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-muted"
                  >
                    <span className="font-medium text-foreground">{emp.name}</span>
                    <span className="block text-muted-foreground">{companies.find(company => company.id === emp.companyId)?.name || ''}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card-premium overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              {['Tipo', 'Data', 'Empresa', 'Funcionario', 'Descricao', 'Acoes'].map(header => (
                <th key={header} className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {records.length === 0 && (
              <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">Nenhum registro encontrado</td></tr>
            )}
            {groupedDates.map(dateKey => (
              <React.Fragment key={dateKey}>
                <tr className="bg-primary/5 border-b">
                  <td colSpan={6} className="px-3 py-2 text-xs font-bold text-primary">
                    {dateKey === 'sem-data' ? 'Sem data' : formatDate(dateKey)}
                  </td>
                </tr>
                {groupedRecords[dateKey].map(record => {
                  const emp = record.employeeId ? employees.find(e => e.id === record.employeeId) : null;
                  const company = companies.find(c => c.id === record.companyId);
                  return (
                    <tr key={record.id} className="border-b hover:bg-muted/20">
                      <td className="px-3 py-2"><Badge className={typeBadgeClass(record.type)}>{typeLabel(record.type)}</Badge></td>
                      <td className="px-3 py-2 text-xs">{formatDate(record.date)}</td>
                      <td className="px-3 py-2 text-xs">{company?.name || '-'}</td>
                      <td className="px-3 py-2 text-xs font-medium">{emp?.name || '-'}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{record.description}</td>
                      <td className="px-3 py-2">
                        <Button size="sm" variant="ghost" onClick={() => window.open(record.printUrl, '_blank')}>
                          <FileText className="w-4 h-4 mr-1" /> Reimprimir
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default HistoricoPage;
