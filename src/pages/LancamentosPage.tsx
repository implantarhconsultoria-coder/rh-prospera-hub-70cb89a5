import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '@/context/AppContext';
import { formatCurrency } from '@/lib/calculations';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Save, Lock, Filter, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { useSearchParams } from 'react-router-dom';

const LancamentosPage: React.FC = () => {
  const { companies, employees, getOrCreateEntries, updateEntry, entries, userRole } = useApp();
  const [searchParams] = useSearchParams();
  const [selectedCompany, setSelectedCompany] = useState(searchParams.get('empresa') || companies[0]?.id || '');
  const [competencia, setCompetencia] = useState(searchParams.get('comp') || new Date().toISOString().slice(0, 7));
  const [origemFiltro, setOrigemFiltro] = useState<'todos' | 'manual' | 'consolidado'>('todos');

  const isAdmin = userRole === 'admin';

  useEffect(() => {
    if (selectedCompany && competencia) {
      const created = getOrCreateEntries(selectedCompany, competencia);
      const compEmpsLocal = employees.filter(e => e.companyId === selectedCompany && e.status === 'ativo' && e.categoria === 'operacional');
      compEmpsLocal.forEach(emp => {
        const entry = created.find(e => e.employeeId === emp.id);
        if (entry && entry.adiantamento === 0) {
          updateEntry(emp.id, competencia, { adiantamento: Math.round(emp.salarioBase * 0.4 * 100) / 100 });
        }
      });
    }
  }, [selectedCompany, competencia]);

  const compEntries = useMemo(
    () => entries.filter(e => e.companyId === selectedCompany && e.competencia === competencia),
    [entries, selectedCompany, competencia]
  );
  const compEmps = employees.filter(e => e.companyId === selectedCompany && e.status === 'ativo' && e.categoria === 'operacional');

  const empresaNome = companies.find(c => c.id === selectedCompany)?.name || '';

  // estatísticas por origem
  const stats = useMemo(() => ({
    manual: compEntries.filter(e => (e.origem || 'manual') === 'manual').length,
    consolidado: compEntries.filter(e => e.origem === 'consolidado').length,
    bloqueados: compEntries.filter(e => e.bloqueado).length,
  }), [compEntries]);

  const empsFiltrados = useMemo(() => {
    return compEmps.filter(emp => {
      if (origemFiltro === 'todos') return true;
      const entry = compEntries.find(e => e.employeeId === emp.id);
      const o = entry?.origem || 'manual';
      return o === origemFiltro;
    });
  }, [compEmps, compEntries, origemFiltro]);

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground">Lançamentos Mensais</h1>
          <p className="text-xs text-muted-foreground flex items-center gap-2">
            <Building2 className="w-3 h-3" /> {empresaNome} • {competencia}
            {isAdmin && <Badge variant="outline" className="text-[10px]">Admin pode editar mesmo bloqueados</Badge>}
          </p>
        </div>
        <div className="flex gap-2 text-xs">
          <Badge variant="secondary">Manual: {stats.manual}</Badge>
          <Badge variant="default" className="bg-success text-success-foreground">Consolidado: {stats.consolidado}</Badge>
          {stats.bloqueados > 0 && <Badge variant="destructive" className="gap-1"><Lock className="w-3 h-3" /> {stats.bloqueados} bloqueados</Badge>}
        </div>
      </div>

      <div className="card-premium p-4 flex flex-wrap gap-3 items-center">
        <div>
          <label className="text-[10px] text-muted-foreground uppercase block mb-1">Filial</label>
          <select value={selectedCompany} onChange={e => setSelectedCompany(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm bg-background text-foreground">
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground uppercase block mb-1">Competência</label>
          <Input type="month" value={competencia} onChange={e => setCompetencia(e.target.value)} className="w-44" />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground uppercase block mb-1 flex items-center gap-1"><Filter className="w-3 h-3" /> Origem</label>
          <select value={origemFiltro} onChange={e => setOrigemFiltro(e.target.value as any)}
            className="border rounded-lg px-3 py-2 text-sm bg-background text-foreground">
            <option value="todos">Todos</option>
            <option value="manual">Manual</option>
            <option value="consolidado">Consolidado (filial)</option>
          </select>
        </div>
        <Button onClick={() => toast.success('Lançamentos salvos!')} className="gradient-primary text-primary-foreground ml-auto">
          <Save className="w-4 h-4 mr-2" /> Salvar Lançamentos
        </Button>
      </div>

      <div className="card-premium overflow-x-auto overflow-y-auto max-h-[calc(100vh-260px)]" style={{ overflowX: 'scroll' }}>
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="border-b bg-muted">
              {['Origem','Funcionário','Cargo','Salário','Faltas (dias)','Atrasos (h)','HE 50%','HE 100%','Adicionais','Descontos','Adiant.','Insal.','Status','Obs'].map(h => (
                <th key={h} className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {empsFiltrados.map(emp => {
              const entry = compEntries.find(e => e.employeeId === emp.id);
              if (!entry) return null;
              const update = (data: any) => updateEntry(emp.id, competencia, data);
              const isLocked = !!entry.bloqueado && !isAdmin;
              const isConsolidado = entry.origem === 'consolidado';
              return (
                <tr key={emp.id} className={`border-b hover:bg-muted/20 ${isLocked ? 'bg-muted/30' : ''}`}>
                  <td className="px-3 py-2">
                    {isConsolidado ? (
                      <Badge variant="default" className="bg-success text-success-foreground gap-1 text-[10px]">
                        {entry.bloqueado && <Lock className="w-3 h-3" />} Consolidado
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">Manual</Badge>
                    )}
                  </td>
                  <td className="px-3 py-2 font-medium whitespace-nowrap">{emp.name}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{emp.cargo}</td>
                  <td className="px-3 py-2 text-xs">{formatCurrency(emp.salarioBase)}</td>
                  <td className="px-3 py-2"><Input disabled={isLocked} type="number" value={entry.faltasDias} onChange={e => update({ faltasDias: Number(e.target.value) })} className="w-16 text-xs h-8" /></td>
                  <td className="px-3 py-2"><Input disabled={isLocked} type="number" value={entry.atrasos} onChange={e => update({ atrasos: Number(e.target.value) })} className="w-16 text-xs h-8" /></td>
                  <td className="px-3 py-2"><Input disabled={isLocked} type="number" value={entry.he50} onChange={e => update({ he50: Number(e.target.value) })} className="w-16 text-xs h-8" /></td>
                  <td className="px-3 py-2"><Input disabled={isLocked} type="number" value={entry.he100} onChange={e => update({ he100: Number(e.target.value) })} className="w-16 text-xs h-8" /></td>
                  <td className="px-3 py-2"><Input disabled={isLocked} type="number" value={entry.adicionais} onChange={e => update({ adicionais: Number(e.target.value) })} className="w-20 text-xs h-8" /></td>
                  <td className="px-3 py-2"><Input disabled={isLocked} type="number" value={entry.descontosDiversos} onChange={e => update({ descontosDiversos: Number(e.target.value) })} className="w-20 text-xs h-8" /></td>
                  <td className="px-3 py-2 text-xs">{formatCurrency(Math.round(emp.salarioBase * 0.4 * 100) / 100)}</td>
                  <td className="px-3 py-2 text-xs">{emp.insalubridadeAtiva ? formatCurrency(emp.insalubridadeValor) : '—'}</td>
                  <td className="px-3 py-2">
                    <select disabled={isLocked} value={entry.statusConferencia} onChange={e => update({ statusConferencia: e.target.value })}
                      className="border rounded px-1.5 py-1 text-xs bg-background text-foreground">
                      <option value="pendente">Pendente</option>
                      <option value="conferido">Conferido</option>
                      <option value="divergente">Divergente</option>
                    </select>
                  </td>
                  <td className="px-3 py-2"><Input disabled={isLocked} value={entry.observacoes} onChange={e => update({ observacoes: e.target.value })} className="w-24 text-xs h-8" placeholder="..." /></td>
                </tr>
              );
            })}
            {empsFiltrados.length === 0 && (
              <tr><td colSpan={14} className="px-3 py-8 text-center text-muted-foreground text-sm">Nenhum lançamento para o filtro selecionado.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default LancamentosPage;
