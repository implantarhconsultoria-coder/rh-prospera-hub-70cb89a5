import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import TicketVrModule from '@/components/TicketVrModule';

const TicketVrPortalAddon: React.FC = () => {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const mount = () => {
      if (!window.location.pathname.includes('/admin/fechamento')) { setHost(null); return; }
      const existing = document.querySelector<HTMLElement>('[data-ticket-vr-module="true"]');
      if (existing) { setHost(existing); return; }
      const cards = Array.from(document.querySelectorAll<HTMLElement>('.card-premium'));
      const anchor = cards.find((element) => /dias uteis/i.test(element.textContent || '') && element.querySelector('input[type="month"]'));
      if (!anchor?.parentElement) return;
      const element = document.createElement('div');
      element.dataset.ticketVrModule = 'true';
      element.className = 'mt-4';
      anchor.insertAdjacentElement('afterend', element);
      setHost(element);
    };
    mount();
    const observer = new MutationObserver(mount);
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = window.setInterval(mount, 700);
    return () => { observer.disconnect(); window.clearInterval(timer); };
  }, []);

  if (!host) return null;
  return createPortal(<TicketVrModule />, host);
};

export default TicketVrPortalAddon;
