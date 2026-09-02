import { describe, expect, it } from 'vitest';
import {
  findVehicleByPlate,
  hasRequiredVehicleIdentity,
  normalizeVehiclePlate,
  toProtocolVehicleFields,
  vehicleIdentityWarnings,
} from '../vehicleSync';

describe('sincronizacao Frota e Protocolo', () => {
  const vehicle = {
    id: 'vehicle-1',
    descricao: 'Volkswagen Delivery',
    placa: 'ABC-1D23',
    patrimonio: 'PAT-009',
    renavam: '12345678901',
    chassi: '9BWZZZ377VT004251',
    ano_fabricacao: '2024',
    ano_modelo: '2025',
    empresa: 'TOPAC MATRIZ',
    arquivo_url: 'https://storage.example/veiculo.pdf',
    observacao: 'Documento vigente',
  };

  it('localiza pela placa normalizada e transfere todos os dados', () => {
    const match = findVehicleByPlate([vehicle], 'abc 1d23');
    expect(match?.id).toBe('vehicle-1');
    expect(normalizeVehiclePlate('ABC-1D23')).toBe('ABC1D23');

    const protocol = toProtocolVehicleFields(match!);
    expect(protocol).toMatchObject({
      ativoId: 'vehicle-1',
      placa: 'ABC1D23',
      patrimonio: 'PAT-009',
      renavam: '12345678901',
      chassi: '9BWZZZ377VT004251',
      anoFabricacao: '2024',
      anoModelo: '2025',
      empresa: 'TOPAC MATRIZ',
      pdfUrl: 'https://storage.example/veiculo.pdf',
    });
  });

  it('exige RENAVAM e chassi completos', () => {
    expect(hasRequiredVehicleIdentity(vehicle)).toBe(true);
    expect(vehicleIdentityWarnings({ renavam: '', chassi: '123' })).toEqual([
      'RENAVAM obrigatório não identificado.',
      'Chassi obrigatório não identificado ou incompleto.',
    ]);
  });

  it('nao vincula uma placa incompleta', () => {
    expect(findVehicleByPlate([vehicle], 'ABC1')).toBeNull();
  });
});
