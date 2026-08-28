import { useEffect } from 'react';

const PRINT_BUTTON_TITLE = 'Abrir a ficha TOPAC FSE-2026 pronta para impressão';

const findActionBar = () => {
  const saveButton = Array.from(document.querySelectorAll('button')).find((button) => button.textContent?.trim() === 'Salvar');
  return saveButton?.parentElement || null;
};

const PreCadastroFseButtonPlacement = () => {
  useEffect(() => {
    const placeButton = () => {
      const printButton = document.querySelector(`button[title="${PRINT_BUTTON_TITLE}"]`) as HTMLButtonElement | null;
      const actionBar = findActionBar();
      if (!printButton || !actionBar) return;

      const saveButton = Array.from(actionBar.querySelectorAll(':scope > button')).find((button) => button.textContent?.trim() === 'Salvar');
      if (!saveButton) return;

      if (printButton.parentElement !== actionBar || saveButton.nextElementSibling !== printButton) {
        saveButton.insertAdjacentElement('afterend', printButton);
      }

      printButton.className = 'inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50';
      printButton.style.position = 'static';
      printButton.style.inset = 'auto';
      printButton.style.margin = '0';
      printButton.style.zIndex = 'auto';

      const textNode = Array.from(printButton.childNodes).find((node) => node.nodeType === Node.TEXT_NODE);
      if (textNode) textNode.textContent = ' Imprimir ficha';
    };

    placeButton();
    const observer = new MutationObserver(placeButton);
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = window.setInterval(placeButton, 800);

    return () => {
      observer.disconnect();
      window.clearInterval(timer);
    };
  }, []);

  return null;
};

export default PreCadastroFseButtonPlacement;
