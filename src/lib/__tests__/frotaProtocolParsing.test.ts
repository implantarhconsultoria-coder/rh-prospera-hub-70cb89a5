import { describe, expect, it } from 'vitest';
import { parseMultipartFormData, parseVehiclePdfText } from '../../../api/frota-upload';
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

  it('lê multipart/form-data binário sem depender de Web Request.formData()', () => {
    const boundary = '----topac-test-boundary-123456';
    const pdf = Buffer.from('%PDF-1.7\nTOPAC-PDF-TEST\n%%EOF', 'utf8');
    const extracted = JSON.stringify({ placa: 'GCO6C26', patrimonio: 'A10.245' });
    const raw = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="extracted"\r\n\r\n${extracted}\r\n`, 'utf8'),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="A10.245.pdf"\r\nContent-Type: application/pdf\r\n\r\n`, 'utf8'),
      pdf,
      Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8'),
    ]);

    const parsed = parseMultipartFormData(raw, `multipart/form-data; boundary=${boundary}`);
    expect(parsed.fields.extracted).toBe(extracted);
    expect(parsed.files).toHaveLength(1);
    expect(parsed.files[0].filename).toBe('A10.245.pdf');
    expect(parsed.files[0].contentType).toBe('application/pdf');
    expect(parsed.files[0].data.equals(pdf)).toBe(true);
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

  it('interpreta exatamente a mensagem exibida no erro de produção', () => {
    const groups = parseProtocolMessage(`
A10.149 - placa CUI-4B29
A10.153 - placa FVB-0084

A mesma será encaminhada a empresa Construtech canteiro da Campinas aos cuidados do Lucas.

Atenciosamente,

VAI FICAR ASSIM CORRETO ??
    `);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      cliente: 'Construtech',
      local: 'Campinas',
      responsavel: 'Lucas',
    });
    expect(groups[0].itens).toEqual([
      { patrimonio: 'A10.149', placa: 'CUI4B29', descricao: '' },
      { patrimonio: 'A10.153', placa: 'FVB0084', descricao: '' },
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
