import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import TicketVrModule from '@/components/TicketVrModule';

const TicketVrReportPageAddon: React.FC = () => {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const mount = () => {
      const path = window.location.pathname;
      if (!path.includes('/admin/relatorio-vr')) {
        setHost(null);
        return;
      }

      const cards = Array.from(document.querySelectorAll<HTMLElement>('.card-premium'));
      const importCard = cards.find((element) => /Importar VR por XLSX\/TXT/i.test(element.textContent || ''));
      if (!importCard?.parentElement) return;

      importCard.style.display = 'none';
      importCard.dataset.ticketVrLegacyImport = 'hidden';

      let element = document.querySelector<HTMLElement>('[data-ticket-vr-report-host="true"]');
      if (!element) {
        element = document.createElement('div');
        element.dataset.ticketVrReportHost = 'true';
        element.className = 'space-y-2';
        importCard.insertAdjacentElement('beforebegin', element);
      }
      setHost(element);
    };

    mount();
    const observer = new MutationObserver(mount);
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = window.setInterval(mount, 700);

    return () => {
      observer.disconnect();
      window.clearInterval(timer);
      const importCard = document.querySelector<HTMLElement>('[data-ticket-vr-legacy-import="hidden"]');
      if (importCard) importCard.style.display = '';
    };
  }, []);

  if (!host) return null;

  return createPortal(
    <div className="space-y-2">
      <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
        <p className="text-xs font-bold uppercase text-primary">EXPORTAÇÃO PARA TICKET</p>
        <p className="mt-1 text-xs text-muted-foreground">
          A Plataforma TOPAC usa os dados já cadastrados para calcular o VR e gerar o relatório PDF e o arquivo TXT no modelo Ticket. Não é necessário escolher ou importar arquivo.
        </p>
      </div>
      <TicketVrModule />
    </div>,
    host,
  );
};

export default TicketVrReportPageAddon;
