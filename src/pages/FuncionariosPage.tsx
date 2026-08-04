import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Check, KeyRound, Landmark, Save, Search, ShieldCheck, UserPlus, X } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useFilialFilter } from '@/hooks/useFilialFilter';
import { formatCurrency } from '@/lib/calculations';
import { upsertFuncionarioBase, onlyDigits } from '@/lib/funcionariosBase';
import BankingDataEditor from '@/components/BankingDataEditor';
import { emptyBankingData, type BankingData } from '@/lib/bankingParser';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const MODULOS = [
  { perfil: 'filial', modulo: 'filial', label: 'Filial / RH', descricao: 'Funcionários, ASO, atestados, férias e fechamento da filial' },
  { perfil: 'financeiro', modulo: 'financeiro', label: 'Financeiro', descricao: 'Pagar, receber, bancos, caixa e conciliação' },
  { perfil: 'faturamento', modulo: 'faturamento', label: 'Faturamento', descricao: 'Clientes, contratos, medições e faturas' },
  { perfil: 'almoxarifado', modulo: 'almoxarifado', label: 'Almoxarifado', descricao: 'Entradas, saídas e histórico de estoque' },
  { perfil: 'operacional', modulo: 'operacional', label: 'Operacional', descricao: 'Chamados e protocolo operacional' },
  { perfil: 'tecnico_campo', modulo: 'campo', label: 'Técnico de Campo', descricao: 'Chamados e atividades externas' },
  { perfil: 'mecanico_externo', modulo: 'mecanico', label: 'App Mecânico', descricao: 'Ponto, chamados, veículo, abastecimento e histórico no app' },
] as const;

const emptyEmployee = () => ({
  nome: '', cpf: '', rg: '', cargo: '', salario_base: '', data_admissao: '', telefone: '', celular: '', email: '', endereco: '',
  banking: emptyBankingData(),
});

const bankingFromRow = (row: any): BankingData => ({
  banco: String(row?.banco || ''),
  bancoCodigo: String(row?.banco_codigo || ''),
  agencia: String(row?.agencia || ''),
  conta: String(row?.conta || ''),
  digito: String(row?.conta_digito || ''),
  tipoConta: String(row?.tipo_conta || ''),
  titular: String(row?.titular_conta || row?.nome || ''),
  cpfTitular: String(row?.cpf_titular || row?.cpf || ''),
  chavePix: String(row?.pix || ''),
  tipoChavePix: String(row?.tipo_chave_pix || ''),
  textoOriginal: String(row?.dados_bancarios_origem || ''),
});

const bankingPayload = (data: BankingData) => ({
  banco: data.banco || null,
  banco_codigo: data.bancoCodigo || null,
  agencia: data.agencia || null,
  conta: data.conta || null,
  conta_digito: data.digito || null,
  tipo_conta: data.tipoConta || null,
  titular_conta: data.titular || null,
  cpf_titular: data.cpfTitular || null,
  pix: data.chavePix || null,
  tipo_chave_pix: data.tipoChavePix || null,
  dados_bancarios_origem: data.textoOriginal || null,
  dados_bancarios_atualizado_em: new Date().toISOString(),
});

