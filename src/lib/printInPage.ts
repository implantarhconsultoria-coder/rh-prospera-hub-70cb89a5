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

const compactPrintToken = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

const substitutionTokens = (value: string) =>
  value
    .split(/[\s/—–,:;()[\]]+/)
    .map(compactPrintToken)
    .filter((token) => token.length >= 5 && token !== 'EQUIPAMENTO' && token !== 'SUBSTITUICAO');

/**
 * Regra específica do Protocolo de substituição:
 * o ativo marcado como SAI permanece descrito no protocolo, mas seu PDF não deve
 * ser anexado à impressão. Somente os documentos efetivamente enviados seguem.
 * Fora do Protocolo esta função não altera absolutamente nada.
 */
const pruneOutgoingSubstitutionDocuments = (doc: Document) => {
  if (!doc.querySelector('.protocol-page .substitution-line') || !doc.querySelector('.document-page')) return;

  const children = Array.from(doc.body.children) as HTMLElement[];
  let index = 0;

  while (index < children.length) {
    const firstProtocol = children[index];
    if (!firstProtocol?.classList.contains('protocol-page')) {
      index += 1;
      continue;
    }

    const secondProtocol = children[index + 1]?.classList.contains('protocol-page') ? children[index + 1] : null;
    const groupStart = secondProtocol ? index + 2 : index + 1;
    let groupEnd = groupStart;

    while (groupEnd < children.length && !children[groupEnd].classList.contains('protocol-page')) {
      groupEnd += 1;
    }

    const substitutionLine = firstProtocol.querySelector('.substitution-line');
    if (substitutionLine) {
      const text = substitutionLine.textContent || '';
      const outgoingMatch = text.match(/SAI:\s*(.*?)(?:→|ENTRA:)/i);
      const outgoingText = outgoingMatch?.[1]?.trim() || '';
      const outgoingTokens = substitutionTokens(outgoingText);
      const documentPages = children
        .slice(groupStart, groupEnd)
        .filter((node) => node.classList.contains('document-page'));

      let removed = false;

      // 1) Preferência: nome do PDF contém placa/patrimônio do equipamento que SAI.
      if (outgoingTokens.length) {
        const directMatches = documentPages.filter((page) => {
          const documentName = compactPrintToken(page.getAttribute('data-document') || '');
          return outgoingTokens.some((token) => documentName.includes(token));
        });

        if (directMatches.length === 1) {
          directMatches[0].remove();
          removed = true;
        }
      }

      // 2) Fallback seguro: usa a ordem dos ativos mostrada nas Observações.
      // O Protocolo monta os PDFs na mesma ordem dos itens do grupo.
      if (!removed && documentPages.length > 1 && outgoingTokens.length) {
        const listedItems = Array.from(firstProtocol.querySelectorAll('.observations-content li'));
        const outgoingIndex = listedItems.findIndex((item) => {
          const listed = compactPrintToken(item.textContent || '');
          return outgoingTokens.some((token) => listed.includes(token));
        });

        if (outgoingIndex >= 0 && outgoingIndex < documentPages.length) {
          documentPages[outgoingIndex].remove();
        }
      }
    }

    index = groupEnd;
  }
};

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

      pruneOutgoingSubstitutionDocuments(printDoc);
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
