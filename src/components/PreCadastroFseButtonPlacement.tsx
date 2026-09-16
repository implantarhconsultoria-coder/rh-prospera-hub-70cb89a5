import { useEffect } from 'react';

const PRINT_BUTTON_TITLE = 'Abrir a ficha TOPAC FSE-2026 pronta para impressão';
const FSE_SLOT_ID = 'topac-pre-cadastro-fse-slot';

const PreCadastroFseButtonPlacement = () => {
  useEffect(() => {
    const placeButton = () => {
      const printButton = document.querySelector(`button[title="${PRINT_BUTTON_TITLE}"]`) as HTMLButtonElement | null;
      if (!printButton) return;

      const slot = document.getElementById(FSE_SLOT_ID);
      if (slot) {
        if (printButton.parentElement !== slot) slot.appendChild(printButton);
      } else {
        const saveButton = Array.from(document.querySelectorAll('button')).find((button) => button.textContent?.trim() === 'Salvar');
        const actionBar = saveButton?.parentElement;
        if (!saveButton || !actionBar) return;
        if (printButton.parentElement !== actionBar || saveButton.nextElementSibling !== printButton) saveButton.insertAdjacentElement('afterend', printButton);
      }

      printButton.className = 'inline-flex min-h-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-md border border-violet-500/25 bg-violet-500/[.06] px-4 py-2 text-sm font-semibold text-violet-100 transition-colors hover:bg-violet-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:pointer-events-none disabled:opacity-50';
      printButton.style.position = 'static';
      printButton.style.inset = 'auto';
      printButton.style.margin = '0';
      printButton.style.zIndex = 'auto';
      printButton.style.width = '100%';

      const textNode = Array.from(printButton.childNodes).find((node) => node.nodeType === Node.TEXT_NODE);
      if (textNode) textNode.textContent = ' Ficha FSE-2026';
    };

    placeButton();
    const observer = new MutationObserver(placeButton);
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = window.setInterval(placeButton, 500);

    return () => {
      observer.disconnect();
      window.clearInterval(timer);
    };
  }, []);

  return null;
};

export default PreCadastroFseButtonPlacement;
