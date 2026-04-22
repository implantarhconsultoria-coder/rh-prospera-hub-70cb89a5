import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '@/context/AppContext';
import { formatCurrency } from '@/lib/calculations';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Save, Lock, Filter, Building2, Search, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useSearchParams } from 'react-router-dom';

const LancamentosPage: React.FC = () => {
  const { companies, employees, getOrCreateEntries, updateEntry, entries, userRole } = useApp();
  const [searchParams] = useSearchParams();
  const [selectedCompany, setSelectedCompany] = useState(searchParams.get('empresa') || companies[0]?.id || '');
  const [competencia, setCompetencia] = useState(searchParams.get('comp') || new Date().toISOString().slice(0, 7));
  const [origemFiltro, setOrigemFiltro] = useState<'todos' | 'manual' | 'consolidado'>('todos');
  const [busca, setBusca] = useState('');

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompany, competencia]);

  const compEntries = useMemo(
    () => entries.filter(e => e.companyId === selectedCompany && e.competencia === competencia),
    [entries, selectedCompany, competencia],
  );
  const compEmps = useMemo(
    () => employees.filter(e => e.companyId === selectedCompany && e.status === 'ativo' && e.categoria === 'operacional'),
    [employees, selectedCompany],
  );

  const empresaNome = companies.find(c => c.id === selectedCompany)?.name || '';

  const stats = useMemo(() => ({
    manual: compEntries.filter(e => (e.origem || 'manual') === 'manual').length,
    consolidado: compEntries.filter(e => e.origem === 'consolidado').length,
    bloqueados: compEntries.filter(e => e.bloqueado).length,
    pendentes: compEntries.filter(e => e.statusConferencia === 'pendente').length,
    divergentes: compEntries.filter(e => e.statusConferencia === 'divergente').length,
  }), [compEntries]);

  const empsFiltrados = useMemo(() => {
    return compEmps.filter(emp => {
      if (busca && !emp.name.toLowerCase().includes(busca.toLowerCase()) && !emp.cargo.toLowerCase().includes(busca.toLowerCase())) return false;
      if (origemFiltro === 'todos') return true;
      const entry = compEntries.find(e => e.employeeId === emp.id);
      const o = entry?.origem || 'manual';
      return o === origemFiltro;
    });
  }, [compEmps, compEntries, origemFiltro, busca]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header premium */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold font-display text-foreground tracking-tight">Lançamentos Mensais</h1>
          <p className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
            <Building2 className="w-4 h-4" />
            <span className="font-medium text-foreground">{empresaNome}</span>
            <span className="text-muted-foreground/60">•</span>
            <span>{competencia}</span>
            {isAdmin && <Badge variant="outline" className="ml-2 text-[10px]">Admin</Badge>}
          </p>
        </div>
        <Button onClick={() => toast.success('Lançamentos salvos!')} size="lg" className="gradient-primary text-primary-foreground shadow-premium">
          <Save className="w-4 h-4 mr-2" /> Salvar Alterações
        </Button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="p-4">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total</p>
          <p className="text-2xl font-bold font-display mt-1">{compEmps.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Manual</p>
          <p className="text-2xl font-bold font-display mt-1">{stats.manual}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Consolidado</p>
          <p className="text-2xl font-bold font-display text-success mt-1">{stats.consolidado}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Pendentes</p>
          <p className="text-2xl font-bold font-display text-warning mt-1">{stats.pendentes}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> Divergentes
          </p>
          <p className="text-2xl font-bold font-display text-destructive mt-1">{stats.divergentes}</p>
        </Card>
      </div>

      {/* Filtros */}
      <Card className="p-4 flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-[180px]">
          <label className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-1.5 font-medium">Filial</label>
          <select value={selectedCompany} onChange={e => setSelectedCompany(e.target.value)}
            className="w-full border rounded-lg px-3 py-2.5 text-sm bg-background text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition">
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-1.5 font-medium">Competência</label>
          <Input type="month" value={competencia} onChange={e => setCompetencia(e.target.value)} className="w-44 h-10" />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-1.5 font-medium flex items-center gap-1">
            <Filter className="w-3 h-3" /> Origem
          </label>
          <select value={origemFiltro} onChange={e => setOrigemFiltro(e.target.value as any)}
            className="border rounded-lg px-3 py-2.5 text-sm bg-background text-foreground h-10 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition">
            <option value="todos">Todos</option>
            <option value="manual">Manual</option>
            <option value="consolidado">Consolidado</option>
          </select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-1.5 font-medium">Buscar</label>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Nome ou cargo…" className="pl-9 h-10" />
          </div>
        </div>
      </Card>

      {/* Tabela */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 border-b">
              <tr>
                <th className="px-4 py-3.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Origem</th>
                <th className="px-4 py-3.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Funcionário</th>
                <th className="px-4 py-3.5 text-right text-[11px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Salário</th>
                <th className="px-4 py-3.5 text-center text-[11px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Faltas (d)</th>
                <th className="px-4 py-3.5 text-center text-[11px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Atrasos (h)</th>
                <th className="px-4 py-3.5 text-center text-[11px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">HE 50%</th>
                <th className="px-4 py-3.5 text-center text-[11px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">HE 100%</th>
                <th className="px-4 py-3.5 text-right text-[11px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Adicionais</th>
                <th className="px-4 py-3.5 text-right text-[11px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Descontos</th>
                <th className="px-4 py-3.5 text-right text-[11px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Adiant.</th>
                <th className="px-4 py-3.5 text-right text-[11px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Insal.</th>
                <th className="px-4 py-3.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Status</th>
                <th className="px-4 py-3.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Obs</th>
              </tr>
            </thead>
            <tbody>
              {empsFiltrados.map(emp => {
                const entry = compEntries.find(e => e.employeeId === emp.id);
                if (!entry) return null;
                const update = (data: any) => updateEntry(emp.id, competencia, data);
                const isLocked = !!entry.bloqueado && !isAdmin;
                const isConsolidado = entry.origem === 'consolidado';
                const statusBg = entry.statusConferencia === 'conferido' ? 'bg-success/5' : entry.statusConferencia === 'divergente' ? 'bg-destructive/5' : '';
                return (
                  <tr key={emp.id} className={`border-b hover:bg-muted/30 transition-colors ${isLocked ? 'bg-muted/20' : ''} ${statusBg}`}>
                    <td className="px-4 py-3">
                      {isConsolidado ? (
                        <Badge className="bg-success text-success-foreground gap-1 text-[10px]">
                          {entry.bloqueado && <Lock className="w-3 h-3" />} Consolidado
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">Manual</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="font-semibold text-foreground">{emp.name}</div>
                      <div className="text-xs text-muted-foreground">{emp.cargo}</div>
                    </td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums whitespace-nowrap">{formatCurrency(emp.salarioBase)}</td>
                    <td className="px-4 py-3 text-center"><Input disabled={isLocked} type="number" min="0" value={entry.faltasDias} onChange={e => update({ faltasDias: Number(e.target.value) })} className="w-20 h-9 text-sm text-center mx-auto" /></td>
                    <td className="px-4 py-3 text-center"><Input disabled={isLocked} type="number" min="0" step="0.5" value={entry.atrasos} onChange={e => update({ atrasos: Number(e.target.value) })} className="w-20 h-9 text-sm text-center mx-auto" /></td>
                    <td className="px-4 py-3 text-center"><Input disabled={isLocked} type="number" min="0" step="0.5" value={entry.he50} onChange={e => update({ he50: Number(e.target.value) })} className="w-20 h-9 text-sm text-center mx-auto" /></td>
                    <td className="px-4 py-3 text-center"><Input disabled={isLocked} type="number" min="0" step="0.5" value={entry.he100} onChange={e => update({ he100: Number(e.target.value) })} className="w-20 h-9 text-sm text-center mx-auto" /></td>
                    <td className="px-4 py-3 text-right"><Input disabled={isLocked} type="number" min="0" step="0.01" value={entry.adicionais} onChange={e => update({ adicionais: Number(e.target.value) })} className="w-24 h-9 text-sm text-right ml-auto" /></td>
                    <td className="px-4 py-3 text-right"><Input disabled={isLocked} type="number" min="0" step="0.01" value={entry.descontosDiversos} onChange={e => update({ descontosDiversos: Number(e.target.value) })} className="w-24 h-9 text-sm text-right ml-auto" /></td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums whitespace-nowrap text-muted-foreground">{formatCurrency(entry.adiantamento || 0)}</td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums whitespace-nowrap text-muted-foreground">{emp.insalubridadeAtiva ? formatCurrency(emp.insalubridadeValor) : '—'}</td>
                    <td className="px-4 py-3">
                      <select disabled={isLocked} value={entry.statusConferencia} onChange={e => update({ statusConferencia: e.target.value })}
                        className="border rounded-md px-2 py-1.5 text-xs bg-background text-foreground h-9">
                        <option value="pendente">Pendente</option>
                        <option value="conferido">Conferido</option>
                        <option value="divergente">Divergente</option>
                      </select>
                    </td>
                    <td className="px-4 py-3"><Input disabled={isLocked} value={entry.observacoes} onChange={e => update({ observacoes: e.target.value })} className="w-32 h-9 text-sm" placeholder="…" /></td>
                  </tr>
                );
              })}
              {empsFiltrados.length === 0 && (
                <tr><td colSpan={13} className="px-4 py-12 text-center text-muted-foreground text-sm">Nenhum lançamento para o filtro selecionado.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default LancamentosPage;
