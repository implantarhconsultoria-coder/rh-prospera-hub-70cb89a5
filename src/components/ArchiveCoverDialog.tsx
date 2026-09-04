import React, { useMemo, useState } from 'react';
import { Building2, FileArchive, Layers3, PencilLine, Printer, Search, UserRound } from 'lucide-react';
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

type PrintMode = 'employee' | 'company' | 'all' | 'custom';

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

const sanitizeCargoForArchiveCover = (value: unknown) => String(value || '')
  .replace(/\s*[-–—]?\s*R\$\s*\d{1,3}(?:\.\d{3})*(?:,\d{2})?/gi, '')
  .replace(/\s*[-–—]?\s*R\$\s*\d+(?:,\d{2})?/gi, '')
  .replace(/\s{2,}/g, ' ')
  .replace(/\s*[-–—]\s*\+/g, ' +')
  .replace(/\s*[-–—]\s*$/g, '')
  .trim();

const lightFieldClass = 'bg-white text-slate-950 placeholder:text-slate-500 caret-slate-950 dark:bg-white dark:text-slate-950 dark:placeholder:text-slate-500';

const ArchiveCoverDialog: React.FC<ArchiveCoverDialogProps> = ({ open, onOpenChange }) => {
  const { employees, companies } = useApp();
  const [mode, setMode] = useState<PrintMode>('employee');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [dismissalDate, setDismissalDate] = useState('');
  const [loadingEmployee, setLoadingEmployee] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [options, setOptions] = useState<CoverOptions>(defaultOptions);
  const [customTitle, setCustomTitle] = useState('');
  const [customText, setCustomText] = useState('');
  const [customFooter, setCustomFooter] = useState('');

  const availableEmployees = useMemo(() => employees
    .filter((employee) => String(employee.status || '').toLowerCase() !== 'excluido')
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })), [employees]);

  const sortedCompanies = useMemo(() => [...companies]
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })), [companies]);

  const selectedEmployee = availableEmployees.find((employee) => employee.id === selectedId) || null;
  const selectedCompany = selectedEmployee ? companies.find((company) => company.id === selectedEmployee.companyId) || null : null;

  const candidates = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];
    return availableEmployees
      .filter((employee) => {
        const company = companies.find((item) => item.id === employee.companyId);
        return `${employee.name} ${employee.cpf} ${employee.cargo} ${company?.name || ''}`.toLowerCase().includes(normalized);
      })
      .slice(0, 20);
  }, [availableEmployees, companies, query]);

  const targetEmployees = useMemo(() => {
    if (mode === 'employee') return selectedEmployee ? [selectedEmployee] : [];
    if (mode === 'company') return selectedCompanyId
      ? availableEmployees.filter((employee) => employee.companyId === selectedCompanyId)
      : [];
    if (mode === 'all') return availableEmployees;
    return [];
  }, [availableEmployees, mode, selectedCompanyId, selectedEmployee]);

  const reset = () => {
    setMode('employee');
    setQuery('');
    setSelectedId('');
    setSelectedCompanyId('');
    setDismissalDate('');
    setLoadingEmployee(false);
    setPrinting(false);
    setOptions(defaultOptions);
    setCustomTitle('');
    setCustomText('');
    setCustomFooter('');
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  };

  const changeMode = (nextMode: PrintMode) => {
    setMode(nextMode);
    setQuery('');
    setSelectedId('');
    setDismissalDate('');
    setLoadingEmployee(false);
    if (nextMode !== 'company') setSelectedCompanyId('');
  };

  const selectEmployee = async (employeeId: string) => {
    const employee = availableEmployees.find((item) => item.id === employeeId);
    if (!employee) return;
    setSelectedId(employeeId);
    setQuery(employee.name);
    setDismissalDate('');
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

  const buildCoverPage = (employee: any, dismissalById: Record<string, string>) => {
    const company = companies.find((item) => item.id === employee.companyId) || null;
    const companyName = company?.name || '';
    const admission = formatDateBR(employee.dataAdmissao);
    const dismissal = formatDateBR(dismissalById[employee.id] || '');
    const safeCargo = sanitizeCargoForArchiveCover(employee.cargo);
    const detailRows = [
      options.company && companyName ? `<div class="row"><span>EMPRESA</span><strong>${escapeHtml(companyName)}</strong></div>` : '',
      options.cargo && safeCargo ? `<div class="row"><span>CARGO / FUNÇÃO</span><strong>${escapeHtml(safeCargo)}</strong></div>` : '',
      options.admission && admission ? `<div class="row"><span>ADMISSÃO</span><strong>${escapeHtml(admission)}</strong></div>` : '',
      options.dismissal && dismissal ? `<div class="row"><span>DEMISSÃO</span><strong>${escapeHtml(dismissal)}</strong></div>` : '',
    ].filter(Boolean).join('');

    return `
      <section class="page">
        <div class="top"><small>TOPAC RH PRO</small><h1>CAPA PARA ARQUIVAR</h1></div>
        <div class="name-wrap"><h2 class="name">${escapeHtml(employee.name)}</h2></div>
        <div class="details">${detailRows}</div>
        <div class="footer">ARQUIVO DO FUNCIONÁRIO</div>
      </section>
    `;
  };

  const printCustomCover = () => {
    const title = customTitle.trim();
    const text = customText.trim();
    const footer = customFooter.trim();
    if (!title && !text) {
      toast.error('Escreva um título ou algum texto para gerar a capa.');
      return;
    }

    const safeText = escapeHtml(text).replace(/\n/g, '<br />');
    printInPage(`
      <style>
        @page { size: A4 portrait; margin: 0; }
        * { box-sizing: border-box; }
        body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #111827; background: #fff; }
        .page { width: 210mm; min-height: 297mm; padding: 20mm 18mm 18mm; position: relative; }
        .top { border-bottom: 2px solid #111827; padding-bottom: 7mm; text-align: center; }
        .top small { display: block; font-size: 10pt; letter-spacing: 2.4px; font-weight: 700; color: #4b5563; }
        .top h1 { margin: 4mm 0 0; font-size: 18pt; letter-spacing: 1.2px; }
        .custom-wrap { min-height: 165mm; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 18mm 6mm; text-align: center; }
        .custom-title { margin: 0; max-width: 100%; font-size: 34pt; line-height: 1.1; font-weight: 900; text-transform: uppercase; overflow-wrap: anywhere; }
        .custom-text { margin-top: 14mm; width: 100%; font-size: 17pt; line-height: 1.55; font-weight: 600; overflow-wrap: anywhere; white-space: normal; }
        .footer { position: absolute; bottom: 16mm; left: 18mm; right: 18mm; text-align: center; color: #6b7280; font-size: 9pt; letter-spacing: .8px; }
      </style>
      <section class="page">
        <div class="top"><small>TOPAC RH PRO</small><h1>CAPA PARA ARQUIVAR</h1></div>
        <div class="custom-wrap">
          ${title ? `<h2 class="custom-title">${escapeHtml(title)}</h2>` : ''}
          ${text ? `<div class="custom-text">${safeText}</div>` : ''}
        </div>
        <div class="footer">${escapeHtml(footer || 'ARQUIVO TOPAC RH')}</div>
      </section>
    `, `Capa - ${title || 'Personalizada'}`);
  };

  const printCover = async () => {
    if (mode === 'custom') {
      setPrinting(true);
      try {
        printCustomCover();
      } finally {
        setPrinting(false);
      }
      return;
    }

    if (!targetEmployees.length) {
      if (mode === 'employee') return toast.error('Selecione um funcionário.');
      if (mode === 'company') return toast.error('Selecione uma empresa com funcionários cadastrados.');
      return toast.error('Nenhum funcionário disponível para gerar capa.');
    }

    setPrinting(true);
    try {
      const ids = targetEmployees.map((employee) => employee.id);
      const dismissalById: Record<string, string> = {};

      if (options.dismissal && ids.length) {
        const { data, error } = await (supabase as any)
          .from('funcionarios')
          .select('id,data_demissao')
          .in('id', ids);
        if (error) throw new Error(`Não foi possível carregar as datas de demissão: ${error.message}`);
        ((data as any[]) || []).forEach((row) => {
          if (row?.id && row?.data_demissao) dismissalById[String(row.id)] = String(row.data_demissao);
        });
      }

      if (mode === 'employee' && selectedEmployee && dismissalDate && options.dismissal) {
        dismissalById[selectedEmployee.id] = dismissalDate;
      }

      const ordered = [...targetEmployees].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
      const pages = ordered.map((employee) => buildCoverPage(employee, dismissalById)).join('');
      const title = mode === 'employee'
        ? `Capa - ${ordered[0]?.name || 'Funcionário'}`
        : mode === 'company'
          ? `Capas - ${companies.find((company) => company.id === selectedCompanyId)?.name || 'Empresa'}`
          : 'Capas - Todos os funcionários';

      printInPage(`
        <style>
          @page { size: A4 portrait; margin: 0; }
          * { box-sizing: border-box; }
          body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #111827; background: #fff; }
          .page { width: 210mm; min-height: 297mm; padding: 20mm 18mm 18mm; position: relative; break-after: page; page-break-after: always; }
          .page:last-child { break-after: auto; page-break-after: auto; }
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
        ${pages}
      `, title);
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível gerar as capas.');
    } finally {
      setPrinting(false);
    }
  };

  const customReady = Boolean(customTitle.trim() || customText.trim());

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileArchive className="h-5 w-5" /> Capa para Arquivar</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <ModeButton active={mode === 'employee'} icon={UserRound} title="Por funcionário" subtitle="Escolher uma pessoa" onClick={() => changeMode('employee')} />
            <ModeButton active={mode === 'company'} icon={Building2} title="Por empresa" subtitle="Uma capa para cada funcionário" onClick={() => changeMode('company')} />
            <ModeButton active={mode === 'all'} icon={Layers3} title="Todas" subtitle="Todos os funcionários do RH" onClick={() => changeMode('all')} />
            <ModeButton active={mode === 'custom'} icon={PencilLine} title="Capa livre" subtitle="Escrever o que quiser" onClick={() => changeMode('custom')} />
          </div>

          {mode === 'employee' && (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">Procurar funcionário</label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                <Input className={`pl-9 ${lightFieldClass}`} value={query} onChange={(event) => { setQuery(event.target.value); setSelectedId(''); setDismissalDate(''); }} placeholder="Digite nome, CPF, cargo ou empresa" autoFocus />
              </div>
              {!selectedEmployee && candidates.length > 0 && (
                <div className="max-h-56 overflow-y-auto rounded-lg border bg-background p-1">
                  {candidates.map((employee) => {
                    const company = companies.find((item) => item.id === employee.companyId);
                    const safeCargo = sanitizeCargoForArchiveCover(employee.cargo);
                    return (
                      <button key={employee.id} type="button" onClick={() => void selectEmployee(employee.id)} className="w-full rounded-md px-3 py-2 text-left hover:bg-muted">
                        <div className="text-xs font-semibold">{employee.name}</div>
                        <div className="text-[11px] text-muted-foreground">{[safeCargo, company?.name].filter(Boolean).join(' • ')}</div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {mode === 'company' && (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">Empresa</label>
              <select value={selectedCompanyId} onChange={(event) => setSelectedCompanyId(event.target.value)} className={`h-10 w-full rounded-md border px-3 text-sm ${lightFieldClass}`}>
                <option value="">Selecione uma empresa</option>
                {sortedCompanies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
              </select>
            </div>
          )}

          {mode === 'custom' && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-4 rounded-xl border p-4">
                <div>
                  <p className="text-sm font-semibold">Capa personalizada</p>
                  <p className="text-xs text-muted-foreground">Escreva livremente. Nada aqui altera cadastro ou salva informação no banco.</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Título da capa</label>
                  <Input className={lightFieldClass} value={customTitle} onChange={(event) => setCustomTitle(event.target.value)} placeholder="Ex.: DOCUMENTOS 2026" autoFocus />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Texto livre</label>
                  <textarea className={`min-h-44 w-full resize-y rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30 ${lightFieldClass}`} value={customText} onChange={(event) => setCustomText(event.target.value)} placeholder={'Ex.: CONTRATOS\nDOCUMENTOS PESSOAIS\nFICHAS E RECIBOS'} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Rodapé opcional</label>
                  <Input className={lightFieldClass} value={customFooter} onChange={(event) => setCustomFooter(event.target.value)} placeholder="Ex.: ARQUIVO ADMINISTRATIVO" />
                </div>
              </div>

              <div className="rounded-xl border bg-white p-6 text-slate-950 shadow-sm">
                <div className="border-b-2 border-slate-900 pb-4 text-center">
                  <div className="text-[9px] font-bold tracking-[.22em] text-slate-500">TOPAC RH PRO</div>
                  <div className="mt-1 text-sm font-extrabold tracking-wide">CAPA PARA ARQUIVAR</div>
                </div>
                <div className="flex min-h-[330px] flex-col items-center justify-center px-3 py-10 text-center">
                  {customTitle.trim() && <div className="break-words text-3xl font-black uppercase leading-tight md:text-5xl">{customTitle}</div>}
                  {customText.trim() && <div className="mt-8 whitespace-pre-wrap break-words text-base font-semibold leading-relaxed md:text-xl">{customText}</div>}
                  {!customReady && <div className="text-sm text-slate-400">A prévia aparece conforme você escreve.</div>}
                </div>
                <div className="border-t pt-3 text-center text-[10px] tracking-wide text-slate-500">{customFooter.trim() || 'ARQUIVO TOPAC RH'}</div>
              </div>
            </div>
          )}

          {mode === 'employee' && selectedEmployee && (
            <div className="grid gap-4 md:grid-cols-[1fr_280px]">
              <div className="rounded-xl border bg-white p-6 text-slate-950 shadow-sm">
                <div className="border-b-2 border-slate-900 pb-4 text-center">
                  <div className="text-[9px] font-bold tracking-[.22em] text-slate-500">TOPAC RH PRO</div>
                  <div className="mt-1 text-sm font-extrabold tracking-wide">CAPA PARA ARQUIVAR</div>
                </div>
                <div className="flex min-h-40 items-center justify-center px-3 py-8"><div className="break-words text-center text-3xl font-black uppercase leading-tight md:text-5xl">{selectedEmployee.name}</div></div>
                <div className="divide-y border-y text-sm">
                  {options.company && selectedCompany?.name && <PreviewRow label="EMPRESA" value={selectedCompany.name} />}
                  {options.cargo && sanitizeCargoForArchiveCover(selectedEmployee.cargo) && <PreviewRow label="CARGO / FUNÇÃO" value={sanitizeCargoForArchiveCover(selectedEmployee.cargo)} />}
                  {options.admission && selectedEmployee.dataAdmissao && <PreviewRow label="ADMISSÃO" value={formatDateBR(selectedEmployee.dataAdmissao)} />}
                  {options.dismissal && dismissalDate && <PreviewRow label="DEMISSÃO" value={formatDateBR(dismissalDate)} />}
                </div>
              </div>

              <CoverOptionsPanel options={options} dismissalEnabled={!!dismissalDate && !loadingEmployee} loadingEmployee={loadingEmployee} dismissalDate={dismissalDate} bulk={false} toggleOption={toggleOption} />
            </div>
          )}

          {mode !== 'employee' && mode !== 'custom' && (
            <div className="grid gap-4 md:grid-cols-[1fr_280px]">
              <div className="rounded-xl border bg-muted/20 p-5">
                <div className="text-5xl font-black">{targetEmployees.length}</div>
                <div className="mt-2 text-sm font-semibold uppercase tracking-wide">capa(s) no lote</div>
                <div className="mt-1 text-xs text-slate-500">uma página A4 por funcionário</div>
              </div>

              <CoverOptionsPanel options={options} dismissalEnabled loadingEmployee={false} dismissalDate="" bulk toggleOption={toggleOption} />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={printing}>Fechar</Button>
          <Button onClick={() => void printCover()} disabled={printing || (mode === 'employee' && !selectedEmployee) || (mode === 'company' && !targetEmployees.length) || (mode === 'all' && !targetEmployees.length) || (mode === 'custom' && !customReady)}>
            <Printer className="mr-2 h-4 w-4" /> {printing ? 'Gerando...' : 'Imprimir / Salvar PDF'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const ModeButton = ({ active, icon: Icon, title, subtitle, onClick }: { active: boolean; icon: React.ElementType; title: string; subtitle: string; onClick: () => void }) => (
  <button type="button" onClick={onClick} className={`rounded-xl border p-3 text-left transition ${active ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-border bg-muted/10 hover:bg-muted/20'}`}>
    <Icon className={`mb-2 h-4 w-4 ${active ? 'text-primary' : 'text-muted-foreground'}`} />
    <div className="text-xs font-semibold">{title}</div>
    <div className="mt-0.5 text-[10px] text-muted-foreground">{subtitle}</div>
  </button>
);

const PreviewRow = ({ label, value }: { label: string; value: string }) => (
  <div className="grid grid-cols-[130px_1fr] gap-3 py-3">
    <div className="text-[9px] font-extrabold tracking-wide text-slate-500">{label}</div>
    <div className="text-xs font-bold uppercase leading-snug">{value}</div>
  </div>
);

const CoverOptionsPanel = ({ options, dismissalEnabled, loadingEmployee, dismissalDate, bulk, toggleOption }: { options: CoverOptions; dismissalEnabled: boolean; loadingEmployee: boolean; dismissalDate: string; bulk: boolean; toggleOption: (key: keyof CoverOptions) => void }) => (
  <div className="rounded-xl border p-4">
    <div className="text-xs font-semibold">Informações da capa</div>
    <div className="mb-3 mt-0.5 text-[10px] text-muted-foreground">O nome sempre será impresso em destaque.</div>
    <div className="space-y-2">
      <OptionButton checked={options.company} label="Empresa" onClick={() => toggleOption('company')} />
      <OptionButton checked={options.cargo} label="Cargo / Função" onClick={() => toggleOption('cargo')} />
      <OptionButton checked={options.admission} label="Data de admissão" onClick={() => toggleOption('admission')} />
      <OptionButton checked={options.dismissal} label="Data de demissão" onClick={() => toggleOption('dismissal')} disabled={!dismissalEnabled} />
    </div>
    {!bulk && loadingEmployee && <div className="mt-3 text-[10px] text-muted-foreground">Conferindo data de demissão...</div>}
    {!bulk && !loadingEmployee && !dismissalDate && <div className="mt-3 text-[10px] text-muted-foreground">Este funcionário não possui data de demissão cadastrada.</div>}
  </div>
);

const OptionButton = ({ checked, label, onClick, disabled }: { checked: boolean; label: string; onClick: () => void; disabled?: boolean }) => (
  <button type="button" onClick={onClick} disabled={disabled} className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition ${disabled ? 'cursor-not-allowed opacity-40' : 'hover:bg-muted/20'}`}>
    <span className={`flex h-4 w-4 items-center justify-center rounded border text-[10px] ${checked ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`}>{checked ? '✓' : ''}</span>
    <span>{label}</span>
  </button>
);

export default ArchiveCoverDialog;
