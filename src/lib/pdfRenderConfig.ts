import { getDocument, type PDFDocumentProxy } from 'pdfjs-dist';

// PDF.js 5 usa decodificadores WASM para formatos de imagem como JPEG2000/JPX.
// Sem wasmUrl alguns CRLVs abrem no visualizador nativo do navegador, mas
// renderizam como canvas branco quando transformados em imagem para impressão.
const PDFJS_VERSION = '5.6.205';
const PDFJS_CDN_BASE = `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/`;

export const loadPdfDocumentForRender = async (bytes: Uint8Array): Promise<PDFDocumentProxy> => {
  return getDocument({
    data: new Uint8Array(bytes),
    enableXfa: true,
    useWasm: true,
    wasmUrl: `${PDFJS_CDN_BASE}wasm/`,
    cMapUrl: `${PDFJS_CDN_BASE}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${PDFJS_CDN_BASE}standard_fonts/`,
    // Força o caminho consistente do PDF.js/WASM em vez de depender do
    // ImageDecoder do navegador, que varia entre versões do Chromium.
    isImageDecoderSupported: false,
  }).promise;
};
