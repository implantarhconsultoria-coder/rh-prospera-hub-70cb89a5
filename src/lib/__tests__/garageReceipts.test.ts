import { describe, expect, it } from 'vitest';
import { buildGarageConsolidatedPdf, buildGarageIndividualPdf, garageReceiptFilename, type GarageReceiptData } from '../garageReceipts';

const receipt: GarageReceiptData = {
  employeeId: 'registered-id', employeeName: 'FUNCIONARIO TESTE', cpf: '000.000.000-00',
  cargo: 'MECANICO', registro: '42', companyId: 'company-id', companyName: 'EMPRESA TESTE',
  cnpj: '00.000.000/0001-00', veiculo: 'FIAT STRADA', placa: 'ABC1D23',
  competencia: '2026-10', dataPagamento: '2026-10-03', valor: 200,
};

describe('comprovantes de garagem', () => {
  it('cria o PDF individual usando funcionario e competencia', async () => {
    const blob = buildGarageIndividualPdf(receipt);
    expect(blob.type).toBe('application/pdf');
    expect(blob.size).toBeGreaterThan(1000);
    expect(garageReceiptFilename(receipt)).toBe('RECIBO_GARAGEM_FUNCIONARIO_TESTE_2026-10.pdf');
  });
  it('cria consolidado sem exigir dados fora do cadastro', () => {
    const blob = buildGarageConsolidatedPdf([receipt, { ...receipt, employeeId: 'registered-id-2', employeeName: 'SEGUNDO FUNCIONARIO' }]);
    expect(blob.type).toBe('application/pdf');
    expect(blob.size).toBeGreaterThan(1000);
  });
  it('nao modifica o valor do recibo original', () => {
    buildGarageIndividualPdf(receipt);
    expect(receipt.valor).toBe(200);
    expect(receipt.placa).toBe('ABC1D23');
  });
});
