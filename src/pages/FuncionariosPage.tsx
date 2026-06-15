import React, { useState } from 'react';
import { useApp } from '@/context/AppContext';
import { useLocation } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, UserPlus, X, Save, KeyRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatCurrency } from '@/lib/calculations';
import { Button } from '@/components/ui/button';
import { useFilialFilter } from '@/hooks/useFilialFilter';
import { toast } from 'sonner';
import { upsertFuncionarioBase } from '@/lib/funcionariosBase';

const FuncionariosPage: React.FC = () => {
  const { employees, companies, refreshData } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const { isFilial, filialCompanyId } = useFilialFilter();
  const [search, setSearch] = useState('');
  const [filterCompany, setFilterCompany] = useState('');
  const [filterStatus, setFilterStatus] = useState<'ativos' | 'inativos' | 'todos'>('ativos');
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);

  const [newEmp, setNewEmp] = useState({
    nome: '', cpf: '', cargo: '', salario_base: '', data_admissao: '',
    telefone: '', celular: '', email: '', endereco: '', rg: '',
  });

  const portalPrefix = location.pathname.startsWith('/filial') ? '/filial'
    : location.pathname.startsWith('/admin') ? '/admin' : '';
  const isAdminPortal = portalPrefix === '/admin';

  const filtered = employees.filter(e => {
    if (search && !e.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterCompany && e.companyId !== filterCompany) return false;
    if (filterStatus === 'ativos' && e.status === 'desligado') return false;
    if (filterStatus === 'inativos' && e.status !== 'desligado') return false;
    return true;
  });

  const operacionais = filtered.filter(e => e.categoria === 'operacional');
  const socios = filtered.filter(e => e.categoria === 'socio');

  const handleSaveNew = async () => {
    if (!newEmp.nome.trim()) { toast.error('Nome e obrigatorio'); return; }
    const companyId = isFilial ? filialCompanyId : filterCompany;
    if (!companyId) { toast.error('Selecione a empresa primeiro'); return; }

    setSaving(true);
    const result = await upsertFuncionarioBase({
      employees,
      companies,
      companyId,
      nome: newEmp.nome.trim(),
      cpf: newEmp.cpf,
      cargo: newEmp.cargo,
      salarioBase: Number(newEmp.salario_base) || 0,
      dataAdmissao: newEmp.data_admissao || null,
      telefone: newEmp.telefone,
      celular: newEmp.celular,
      email: newEmp.email,
      endereco: newEmp.endereco,
      rg: newEmp.rg,
      setor: 'operacional',
    });
    setSaving(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(result.action === 'created' ? 'Funcionario cadastrado com sucesso!' : 'Funcionario existente atualizado e vinculado.');
    setShowNew(false);
    setNewEmp({ nome: '', cpf: '', cargo: '', salario_base: '', data_admissao: '', telefone: '', celular: '', email: '', endereco: '', rg: '' });
    await refreshData();
  };

  const abrirAcessos = (event: React.MouseEvent, funcionarioId: string) => {
    event.stopPropagation();
    navigate(`/admin/acessos-externos?funcionario=${funcionarioId}`);
  };

  const renderCard = (e: typeof employees[0]) => (
    <div key={e.id} className="card-premium p-5 cursor-pointer hover:shadow-premium transition-shadow"
      onClick={() => navigate(`${portalPrefix}/funcionarios/${e.id}`)}>
      <div className="flex items-start gap-3 mb-3">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-primary-foreground font-bold text-sm ${e.categoria === 'socio' ? 'bg-accent' : 'gradient-primary'}`}>
          {e.name.split(' ').map(n => n[0]).slice(0, 2).join('')}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-foreground text-sm truncate">{e.name}</h3>
          <p className="text-xs text-muted-foreground truncate">{e.cargo}</p>
        </div>
        {isAdminPortal && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={(event) => abrirAcessos(event, e.id)}
            className="h-8 shrink-0 gap-1.5"
            title="Liberar módulos deste funcionário"
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">Módulos</span>
          </Button>
        )}
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{companies.find(c => c.id === e.companyId)?.name}</span>
        <span className="font-semibold text-foreground">{formatCurrency(e.salarioBase)}</span>
      </div>
      <div className="mt-2 flex gap-1">
        <Badge className={`text-[10px] ${e.status === 'ativo' ? 'bg-success text-success-foreground' : 'bg-muted text-muted-foreground'}`}>
          {e.status}
        </Badge>
        {e.categoria === 'socio' && (
          <Badge variant="outline" className="text-[10px] border-accent text-accent">Socio</Badge>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold font-display text-foreground">Funcionarios</h1>
        <Button onClick={() => setShowNew(true)} className="gradient-primary text-primary-foreground">
          <UserPlus className="w-4 h-4 mr-2" /> Novo Funcionario
        </Button>
      </div>

      {showNew && (
        <div className="card-premium p-5 space-y-4 border-l-4 border-primary">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground">Cadastrar Novo Funcionario</h2>
            <Button variant="ghost" size="icon" onClick={() => setShowNew(false)}><X className="w-4 h-4" /></Button>
          </div>
          {isFilial && (
            <p className="text-xs text-muted-foreground">
              Empresa: <strong>{companies.find(c => c.id === filialCompanyId)?.name}</strong>
            </p>
          )}
          {!isFilial && !filterCompany && (
            <p className="text-xs text-warning">Selecione uma empresa no filtro antes de cadastrar.</p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <div><label className="text-xs text-muted-foreground block mb-1">Nome Completo *</label><Input value={newEmp.nome} onChange={e => setNewEmp(p => ({ ...p, nome: e.target.value }))} /></div>
            <div><label className="text-xs text-muted-foreground block mb-1">CPF</label><Input value={newEmp.cpf} onChange={e => setNewEmp(p => ({ ...p, cpf: e.target.value }))} /></div>
            <div><label className="text-xs text-muted-foreground block mb-1">RG</label><Input value={newEmp.rg} onChange={e => setNewEmp(p => ({ ...p, rg: e.target.value }))} /></div>
            <div><label className="text-xs text-muted-foreground block mb-1">Cargo / Funcao</label><Input value={newEmp.cargo} onChange={e => setNewEmp(p => ({ ...p, cargo: e.target.value }))} /></div>
            <div><label className="text-xs text-muted-foreground block mb-1">Salario Base</label><Input type="number" value={newEmp.salario_base} onChange={e => setNewEmp(p => ({ ...p, salario_base: e.target.value }))} /></div>
            <div><label className="text-xs text-muted-foreground block mb-1">Data Admissao</label><Input type="date" value={newEmp.data_admissao} onChange={e => setNewEmp(p => ({ ...p, data_admissao: e.target.value }))} /></div>
            <div><label className="text-xs text-muted-foreground block mb-1">Telefone</label><Input value={newEmp.telefone} onChange={e => setNewEmp(p => ({ ...p, telefone: e.target.value }))} /></div>
            <div><label className="text-xs text-muted-foreground block mb-1">Celular</label><Input value={newEmp.celular} onChange={e => setNewEmp(p => ({ ...p, celular: e.target.value }))} /></div>
            <div><label className="text-xs text-muted-foreground block mb-1">E-mail</label><Input value={newEmp.email} onChange={e => setNewEmp(p => ({ ...p, email: e.target.value }))} /></div>
          </div>
          <div className="flex gap-3">
            <Button onClick={handleSaveNew} disabled={saving} className="gradient-primary text-primary-foreground"><Save className="w-4 h-4 mr-2" /> {saving ? 'Salvando...' : 'Salvar Funcionario'}</Button>
            <Button variant="outline" onClick={() => setShowNew(false)}>Cancelar</Button>
          </div>
        </div>
      )}

      <div className="card-premium p-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]"><Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" /><Input placeholder="Buscar funcionario..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" /></div>
        {!isFilial && (<select value={filterCompany} onChange={e => setFilterCompany(e.target.value)} className="border rounded-lg px-3 py-2 text-sm bg-background text-foreground"><option value="">Todas Empresas</option>{companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>)}
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as typeof filterStatus)} className="border rounded-lg px-3 py-2 text-sm bg-background text-foreground"><option value="ativos">Ativos</option><option value="inativos">Inativos</option><option value="todos">Todos</option></select>
      </div>

      {operacionais.length > 0 && (<><h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Operacionais ({operacionais.length})</h2><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{operacionais.map(renderCard)}</div></>)}
      {socios.length > 0 && (<><h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mt-6">Socios / Pro-labore ({socios.length})</h2><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{socios.map(renderCard)}</div></>)}
      {filtered.length === 0 && (<div className="text-center py-12 text-muted-foreground"><p>Nenhum funcionario encontrado.</p></div>)}
    </div>
  );
};

export default FuncionariosPage;
