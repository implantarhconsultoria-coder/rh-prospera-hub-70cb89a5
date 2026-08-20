import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { RotateCcw, Sparkles, Trash2 } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import EmployeeSmartTextPanel from '@/components/EmployeeSmartTextPanel';
import { useApp } from '@/context/AppContext';
import type { EmployeeSmartData } from '@/lib/smartTextParser';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const clean = (value: unknown) => String(value || '').trim();
const onlyDigits = (value: unknown) => String(value || '').replace(/\D/g, '');
const normalizedName = (value: unknown) => clean(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^A-Z0-9]/gi, '')
  .toUpperCase();

const EmployeeSmartEditOverlay: React.FC = () => {
  const location = useLocation();
  const { employees, refreshData } = useApp();
  const [open, setOpen] = useState(false);
  const [undoAvailable, setUndoAvailable] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [clearingBanking, setClearingBanking] = useState(false);
  const [birthTarget, setBirthTarget] = useState<HTMLElement | null>(null);
  const [birthDate, setBirthDate] = useState('');
  const [savingBirthDate, setSavingBirthDate] = useState(false);
  const employeeId = useMemo(() => location.pathname.match(/\/funcionarios\/([0-9a-f-]{36})\/?$/i)?.[1] || '', [location.pathname]);
  const employee = employees.find((item) => item.id === employeeId) || null;

  const refreshUndoAvailability = async () => {
    if (!employeeId) return;
    const { data, error } = await (supabase as any)
      .from('funcionario_leitura_inteligente_backups')
      .select('id')
      .eq('funcionario_id', employeeId)
      .is('desfeito_em', null)
      .order('created_at', { ascending: false })
      .limit(1);
    if (!error) setUndoAvailable(Boolean(data?.length));
  };

  useEffect(() => {
    void refreshUndoAvailability();
  }, [employeeId]);

  useEffect(() => {
    setBirthDate(String((employee as any)?.dataNascimento || ''));
  }, [employeeId, (employee as any)?.dataNascimento]);

  useEffect(() => {
    if (!employeeId) {
      setBirthTarget(null);
      return;
    }

    const ensureBirthSlot = () => {
      const cpfLabel = Array.from(document.querySelectorAll('label')).find((node) =>
        node.textContent?.trim() === 'CPF' && Boolean(node.closest('.card-premium')),
      );
      const cpfField = cpfLabel?.parentElement;
      const grid = cpfField?.parentElement;
      if (!cpfField || !grid) return;

      let slot = grid.querySelector<HTMLElement>('[data-employee-birth-date-slot="true"]');
      if (!slot) {
        slot = document.createElement('div');
        slot.dataset.employeeBirthDateSlot = 'true';
        grid.insertBefore(slot, cpfField.nextSibling);
      }
      setBirthTarget(slot);
    };

    ensureBirthSlot();
    const observer = new MutationObserver(ensureBirthSlot);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      document.querySelectorAll('[data-employee-birth-date-slot="true"]').forEach((node) => node.remove());
      setBirthTarget(null);
    };
  }, [employeeId]);

  const saveBirthDate = async () => {
    if (!employeeId || !employee || savingBirthDate) return;
    const current = String((employee as any).dataNascimento || '');
    if (birthDate === current) return;

    setSavingBirthDate(true);
    try {
      const { error } = await (supabase as any)
        .from('funcionarios')
        .update({ data_nascimento: birthDate || null })
        .eq('id', employeeId);
      if (error) throw new Error(error.message);
      await refreshData();
      toast.success(`Data de nascimento de ${employee.name} atualizada.`);
    } catch (error) {
      setBirthDate(current);
      toast.error(error instanceof Error ? error.message : 'Não foi possível salvar a data de nascimento.');
    } finally {
      setSavingBirthDate(false);
    }
  };

  if (!employeeId || !employee) return null;

  const apply = async (data: EmployeeSmartData): Promise<boolean> => {
    const payload: Record<string, string | number> = {};
    const add = (key: string, value: unknown, transform?: (input: string) => string | number) => {
      const normalized = clean(value);
      if (normalized) payload[key] = transform ? transform(normalized) : normalized;
    };

    add('nome', data.nome);
    add('cpf', data.cpf);
    add('rg', data.rg);
    add('cargo', data.cargo);
    add('salario_base', data.salarioBase, Number);
    add('data_admissao', data.dataAdmissao);
    add('telefone', data.telefone);
    add('celular', data.celular);
    add('email', data.email);
    add('endereco', data.endereco);
    add('banco', data.banking.banco);
    add('banco_codigo', data.banking.bancoCodigo);
    add('agencia', data.banking.agencia);
    add('conta', data.banking.conta);
    add('conta_digito', data.banking.digito);
    add('tipo_conta', data.banking.tipoConta);
    add('titular_conta', data.banking.titular);
    add('cpf_titular', data.banking.cpfTitular);
    add('pix', data.banking.chavePix);
    add('tipo_chave_pix', data.banking.tipoChavePix);

    const hasBanking = Object.keys(payload).some((key) => [
      'banco', 'banco_codigo', 'agencia', 'conta', 'conta_digito', 'tipo_conta',
      'titular_conta', 'cpf_titular', 'pix', 'tipo_chave_pix',
    ].includes(key));
    if (hasBanking) {
      add('dados_bancarios_origem', data.banking.textoOriginal);
      payload.dados_bancarios_atualizado_em = new Date().toISOString();
    }

    if (!Object.keys(payload).length) {
      toast.error('Nenhum campo confiável foi identificado para aplicar.');
      return false;
    }

    const parsedCpf = onlyDigits(data.cpf);
    const currentCpf = onlyDigits(employee.cpf);
    if (parsedCpf && currentCpf && parsedCpf !== currentCpf) {
      toast.error(`CPF da mensagem não pertence a ${employee.name}. Abra o funcionário correto.`);
      return false;
    }

    const parsedName = normalizedName(data.nome);
    const currentName = normalizedName(employee.name);
    const identityMissing = !parsedCpf && !parsedName;
    const nameMismatch = Boolean(parsedName && currentName && parsedName !== currentName);
    const warning = nameMismatch
      ? `O nome identificado (${data.nome}) é diferente de ${employee.name}. Confirma que deseja aplicar mesmo assim?`
      : identityMissing
        ? `A mensagem não contém nome nem CPF. Confirma que os dados pertencem a ${employee.name}?`
        : `Confirma a aplicação dos campos identificados em ${employee.name}?`;

    if (!window.confirm(warning)) return false;

    const { error } = await (supabase as any).rpc('topac_aplicar_leitura_inteligente_funcionario', {
      p_funcionario_id: employeeId,
      p_payload: payload,
      p_texto_origem: data.banking.textoOriginal || null,
    });
    if (error) throw new Error(error.message);

    await refreshData();
    await refreshUndoAvailability();
    toast.success(`Cadastro de ${employee.name} atualizado com backup para desfazer.`);
    setOpen(false);
    return true;
  };

  const undoLastApply = async () => {
    if (!undoAvailable || undoing) return;
    if (!window.confirm(`Desfazer a última leitura inteligente aplicada em ${employee.name}?`)) return;

    setUndoing(true);
    try {
      const { error } = await (supabase as any).rpc('topac_desfazer_ultima_leitura_funcionario', {
        p_funcionario_id: employeeId,
      });
      if (error) throw new Error(error.message);
      await refreshData();
      await refreshUndoAvailability();
      toast.success(`Última leitura inteligente de ${employee.name} desfeita.`);
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível desfazer a leitura.');
    } finally {
      setUndoing(false);
    }
  };

  const clearBankingData = async () => {
    if (clearingBanking) return;
    if (!window.confirm(`Limpar todos os dados bancários cadastrados em ${employee.name}?`)) return;

    setClearingBanking(true);
    try {
      const { error } = await (supabase as any)
        .from('funcionarios')
        .update({
          banco: null,
          banco_codigo: null,
          agencia: null,
          conta: null,
          conta_digito: null,
          tipo_conta: null,
          titular_conta: null,
          cpf_titular: null,
          pix: null,
          tipo_chave_pix: null,
          dados_bancarios_origem: null,
          dados_bancarios_atualizado_em: new Date().toISOString(),
        })
        .eq('id', employeeId);
      if (error) throw new Error(error.message);
      await refreshData();
      toast.success(`Dados bancários de ${employee.name} removidos.`);
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível limpar os dados bancários.');
    } finally {
      setClearingBanking(false);
    }
  };

  return (
    <>
      {birthTarget && createPortal(
        <>
          <label className="text-xs text-muted-foreground block mb-1">Data de Nascimento</label>
          <Input
            type="date"
            value={birthDate}
            onChange={(event) => setBirthDate(event.target.value)}
            onBlur={() => void saveBirthDate()}
            disabled={savingBirthDate}
            className="text-sm"
          />
        </>,
        birthTarget,
      )}
      <Button type="button" onClick={() => setOpen(true)} className="fixed bottom-6 right-24 z-40 gap-2 shadow-xl no-print">
        <Sparkles className="h-4 w-4" /> Edição inteligente
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>Leitura Inteligente — {employee.name}</DialogTitle></DialogHeader>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
            <p className="text-xs text-amber-900">Aplicou no funcionário errado? Desfaça a última leitura ou limpe somente os dados bancários.</p>
            <div className="flex flex-wrap gap-2">
              {undoAvailable && (
                <Button type="button" variant="outline" size="sm" onClick={() => void undoLastApply()} disabled={undoing}>
                  <RotateCcw className="mr-2 h-4 w-4" /> {undoing ? 'Desfazendo...' : 'Desfazer última leitura'}
                </Button>
              )}
              <Button type="button" variant="outline" size="sm" onClick={() => void clearBankingData()} disabled={clearingBanking} className="text-destructive hover:text-destructive">
                <Trash2 className="mr-2 h-4 w-4" /> {clearingBanking ? 'Limpando...' : 'Limpar dados bancários'}
              </Button>
            </div>
          </div>
          <EmployeeSmartTextPanel onApply={apply} targetName={employee.name} />
          <p className="text-xs text-muted-foreground">A aplicação é transacional, preserva os campos não identificados e cria um backup antes de alterar o cadastro.</p>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default EmployeeSmartEditOverlay;