const FuncionariosPage: React.FC = () => {
  const { employees, companies, refreshData } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const { isFilial, filialCompanyId } = useFilialFilter();
  const portalPrefix = location.pathname.startsWith('/filial') ? '/filial' : location.pathname.startsWith('/admin') ? '/admin' : '';
  const isAdminPortal = portalPrefix === '/admin';

  const [search, setSearch] = useState('');
  const [filterCompany, setFilterCompany] = useState('');
  const [filterStatus, setFilterStatus] = useState<'ativos' | 'inativos' | 'todos'>('ativos');
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newEmp, setNewEmp] = useState(emptyEmployee());

  const [bankEmployeeId, setBankEmployeeId] = useState<string | null>(null);
  const [bankData, setBankData] = useState<BankingData>(emptyBankingData());
  const [loadingBank, setLoadingBank] = useState(false);
  const [savingBank, setSavingBank] = useState(false);

  const [accessEmployeeId, setAccessEmployeeId] = useState<string | null>(null);
  const [activeModules, setActiveModules] = useState<string[]>([]);
  const [loadingAccess, setLoadingAccess] = useState(false);
  const [savingAccess, setSavingAccess] = useState(false);

  const effectiveCompany = isFilial ? filialCompanyId || '' : filterCompany;
  const bankEmployee = employees.find((employee) => employee.id === bankEmployeeId) || null;
  const accessEmployee = employees.find((employee) => employee.id === accessEmployeeId) || null;
  const accessCompany = accessEmployee ? companies.find((company) => company.id === accessEmployee.companyId) : null;

  const filtered = useMemo(() => employees.filter((employee) => {
    const query = search.trim().toLowerCase();
    if (query && !`${employee.name} ${employee.cpf} ${employee.cargo}`.toLowerCase().includes(query)) return false;
    if (filterCompany && employee.companyId !== filterCompany) return false;
    if (filterStatus === 'ativos' && employee.status === 'desligado') return false;
    if (filterStatus === 'inativos' && employee.status !== 'desligado') return false;
    return true;
  }), [employees, search, filterCompany, filterStatus]);

  useEffect(() => {
    if (!accessEmployee) return;
    const load = async () => {
      setLoadingAccess(true);
      const cpfClean = onlyDigits(accessEmployee.cpf || '');
      const filter = cpfClean.length === 11 ? `cpf_clean.eq.${cpfClean},funcionario_id.eq.${accessEmployee.id}` : `funcionario_id.eq.${accessEmployee.id}`;
      const { data, error } = await supabase.from('acessos_externos' as any).select('modulo,status,acesso_liberado').or(filter);
      if (error) toast.error('Não foi possível carregar os módulos deste funcionário.');
      setActiveModules(((data as any[]) || []).filter((row) => row.status === 'ativo' && row.acesso_liberado).map((row) => row.modulo));
      setLoadingAccess(false);
    };
    void load();
  }, [accessEmployee?.id, accessEmployee?.cpf]);

  const saveNewEmployee = async () => {
    if (!newEmp.nome.trim()) return toast.error('Nome é obrigatório.');
    if (!effectiveCompany) return toast.error('Selecione a empresa antes de cadastrar.');
    setSaving(true);
    const result = await upsertFuncionarioBase({
      employees,
      companies,
      companyId: effectiveCompany,
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
      dadosBancarios: newEmp.banking,
    });
    setSaving(false);
    if (!result.ok) return toast.error(result.error);
    toast.success(result.action === 'created' ? 'Funcionário cadastrado com sucesso.' : 'Funcionário atualizado e vinculado.');
    setShowNew(false);
    setNewEmp(emptyEmployee());
    await refreshData();
  };

  const openBanking = async (event: React.MouseEvent, employeeId: string) => {
    event.stopPropagation();
    setBankEmployeeId(employeeId);
    setLoadingBank(true);
    const { data, error } = await (supabase as any).from('funcionarios')
      .select('nome,cpf,banco,banco_codigo,agencia,conta,conta_digito,tipo_conta,titular_conta,cpf_titular,pix,tipo_chave_pix,dados_bancarios_origem')
      .eq('id', employeeId)
      .single();
    setLoadingBank(false);
    if (error) {
      toast.error(`Não foi possível carregar os dados bancários: ${error.message}`);
      setBankData(emptyBankingData());
      return;
    }
    setBankData(bankingFromRow(data));
  };

  const saveBanking = async () => {
    if (!bankEmployeeId) return;
    setSavingBank(true);
    const { error } = await (supabase as any).from('funcionarios').update(bankingPayload(bankData)).eq('id', bankEmployeeId);
    setSavingBank(false);
    if (error) return toast.error(`Não foi possível salvar os dados bancários: ${error.message}`);
    toast.success('Dados bancários salvos após revisão.');
    setBankEmployeeId(null);
    await refreshData();
  };

  const saveAccess = async () => {
    if (!accessEmployee || savingAccess) return;
    const cpfClean = onlyDigits(accessEmployee.cpf || '');
    if (cpfClean.length !== 11) return toast.error('Cadastre o CPF completo antes de liberar acesso.');
    if (accessEmployee.status === 'desligado') return toast.error('Funcionário desligado não pode receber acesso.');
    setSavingAccess(true);
    const { data: existing, error: loadError } = await supabase.from('acessos_externos' as any).select('id,modulo').or(`cpf_clean.eq.${cpfClean},funcionario_id.eq.${accessEmployee.id}`);
    if (loadError) { setSavingAccess(false); return toast.error('Não foi possível conferir os acessos atuais.'); }

    const payload = MODULOS.filter((item) => activeModules.includes(item.modulo)).map((item) => ({
      nome: accessEmployee.name.trim(),
      cpf: accessEmployee.cpf,
      cpf_clean: cpfClean,
      pin: cpfClean.slice(-4),
      email: accessEmployee.email?.trim().toLowerCase() || null,
      observacoes: JSON.stringify({ telefone: accessEmployee.telefone || accessEmployee.celular || '', atualizado_em: new Date().toISOString() }),
      empresa: accessCompany?.name || null,
      filial: accessCompany?.city || null,
      funcao: accessEmployee.cargo || null,
      funcionario_id: accessEmployee.id,
      perfil_acesso: item.perfil,
      modulo: item.modulo,
      status: 'ativo',
      acesso_liberado: true,
    }));
    if (payload.length) {
      const { error } = await supabase.from('acessos_externos' as any).upsert(payload, { onConflict: 'cpf_clean,modulo', ignoreDuplicates: false });
      if (error) { setSavingAccess(false); return toast.error(`Não foi possível liberar os módulos: ${error.message}`); }
    }
    const idsToBlock = ((existing as any[]) || []).filter((row) => !activeModules.includes(row.modulo)).map((row) => row.id);
    if (idsToBlock.length) {
      const { error } = await supabase.from('acessos_externos' as any).update({ status: 'bloqueado', acesso_liberado: false }).in('id', idsToBlock);
      if (error) { setSavingAccess(false); return toast.error(`Erro ao bloquear módulos removidos: ${error.message}`); }
    }
    setSavingAccess(false);
    toast.success(activeModules.length ? 'Módulos atualizados.' : 'Todos os acessos foram bloqueados.');
    setAccessEmployeeId(null);
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold font-display text-foreground">Funcionários</h1>
        <Button onClick={() => setShowNew(true)} className="gradient-primary text-primary-foreground"><UserPlus className="mr-2 h-4 w-4" /> Novo Funcionário</Button>
      </div>

      {showNew && (
        <div className="card-premium space-y-4 border-l-4 border-primary p-5">
          <div className="flex items-center justify-between"><h2 className="text-sm font-bold">Cadastrar Novo Funcionário</h2><Button variant="ghost" size="icon" onClick={() => setShowNew(false)}><X className="h-4 w-4" /></Button></div>
          {!isFilial && !filterCompany && <p className="text-xs text-warning">Selecione uma empresa no filtro antes de cadastrar.</p>}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            <Field label="Nome Completo *" value={newEmp.nome} onChange={(value) => setNewEmp((current) => ({ ...current, nome: value }))} />
            <Field label="CPF" value={newEmp.cpf} onChange={(value) => setNewEmp((current) => ({ ...current, cpf: value }))} />
            <Field label="RG" value={newEmp.rg} onChange={(value) => setNewEmp((current) => ({ ...current, rg: value }))} />
            <Field label="Cargo / Função" value={newEmp.cargo} onChange={(value) => setNewEmp((current) => ({ ...current, cargo: value }))} />
            <Field label="Salário Base" value={newEmp.salario_base} type="number" onChange={(value) => setNewEmp((current) => ({ ...current, salario_base: value }))} />
            <Field label="Data de Admissão" value={newEmp.data_admissao} type="date" onChange={(value) => setNewEmp((current) => ({ ...current, data_admissao: value }))} />
            <Field label="Telefone" value={newEmp.telefone} onChange={(value) => setNewEmp((current) => ({ ...current, telefone: value }))} />
            <Field label="Celular" value={newEmp.celular} onChange={(value) => setNewEmp((current) => ({ ...current, celular: value }))} />
            <Field label="E-mail" value={newEmp.email} onChange={(value) => setNewEmp((current) => ({ ...current, email: value }))} />
            <Field label="Endereço" value={newEmp.endereco} onChange={(value) => setNewEmp((current) => ({ ...current, endereco: value }))} />
          </div>
          <BankingDataEditor value={newEmp.banking} onChange={(banking) => setNewEmp((current) => ({ ...current, banking }))} defaultHolder={newEmp.nome} defaultCpf={newEmp.cpf} />
          <div className="flex gap-3"><Button onClick={() => void saveNewEmployee()} disabled={saving}><Save className="mr-2 h-4 w-4" /> {saving ? 'Salvando...' : 'Salvar Funcionário'}</Button><Button variant="outline" onClick={() => setShowNew(false)}>Cancelar</Button></div>
        </div>
      )}

      <div className="card-premium flex flex-wrap gap-3 p-4">
        <div className="relative min-w-[220px] flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="Buscar funcionário, CPF ou cargo" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        {!isFilial && <select value={filterCompany} onChange={(e) => setFilterCompany(e.target.value)} className="rounded-lg border bg-background px-3 py-2 text-sm"><option value="">Todas as empresas</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select>}
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)} className="rounded-lg border bg-background px-3 py-2 text-sm"><option value="ativos">Ativos</option><option value="inativos">Inativos</option><option value="todos">Todos</option></select>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((employee) => {
          const company = companies.find((item) => item.id === employee.companyId);
          return <div key={employee.id} className="card-premium cursor-pointer p-5 transition-shadow hover:shadow-premium" onClick={() => navigate(`${portalPrefix}/funcionarios/${employee.id}`)}>
            <div className="mb-3 flex items-start gap-3"><div className="gradient-primary flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-primary-foreground">{employee.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}</div><div className="min-w-0 flex-1"><h3 className="truncate text-sm font-semibold">{employee.name}</h3><p className="truncate text-xs text-muted-foreground">{employee.cargo}</p></div><div className="flex gap-1"><Button type="button" variant="outline" size="icon" onClick={(event) => void openBanking(event, employee.id)} title="Editar dados bancários"><Landmark className="h-4 w-4" /></Button>{isAdminPortal && <Button type="button" variant="outline" size="icon" onClick={(event) => { event.stopPropagation(); setActiveModules([]); setAccessEmployeeId(employee.id); }} title="Liberar módulos"><KeyRound className="h-4 w-4" /></Button>}</div></div>
            <div className="flex items-center justify-between text-xs"><span className="text-muted-foreground">{company?.name}</span><span className="font-semibold">{formatCurrency(employee.salarioBase)}</span></div>
            <div className="mt-2"><Badge className={employee.status === 'ativo' ? 'bg-success text-success-foreground' : ''}>{employee.status}</Badge></div>
          </div>;
        })}
      </div>
      {!filtered.length && <div className="card-premium p-10 text-center text-sm text-muted-foreground">Nenhum funcionário encontrado.</div>}

      <Dialog open={!!bankEmployeeId} onOpenChange={(open) => !open && setBankEmployeeId(null)}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto"><DialogHeader><DialogTitle>Dados bancários — {bankEmployee?.name}</DialogTitle></DialogHeader>{loadingBank ? <div className="p-10 text-center">Carregando...</div> : <BankingDataEditor value={bankData} onChange={setBankData} defaultHolder={bankEmployee?.name} defaultCpf={bankEmployee?.cpf} />}<DialogFooter><Button variant="outline" onClick={() => setBankEmployeeId(null)}>Cancelar</Button><Button onClick={() => void saveBanking()} disabled={savingBank}><Save className="mr-2 h-4 w-4" /> {savingBank ? 'Salvando...' : 'Salvar após revisão'}</Button></DialogFooter></DialogContent>
      </Dialog>

      <Dialog open={!!accessEmployeeId} onOpenChange={(open) => !open && setAccessEmployeeId(null)}>
        <DialogContent className="max-w-xl"><DialogHeader><DialogTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" /> Módulos — {accessEmployee?.name}</DialogTitle></DialogHeader>{loadingAccess ? <div className="p-10 text-center">Carregando...</div> : <div className="space-y-2">{MODULOS.map((item) => { const active = activeModules.includes(item.modulo); return <button key={item.modulo} type="button" onClick={() => setActiveModules((current) => active ? current.filter((value) => value !== item.modulo) : [...current, item.modulo])} className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left ${active ? 'border-primary bg-primary/5' : ''}`}><span className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded border ${active ? 'border-primary bg-primary text-primary-foreground' : ''}`}>{active && <Check className="h-3.5 w-3.5" />}</span><span><span className="block text-sm font-semibold">{item.label}</span><span className="text-xs text-muted-foreground">{item.descricao}</span></span></button>; })}</div>}<DialogFooter><Button variant="outline" onClick={() => setAccessEmployeeId(null)}>Cancelar</Button><Button onClick={() => void saveAccess()} disabled={savingAccess}>{savingAccess ? 'Salvando...' : 'Salvar módulos'}</Button></DialogFooter></DialogContent>
      </Dialog>
    </div>
  );
};

const Field = ({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; type?: string }) => <div><label className="mb-1 block text-xs text-muted-foreground">{label}</label><Input type={type} value={value} onChange={(event) => onChange(event.target.value)} /></div>;

export default FuncionariosPage;
