import React, { useState } from 'react';
import { useApp } from '@/context/AppContext';
import { formatCurrency, formatDate, asoStatus, feriasStatus } from '@/lib/calculations';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, Filter } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const BaseMestraPage: React.FC = () => {
  const { employees, companies } = useApp();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [filterCompany, setFilterCompany] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const filtered = employees.filter(e => {
    if (search && !e.name.toLowerCase().includes(search.toLowerCase()) && !e.cpf.includes(search) && !e.cargo.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterCompany && e.companyId !== filterCompany) return false;
    if (filterStatus && e.status !== filterStatus) return false;
    return true;
  });

  const getCompanyName = (id: string) => companies.find(c => c.id === id)?.name || '';
  const getCompanyCnpj = (id: string) => companies.find(c => c.id === id)?.cnpj || '';

  const statusColor = (s: string) => {
    if (s === 'ativo') return 'bg-success text-success-foreground';
    if (s === 'afastado') return 'bg-warning text-warning-foreground';
    if (s === 'férias') return 'bg-primary text-primary-foreground';
    return 'bg-destructive text-destructive-foreground';
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <h1 className="text-2xl font-bold font-display text-foreground">Base Mestra de Funcionários</h1>

      <div className="card-premium p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome, CPF ou cargo..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <select value={filterCompany} onChange={e => setFilterCompany(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm bg-background text-foreground">
          <option value="">Todas Empresas</option>
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm bg-background text-foreground">
          <option value="">Todos Status</option>
          <option value="ativo">Ativo</option>
          <option value="afastado">Afastado</option>
          <option value="férias">Férias</option>
          <option value="desligado">Desligado</option>
        </select>
        <Filter className="w-5 h-5 text-muted-foreground" />
      </div>

      <div className="card-premium overflow-x-auto overflow-y-auto max-h-[calc(100vh-220px)]" style={{ overflowX: 'scroll' }}>
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="border-b bg-muted">
              {['Empresa','CNPJ','Nº Reg','Mat. eSocial','Nome','CPF','Cargo','Salário Base','Admissão','ASO','Férias','VR','VA','VT','Insal.','Status'].map(h => (
                <th key={h} className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(e => {
              const aso = asoStatus(e.dataExameMedico);
              const fer = feriasStatus(e.dataAdmissao);
              return (
                <tr key={e.id} className="border-b hover:bg-muted/30 cursor-pointer transition-colors"
                  onClick={() => navigate(`/admin/funcionarios/${e.id}`)}>
                  <td className="px-3 py-2.5 whitespace-nowrap font-medium">{getCompanyName(e.companyId)}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground text-xs">{getCompanyCnpj(e.companyId)}</td>
                  <td className="px-3 py-2.5">{e.registro}</td>
                  <td className="px-3 py-2.5 text-xs">{e.matriculaEsocial}</td>
                  <td className="px-3 py-2.5 font-medium whitespace-nowrap">{e.name}</td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">{e.cpf}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{e.cargo}</td>
                  <td className="px-3 py-2.5 font-medium">{formatCurrency(e.salarioBase)}</td>
                  <td className="px-3 py-2.5 text-xs">{formatDate(e.dataAdmissao)}</td>
                  <td className="px-3 py-2.5">
                    <Badge variant="outline" className={`text-[10px] ${aso.status === 'ok' ? 'border-success text-success' : aso.status === 'próximo' ? 'border-warning text-warning' : 'border-destructive text-destructive'}`}>
                      {aso.status}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge variant="outline" className={`text-[10px] ${fer.status === 'em dia' ? 'border-success text-success' : fer.status === 'atenção' ? 'border-warning text-warning' : 'border-destructive text-destructive'}`}>
                      {fer.status}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5 text-center">{e.vrAtivo ? '✓' : '—'}</td>
                  <td className="px-3 py-2.5 text-center">{e.vaAtivo ? '✓' : '—'}</td>
                  <td className="px-3 py-2.5 text-center">{e.vtAtivo ? '✓' : '—'}</td>
                  <td className="px-3 py-2.5 text-center">{e.insalubridadeAtiva ? formatCurrency(e.insalubridadeValor) : '—'}</td>
                  <td className="px-3 py-2.5"><Badge className={`text-[10px] ${statusColor(e.status)}`}>{e.status}</Badge></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="p-3 text-xs text-muted-foreground border-t">{filtered.length} funcionário(s) encontrado(s)</div>
      </div>
    </div>
  );
};

export default BaseMestraPage;
