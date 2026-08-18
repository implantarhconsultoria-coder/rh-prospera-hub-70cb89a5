import React, { useMemo, useState } from 'react';
import { FileArchive, Printer, Search } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { printInPage } from '@/lib/printInPage';
import { toast } from 'sonner';

type ArchiveCoverDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type CoverOptions = {
  company: boolean;
  cargo: boolean;
  admission: boolean;
  dismissal: boolean;
};

const defaultOptions: CoverOptions = {
  company: true,
  cargo: true,
  admission: true,
  dismissal: true,
};

const formatDateBR = (value?: string | null) => {
  const raw = String(value || '').slice(0, 10);
  const [year, month, day] = raw.split('-');
  return year && month && day ? `${day}/${month}/${year}` : '';
};

const escapeHtml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const ArchiveCoverDialog: React.FC<ArchiveCoverDialogProps> = ({ open, onOpenChange }) => {
  const { employees, companies } = useApp();
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [dismissalDate, setDismissalDate] = useState('');
  const [loadingEmployee, setLoadingEmployee] = useState(false);
  const [options, setOptions] = useState<CoverOptions>(defaultOptions);

  const selectedEmployee = employees.find((employee) => employee.id === selectedId) || null;
  const selectedCompany = selectedEmployee ? companies.find((company) => company.id === selectedEmployee.companyId) || null : null;

  const candidates = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];
    return employees
      .filter((employee) => {
        const company = companies.find((item) => item.id === employee.companyId);
        return `${employee.name} ${employee.cpf} ${employee.cargo} ${company?.name || ''}`.toLowerCase().includes(normalized);
      })
      .slice(0, 12);
  }, [companies, employees, query]);

  const reset = () => {
    setQuery('');
    setSelectedId('');
    setDismissalDate('');
    setLoadingEmployee(false);
    setOptions(defaultOptions);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  };

  const selectEmployee = async (employeeId: string) => {
    const employee = employees.find((item) => item.id === employeeId);
    if (!employee) return;
    setSelectedId(employeeId);
    setQuery(employee.name);
    setDismissalDate('');
    setOptions(defaultOptions);
    setLoadingEmployee(true);
    const { data, error } = await (supabase as any)
      .from('funcionarios')
      .select('data_demissao')
      .eq('id', employeeId)
      .maybeSingle();
    setLoadingEmployee(false);
    if (error) {
      toast.error(`Não foi possível conferir a data de demissão: ${error.message}`);
      return;
    }
    setDismissalDate(String(data?.data_demissao || ''));
  };

  const toggleOption = (key: keyof CoverOptions) => {
    setOptions((current) => ({ ...current, [key]: !current[key] }));
  };

  const printCover = () => {
    if (!selectedEmployee) return toast.error('Selecione um funcionário.');
    const companyName = selectedCompany?.name || '';
    const admission = formatDateBR(selectedEmployee.dataAdmissao);
    const dismissal = formatDateBR(dismissalDate);
    const detailRows = [
      options.company && companyName ? `<div class="row"><span>EMPRESA</span><strong>${escapeHtml(companyName)}</strong></div>` : '',
      options.cargo && selectedEmployee.cargo ? `<div class="row"><span>CARGO / FUNÇÃO</span><strong>${escapeHtml(selectedEmployee.cargo)}</strong></div>` : '',
      options.admission && admission ? `<div class="row"><span>ADMISSÃO</span><strong>${escapeHtml(admission)}</strong></div>` : '',
      options.dismissal && dismissal ? `<div class="row"><span>DEMISSÃO</span><strong>${escapeHtml(dismissal)}</strong></div>` : '',
    ].filter(Boolean).join('');

    printInPage(`
      <style>
        @page { size: A4 portrait; margin: 0; }
        * { box-sizing: border-box; }
        body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #111827; background: #fff; }
        .page { width: 210mm; min-height: 297mm; padding: 20mm 18mm 18mm; position: relative; }
        .top { border-bottom: 2px solid #111827; padding-bottom: 7mm; text-align: center; }
        .top small { display: block; font-size: 10pt; letter-spacing: 2.4px; font-weight: 700; color: #4b5563; }
        .top h1 { margin: 4mm 0 0; font-size: 18pt; letter-spacing: 1.2px; }
        .name-wrap { min-height: 88mm; display: flex; align-items: center; justify-content: center; padding: 15mm 4mm 8mm; }
        .name { margin: 0; text-align: center; text-transform: uppercase; font-size: 36pt; line-height: 1.08; font-weight: 900; letter-spacing: .4px; overflow-wrap: anywhere; }
        .details { margin: 3mm auto 0; width: 100%; border-top: 1px solid #d1d5db; }
        .row { display: grid; grid-template-columns: 48mm 1fr; gap: 8mm; align-items: center; min-height: 20mm; padding: 5mm 2mm; border-bottom: 1px solid #d1d5db; }
        .row span { font-size: 9.5pt; font-weight: 800; letter-spacing: 1px; color: #6b7280; }
        .row strong { font-size: 16pt; line-height: 1.25; }
        .footer { position: absolute; bottom: 16mm; left: 18mm; right: 18mm; text-align: center; color: #6b7280; font-size: 8.5pt; letter-spacing: .8px; }
      </style>
      <div class="page">
        <div class="top"><small>TOPAC RH PRO</small><h1>CAPA PARA ARQUIVAR</h1></div>
        <div class="name-wrap"><h2 class="name">${escapeHtml(selectedEmployee.name)}</h2></div>
        <div class="details">${detailRows}</div>
        <div class="footer">ARQUIVO DO FUNCIONÁRIO</div>
      </div>
    `, `Capa - ${selectedEmployee.name}`);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileArchive className="h-5 w-5" /> Capa para Arquivar</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground">Procurar funcionário</label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" value={query} onChange={(event) => { setQuery(event.target.value); setSelectedId(''); setDismissalDate(''); }} placeholder="Digite nome, CPF, cargo ou empresa" autoFocus />
            </div>
            {!selectedEmployee && candidates.length > 0 && (
              <div className="max-h-56 overflow-y-auto rounded-lg border bg-background p-1">
                {candidates.map((employee) => {
                  const company = companies.find((item) => item.id === employee.companyId);
                  return <button key={employee.id} type="button" onClick={() => void selectEmployee(employee.id)} className="flex w-full items-start justify-between rounded-md px-3 py-2 text-left hover:bg-muted"><span><span className="block text-sm font-semibold">{employee.name}</span><span className="block text-xs text-muted-foreground">{employee.cargo || 'Cargo não informado'} • {company?.name || 'Empresa não informada'}</span></span><span className="text-[10px] uppercase text-muted-foreground">{employee.status}</span></button>;
                })}
              </div>
            )}
          </div>

          {selectedEmployee && (
            <>
              <div className="grid gap-4 md:grid-cols-[1fr_260px]">
                <div className="rounded-xl border bg-white p-6 text-slate-900 shadow-sm">
                  <div className="border-b-2 border-slate-800 pb-4 text-center"><p className="text-[10px] font-bold tracking-[0.28em] text-slate-500">TOPAC RH PRO</p><h3 className="mt-1 text-lg font-extrabold tracking-wide">CAPA PARA ARQUIVAR</h3></div>
                  <div className="flex min-h-40 items-center justify-center px-3 py-8"><div className="break-words text-center text-3xl font-black uppercase leading-tight md:text-5xl">{selectedEmployee.name}</div></div>
                  <div className="divide-y border-y text-sm">
                    {options.company && selectedCompany?.name && <PreviewRow label="EMPRESA" value={selectedCompany.name} />}
                    {options.cargo && selectedEmployee.cargo && <PreviewRow label="CARGO / FUNÇÃO" value={selectedEmployee.cargo} />}
                    {options.admission && selectedEmployee.dataAdmissao && <PreviewRow label="ADMISSÃO" value={formatDateBR(selectedEmployee.dataAdmissao)} />}
                    {options.dismissal && dismissalDate && <PreviewRow label="DEMISSÃO" value={formatDateBR(dismissalDate)} />}
                  </div>
                </div>

                <div className="space-y-3 rounded-xl border p-4">
                  <div><p className="text-sm font-semibold">Informações da capa</p><p className="text-xs text-muted-foreground">O nome sempre será impresso em destaque.</p></div>
                  <CoverCheck label="Empresa" checked={options.company} onClick={() => toggleOption('company')} />
                  <CoverCheck label="Cargo / Função" checked={options.cargo} onClick={() => toggleOption('cargo')} />
                  <CoverCheck label="Data de admissão" checked={options.admission} onClick={() => toggleOption('admission')} />
                  <CoverCheck label="Data de demissão" checked={options.dismissal} disabled={!dismissalDate || loadingEmployee} onClick={() => toggleOption('dismissal')} />
                  {loadingEmployee && <p className="text-xs text-muted-foreground">Conferindo desligamento...</p>}
                  {!loadingEmployee && !dismissalDate && <p className="text-xs text-muted-foreground">Este funcionário não possui data de demissão cadastrada.</p>}
                  {!!dismissalDate && <p className="text-xs text-muted-foreground">Demissão cadastrada: <strong>{formatDateBR(dismissalDate)}</strong>.</p>}
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>Fechar</Button>
          <Button onClick={printCover} disabled={!selectedEmployee || loadingEmployee}><Printer className="mr-2 h-4 w-4" /> Imprimir / Salvar PDF</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const PreviewRow = ({ label, value }: { label: string; value: string }) => <div className="grid grid-cols-[130px_1fr] gap-3 py-3"><span className="text-[10px] font-extrabold tracking-wide text-slate-500">{label}</span><strong className="text-base">{value}</strong></div>;

const CoverCheck = ({ label, checked, disabled, onClick }: { label: string; checked: boolean; disabled?: boolean; onClick: () => void }) => <button type="button" disabled={disabled} onClick={onClick} className="flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-45"><span className={`flex h-5 w-5 items-center justify-center rounded border ${checked ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`}>{checked ? '✓' : ''}</span><span>{label}</span></button>;

export default ArchiveCoverDialog;
