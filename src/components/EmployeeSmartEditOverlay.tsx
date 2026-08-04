import React, { useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import EmployeeSmartTextPanel from '@/components/EmployeeSmartTextPanel';
import { useApp } from '@/context/AppContext';
import type { EmployeeSmartData } from '@/lib/smartTextParser';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const EmployeeSmartEditOverlay: React.FC = () => {
  const location = useLocation();
  const { employees, refreshData } = useApp();
  const [open, setOpen] = useState(false);
  const employeeId = useMemo(() => location.pathname.match(/\/funcionarios\/([0-9a-f-]{36})\/?$/i)?.[1] || '', [location.pathname]);
  const employee = employees.find((item) => item.id === employeeId) || null;

  if (!employeeId || !employee) return null;

  const apply = async (data: EmployeeSmartData) => {
    const payload = {
      nome: data.nome || employee.name,
      cpf: data.cpf || employee.cpf || null,
      rg: data.rg || employee.rg || null,
      cargo: data.cargo || employee.cargo || null,
      salario_base: data.salarioBase ? Number(data.salarioBase) : employee.salarioBase,
      data_admissao: data.dataAdmissao || employee.dataAdmissao || null,
      telefone: data.telefone || employee.telefone || null,
      celular: data.celular || employee.celular || null,
      email: data.email || employee.email || null,
      endereco: data.endereco || employee.endereco || null,
      banco: data.banking.banco || employee.banco || null,
      banco_codigo: data.banking.bancoCodigo || null,
      agencia: data.banking.agencia || employee.agencia || null,
      conta: data.banking.conta || employee.conta || null,
      conta_digito: data.banking.digito || null,
      tipo_conta: data.banking.tipoConta || null,
      titular_conta: data.banking.titular || data.nome || employee.name,
      cpf_titular: data.banking.cpfTitular || data.cpf || employee.cpf || null,
      pix: data.banking.chavePix || employee.pix || null,
      tipo_chave_pix: data.banking.tipoChavePix || null,
      dados_bancarios_origem: data.banking.textoOriginal || null,
      dados_bancarios_atualizado_em: new Date().toISOString(),
    };
    const { error } = await (supabase as any).from('funcionarios').update(payload).eq('id', employeeId);
    if (error) throw new Error(error.message);
    await refreshData();
    toast.success('Cadastro do funcionário atualizado após revisão.');
    setOpen(false);
  };

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)} className="fixed bottom-6 right-24 z-40 gap-2 shadow-xl no-print">
        <Sparkles className="h-4 w-4" /> Edição inteligente
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>Leitura Inteligente — {employee.name}</DialogTitle></DialogHeader>
          <EmployeeSmartTextPanel onApply={apply} />
          <p className="text-xs text-muted-foreground">Somente os campos identificados serão atualizados. Os demais dados atuais serão preservados.</p>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default EmployeeSmartEditOverlay;
