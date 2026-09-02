import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { formatDate } from '@/lib/calculations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Copy, FileText, Filter, History, Landmark, Mail, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type FilterType = 'todos' | 'epi' | 'uniforme' | 'vr' | 'vt' | 'bancario';

type BankingChange = {
  id: string;
  employee_id: string;
  company_id: string;
  changed_at: string;
  fields_changed: string[];
  email_to: string;
  email_subject?: string | null;
  email_body?: string | null;
  email_status?: string | null;
};

const HistoricoPage: React.FC = () => {
  const { companies, employees, deliveries, benefitReports } = useApp();
  const [filterType, setFilterType] = useState<FilterType>('todos');
  const [filterCompany, setFilterCompany] = useState('');
  const [filterEmployee, setFilterEmployee] = useState('');
  const [bankingChanges, setBankingChanges] = useState<BankingChange[]>([]);

  useEffect(() => {
    const load = async () => {
      const { data, error } = await (supabase as any).from('employee_banking_changes')
        .select('id,employee_id,company_id,changed_at,fields_changed,email_to,email_subject,email_body,email_status')
        .order('changed_at', { ascending: false })
        .limit(1000);
      if (error) {
        console.warn('[historico-bancario]', error.message);
        return;
      }
      setBankingChanges((data || []) as BankingChange[]);
    };
    void load();
  }, []);

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
    return n.includes(q) || initials.startsWith(q) || words.some((word) => word.startsWith(q)) || words.some((word, index) => `${word}${words[index + 1] || ''}`.startsWith(q));
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
      type: 'epi' | 'uniforme' | 'vr' | 'vt' | 'bancario';
      date: string;
      companyId: string;
      employeeId?: string;
      description: string;
      printUrl?: string;
      emailTo?: string;
      emailSubject?: string;
      emailBody?: string;
    }> = [];

    deliveries.forEach((delivery) => {
      items.push({ id: delivery.id, type: delivery.type, date: delivery.date, companyId: delivery.companyId, employeeId: delivery.employeeId, description: `${delivery.items.length} item(ns) - ${delivery.responsavel}`, printUrl: `/entrega-impressao?id=${delivery.id}` });
    });

    benefitReports.forEach((report) => {
      items.push({
        id: report.id,
        type: report.type,
        date: report.createdAt,
        companyId: report.companyId,
        description: `Competência: ${report.competencia}`,
        printUrl: report.type === 'vr' ? `/relatorio-vr-impressao?empresa=${report.companyId}&competencia=${report.competencia}` : `/relatorio-vt-impressao?empresa=${report.companyId}&competencia=${report.competencia}`,
      });
    });

    bankingChanges.forEach((change) => {
      items.push({
        id: change.id,
        type: 'bancario',
        date: change.changed_at,
        companyId: change.company_id,
        employeeId: change.employee_id,
        description: `Alteração bancária: ${(change.fields_changed || []).join(', ') || 'dados bancários'} · e-mail ${change.email_status || 'PREPARADO'} para ${change.email_to}`,
        emailTo: change.email_to,
        emailSubject: change.email_subject || '',
        emailBody: change.email_body || '',
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
  }, [deliveries, benefitReports, bankingChanges, filterType, filterCompany, filterEmployee, employees]);

  const groupedRecords = useMemo(() => records.reduce((acc, record) => {
    const key = record.date?.slice(0, 10) || 'sem-data';
    if (!acc[key]) acc[key] = [];
    acc[key].push(record);
    return acc;
  }, {} as Record<string, typeof records>), [records]);
  const groupedDates = useMemo(() => Object.keys(groupedRecords).sort((a, b) => b.localeCompare(a)), [groupedRecords]);

  const typeLabel = (type: string) => type === 'epi' ? 'EPI' : type === 'uniforme' ? 'Uniforme' : type === 'vr' ? 'VR' : type === 'vt' ? 'VT' : type === 'bancario' ? 'Conta bancária' : type;
  const typeBadgeClass = (type: string) => type === 'epi' ? 'bg-primary/10 text-primary' : type === 'uniforme' ? 'bg-accent/10 text-accent-foreground' : type === 'vr' ? 'bg-success/10 text-success' : type === 'vt' ? 'bg-warning/10 text-warning' : type === 'bancario' ? 'bg-violet-500/15 text-violet-300' : 'bg-muted text-muted-foreground';

  const copyEmail = async (record: typeof records[number]) => {
    if (!record.emailBody) return;
    await navigator.clipboard.writeText(`Para: ${record.emailTo}\nAssunto: ${record.emailSubject}\n\n${record.emailBody}`);
    toast.success('E-mail da alteração copiado.');
  };

  const openEmail = (record: typeof records[number]) => {
    if (!record.emailTo) return;
    window.location.href = `mailto:${encodeURIComponent(record.emailTo)}?subject=${encodeURIComponent(record.emailSubject || '')}&body=${encodeURIComponent(record.emailBody || '')}`;
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="card-premium p-6 gradient-primary text-primary-foreground">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-primary-foreground/20 rounded-2xl flex items-center justify-center"><History className="w-7 h-7" /></div>
          <div><h1 className="text-2xl font-bold font-display">Histórico</h1><p className="text-primary-foreground/70 text-sm">EPI, Uniformes, VR/VT e alterações cadastrais importantes</p></div>
        </div>
      </div>

      <div className="card-premium p-5 space-y-3">
        <div className="flex items-center gap-2 mb-2"><Filter className="w-4 h-4 text-muted-foreground" /><span className="text-sm font-medium text-foreground">Filtros</span></div>
        <div className="flex flex-wrap gap-3 items-end">
          <div><label className="text-xs text-muted-foreground block mb-1">Tipo de histórico</label><select value={filterType} onChange={event => setFilterType(event.target.value as FilterType)} className="border rounded-lg px-3 py-2 text-sm bg-background text-foreground"><option value="todos">Todos</option><option value="epi">EPI</option><option value="uniforme">Uniforme</option><option value="vr">VR</option><option value="vt">VT</option><option value="bancario">Conta bancária</option></select></div>
          <div><label className="text-xs text-muted-foreground block mb-1">Empresa</label><select value={filterCompany} onChange={event => setFilterCompany(event.target.value)} className="border rounded-lg px-3 py-2 text-sm bg-background text-foreground min-w-[220px]"><option value="">Todas</option>{companies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}</select></div>
          <div className="relative">
            <label className="text-xs text-muted-foreground block mb-1">Pesquisa rápida funcionário</label>
            <div className="relative"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input placeholder="Iniciais ou nome..." value={filterEmployee} onChange={event => setFilterEmployee(event.target.value)} className="w-60 pl-9" /></div>
            {employeeSuggestions.length > 0 && <div className="absolute z-20 mt-1 w-80 rounded-lg border bg-popover shadow-lg overflow-hidden">{employeeSuggestions.map(emp => <button key={emp.id} type="button" onClick={() => setFilterEmployee(emp.name)} className="w-full text-left px-3 py-2 text-xs hover:bg-muted"><span className="font-medium text-foreground">{emp.name}</span><span className="block text-muted-foreground">{companies.find(company => company.id === emp.companyId)?.name || ''}</span></button>)}</div>}
          </div>
        </div>
      </div>

      <div className="card-premium overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b bg-muted/50">{['Tipo', 'Data', 'Empresa', 'Funcionário', 'Descrição', 'Ações'].map(header => <th key={header} className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">{header}</th>)}</tr></thead>
          <tbody>
            {records.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">Nenhum registro encontrado</td></tr>}
            {groupedDates.map(dateKey => <React.Fragment key={dateKey}>
              <tr className="bg-primary/5 border-b"><td colSpan={6} className="px-3 py-2 text-xs font-bold text-primary">{dateKey === 'sem-data' ? 'Sem data' : formatDate(dateKey)}</td></tr>
              {groupedRecords[dateKey].map(record => {
                const emp = record.employeeId ? employees.find(e => e.id === record.employeeId) : null;
                const company = companies.find(c => c.id === record.companyId);
                return <tr key={record.id} className="border-b hover:bg-muted/20">
                  <td className="px-3 py-2"><Badge className={typeBadgeClass(record.type)}>{record.type === 'bancario' && <Landmark className="mr-1 h-3 w-3" />}{typeLabel(record.type)}</Badge></td>
                  <td className="px-3 py-2 text-xs">{formatDate(record.date)}</td>
                  <td className="px-3 py-2 text-xs">{company?.name || '-'}</td>
                  <td className="px-3 py-2 text-xs font-medium">{emp?.name || '-'}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{record.description}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{record.printUrl ? <Button size="sm" variant="ghost" onClick={() => window.open(record.printUrl, '_blank')}><FileText className="w-4 h-4 mr-1" /> Reimprimir</Button> : <div className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => void copyEmail(record)}><Copy className="w-4 h-4 mr-1" /> Copiar e-mail</Button><Button size="sm" variant="ghost" onClick={() => openEmail(record)}><Mail className="w-4 h-4 mr-1" /> Abrir</Button></div>}</td>
                </tr>;
              })}
            </React.Fragment>)}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default HistoricoPage;