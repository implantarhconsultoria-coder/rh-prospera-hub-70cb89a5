import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileText, Tags } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import ArchiveCoverDialog from '@/components/ArchiveCoverDialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const normalize = (value: unknown) => String(value || '').trim().toLocaleLowerCase('pt-BR');

const escapeHtml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const FechamentoEtiquetasAddon: React.FC = () => {
  const location = useLocation();
  const { employees, companies } = useApp();
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  const [companyId, setCompanyId] = useState('');
  const [archiveOpen, setArchiveOpen] = useState(false);

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

  const activeEmployees = useMemo(() => employees
    .filter((employee) => employee.companyId === companyId)
    .filter((employee) => employee.categoria === 'operacional')
    .filter((employee) => !['desligado', 'excluido'].includes(employee.status))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })), [companyId, employees]);

  const shortName = (employee: typeof activeEmployees[number]) => {
    const parts = employee.name.trim().split(/\s+/).filter(Boolean);
    const first = parts[0] || employee.name;
    const sameFirst = activeEmployees.filter((item) => {
      const itemFirst = item.name.trim().split(/\s+/)[0] || '';
      return itemFirst.localeCompare(first, 'pt-BR', { sensitivity: 'base' }) === 0;
    });
    if (sameFirst.length <= 1 || parts.length < 2) return first;
    const surname = parts.find((part, index) => index > 0 && !['DE', 'DA', 'DO', 'DAS', 'DOS', 'E'].includes(part.toUpperCase())) || parts[parts.length - 1];
    return `${first} ${surname.charAt(0).toUpperCase()}.`;
  };

  const printFolderLabels = () => {
    if (!companyId) return toast.error('Selecione uma empresa no fechamento.');
    if (!activeEmployees.length) return toast.error('Nenhum funcionário vinculado ao RH para esta empresa.');

    const labels = activeEmployees.map((employee) => `
      <section class="folder-label"><strong>${escapeHtml(shortName(employee))}</strong></section>
    `).join('');

    const company = companies.find((item) => item.id === companyId)?.name || 'Empresa';
    const win = window.open('', '_blank');
    if (!win) return toast.error('O navegador bloqueou a janela de impressão. Libere pop-ups para continuar.');

    win.document.write(`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Etiquetas pasta - ${escapeHtml(company)}</title>
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    * { box-sizing: border-box; }
    html,body { margin:0; padding:0; background:#fff; color:#000; font-family:Arial,Helvetica,sans-serif; }
    .toolbar { position:sticky; top:0; z-index:2; display:flex; gap:8px; align-items:center; padding:10px 14px; background:#f3f4f6; border-bottom:1px solid #d1d5db; }
    .toolbar button { border:0; border-radius:8px; padding:8px 12px; background:#111827; color:#fff; font-weight:700; cursor:pointer; }
    .toolbar span { font-size:12px; color:#374151; }
    .sheet { display:grid; grid-template-columns:repeat(4,42mm); gap:4mm 5mm; justify-content:center; align-content:start; }
    .folder-label { width:42mm; height:14mm; border:.6pt solid #777; border-radius:1.5mm; display:flex; align-items:center; justify-content:center; padding:1.5mm 2mm; text-align:center; overflow:hidden; break-inside:avoid; page-break-inside:avoid; }
    .folder-label strong { font-size:12pt; line-height:1; font-weight:800; white-space:nowrap; max-width:100%; overflow:hidden; text-overflow:ellipsis; }
    @media print { .toolbar { display:none; } }
  </style>
</head>
<body>
  <div class="toolbar"><button onclick="window.print()">Imprimir / salvar PDF</button><span>${activeEmployees.length} funcionários • ordem alfabética • vínculo automático com RH</span></div>
  <main class="sheet">${labels}</main>
</body>
</html>`);
    win.document.close();
    win.focus();
  };

  if (!portalHost) return <ArchiveCoverDialog open={archiveOpen} onOpenChange={setArchiveOpen} />;

  return (
    <>
      {createPortal(<>
        <Button type="button" size="sm" variant="outline" onClick={() => setArchiveOpen(true)}>
          <FileText className="mr-1 h-3.5 w-3.5" /> Capa para arquivar
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={printFolderLabels}>
          <Tags className="mr-1 h-3.5 w-3.5" /> Etiqueta pasta A-Z
        </Button>
      </>, portalHost)}
      <ArchiveCoverDialog open={archiveOpen} onOpenChange={setArchiveOpen} />
    </>
  );
};

export default FechamentoEtiquetasAddon;
