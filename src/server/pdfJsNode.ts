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

const installPdfWorker = async () => {
  const scope = globalThis as any;
  if (scope.pdfjsWorker?.WorkerMessageHandler) return;

  // Import explícito: força a Vercel a incluir o worker no bundle da Function.
  // PDF.js em Node usa esse módulo como "fake worker".
  const workerModule: any = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs');
  scope.pdfjsWorker = workerModule;
};

export const loadPdfJsNode = async () => {
  if (!pdfJsPromise) {
    pdfJsPromise = (async () => {
      await installCanvasGlobals();
      await installPdfWorker();
      const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
      return pdfjs;
    })();
  }
  return pdfJsPromise;
};
