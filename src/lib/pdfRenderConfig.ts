import { getDocument, type PDFDocumentProxy } from 'pdfjs-dist';

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
    isImageDecoderSupported: false,
  }).promise;
};
