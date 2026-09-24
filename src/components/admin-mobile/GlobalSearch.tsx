import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Users, Building2, LayoutGrid, X } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export interface SearchModule { label: string; path: string; }

interface Props {
  open: boolean;
  onClose: () => void;
  query: string;
  onQuery: (q: string) => void;
  modules: SearchModule[];
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const GlobalSearch: React.FC<Props> = ({ open, onClose, query, onQuery, modules }) => {
  const { employees, companies } = useApp();
  const nav = useNavigate();

  const q = norm(query.trim());
  const empResults = useMemo(() => !q ? [] : employees
    .filter(e => norm(e.name).includes(q) || (e.cpf || '').includes(query))
    .slice(0, 8), [q, employees, query]);
  const coResults = useMemo(() => !q ? [] : companies
    .filter(c => norm(c.name).includes(q) || norm(c.codigo).includes(q))
    .slice(0, 6), [q, companies]);
  const modResults = useMemo(() => !q ? modules.slice(0, 8) : modules
    .filter(m => norm(m.label).includes(q)).slice(0, 10), [q, modules]);

  const go = (path: string) => { onClose(); onQuery(''); nav(path,{state:{openMobileModule:true}}); };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <div className="flex items-center gap-2 p-3 border-b border-border bg-card">
        <Search className="w-5 h-5 text-muted-foreground" />
        <Input
          autoFocus
          value={query}
          onChange={e => onQuery(e.target.value)}
          placeholder="Buscar funcionário, empresa, módulo..."
          className="border-0 focus-visible:ring-0 h-10 text-base"
        />
        <Button size="icon" variant="ghost" onClick={onClose}><X className="w-5 h-5" /></Button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-5">
        {empResults.length > 0 && (
          <Section icon={<Users className="w-4 h-4" />} title="Funcionários">
            {empResults.map(e => (
              <Row key={e.id} title={e.name} subtitle={`${e.cargo || ''} · ${e.cpf || ''}`}
                onClick={() => go(`/admin/funcionarios/${e.id}`)} />
            ))}
          </Section>
        )}

        {coResults.length > 0 && (
          <Section icon={<Building2 className="w-4 h-4" />} title="Empresas">
            {coResults.map(c => (
              <Row key={c.id} title={c.name} subtitle={c.codigo}
                onClick={() => go('/admin/empresas')} />
            ))}
          </Section>
        )}

        {modResults.length > 0 && (
          <Section icon={<LayoutGrid className="w-4 h-4" />} title="Módulos">
            {modResults.map(m => (
              <Row key={m.path} title={m.label} subtitle={m.path}
                onClick={() => go(m.path)} />
            ))}
          </Section>
        )}

        {q && empResults.length === 0 && coResults.length === 0 && modResults.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-10">Nada encontrado para "{query}".</div>
        )}
      </div>
    </div>
  );
};

const Section: React.FC<{ icon: React.ReactNode; title: string; children: React.ReactNode }> = ({ icon, title, children }) => (
  <div>
    <div className="flex items-center gap-2 px-1 mb-2 text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
      {icon}{title}
    </div>
    <div className="space-y-1.5">{children}</div>
  </div>
);

const Row: React.FC<{ title: string; subtitle?: string; onClick: () => void }> = ({ title, subtitle, onClick }) => (
  <button onClick={onClick} className="w-full text-left p-3 rounded-xl bg-card border border-border active:scale-[0.99] transition">
    <div className="text-sm font-medium text-foreground truncate">{title}</div>
    {subtitle && <div className="text-xs text-muted-foreground truncate">{subtitle}</div>}
  </button>
);

export default GlobalSearch;
