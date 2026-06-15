import { describe, expect, it } from 'vitest';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { gerarReciboAbastecimentoPdf } from '@/app-mecanico/lib/abastecimentoReceiptPdf';
import { ponteAereaLogoDataUrl as testImage } from '@/assets/ponteAereaLogoData';
const toBytes = (blob: Blob) => new Promise<Uint8Array>((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(reader.error);
  reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
  reader.readAsArrayBuffer(blob);
});

it('gera recibo PDF com dados e as duas fotos', async () => {
  const { blob, fileName } = await gerarReciboAbastecimentoPdf({
    id: 'abast-1', postoNome: 'Posto Teste', postoCnpj: '12.345.678/0001-90', postoEndereco: 'Rua Teste, 10',
    mecanicoNome: 'Mecânico TOPAC', empresa: 'TOPAC MATRIZ', filial: 'São Paulo', placa: 'ABC1D23',
    combustivel: 'Diesel S10', valor: '250,00', litros: '40,000', precoLitro: '6,250', km: '123456',
    observacao: 'OCR confirmado', fotoBombaUrl: testImage, fotoPainelUrl: testImage, createdAt: new Date('2026-06-10T12:30:00Z'),
  });
  const pdf = await getDocument({ data: await toBytes(blob), disableWorker: true }).promise;
  const content = await (await pdf.getPage(1)).getTextContent();
  const text = content.items.map(item => 'str' in item ? item.str : '').join(' ');

  expect(fileName).toMatch(/^ABASTECIMENTO_TOPAC_MATRIZ_ABC1D23_/);
  expect(blob.type).toBe('application/pdf');
  expect(blob.size).toBeGreaterThan(5_000);
  expect(text).toContain('RECIBO DE ABASTECIMENTO');
  expect(text).toContain('Mecânico TOPAC');
  expect(text).toContain('ABC1D23');
  expect(text).toContain('123456');
  expect(text).toContain('Foto da bomba');
  expect(text).toContain('Foto do painel / KM');
});
