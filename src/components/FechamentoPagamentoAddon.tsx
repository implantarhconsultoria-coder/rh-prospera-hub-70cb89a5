import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Wallet } from 'lucide-react';

const FechamentoPagamentoAddon: React.FC = () => {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const mount = () => {
      if (window.location.pathname !== '/admin/fechamento') { setHost(null); return; }
      const grids = Array.from(document.querySelectorAll<HTMLElement>('.grid'));
      const grid = grids.find(element => /Lancamentos/i.test(element.textContent || '') && /Importar ponto/i.test(element.textContent || '') && /VR/i.test(element.textContent || ''));
      if (!grid) return;
      let element = grid.querySelector<HTMLElement>('[data-fechamento-pagamento-host="true"]');
      if (!element) {
        element = document.createElement('div');
        element.dataset.fechamentoPagamentoHost = 'true';
        grid.appendChild(element);
      }
      setHost(element);
    };
    mount();
    const observer = new MutationObserver(mount);
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = window.setInterval(mount, 700);
    return () => { observer.disconnect(); window.clearInterval(timer); };
  }, []);

  if (!host) return null;
  return createPortal(
    <button type="button" onClick={() => { window.location.href = '/admin/folha-pagamento'; }} className="card-premium h-full w-full p-3 text-left hover:ring-2 hover:ring-primary/30 transition-all">
      <Wallet className="w-4 h-4 text-primary mb-2" />
      <span className="text-xs font-semibold text-foreground">Pagamento</span>
    </button>,
    host,
  );
};

export default FechamentoPagamentoAddon;
