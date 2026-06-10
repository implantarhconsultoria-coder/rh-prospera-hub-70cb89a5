import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { gerarAutorizacaoExameAdmissionalPdf } from '@/lib/pdfGenerator';

const blobToUint8Array = (blob: Blob) => new Promise<Uint8Array>((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(reader.error);
  reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
  reader.readAsArrayBuffer(blob);
});

const extractPdfText = async (blob: Blob) => {
  const pdf = await getDocument({ data: await blobToUint8Array(blob), disableWorker: true }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map(item => ('str' in item ? item.str : '')).join(' '));
  }
  return pages.join(' ');
};

describe('PDF padrão Audiolife para ASO', () => {
  it('gera a autorização preenchida para funcionário TOPAC real', async () => {
    const { blob, fileName } = gerarAutorizacaoExameAdmissionalPdf({
      empresa: 'TOPAC FILIAL GOIANIA',
      cnpj: '07.291.648/0003-75',
      nome: 'IGOR FERREIRA ABREU',
      cpf: '700.995.111-00',
      funcao: 'AUXILIAR ADMINISTRATIVO',
      dataAdmissao: '2025-05-21',
      dataNascimento: '1995-04-18',
      setorGhe: 'ADMINISTRATIVO',
      dataExame: '2026-06-20',
      tipoExame: 'Periódico',
      obraLocal: 'TOPAC FILIAL GOIANIA',
      trabalhoAltura: true,
      espacoConfinado: false,
      toxicologico: true,
      responsavelContato: 'RODRIGO DE SOUZA SABINO - RH TOPAC',
      clinica: 'ASMETRO - Medicina do Trabalho, Rua 18, nº 247, Setor Central, Goiânia - GO, CEP 74030-040',
    });

    const pdfBytes = await blobToUint8Array(blob);
    writeFileSync('/tmp/GUIA-ASO-AUDIOLIFE-IGOR-FERREIRA-ABREU.pdf', pdfBytes);
    const text = await extractPdfText(blob);

    expect(fileName).toContain('GUIA ASO AUDIOLIFE - IGOR FERREIRA ABREU');
    expect(blob.size).toBeGreaterThan(20_000);
    expect(text).toContain('AUTORIZAÇÃO DE EXAMES');
    expect(text).toContain('TOPAC FILIAL GOIANIA');
    expect(text).toContain('IGOR FERREIRA ABREU');
    expect(text).toContain('700.995.111-00');
    expect(text).toContain('EXAME PERIÓDICO');
    expect(text).toContain('ASMETRO - MEDICINA DO TRABALHO');
    expect(text).toContain('NR35');
    expect(text).toContain('NR33');
    expect(text).toContain('TOXICOLÓGICO');
    expect(text).toContain('RODRIGO DE SOUZA SABINO - RH TOPAC');
  });
});
