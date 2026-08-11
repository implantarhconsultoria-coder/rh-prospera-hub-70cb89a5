import { describe, expect, it } from 'vitest';
import { parseVehiclePdfText } from '../../../api/frota-upload';
import { parseProtocolMessage } from '../../../api/protocolos-parse';

describe('Frota PDF parsing', () => {
  it('extrai placa, renavam, chassi, ano e identificação do ativo', () => {
    const parsed = parseVehiclePdfText(`
      CERTIFICADO DE REGISTRO E LICENCIAMENTO DE VEÍCULO
      PLACA GCO-6C26
      RENAVAM 12345678901
      CHASSI 9BWZZZ377VT004251
      ANO FABRICAÇÃO / ANO MODELO 2022 / 2023
      PATRIMÔNIO A10.245
      MARCA / MODELO VOLKSWAGEN SAVEIRO
    `, 'A10.245-GCO-6C26.pdf');

    expect(parsed.placa).toBe('GCO6C26');
    expect(parsed.renavam).toBe('12345678901');
    expect(parsed.chassi).toBe('9BWZZZ377VT004251');
    expect(parsed.ano_fabricacao).toBe('2022');
    expect(parsed.ano_modelo).toBe('2023');
    expect(parsed.patrimonio).toBe('A10.245');
    expect(parsed.identificacao_ativo).toBe('A10.245');
  });

  it('identifica equipamento por patrimônio e descrição', () => {
    const parsed = parseVehiclePdfText(`
      EQUIPAMENTO COMPRESSOR
      PATRIMONIO A10.149
      PLACA CUI-4B29
      ANO 2024
    `, 'A10.149.pdf');

    expect(parsed.tipo).toBe('equipamento');
    expect(parsed.patrimonio).toBe('A10.149');
    expect(parsed.placa).toBe('CUI4B29');
    expect(parsed.ano).toBe('2024');
  });
});

describe('Mensagem Inteligente de Protocolos', () => {
  it('interpreta exatamente a mensagem operacional com contexto após os ativos', () => {
    const groups = parseProtocolMessage(`
Bom dia Rodrigo,
Por favor, confeccionar os protocolos de documentos referentes aos compressores de patrimônios:
A10.245 - placa GCO-6C26
A10.192 - placa FVL-9H73
A10.149 - placa CUI-4B29
A mesma será encaminhada a empresa Construtech canteiro da Campinas aos cuidados do Lucas.
Atenciosamente,
    `);

    expect(groups).toHaveLength(1);
    expect(groups[0].cliente).toBe('Construtech');
    expect(groups[0].local).toBe('Campinas');
    expect(groups[0].responsavel).toBe('Lucas');
    expect(groups[0].itens).toEqual([
      { patrimonio: 'A10.245', placa: 'GCO6C26', descricao: '' },
      { patrimonio: 'A10.192', placa: 'FVL9H73', descricao: '' },
      { patrimonio: 'A10.149', placa: 'CUI4B29', descricao: '' },
    ]);
  });

  it('mantém grupos separados quando Cliente + Local mudam', () => {
    const groups = parseProtocolMessage(`
A10.245 - placa GCO-6C26
Empresa Construtech canteiro Campinas aos cuidados do Lucas.
A10.192 - placa FVL-9H73
Empresa Outra Cliente canteiro Goiânia aos cuidados da Maria.
    `);

    expect(groups).toHaveLength(2);
    expect(groups.map((group) => `${group.cliente}|${group.local}`)).toEqual([
      'Construtech|Campinas',
      'Outra Cliente|Goiânia',
    ]);
  });
});
