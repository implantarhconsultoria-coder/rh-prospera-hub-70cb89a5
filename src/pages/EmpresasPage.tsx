import React from 'react';
import { useApp } from '@/context/AppContext';
import { Building2, MapPin } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const EmpresasPage: React.FC = () => {
  const { companies } = useApp();

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold font-display text-foreground">Empresas</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {companies.map(c => (
          <div key={c.id} className="card-premium p-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 gradient-primary rounded-xl flex items-center justify-center">
                <Building2 className="w-6 h-6 text-primary-foreground" />
              </div>
              <div>
                <h3 className="font-bold font-display text-foreground">{c.name}</h3>
                <p className="text-sm text-muted-foreground">{c.cnpj}</p>
              </div>
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1"><MapPin className="w-4 h-4" />{c.city}</span>
              <Badge variant={c.status === 'ativa' ? 'default' : 'secondary'}
                className={c.status === 'ativa' ? 'bg-success text-success-foreground' : ''}>
                {c.status}
              </Badge>
            </div>
            {c.notes && <p className="text-xs text-muted-foreground mt-3">{c.notes}</p>}
          </div>
        ))}
      </div>
    </div>
  );
};

export default EmpresasPage;
