let pdfJsPromise: Promise<any> | null = null;

const installCanvasGlobals = async () => {
  const scope = globalThis as any;
  if (typeof scope.DOMMatrix !== 'undefined'
      && typeof scope.ImageData !== 'undefined'
      && typeof scope.Path2D !== 'undefined') return;

  const canvas: any = await import('@napi-rs/canvas');
  if (typeof scope.DOMMatrix === 'undefined' && canvas.DOMMatrix) scope.DOMMatrix = canvas.DOMMatrix;
  if (typeof scope.ImageData === 'undefined' && canvas.ImageData) scope.ImageData = canvas.ImageData;
  if (typeof scope.Path2D === 'undefined' && canvas.Path2D) scope.Path2D = canvas.Path2D;
};

export const loadPdfJsNode = async () => {
  if (!pdfJsPromise) {
    pdfJsPromise = (async () => {
      await installCanvasGlobals();
      return import('pdfjs-dist/legacy/build/pdf.mjs');
    })();
  }
  return pdfJsPromise;
};
