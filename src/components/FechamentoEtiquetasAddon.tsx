import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Building2, FileText, Layers3, Search, Tags, UserRound } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import ArchiveCoverDialog from '@/components/ArchiveCoverDialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

const normalize = (value: unknown) => String(value || '').trim().toLocaleLowerCase('pt-BR');

const escapeHtml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/\"/g, '&quot;')
  .replace(/'/g, '&#039;');

type FolderPrintMode = 'employee' | 'company' | 'all';

const FechamentoEtiquetasAddon: React.FC = () => {
  const location = useLocation();
  const { employees, companies } = useApp();
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  const [companyId, setCompanyId] = useState('');
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [folderOpen, setFolderOpen] = useState(false);
  const [folderMode, setFolderMode] = useState<FolderPrintMode>('company');
  const [folderQuery, setFolderQuery] = useState('');
  const [folderEmployeeId, setFolderEmployeeId] = useState('');
  const [folderCompanyIds, setFolderCompanyIds] = useState<string[]>([]);

  useEffect(() => {
    if (location.pathname !== '/admin/fechamento') {
      setPortalHost(null);
      setCompanyId('');
      return;
    }

    let ownedHost: HTMLElement | null = null;
    const locate = () => {
      const cards = Array.from(document.querySelectorAll<HTMLElement>('.card-premium'));
      const card = cards.find((item) => normalize(item.textContent).includes('etiquetas a4 - modelo fixo'));
      if (!card) return;

      const title = card.querySelector('h2')?.textContent || '';
      const company = [...companies]
        .sort((a, b) => b.name.length - a.name.length)
        .find((item) => normalize(title).startsWith(normalize(item.name)));
      if (company) setCompanyId(company.id);

      const buttonGroups = Array.from(card.querySelectorAll<HTMLElement>('div.flex.flex-wrap.gap-2'));
      const target = buttonGroups.find((group) => normalize(group.textContent).includes('imprimir etiquetas')) || buttonGroups[0];
      if (!target) return;

      let host = target.querySelector<HTMLElement>('[data-topac-folder-tools="true"]');
      if (!host) {
        host = document.createElement('span');
        host.dataset.topacFolderTools = 'true';
        host.style.display = 'contents';
        target.appendChild(host);
      }
      ownedHost = host;
      setPortalHost(host);
    };

    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (ownedHost?.isConnected) ownedHost.remove();
      setPortalHost(null);
    };
  }, [companies, location.pathname]);

  const sortedCompanies = useMemo(() => [...companies]
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })), [companies]);

  const printableRhEmployees = useMemo(() => employees
    .filter((employee) => !['desligado', 'excluido'].includes(String(employee.status || '').toLowerCase()))
    .filter((employee) => employee.categoria === 'operacional')
    .filter((employee) => !!employee.companyId && companies.some((company) => company.id === employee.companyId))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })), [companies, employees]);

  const selectedFolderEmployee = printableRhEmployees.find((employee) => employee.id === folderEmployeeId) || null;

  const folderCandidates = useMemo(() => {
    const term = normalize(folderQuery);
    if (!term) return [];
    return printableRhEmployees
      .filter((employee) => {
        const company = companies.find((item) => item.id === employee.companyId);
        return normalize(`${employee.name} ${employee.cpf || ''} ${employee.cargo || ''} ${company?.name || ''}`).includes(term);
      })
      .slice(0, 20);
  }, [companies, folderQuery, printableRhEmployees]);

  const companyEmployeeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    printableRhEmployees.forEach((employee) => {
      if (employee.companyId) counts[employee.companyId] = (counts[employee.companyId] || 0) + 1;
    });
    return counts;
  }, [printableRhEmployees]);

  const selectableCompanyIds = useMemo(() => sortedCompanies
    .filter((company) => (companyEmployeeCounts[company.id] || 0) > 0)
    .map((company) => company.id), [companyEmployeeCounts, sortedCompanies]);

  const targetFolderEmployees = useMemo(() => {
    if (folderMode === 'employee') return selectedFolderEmployee ? [selectedFolderEmployee] : [];
    if (folderMode === 'company') return folderCompanyIds.length
      ? printableRhEmployees.filter((employee) => !!employee.companyId && folderCompanyIds.includes(employee.companyId))
      : [];
    return printableRhEmployees;
  }, [folderCompanyIds, folderMode, printableRhEmployees, selectedFolderEmployee]);

  const shortName = (employee: typeof printableRhEmployees[number]) => {
    const parts = employee.name.trim().split(/\s+/).filter(Boolean);
    const rawFirst = parts[0] || employee.name;
    const first = rawFirst.toLocaleUpperCase('pt-BR');
    const sameFirst = printableRhEmployees.filter((item) => {
      const itemFirst = item.name.trim().split(/\s+/)[0] || '';
      return itemFirst.localeCompare(rawFirst, 'pt-BR', { sensitivity: 'base' }) === 0;
    });
    if (sameFirst.length <= 1 || parts.length < 2) return first;
    const surname = parts.find((part, index) => index > 0 && !['DE', 'DA', 'DO', 'DAS', 'DOS', 'E'].includes(part.toUpperCase())) || parts[parts.length - 1];
    return `${first} ${surname.charAt(0).toLocaleUpperCase('pt-BR')}.`;
  };

  const openFolderDialog = () => {
    setFolderMode('company');
    setFolderCompanyIds(companyId && selectableCompanyIds.includes(companyId) ? [companyId] : []);
    setFolderQuery('');
    setFolderEmployeeId('');
    setFolderOpen(true);
  };

  const changeFolderMode = (mode: FolderPrintMode) => {
    setFolderMode(mode);
    setFolderQuery('');
    setFolderEmployeeId('');
    if (mode === 'company' && folderCompanyIds.length === 0 && companyId && selectableCompanyIds.includes(companyId)) {
      setFolderCompanyIds([companyId]);
    }
  };

  const toggleFolderCompany = (selectedCompanyId: string) => {
    setFolderCompanyIds((current) => current.includes(selectedCompanyId)
      ? current.filter((id) => id !== selectedCompanyId)
      : [...current, selectedCompanyId]);
  };

  const printFolderLabels = () => {
    if (!targetFolderEmployees.length) {
      if (folderMode === 'employee') return toast.error('Selecione um funcionário.');
      if (folderMode === 'company') return toast.error('Selecione uma ou mais empresas com funcionários ativos.');
      return toast.error('Nenhum funcionário ativo disponível para imprimir.');
    }

    const ordered = [...targetFolderEmployees]
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
    const labels = ordered.map((employee) => `
      <section class="folder-label"><strong>${escapeHtml(shortName(employee))}</strong></section>
    `).join('');

    const selectedCompanies = sortedCompanies.filter((company) => folderCompanyIds.includes(company.id));
    const selectedCompanyTitle = selectedCompanies.length === 1
      ? selectedCompanies[0].name
      : `${selectedCompanies.length} empresas`;
    const title = folderMode === 'employee'
      ? `Etiqueta pasta - ${ordered[0]?.name || 'Funcionário'}`
      : folderMode === 'company'
        ? `Etiquetas pasta - ${selectedCompanyTitle}`
        : 'Etiquetas pasta - Todos os funcionários';

    const win = window.open('', '_blank');
    if (!win) return toast.error('O navegador bloqueou a janela de impressão. Libere pop-ups para continuar.');

    win.document.write(`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: A4 portrait; margin: 20mm 12mm 12mm; }
    * { box-sizing: border-box; }
    html,body { margin:0; padding:0; background:#fff; color:#000; font-family:Arial,Helvetica,sans-serif; }
    .toolbar { position:sticky; top:0; z-index:2; display:flex; gap:8px; align-items:center; padding:10px 14px; background:#f3f4f6; border-bottom:1px solid #d1d5db; }
    .toolbar button { border:0; border-radius:8px; padding:8px 12px; background:#111827; color:#fff; font-weight:700; cursor:pointer; }
    .toolbar span { font-size:12px; color:#374151; }
    .sheet { display:grid; grid-template-columns:repeat(6,25mm); gap:3mm 5mm; justify-content:center; align-content:start; }
    .folder-label { width:25mm; height:10mm; border:.6pt solid #777; border-radius:1.5mm; display:flex; align-items:center; justify-content:center; padding:.65mm .55mm; text-align:center; overflow:hidden; break-inside:avoid; page-break-inside:avoid; }
    .folder-label strong { display:block; width:100%; font-size:14pt; line-height:1; font-weight:900; white-space:nowrap; overflow:hidden; text-align:center; }
    @media print { .toolbar { display:none; } }
  </style>
</head>
<body>
  <div class="toolbar"><button onclick="window.print()">Imprimir / salvar PDF</button><span>${ordered.length} etiqueta(s) • 2,5 × 1 cm • ordem alfabética • margem superior ampliada</span></div>
  <main class="sheet">${labels}</main>
  <script>
    (() => {
      const fitNames = () => {
        document.querySelectorAll('.folder-label strong').forEach((el) => {
          let size = 14;
          el.style.fontSize = size + 'pt';
          while (el.scrollWidth > el.clientWidth && size > 7) {
            size -= 0.25;
            el.style.fontSize = size + 'pt';
          }
        });
      };
      fitNames();
      window.addEventListener('beforeprint', fitNames);
    })();
  </script>
</body>
</html>`);
    win.document.close();
    win.focus();
    setFolderOpen(false);
  };

  const folderDialog = (
    <Dialog open={folderOpen} onOpenChange={setFolderOpen}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Tags className="h-5 w-5" /> Etiqueta pasta A-Z</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <button type="button" onClick={() => changeFolderMode('employee')} className={`rounded-lg border p-3 text-left transition ${folderMode === 'employee' ? 'border-primary bg-primary/5' : 'hover:bg-muted'}`}>
              <UserRound className="mb-2 h-5 w-5" />
              <strong className="block text-sm">Por funcionário</strong>
              <span className="text-xs text-muted-foreground">Digite e imprima uma pessoa</span>
            </button>
            <button type="button" onClick={() => changeFolderMode('company')} className={`rounded-lg border p-3 text-left transition ${folderMode === 'company' ? 'border-primary bg-primary/5' : 'hover:bg-muted'}`}>
              <Building2 className="mb-2 h-5 w-5" />
              <strong className="block text-sm">Por empresas</strong>
              <span className="text-xs text-muted-foreground">Marque 1, 2, 3 ou mais empresas</span>
            </button>
            <button type="button" onClick={() => changeFolderMode('all')} className={`rounded-lg border p-3 text-left transition ${folderMode === 'all' ? 'border-primary bg-primary/5' : 'hover:bg-muted'}`}>
              <Layers3 className="mb-2 h-5 w-5" />
              <strong className="block text-sm">Todas</strong>
              <span className="text-xs text-muted-foreground">RH completo em uma sequência A-Z</span>
            </button>
          </div>

          {folderMode === 'employee' && (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">Procurar funcionário</label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  value={folderQuery}
                  onChange={(event) => {
                    setFolderQuery(event.target.value);
                    setFolderEmployeeId('');
                  }}
                  placeholder="Digite o nome do funcionário"
                  autoFocus
                />
              </div>
              {!selectedFolderEmployee && folderCandidates.length > 0 && (
                <div className="max-h-56 overflow-y-auto rounded-lg border bg-background p-1">
                  {folderCandidates.map((employee) => {
                    const company = companies.find((item) => item.id === employee.companyId);
                    return (
                      <button key={employee.id} type="button" onClick={() => { setFolderEmployeeId(employee.id); setFolderQuery(employee.name); }} className="flex w-full items-start justify-between rounded-md px-3 py-2 text-left hover:bg-muted">
                        <span>
                          <span className="block text-sm font-semibold">{employee.name}</span>
                          <span className="block text-xs text-muted-foreground">{company?.name || 'Empresa não informada'} • {employee.cargo || 'Cargo não informado'}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              {selectedFolderEmployee && <p className="text-xs text-muted-foreground">Será impressa somente a etiqueta de <strong>{selectedFolderEmployee.name}</strong>.</p>}
            </div>
          )}

          {folderMode === 'company' && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-xs font-semibold text-muted-foreground">Selecione uma ou mais empresas</label>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => setFolderCompanyIds(selectableCompanyIds)}>Selecionar todas</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setFolderCompanyIds([])}>Limpar</Button>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {sortedCompanies.map((company) => {
                  const count = companyEmployeeCounts[company.id] || 0;
                  const checked = folderCompanyIds.includes(company.id);
                  return (
                    <label key={company.id} className={`flex items-center gap-3 rounded-lg border p-3 ${count ? 'cursor-pointer hover:bg-muted/50' : 'cursor-not-allowed opacity-50'} ${checked ? 'border-primary bg-primary/5' : ''}`}>
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-primary"
                        checked={checked}
                        disabled={!count}
                        onChange={() => toggleFolderCompany(company.id)}
                      />
                      <span className="min-w-0 flex-1">
                        <strong className="block truncate text-sm">{company.name}</strong>
                        <span className="text-xs text-muted-foreground">{count} funcionário(s) ativo(s)</span>
                      </span>
                    </label>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                <strong>{folderCompanyIds.length}</strong> empresa(s) selecionada(s) • <strong>{targetFolderEmployees.length}</strong> funcionário(s) serão reunidos em uma única sequência A-Z.
              </p>
            </div>
          )}

          {folderMode === 'all' && (
            <div className="rounded-lg border bg-muted/30 p-4 text-sm">
              <strong>{targetFolderEmployees.length} funcionários ativos</strong> serão reunidos em uma única sequência alfabética, sem separar por empresa, para aproveitar melhor as folhas.
            </div>
          )}

          <div className="rounded-lg border p-3 text-xs text-muted-foreground">
            Medida fixa: <strong>2,5 × 1 cm</strong>. Nomes iguais continuam diferenciados pela inicial do sobrenome em todo o RH. A impressão começa mais abaixo na folha para evitar corte no topo.
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setFolderOpen(false)}>Cancelar</Button>
          <Button type="button" onClick={printFolderLabels}>Imprimir etiquetas</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (!portalHost) {
    return <><ArchiveCoverDialog open={archiveOpen} onOpenChange={setArchiveOpen} />{folderDialog}</>;
  }

  return (
    <>
      {createPortal(<>
        <Button type="button" size="sm" variant="outline" onClick={() => setArchiveOpen(true)}>
          <FileText className="mr-1 h-3.5 w-3.5" /> Capa para arquivar
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={openFolderDialog}>
          <Tags className="mr-1 h-3.5 w-3.5" /> Etiqueta pasta A-Z
        </Button>
      </>, portalHost)}
      <ArchiveCoverDialog open={archiveOpen} onOpenChange={setArchiveOpen} />
      {folderDialog}
    </>
  );
};

export default FechamentoEtiquetasAddon;
