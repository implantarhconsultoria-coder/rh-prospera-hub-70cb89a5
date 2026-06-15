import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { useLocation } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, UserPlus, X, Save, KeyRound, Check, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatCurrency } from '@/lib/calculations';
import { Button } from '@/components/ui/button';
import { useFilialFilter } from '@/hooks/useFilialFilter';
import { toast } from 'sonner';
import { upsertFuncionarioBase, onlyDigits } from '@/lib/funcionariosBase';
import { supabase } from '@/integrations/supabase/client';

const MODULOS = [
  { perfil: 'filial', modulo: 'filial', label: 'Filial / RH', descricao: 'Funcionários, ASO, atestados, férias e fechamento da filial' },
  { perfil: 'financeiro', modulo: 'financeiro', label: 'Financeiro', descricao: 'Pagar, receber, bancos, caixa e conciliação' },
  { perfil: 'faturamento', modulo: 'faturamento', label: 'Faturamento', descricao: 'Clientes, contratos, medições e faturas' },
  { perfil: 'almoxarifado', modulo: 'almoxarifado', label: 'Almoxarifado', descricao: 'Entradas, saídas e histórico de estoque' },
  { perfil: 'operacional', modulo: 'operacional', label: 'Operacional', descricao: 'Chamados e protocolo operacional' },
  { perfil: 'tecnico_campo', modulo: 'campo', label: 'Técnico de Campo', descricao: 'Chamados e atividades externas' },
  { perfil: 'mecanico_externo', modulo: 'mecanico', label: 'App Mecânico', descricao: 'Ponto, chamados, veículo, abastecimento e histórico no app' },
] as const;

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
  const [acessoEmployeeId, setAcessoEmployeeId] = useState<string | null>(null);
  const [modulosAtivos, setModulosAtivos] = useState<string[]>([]);
  const [loadingAcessos, setLoadingAcessos] = useState(false);
  const [salvandoAcessos, setSalvandoAcessos] = useState(false);

  const [newEmp, setNewEmp] = useState({ nome: '', cpf: '', cargo: '', salario_base: '', data_admissao: '', telefone: '', celular: '', email: '', endereco: '', rg: '' });
  const portalPrefix = location.pathname.startsWith('/filial') ? '/filial' : location.pathname.startsWith('/admin') ? '/admin' : '';
  const isAdminPortal = portalPrefix === '/admin';
  const acessoEmployee = useMemo(() => employees.find(employee => employee.id === acessoEmployeeId) || null, [employees, acessoEmployeeId]);
  const acessoCompany = acessoEmployee ? companies.find(company => company.id === acessoEmployee.companyId) : null;

  const filtered = employees.filter(e => {
    if (search && !e.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterCompany && e.companyId !== filterCompany) return false;
    if (filterStatus === 'ativos' && e.status === 'desligado') return false;
    if (filterStatus === 'inativos' && e.status !== 'desligado') return false;
    return true;
  });
  const operacionais = filtered.filter(e => e.categoria === 'operacional');
  const socios = filtered.filter(e => e.categoria === 'socio');

  useEffect(() => {
    if (!acessoEmployee) return;
    const carregar = async () => {
      setLoadingAcessos(true);
      const cpfClean = onlyDigits(acessoEmployee.cpf || '');
      const filter = cpfClean.length === 11 ? `cpf_clean.eq.${cpfClean},funcionario_id.eq.${acessoEmployee.id}` : `funcionario_id.eq.${acessoEmployee.id}`;
      const { data, error } = await supabase.from('acessos_externos' as any).select('modulo,status,acesso_liberado').or(filter);
      if (error) toast.error('Não foi possível carregar os módulos deste funcionário.');
      setModulosAtivos(((data as any[]) || []).filter(row => row.status === 'ativo' && row.acesso_liberado).map(row => row.modulo));
      setLoadingAcessos(false);
    };
    carregar();
  }, [acessoEmployee?.id, acessoEmployee?.cpf]);

  const handleSaveNew = async () => {
    if (!newEmp.nome.trim()) return toast.error('Nome é obrigatório');
    const companyId = isFilial ? filialCompanyId : filterCompany;
    if (!companyId) return toast.error('Selecione a empresa primeiro');
    setSaving(true);
    const result = await upsertFuncionarioBase({ employees, companies, companyId, nome: newEmp.nome.trim(), cpf: newEmp.cpf, cargo: newEmp.cargo, salarioBase: Number(newEmp.salario_base) || 0, dataAdmissao: newEmp.data_admissao || null, telefone: newEmp.telefone, celular: newEmp.celular, email: newEmp.email, endereco: newEmp.endereco, rg: newEmp.rg, setor: 'operacional' });
    setSaving(false);
    if (!result.ok) return toast.error(result.error);
    toast.success(result.action === 'created' ? 'Funcionário cadastrado com sucesso!' : 'Funcionário existente atualizado e vinculado.');
    setShowNew(false);
    setNewEmp({ nome: '', cpf: '', cargo: '', salario_base: '', data_admissao: '', telefone: '', celular: '', email: '', endereco: '', rg: '' });
    await refreshData();
  };

  const abrirAcessos = (event: React.MouseEvent, funcionarioId: string) => {
    event.stopPropagation();
    setModulosAtivos([]);
    setAcessoEmployeeId(funcionarioId);
  };

  const toggleModulo = (modulo: string) => setModulosAtivos(current => current.includes(modulo) ? current.filter(item => item !== modulo) : [...current, modulo]);

  const salvarAcessos = async () => {
    if (!acessoEmployee || salvandoAcessos) return;
    const cpfClean = onlyDigits(acessoEmployee.cpf || '');
    if (cpfClean.length !== 11) return toast.error('Cadastre o CPF completo do funcionário antes de liberar acesso.');
    if (acessoEmployee.status === 'desligado') return toast.error('Funcionário desligado não pode receber acesso.');
    setSalvandoAcessos(true);
    const { data: existentes, error: loadError } = await supabase.from('acessos_externos' as any).select('id,modulo').or(`cpf_clean.eq.${cpfClean},funcionario_id.eq.${acessoEmployee.id}`);
    if (loadError) { setSalvandoAcessos(false); return toast.error('Não foi possível conferir os acessos atuais.'); }

    const email = String((acessoEmployee as any).email || '').trim().toLowerCase() || null;
    const telefone = String((acessoEmployee as any).telefone || (acessoEmployee as any).celular || '').trim();
    const payload = MODULOS.filter(item => modulosAtivos.includes(item.modulo)).map(item => ({
      nome: acessoEmployee.name.trim(), cpf: acessoEmployee.cpf, cpf_clean: cpfClean, pin: cpfClean.slice(-4), email,
      observacoes: JSON.stringify({ telefone, atualizado_em: new Date().toISOString() }), empresa: acessoCompany?.name || null,
      filial: (acessoCompany as any)?.cidade || null, funcao: acessoEmployee.cargo || null, funcionario_id: acessoEmployee.id,
      perfil_acesso: item.perfil, modulo: item.modulo, status: 'ativo', acesso_liberado: true,
    }));

    if (payload.length) {
      const { error } = await supabase.from('acessos_externos' as any).upsert(payload, { onConflict: 'cpf_clean,modulo', ignoreDuplicates: false });
      if (error) { setSalvandoAcessos(false); return toast.error(`Não foi possível liberar os módulos: ${error.message}`); }
    }
    const idsBloquear = ((existentes as any[]) || []).filter(row => !modulosAtivos.includes(row.modulo)).map(row => row.id);
    if (idsBloquear.length) {
      const { error } = await supabase.from('acessos_externos' as any).update({ status: 'bloqueado', acesso_liberado: false }).in('id', idsBloquear);
      if (error) { setSalvandoAcessos(false); return toast.error(`Erro ao bloquear os módulos removidos: ${error.message}`); }
    }
    setSalvandoAcessos(false);
    toast.success(modulosAtivos.length ? 'Módulos do funcionário atualizados.' : 'Todos os acessos deste funcionário foram bloqueados.');
    setAcessoEmployeeId(null);
  };

  const renderCard = (e: typeof employees[0]) => (
    <div key={e.id} className="card-premium p-5 cursor-pointer hover:shadow-premium transition-shadow" onClick={() => navigate(`${portalPrefix}/funcionarios/${e.id}`)}>
      <div className="flex items-start gap-3 mb-3">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-primary-foreground font-bold text-sm ${e.categoria === 'socio' ? 'bg-accent' : 'gradient-primary'}`}>{e.name.split(' ').map(n => n[0]).slice(0, 2).join('')}</div>
        <div className="min-w-0 flex-1"><h3 className="font-semibold text-foreground text-sm truncate">{e.name}</h3><p className="text-xs text-muted-foreground truncate">{e.cargo}</p></div>
        {isAdminPortal && <Button type="button" variant="outline" size="sm" onClick={(event) => abrirAcessos(event, e.id)} className="h-8 shrink-0 gap-1.5" title="Liberar módulos deste funcionário"><KeyRound className="w-3.5 h-3.5" /><span className="hidden xl:inline">Módulos</span></Button>}
      </div>
      <div className="flex items-center justify-between text-xs"><span className="text-muted-foreground">{companies.find(c => c.id === e.companyId)?.name}</span><span className="font-semibold text-foreground">{formatCurrency(e.salarioBase)}</span></div>
      <div className="mt-2 flex gap-1"><Badge className={`text-[10px] ${e.status === 'ativo' ? 'bg-success text-success-foreground' : 'bg-muted text-muted-foreground'}`}>{e.status}</Badge>{e.categoria === 'socio' && <Badge variant="outline" className="text-[10px] border-accent text-accent">Socio</Badge>}</div>
    </div>
  );

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-bold font-display text-foreground">Funcionários</h1><Button onClick={() => setShowNew(true)} className="gradient-primary text-primary-foreground"><UserPlus className="w-4 h-4 mr-2" /> Novo Funcionário</Button></div>

      {showNew && <div className="card-premium p-5 space-y-4 border-l-4 border-primary">
        <div className="flex items-center justify-between"><h2 className="text-sm font-bold text-foreground">Cadastrar Novo Funcionário</h2><Button variant="ghost" size="icon" onClick={() => setShowNew(false)}><X className="w-4 h-4" /></Button></div>
        {isFilial && <p className="text-xs text-muted-foreground">Empresa: <strong>{companies.find(c => c.id === filialCompanyId)?.name}</strong></p>}
        {!isFilial && !filterCompany && <p className="text-xs text-warning">Selecione uma empresa no filtro antes de cadastrar.</p>}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <div><label className="text-xs text-muted-foreground block mb-1">Nome Completo *</label><Input value={newEmp.nome} onChange={e => setNewEmp(p => ({ ...p, nome: e.target.value }))} /></div><div><label className="text-xs text-muted-foreground block mb-1">CPF</label><Input value={newEmp.cpf} onChange={e => setNewEmp(p => ({ ...p, cpf: e.target.value }))} /></div><div><label className="text-xs text-muted-foreground block mb-1">RG</label><Input value={newEmp.rg} onChange={e => setNewEmp(p => ({ ...p, rg: e.target.value }))} /></div><div><label className="text-xs text-muted-foreground block mb-1">Cargo / Função</label><Input value={newEmp.cargo} onChange={e => setNewEmp(p => ({ ...p, cargo: e.target.value }))} /></div><div><label className="text-xs text-muted-foreground block mb-1">Salário Base</label><Input type="number" value={newEmp.salario_base} onChange={e => setNewEmp(p => ({ ...p, salario_base: e.target.value }))} /></div><div><label className="text-xs text-muted-foreground block mb-1">Data Admissão</label><Input type="date" value={newEmp.data_admissao} onChange={e => setNewEmp(p => ({ ...p, data_admissao: e.target.value }))} /></div><div><label className="text-xs text-muted-foreground block mb-1">Telefone</label><Input value={newEmp.telefone} onChange={e => setNewEmp(p => ({ ...p, telefone: e.target.value }))} /></div><div><label className="text-xs text-muted-foreground block mb-1">Celular</label><Input value={newEmp.celular} onChange={e => setNewEmp(p => ({ ...p, celular: e.target.value }))} /></div><div><label className="text-xs text-muted-foreground block mb-1">E-mail</label><Input value={newEmp.email} onChange={e => setNewEmp(p => ({ ...p, email: e.target.value }))} /></div>
        </div>
        <div className="flex gap-3"><Button onClick={handleSaveNew} disabled={saving} className="gradient-primary text-primary-foreground"><Save className="w-4 h-4 mr-2" /> {saving ? 'Salvando...' : 'Salvar Funcionário'}</Button><Button variant="outline" onClick={() => setShowNew(false)}>Cancelar</Button></div>
      </div>}

      <div className="card-premium p-4 flex flex-wrap gap-3"><div className="relative flex-1 min-w-[200px]"><Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" /><Input placeholder="Buscar funcionário..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" /></div>{!isFilial && <select value={filterCompany} onChange={e => setFilterCompany(e.target.value)} className="border rounded-lg px-3 py-2 text-sm bg-background text-foreground"><option value="">Todas Empresas</option>{companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}<select value={filterStatus} onChange={e => setFilterStatus(e.target.value as typeof filterStatus)} className="border rounded-lg px-3 py-2 text-sm bg-background text-foreground"><option value="ativos">Ativos</option><option value="inativos">Inativos</option><option value="todos">Todos</option></select></div>
      {operacionais.length > 0 && <><h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Operacionais ({operacionais.length})</h2><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{operacionais.map(renderCard)}</div></>}
      {socios.length > 0 && <><h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mt-6">Sócios / Pró-labore ({socios.length})</h2><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{socios.map(renderCard)}</div></>}
      {filtered.length === 0 && <div className="text-center py-12 text-muted-foreground"><p>Nenhum funcionário encontrado.</p></div>}

      {acessoEmployee && <div className="fixed inset-0 z-50 bg-black/65 flex items-center justify-center p-4" onClick={() => setAcessoEmployeeId(null)}>
        <div className="bg-card border border-border rounded-xl shadow-premium-lg w-full max-w-3xl max-h-[92vh] overflow-y-auto" onClick={event => event.stopPropagation()}>
          <div className="flex items-start justify-between gap-3 p-5 border-b border-border"><div><h2 className="text-lg font-bold flex items-center gap-2"><KeyRound className="w-5 h-5 text-primary" /> Liberar módulos</h2><p className="text-sm text-muted-foreground mt-1">{acessoEmployee.name} · {acessoCompany?.name}</p></div><Button variant="ghost" size="icon" onClick={() => setAcessoEmployeeId(null)}><X className="w-5 h-5" /></Button></div>
          <div className="p-5 space-y-4">
            <p className="text-xs text-muted-foreground">Marque somente o que este funcionário pode acessar. Login pelo CPF e PIN com os 4 últimos números.</p>
            {loadingAcessos ? <p className="py-10 text-center text-muted-foreground">Carregando módulos...</p> : <div className="grid md:grid-cols-2 gap-3">{MODULOS.map(item => { const ativo = modulosAtivos.includes(item.modulo); return <button key={item.modulo} type="button" onClick={() => toggleModulo(item.modulo)} className={`text-left rounded-lg border p-4 transition-colors ${ativo ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/50'}`}><div className="flex items-center justify-between gap-2"><span className="font-semibold text-sm">{item.label}</span><span className={`w-6 h-6 rounded-full flex items-center justify-center ${ativo ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>{ativo && <Check className="w-4 h-4" />}</span></div><p className="text-xs text-muted-foreground mt-2">{item.descricao}</p></button>; })}</div>}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-border"><div className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="w-4 h-4 text-success" /> Desmarcar bloqueia o módulo sem apagar o histórico.</div><div className="flex gap-2"><Button variant="outline" onClick={() => setAcessoEmployeeId(null)}>Cancelar</Button><Button onClick={salvarAcessos} disabled={loadingAcessos || salvandoAcessos}>{salvandoAcessos ? 'Salvando...' : 'Salvar acessos'}</Button></div></div>
          </div>
        </div>
      </div>}
    </div>
  );
};

export default FuncionariosPage;
