import { describe, expect, it } from 'vitest';
import { buildTopacRhPdfFileName, competenciaPdfPart } from '@/lib/savePdf';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('padronização de PDFs TOPAC RH', () => {
  it('formata competência em mês por extenso sem acento no arquivo', () => {
    expect(competenciaPdfPart('2026-08')).toBe('Agosto2026');
  });

  it('gera os três nomes executivos obrigatórios', () => {
    expect(buildTopacRhPdfFileName({ tipo: 'Fechamento', nome: 'Alqui Obras', competencia: '2026-08' })).toBe('TOPAC_RH_Fechamento_AlquiObras_Agosto2026.pdf');
    expect(buildTopacRhPdfFileName({ tipo: 'Funcionario', nome: 'Adalto Jacinto', competencia: '2026-08' })).toBe('TOPAC_RH_Funcionario_AdaltoJacinto_Agosto2026.pdf');
    expect(buildTopacRhPdfFileName({ tipo: 'Relatorio', nome: 'Multiempresas', competencia: '2026-08' })).toBe('TOPAC_RH_Relatorio_Multiempresas_Agosto2026.pdf');
  });

  it('não usa canvas/jsPDF na função saveElementAsPdf', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/lib/savePdf.ts'), 'utf8');
    const block = source.slice(source.indexOf('export const saveElementAsPdf'));
    expect(block).toContain('printDocumentAsPdf(fileName)');
    expect(block).not.toContain('html2canvas');
    expect(block).not.toContain('new jsPDF');
  });

  it('faz imprimir e salvar compartilharem o mesmo handler no fechamento', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/pages/RelatorioImpressaoPage.tsx'), 'utf8');
    expect((source.match(/onClick=\{handlePrintOrPdf\}/g) || []).length).toBeGreaterThanOrEqual(2);
    expect(source).toContain("tipo: allCompanies ? 'Relatorio' : 'Fechamento'");
    expect(source).toContain("nome: allCompanies ? 'Multiempresas'");
  });
});
