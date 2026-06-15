import { useEffect, useMemo, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { KeyRound, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useApp } from '@/context/AppContext';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

const MODULOS = [
  { value: 'filial', label: 'Filial / RH' },
  { value: 'financeiro', label: 'Financeiro' },
  { value: 'faturamento', label: 'Faturamento' },
  { value: 'almoxarifado', label: 'Almoxarifado' },
  { value: 'operacional', label: 'Operacional' },
  { value: 'campo', label: 'Tecnico de campo' },
  { value: 'mecanico', label: 'Aplicativo mecanico' },
] as const;

type Modulo = (typeof MODULOS)[number]['value'];
type AcessoRow = { modulo: string; status: string | null; acesso_liberado: boolean | null };

export default function EmployeeAccessControl() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const { employees, userRoles } = useApp();
  const employee = employees.find((item) => item.id === id);
  const isEmployeePage = /^\/admin\/funcionarios\/[^/]+$/.test(location.pathname);
  const canManage = userRoles.includes('admin');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Modulo[]>([]);

  const employeeActive = employee?.status === 'ativo';
  const cpfValido = useMemo(
    () => String(employee?.cpf || '').replace(/\D/g, '').length === 11,
    [employee?.cpf],
  );

  useEffect(() => {
    if (!open || !employee?.id) return;
    let active = true;
    setLoading(true);
    supabase
      .from('acessos_externos' as any)
      .select('modulo,status,acesso_liberado')
      .eq('funcionario_id', employee.id)
      .then(({ data, error }) => {
        if (!active) return;
        setLoading(false);
        if (error) {
          toast.error(error.message || 'Nao foi possivel carregar os acessos.');
          return;
        }
        const rows = (data || []) as unknown as AcessoRow[];
        setSelected(rows
          .filter((row) => row.status === 'ativo' && row.acesso_liberado === true)
          .map((row) => row.modulo)
          .filter((modulo): modulo is Modulo => MODULOS.some((item) => item.value === modulo)));
      });
    return () => { active = false; };
  }, [open, employee?.id]);

  if (!isEmployeePage || !canManage || !employee) return null;

  const toggle = (modulo: Modulo) => {
    setSelected((current) => current.includes(modulo)
      ? current.filter((item) => item !== modulo)
      : [...current, modulo]);
  };

  const salvar = async () => {
    if (!cpfValido) {
      toast.error('Cadastre um CPF valido antes de liberar acesso.');
      return;
    }
    setSaving(true);
    const { data, error } = await (supabase as any).rpc('admin_configurar_acessos_funcionario', {
      p_funcionario_id: employee.id,
      p_modulos: selected,
      p_ativo: employeeActive,
    });
    setSaving(false);
    if (error || !data?.ok) {
      toast.error(data?.error || error?.message || 'Nao foi possivel salvar os acessos.');
      return;
    }
    toast.success(employeeActive ? 'Acessos do funcionario atualizados.' : 'Funcionario inativo: acessos bloqueados.');
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <KeyRound className="h-4 w-4" />
          Acessos do funcionario
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Acessos de {employee.name}</DialogTitle></DialogHeader>
        {!employeeActive && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            Funcionario {employee.status}. Todos os acessos permanecem bloqueados.
          </div>
        )}
        {!cpfValido && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700">
            CPF completo e obrigatorio para gerar o PIN de acesso.
          </div>
        )}
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : (
          <div className="grid gap-2 py-2 sm:grid-cols-2">
            {MODULOS.map((modulo) => (
              <label key={modulo.value} className="flex cursor-pointer items-center gap-3 rounded-md border p-3 text-sm">
                <Checkbox
                  checked={selected.includes(modulo.value)}
                  disabled={!employeeActive || !cpfValido}
                  onCheckedChange={() => toggle(modulo.value)}
                />
                <span>{modulo.label}</span>
              </label>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={loading || saving || !cpfValido}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar acessos
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
