import { describe, expect, it } from 'vitest';

import { loadPdfDocumentForRender } from '@/lib/pdfRenderConfig';

describe('pdf render config', () => {
  it('expõe o carregador robusto usado pela impressão', () => {
    expect(typeof loadPdfDocumentForRender).toBe('function');
  });
});
