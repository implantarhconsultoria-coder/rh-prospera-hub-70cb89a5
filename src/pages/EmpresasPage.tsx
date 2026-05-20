import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import { Building2, MapPin, Users, ChevronRight, ArrowLeft, Search, Plus, X, Save } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/calculations';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const companyOrder = ['topac-matriz', 'topac-pg', 'topac-gyn', 'lmt', 'alqui'];

const EmpresasPage: React.FC = () => {
  const { companies, employees } = useApp();
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState('');
  const [search, setSearch] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [savingCompany, setSavingCompany] = useState(false);
  const [newCompany, setNewCompany] = useState({
    nome: '',
    cnpj: '',
    cidade: '',
    estado: '',
    tipo: 'Matriz',
  });

  const saveCompany = async () => {
    if (!newCompany.nome.trim()) { toast.error('Informe a razao social/nome da empresa'); return; }
    setSavingCompany(true);
    const { error } = await supabase.from('empresas').insert({
      nome: newCompany.nome.trim(),
      cnpj: newCompany.cnpj.trim(),
      cidade: newCompany.cidade.trim(),
      estado: newCompany.estado.trim(),
      tipo: newCompany.tipo.trim(),
      ativa: true,
      status: 'ativa',
      observacoes: newCompany.tipo.trim(),
    } as any);
    setSavingCompany(false);
    if (error) { toast.error('Erro ao cadastrar empresa: ' + error.message); return; }
    toast.success('Empresa cadastrada');
    setShowNew(false);
    setNewCompany({ nome: '', cnpj: '', cidade: '', estado: '', tipo: 'Matriz' });
    window.location.reload();
  };

  const orderedCompanies = [...companies].sort((a, b) => {
    const ai = companyOrder.indexOf(a.codigo || a.id);
    const bi = companyOrder.indexOf(b.codigo || b.id);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi) || a.name.localeCompare(b.name);
  });
  const selected = companies.find(c => c.id === selectedId);

  if (selected) {
    const emps = employees.filter(e => e.companyId === selected.id);
    const ativos = emps.filter(e => e.status === 'ativo');
    const afastados = emps.filter(e => e.status === 'afastado');
    const ferias = emps.filter(e => e.status === 'fÃƒÂ©rias' || e.status === 'férias');
    const desligados = emps.filter(e => e.status === 'desligado');
    const totalFolha = ativos.reduce((s, e) => s + e.salarioBase, 0);
    const q = search.trim().toLowerCase();
    const filteredEmps = emps.filter(e =>
      !q || e.name.toLowerCase().includes(q) || e.cargo.toLowerCase().includes(q) || e.cpf.includes(q)
    );

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
              <p className="text-primary-foreground/70 text-sm">CNPJ: {selected.cnpj} - {selected.city}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="card-premium p-4 text-center">
            <p className="text-xs text-muted-foreground">Ativos</p>
            <p className="text-2xl font-bold text-foreground">{ativos.length}</p>
          </div>
          <div className="card-premium p-4 text-center">
            <p className="text-xs text-muted-foreground">Afastados</p>
            <p className="text-2xl font-bold text-foreground">{afastados.length}</p>
          </div>
          <div className="card-premium p-4 text-center">
            <p className="text-xs text-muted-foreground">Ferias</p>
            <p className="text-2xl font-bold text-foreground">{ferias.length}</p>
          </div>
          <div className="card-premium p-4 text-center">
            <p className="text-xs text-muted-foreground">Desligados</p>
            <p className="text-2xl font-bold text-foreground">{desligados.length}</p>
          </div>
          <div className="card-premium p-4 text-center">
            <p className="text-xs text-muted-foreground">Estimativa Mensal</p>
            <p className="text-xl font-bold text-success">{formatCurrency(totalFolha)}</p>
          </div>
        </div>

        {selected.notes && (
          <div className="card-premium p-4">
            <p className="text-xs text-muted-foreground mb-1">Observacoes</p>
            <p className="text-sm text-foreground">{selected.notes}</p>
          </div>
        )}

        <div className="card-premium p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-3">
            <div>
              <h2 className="text-sm font-bold text-foreground">Funcionarios da Empresa</h2>
              <p className="text-xs text-muted-foreground">Clique no funcionario para abrir a ficha completa.</p>
            </div>
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por nome, cargo ou CPF"
                className="pl-9"
              />
            </div>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Nome</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Cargo</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Salario</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredEmps.map(e => (
                <tr
                  key={e.id}
                  className="border-b hover:bg-muted/20 cursor-pointer"
                  onClick={() => navigate(`/admin/funcionarios/${e.id}`)}
                >
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
          {filteredEmps.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhum funcionario encontrado.</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold font-display text-foreground">Empresas</h1>
        <Button onClick={() => setShowNew(true)} className="gradient-primary text-primary-foreground">
          <Plus className="w-4 h-4 mr-2" /> Nova Empresa
        </Button>
      </div>
      {showNew && (
        <div className="card-premium p-5 space-y-4 border-l-4 border-primary">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground">Cadastrar Empresa</h2>
            <Button variant="ghost" size="icon" onClick={() => setShowNew(false)}><X className="w-4 h-4" /></Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div className="md:col-span-2">
              <label className="text-xs text-muted-foreground block mb-1">Razao Social / Nome *</label>
              <Input value={newCompany.nome} onChange={e => setNewCompany(p => ({ ...p, nome: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">CNPJ</label>
              <Input value={newCompany.cnpj} onChange={e => setNewCompany(p => ({ ...p, cnpj: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Cidade</label>
              <Input value={newCompany.cidade} onChange={e => setNewCompany(p => ({ ...p, cidade: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">UF</label>
              <Input value={newCompany.estado} onChange={e => setNewCompany(p => ({ ...p, estado: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Tipo</label>
              <Input value={newCompany.tipo} onChange={e => setNewCompany(p => ({ ...p, tipo: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-3">
            <Button onClick={saveCompany} disabled={savingCompany} className="gradient-primary text-primary-foreground">
              <Save className="w-4 h-4 mr-2" /> {savingCompany ? 'Salvando...' : 'Salvar Empresa'}
            </Button>
            <Button variant="outline" onClick={() => setShowNew(false)}>Cancelar</Button>
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {orderedCompanies.map(c => {
          const activeCount = employees.filter(e => e.companyId === c.id && e.status === 'ativo').length;
          const totalCount = employees.filter(e => e.companyId === c.id).length;
          return (
            <div
              key={c.id}
              className="card-premium p-6 cursor-pointer hover:ring-2 hover:ring-primary/30 transition-all"
              onClick={() => { setSelectedId(c.id); setSearch(''); }}
            >
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
                <span className="flex items-center gap-1"><Users className="w-4 h-4" />{activeCount} ativos / {totalCount} total</span>
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
