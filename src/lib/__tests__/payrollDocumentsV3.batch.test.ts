import { describe, expect, it } from 'vitest';
import { splitMultiEmployeePayrollPages } from '@/lib/payrollDocuments';

const employees = [
  ['e1', 'ADALTO JACINTO', 'TORNEIRO MECANICO'],
  ['e2', 'CRISTIAN RAFAEL SANTANA DOS SANTOS', 'AUXILIAR DE PINTOR'],
  ['e3', 'DIEGO MARTINS SILVA SANTOS', 'TECNICO MECANICO PLENO'],
  ['e4', 'KAYKY CHAFI SERVILIO', 'ASSISTENTE ADM JUNIOR'],
  ['e5', 'LEONEL DE SOUZA SANTOS', 'ENCARREGADO DE OFICINA'],
  ['e6', 'MARCELO SOARES BENTO', 'AUXILIAR OPERACIONAL PLENO'],
  ['e7', 'NACIEL SANTOS DA SILVA', 'TECNICO MECANICO JUNIOR'],
  ['e8', 'RODRIGO DE SOUZA SABINO', 'ASSISTENTE ADM JUNIOR'],
  ['e9', 'TIAGO MOREIRA DA SILVA FERREIRA', 'TECNICO MECANICO PLENO'],
].map(([id, name, cargo]) => ({ id, name, cargo, companyId: 'alqui' }));

const header = [
  'Folha de Pagamento - Adiantamento',
  'ALQUI OBRAS LTDA',
  'CNPJ/CEI: 14.464.586/0001-50 Inscrição: 146881881113 Período de: 01/08/2026 a 31/08/2026',
  'Endereço: Rua do Bosque 514 Bairro: Barra Funda Cidade: São Paulo UF: SP',
];

const block = (code: string, name: string, role: string, gross: string, previous: string, net: string) => [
  `Cód: ${code} Nome: Função: ${role}`,
  name,
  'Admissão: 01/01/2020 Situação: Ativo',
  `16 Arredondamento Atual 0,70 19 Arredondamento Anterior ${previous}`,
  `20 Adiantamento Crédito 40,00 ${gross}`,
  `Proventos: ${gross} Descontos: ${previous} Líquido: ${net}`,
];

const pages = [
  {
    page: 1,
    usedOcr: false,
    lines: [
      ...header,
      ...block('25', 'ADALTO JACINTO', 'TORNEIRO MECANICO', '1.277,59', '0,59', '1.277,00'),
      ...block('55', 'CRISTIAN RAFAEL SANTANA DOS SANTOS', 'AUXILIAR DE PINTOR', '848,21', '0,21', '848,00'),
      ...block('40', 'DIEGO MARTINS SILVA SANTOS', 'TECNICO MECANICO PLENO', '1.210,82', '0,82', '1.210,00'),
      ...block('50', 'KAYKY CHAFI SERVILIO', 'ASSISTENTE ADM JUNIOR', '309,36', '0,36', '309,00'),
      ...block('17', 'LEONEL DE SOUZA SANTOS', 'ENCARREGADO DE OFICINA', '2.320,21', '0,21', '2.320,00'),
      ...block('46', 'MARCELO SOARES BENTO', 'AUXILIAR OPERACIONAL PLENO', '1.064,09', '0,09', '1.064,00'),
      'Cód: 51 Nome: Função: TECNICO MECANICO JUNIOR',
      'NACIEL SANTOS DA SILVA',
      'Admissão: 27/02/2025 Situação: Gozo de Férias Data: 12/08/2026',
      '16 Arredondamento Atual 0,50 19 Arredondamento Anterior 0,65',
      '20 Adiantamento Crédito 40,00 365,15',
    ],
  },
  {
    page: 2,
    usedOcr: false,
    lines: [
      ...header,
      'Proventos: 365,65 Descontos: 0,65 Líquido: 365,00',
      ...block('53', 'RODRIGO DE SOUZA SABINO', 'ASSISTENTE ADM JUNIOR', '1.159,07', '0,07', '1.159,00'),
      ...block('45', 'TIAGO MOREIRA DA SILVA FERREIRA', 'TECNICO MECANICO PLENO', '1.210,13', '0,13', '1.210,00'),
    ],
  },
  {
    page: 3,
    usedOcr: false,
    lines: [
      ...header,
      'R E S U M O',
      'Lançamentos',
      '20 Adiantamento Crédito 360,00 9.760,02',
      'Proventos: 9.765,13 Descontos: 3,13 Liquido: 9.762,00',
      'Total de Funcionários: 9',
    ],
  },
].map(page => ({ ...page, text: page.lines.join('\n') }));

const byName = (result: ReturnType<typeof splitMultiEmployeePayrollPages>, name: string) => {
  const item = result.find(row => row.employeeName === name);
  expect(item, `resultado de ${name}`).toBeTruthy();
  return item!;
};

describe('payrollDocumentsV3 — folha consolidada ALQUI multi-funcionário', () => {
  it('separa os 9 funcionários sem anexar o resumo e mantém continuação entre páginas', () => {
    const result = splitMultiEmployeePayrollPages({
      pages: pages as any,
      employees,
      sourceName: 'Folha de Pagamento - Adiantamento 082026 ALQUI.pdf',
    });

    expect(result).toHaveLength(9);
    expect(new Set(result.map(row => row.employeeId)).size).toBe(9);
    expect(result.every(row => row.documentType === 'SALARY_ADVANCE')).toBe(true);
    expect(result.every(row => !row.pageNumbers.includes(3))).toBe(true);

    expect(byName(result, 'NACIEL SANTOS DA SILVA').pageNumbers).toEqual([1, 2]);
    expect(byName(result, 'RODRIGO DE SOUZA SABINO').pageNumbers).toEqual([2]);
    expect(byName(result, 'TIAGO MOREIRA DA SILVA FERREIRA').pageNumbers).toEqual([2]);
  });

  it.each([
    ['ADALTO JACINTO', 1277],
    ['CRISTIAN RAFAEL SANTANA DOS SANTOS', 848],
    ['DIEGO MARTINS SILVA SANTOS', 1210],
    ['KAYKY CHAFI SERVILIO', 309],
    ['LEONEL DE SOUZA SANTOS', 2320],
    ['MARCELO SOARES BENTO', 1064],
    ['NACIEL SANTOS DA SILVA', 365],
    ['RODRIGO DE SOUZA SABINO', 1159],
    ['TIAGO MOREIRA DA SILVA FERREIRA', 1210],
  ])('extrai o líquido individual de %s', (name, expected) => {
    const result = splitMultiEmployeePayrollPages({ pages: pages as any, employees, sourceName: 'ALQUI.pdf' });
    expect(byName(result, name).amountDetected).toBe(expected);
  });

  it('não deixa o cabeçalho do próximo funcionário dentro do documento anterior', () => {
    const result = splitMultiEmployeePayrollPages({ pages: pages as any, employees, sourceName: 'ALQUI.pdf' });
    const adalto = byName(result, 'ADALTO JACINTO');
    const cristian = byName(result, 'CRISTIAN RAFAEL SANTANA DOS SANTOS');

    expect(adalto.text).not.toContain('Cód: 55');
    expect(cristian.text).toContain('Cód: 55');
    expect(cristian.bytes.byteLength).toBeGreaterThan(500);
  });
});