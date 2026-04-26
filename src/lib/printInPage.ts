/**
 * Imprime HTML usando um iframe oculto, sem abrir nova aba.
 * Padrão exigido pela plataforma: tudo dentro da própria interface.
 */
export const printInPage = (html: string, title = 'Documento') => {
  const existing = document.getElementById('__lov_print_iframe__') as HTMLIFrameElement | null;
  if (existing) existing.remove();

  const iframe = document.createElement('iframe');
  iframe.id = '__lov_print_iframe__';
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.setAttribute('aria-hidden', 'true');
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) return;
  doc.open();
  doc.write(`<!DOCTYPE html><html><head><title>${title}</title></head><body>${html}</body></html>`);
  doc.close();

  // Aguarda render antes de imprimir
  const trigger = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (e) {
      console.error('print failed', e);
    }
    // Remove depois de um tempo (Chrome precisa que fique vivo durante o diálogo)
    window.setTimeout(() => iframe.remove(), 60_000);
  };

  // Pequeno delay para imagens/fontes
  window.setTimeout(trigger, 350);
};

/**
 * Variante para HTML completo (com <html><head>...</head><body>...</body></html>).
 */
export const printDocumentInPage = (fullHtml: string) => {
  const existing = document.getElementById('__lov_print_iframe__') as HTMLIFrameElement | null;
  if (existing) existing.remove();

  const iframe = document.createElement('iframe');
  iframe.id = '__lov_print_iframe__';
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.setAttribute('aria-hidden', 'true');
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) return;
  doc.open();
  doc.write(fullHtml);
  doc.close();

  const trigger = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (e) {
      console.error('print failed', e);
    }
    window.setTimeout(() => iframe.remove(), 60_000);
  };
  window.setTimeout(trigger, 500);
};
