import { describe, expect, it } from 'vitest';
import { ponteAereaLogoDataUrl } from '@/assets/ponteAereaLogoData';
import { gerarCupomAbastecimentoPdf } from '@/app-mecanico/lib/abastecimentoPdf';


describe('cupom PDF de abastecimento', () => {
  it('gera recibo vertical com valores, veículo, funcionário, fotos e QR', async () => {
    const result = await gerarCupomAbastecimentoPdf({
      id: 'abast-123', codigo: 'POSTO-QR-001', postoNome: 'Posto Exemplo', postoCnpj: '12.345.678/0001-90',
      mecanicoNome: 'Mecânico TOPAC', empresa: 'TOPAC', filial: 'Praia Grande', placa: 'ABC1D23', veiculo: 'Caminhão',
      combustivel: 'Diesel S10', valor: '205,30', litros: '29,370', precoLitro: '6,990', km: '123456',
      observacao: 'Leitura confirmada', fotoBombaUrl: ponteAereaLogoDataUrl, fotoPainelUrl: ponteAereaLogoDataUrl,
      createdAt: new Date('2026-06-11T10:30:00Z'),
    });

    expect(result.blob.type).toBe('application/pdf');
    expect(result.blob.size).toBeGreaterThan(10_000);
    const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = reject;
      reader.readAsArrayBuffer(result.blob);
    });
    const text = new TextDecoder('latin1').decode(new Uint8Array(buffer));

    expect(text).toContain('RECIBO DE ABASTECIMENTO');
    expect(text).toContain('Mecânico TOPAC');
    expect(text).toContain('ABC1D23');
    expect(text).toContain('205,30');
    expect(text).toContain('29,370');
    expect(text).toContain('6,99');
    expect(text).toContain('123456');
    expect(text).toContain('FOTO DA BOMBA');
    expect(text).toContain('FOTO DO PAINEL / KM');
    expect(text).toContain('QR / CHAVE DO POSTO');
    expect((text.match(/\/Subtype \/Image/g) || []).length).toBeGreaterThanOrEqual(2);
  }, 20_000);
});
