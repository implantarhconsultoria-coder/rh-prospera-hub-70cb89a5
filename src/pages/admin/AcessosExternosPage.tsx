import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Check, KeyRound, Search, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useApp } from '@/hooks/useApp';
import { onlyDigits } from '@/lib/funcionariosBase';
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

export default function AcessosExternosPage() {
  const { employees, companies } = useApp();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [selecionadoId, setSelecionadoId] = useState(params.get('funcionario') || '');
  const [modulosAtivos, setModulosAtivos] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const funcionario = employees.find(employee => employee.id === selecionadoId);
  const empresa = funcionario ? companies.find(company => company.id === funcionario.companyId) : null;
  const funcionarios = useMemo(() => employees
    .filter(employee => employee.status !== 'desligado')
    .filter(employee => !search || `${employee.name} ${employee.cpf} ${employee.cargo}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name)), [employees, search]);

  useEffect(() => {
    if (!funcionario) {
      setModulosAtivos([]);
      return;
    }
    const carregar = async () => {
      setLoading(true);
      const cpfClean = onlyDigits(funcionario.cpf || '');
      let query = supabase.from('acessos_externos' as any).select('modulo,status,acesso_liberado').eq('funcionario_id', funcionario.id);
      if (cpfClean.length === 11) query = query.or(`cpf_clean.eq.${cpfClean},funcionario_id.eq.${funcionario.id}`);
      const { data, error } = await query;
      if (error) toast.error('Não foi possível carregar os módulos deste funcionário.');
      setModulosAtivos(((data as any[]) || []).filter(row => row.status === 'ativo' && row.acesso_liberado).map(row => row.modulo));
      setLoading(false);
    };
    carregar();
  }, [funcionario?.id, funcionario?.cpf]);

  const selecionar = (id: string) => {
    setSelecionadoId(id);
    setParams({ funcionario: id });
  };

  const toggleModulo = (modulo: string) => {
    setModulosAtivos(current => current.includes(modulo) ? current.filter(item => item !== modulo) : [...current, modulo]);
  };

  const salvar = async () => {
    if (!funcionario || salvando) return;
    const cpfClean = onlyDigits(funcionario.cpf || '');
    if (cpfClean.length !== 11) return toast.error('Cadastre o CPF completo do funcionário antes de liberar acesso.');
    if (funcionario.status === 'desligado') return toast.error('Funcionário desligado não pode receber acesso.');

    setSalvando(true);
    const { data: existentes, error: loadError } = await supabase
      .from('acessos_externos' as any)
      .select('id,modulo')
      .or(`cpf_clean.eq.${cpfClean},funcionario_id.eq.${funcionario.id}`);
    if (loadError) {
      setSalvando(false);
      return toast.error('Não foi possível conferir os acessos atuais.');
    }

    const email = String((funcionario as any).email || '').trim().toLowerCase() || null;
    const telefone = String((funcionario as any).telefone || (funcionario as any).celular || '').trim();
    const payload = MODULOS.filter(item => modulosAtivos.includes(item.modulo)).map(item => ({
      nome: funcionario.name.trim(),
      cpf: funcionario.cpf,
      cpf_clean: cpfClean,
      pin: cpfClean.slice(-4),
      email,
      observacoes: JSON.stringify({ telefone, atualizado_em: new Date().toISOString() }),
      empresa: empresa?.name || null,
      filial: empresa?.cidade || null,
      funcao: funcionario.cargo || null,
      funcionario_id: funcionario.id,
      perfil_acesso: item.perfil,
      modulo: item.modulo,
      status: 'ativo',
      acesso_liberado: true,
    }));

    if (payload.length) {
      const { error } = await supabase.from('acessos_externos' as any).upsert(payload, { onConflict: 'cpf_clean,modulo', ignoreDuplicates: false });
      if (error) {
        setSalvando(false);
        return toast.error(`Não foi possível liberar os módulos: ${error.message}`);
      }
    }

    const idsBloquear = ((existentes as any[]) || []).filter(row => !modulosAtivos.includes(row.modulo)).map(row => row.id);
    if (idsBloquear.length) {
      const { error } = await supabase.from('acessos_externos' as any).update({ status: 'bloqueado', acesso_liberado: false }).in('id', idsBloquear);
      if (error) {
        setSalvando(false);
        return toast.error(`Os módulos foram liberados, mas houve erro ao bloquear os removidos: ${error.message}`);
      }
    }

    setSalvando(false);
    toast.success(modulosAtivos.length ? 'Módulos do funcionário atualizados.' : 'Todos os acessos deste funcionário foram bloqueados.');
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/admin/funcionarios')}><ArrowLeft className="w-5 h-5" /></Button>
        <div>
          <h1 className="text-2xl font-bold font-display flex items-center gap-2"><KeyRound className="w-6 h-6 text-primary" /> Acessos dos Funcionários</h1>
          <p className="text-sm text-muted-foreground">Escolha o funcionário e marque somente os módulos que ele pode acessar.</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-[340px_1fr] gap-4">
        <div className="card-premium p-4 space-y-3 lg:max-h-[72vh] lg:overflow-y-auto">
          <div className="relative"><Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" /><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar funcionário..." className="pl-9" /></div>
          <div className="space-y-1">
            {funcionarios.map(employee => (
              <button key={employee.id} onClick={() => selecionar(employee.id)} className={`w-full text-left rounded-md px-3 py-2.5 transition-colors ${selecionadoId === employee.id ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
                <div className="text-sm font-semibold">{employee.name}</div>
                <div className={`text-xs ${selecionadoId === employee.id ? 'text-primary-foreground/75' : 'text-muted-foreground'}`}>{employee.cargo || 'Sem função'} · {companies.find(c => c.id === employee.companyId)?.name || 'Sem empresa'}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="card-premium p-5">
          {!funcionario ? (
            <div className="min-h-80 flex items-center justify-center text-center text-muted-foreground">Selecione um funcionário para liberar os módulos.</div>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
                <div><h2 className="text-lg font-bold">{funcionario.name}</h2><p className="text-sm text-muted-foreground">{funcionario.cargo} · {empresa?.name}</p><p className="text-xs text-muted-foreground mt-1">A entrada será feita pelo CPF, usando os 4 últimos números como PIN.</p></div>
                <Badge className={funcionario.status === 'ativo' ? 'bg-success text-success-foreground' : 'bg-muted text-muted-foreground'}>{funcionario.status}</Badge>
              </div>

              {loading ? <p className="py-10 text-center text-muted-foreground">Carregando módulos...</p> : (
                <div className="grid md:grid-cols-2 gap-3">
                  {MODULOS.map(item => {
                    const ativo = modulosAtivos.includes(item.modulo);
                    return (
                      <button key={item.modulo} type="button" onClick={() => toggleModulo(item.modulo)} className={`text-left rounded-lg border p-4 transition-colors ${ativo ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/50'}`}>
                        <div className="flex items-center justify-between gap-2"><span className="font-semibold text-sm">{item.label}</span><span className={`w-6 h-6 rounded-full flex items-center justify-center ${ativo ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>{ativo && <Check className="w-4 h-4" />}</span></div>
                        <p className="text-xs text-muted-foreground mt-2">{item.descricao}</p>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="w-4 h-4 text-success" /> Desmarcar um módulo bloqueia o acesso sem apagar o histórico.</div>
                <Button onClick={salvar} disabled={loading || salvando}>{salvando ? 'Salvando...' : 'Salvar acessos'}</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
