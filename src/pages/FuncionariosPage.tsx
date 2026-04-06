import React, { useState } from 'react';
import { useApp } from '@/context/AppContext';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, UserPlus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatCurrency } from '@/lib/calculations';

const FuncionariosPage: React.FC = () => {
  const { employees, companies } = useApp();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [filterCompany, setFilterCompany] = useState('');

  const filtered = employees.filter(e => {
    if (search && !e.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterCompany && e.companyId !== filterCompany) return false;
    return true;
  });

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold font-display text-foreground">Funcionários</h1>
        <button className="gradient-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:opacity-90">
          <UserPlus className="w-4 h-4" /> Novo Funcionário
        </button>
      </div>

      <div className="card-premium p-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar funcionário..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <select value={filterCompany} onChange={e => setFilterCompany(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm bg-background text-foreground">
          <option value="">Todas Empresas</option>
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(e => (
          <div key={e.id} className="card-premium p-5 cursor-pointer hover:shadow-premium transition-shadow"
            onClick={() => navigate(`/funcionarios/${e.id}`)}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 gradient-primary rounded-full flex items-center justify-center text-primary-foreground font-bold text-sm">
                {e.name.split(' ').map(n => n[0]).slice(0, 2).join('')}
              </div>
              <div>
                <h3 className="font-semibold text-foreground text-sm">{e.name}</h3>
                <p className="text-xs text-muted-foreground">{e.cargo}</p>
              </div>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{companies.find(c => c.id === e.companyId)?.name}</span>
              <span className="font-semibold text-foreground">{formatCurrency(e.salarioBase)}</span>
            </div>
            <div className="mt-2">
              <Badge className={`text-[10px] ${e.status === 'ativo' ? 'bg-success text-success-foreground' : 'bg-muted text-muted-foreground'}`}>
                {e.status}
              </Badge>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default FuncionariosPage;
