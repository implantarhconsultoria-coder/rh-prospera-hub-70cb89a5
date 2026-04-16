import React, { useState } from 'react';
import { useApp } from '@/context/AppContext';
import { Building2, MapPin, Users, ChevronRight, ArrowLeft } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/calculations';

const EmpresasPage: React.FC = () => {
  const { companies, employees } = useApp();
  const [selectedId, setSelectedId] = useState('');

  const selected = companies.find(c => c.id === selectedId);

  if (selected) {
    const emps = employees.filter(e => e.companyId === selected.id);
    const ativos = emps.filter(e => e.status === 'ativo');
    const totalFolha = ativos.reduce((s, e) => s + e.salarioBase, 0);

    return (
      <div className="space-y-5 animate-fade-in">
        <div className="card-premium p-6 gradient-primary text-primary-foreground">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => setSelectedId('')} className="text-primary-foreground hover:bg-primary-foreground/10">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="w-12 h-12 bg-primary-foreground/20 rounded-xl flex items-center justify-center">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold font-display">{selected.name}</h1>
              <p className="text-primary-foreground/70 text-sm">CNPJ: {selected.cnpj} — {selected.city}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="card-premium p-4 text-center">
            <p className="text-xs text-muted-foreground">Funcionários Ativos</p>
            <p className="text-2xl font-bold text-foreground">{ativos.length}</p>
          </div>
          <div className="card-premium p-4 text-center">
            <p className="text-xs text-muted-foreground">Total Cadastrados</p>
            <p className="text-2xl font-bold text-foreground">{emps.length}</p>
          </div>
          <div className="card-premium p-4 text-center">
            <p className="text-xs text-muted-foreground">Folha Estimada</p>
            <p className="text-2xl font-bold text-success">{formatCurrency(totalFolha)}</p>
          </div>
          <div className="card-premium p-4 text-center">
            <p className="text-xs text-muted-foreground">Status</p>
            <Badge className={selected.status === 'ativa' ? 'bg-success text-success-foreground' : ''}>
              {selected.status}
            </Badge>
          </div>
        </div>

        {selected.notes && (
          <div className="card-premium p-4">
            <p className="text-xs text-muted-foreground mb-1">Observações</p>
            <p className="text-sm text-foreground">{selected.notes}</p>
          </div>
        )}

        <div className="card-premium p-4">
          <h2 className="text-sm font-bold text-foreground mb-3">Resumo de Funcionários</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Nome</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Cargo</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Salário</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Status</th>
              </tr>
            </thead>
            <tbody>
              {emps.slice(0, 20).map(e => (
                <tr key={e.id} className="border-b hover:bg-muted/20">
                  <td className="px-3 py-2 font-medium">{e.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{e.cargo}</td>
                  <td className="px-3 py-2">{formatCurrency(e.salarioBase)}</td>
                  <td className="px-3 py-2">
                    <Badge className={`text-[10px] ${e.status === 'ativo' ? 'bg-success text-success-foreground' : 'bg-muted text-muted-foreground'}`}>
                      {e.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {emps.length > 20 && <p className="text-xs text-muted-foreground mt-2 px-3">Exibindo 20 de {emps.length} funcionários</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold font-display text-foreground">Empresas</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {companies.map(c => {
          const empCount = employees.filter(e => e.companyId === c.id && e.status === 'ativo').length;
          return (
            <div key={c.id} className="card-premium p-6 cursor-pointer hover:ring-2 hover:ring-primary/30 transition-all"
              onClick={() => setSelectedId(c.id)}>
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 gradient-primary rounded-xl flex items-center justify-center">
                  <Building2 className="w-6 h-6 text-primary-foreground" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold font-display text-foreground">{c.name}</h3>
                  <p className="text-sm text-muted-foreground">{c.cnpj}</p>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1"><MapPin className="w-4 h-4" />{c.city}</span>
                <span className="flex items-center gap-1"><Users className="w-4 h-4" />{empCount} ativos</span>
                <Badge variant={c.status === 'ativa' ? 'default' : 'secondary'}
                  className={c.status === 'ativa' ? 'bg-success text-success-foreground' : ''}>
                  {c.status}
                </Badge>
              </div>
              {c.notes && <p className="text-xs text-muted-foreground mt-3">{c.notes}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default EmpresasPage;
