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
  iframe.style.right = '-10000px';
  iframe.style.bottom = '-10000px';
  iframe.style.width = '210mm';
  iframe.style.height = '297mm';
  iframe.style.border = '0';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';
  iframe.setAttribute('aria-hidden', 'true');
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) return;
  doc.open();
  doc.write(`<!DOCTYPE html><html><head><title>${title}</title></head><body>${html}</body></html>`);
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

  window.setTimeout(trigger, 350);
};

const waitForImageReady = async (img: HTMLImageElement) => {
  if (!img.complete) {
    await new Promise<void>((resolve) => {
      img.addEventListener('load', () => resolve(), { once: true });
      img.addEventListener('error', () => resolve(), { once: true });
    });
  }

  // `complete` não significa necessariamente que os pixels já foram decodificados.
  // Isso é crítico em impressão de PDFs convertidos para data URL dentro de iframe.
  if (typeof img.decode === 'function' && img.naturalWidth > 0) {
    try {
      await img.decode();
    } catch {
      // Alguns navegadores rejeitam decode() mesmo com a imagem utilizável.
    }
  }
};

const waitForPrintAssets = async (doc: Document) => {
  const images = Array.from(doc.images || []);
  const imagePromise = Promise.all(images.map(waitForImageReady));
  const timeoutPromise = new Promise<void>((resolve) => window.setTimeout(resolve, 12_000));

  await Promise.race([imagePromise.then(() => undefined), timeoutPromise]);

  const fonts = (doc as Document & { fonts?: FontFaceSet }).fonts;
  if (fonts?.ready) {
    try {
      await Promise.race([
        fonts.ready.then(() => undefined),
        new Promise<void>((resolve) => window.setTimeout(resolve, 3_000)),
      ]);
    } catch {
      // A impressão não deve ser bloqueada por uma fonte opcional.
    }
  }
};

const waitForPaint = (win: Window) =>
  new Promise<void>((resolve) => {
    win.requestAnimationFrame(() => {
      win.requestAnimationFrame(() => {
        window.setTimeout(resolve, 120);
      });
    });
  });

/**
 * Variante para HTML completo (com <html><head>...</head><body>...</body></html>).
 * Aguarda imagens/fontes e a decodificação dos pixels antes de chamar print(),
 * evitando páginas em branco na impressão de PDFs renderizados em canvas.
 */
export const printDocumentInPage = (fullHtml: string) => {
  const existing = document.getElementById('__lov_print_iframe__') as HTMLIFrameElement | null;
  if (existing) existing.remove();

  const iframe = document.createElement('iframe');
  iframe.id = '__lov_print_iframe__';
  iframe.style.position = 'fixed';
  iframe.style.right = '-10000px';
  iframe.style.bottom = '-10000px';
  iframe.style.width = '210mm';
  iframe.style.height = '297mm';
  iframe.style.border = '0';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';
  iframe.setAttribute('aria-hidden', 'true');
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) return;
  let didPrint = false;

  const trigger = async () => {
    if (didPrint) return;
    didPrint = true;

    try {
      const printDoc = iframe.contentDocument || iframe.contentWindow?.document;
      const printWindow = iframe.contentWindow;
      if (!printDoc || !printWindow) return;

      await waitForPrintAssets(printDoc);
      await waitForPaint(printWindow);

      printWindow.focus();
      printWindow.print();
    } catch (e) {
      console.error('print failed', e);
    }

    // Chrome precisa que o iframe permaneça vivo durante todo o diálogo de impressão.
    window.setTimeout(() => iframe.remove(), 60_000);
  };

  iframe.onload = () => {
    void trigger();
  };

  doc.open();
  doc.write(fullHtml);
  doc.close();

  // Fallback para navegadores que não disparam onload de forma confiável em iframe escrito via document.write.
  window.setTimeout(() => {
    void trigger();
  }, 1500);
};
