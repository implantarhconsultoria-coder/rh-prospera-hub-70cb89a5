import { describe, expect, it } from 'vitest';
import { extractLikelyAmount, extractPayrollDocumentMetadata } from '@/lib/payrollDocuments';

const pageText = ({ code, name, cbo, role, net, gross, discount = '0,59' }: {
  code: string;
  name: string;
  cbo: string;
  role: string;
  net: string;
  gross: string;
  discount?: string;
}) => {
  const copy = `ALQUI OBRAS LTDA\nRUA DO BOSQUE 514\n14.464.586/0001-50\nSÃO PAULO - SP\nRECIBO DE PAGAMENTO\nADTO\nAgosto/2026\nCódigo Nome Cbo Empresa Local Depto Setor Secao Folha\n${code} ${name} ${cbo} 0 0 0 1\n${role}\nCódigo Descrição Referência Vencimentos Descontos\n16 Arredondamento Atual 0,70\n20 Adiantamento Crédito 40,00 ${gross}\n19 Arredondamento Anterior ${discount}\nTotal Vencimentos ${gross}\nTotal Descontos ${discount}\nTotal Liquido --> ${net}\nAssinatura Data`;
  return `${copy}\n${copy}`;
};

describe('payrollDocumentsV2 — layout real ADTO ALQUI', () => {
  it('classifica ADTO, lê empresa/CNPJ/competência e deduplica as duas vias da página', () => {
    const text = pageText({
      code: '25',
      name: 'ADALTO JACINTO',
      cbo: '721215',
      role: 'TORNEIRO MECANICO',
      gross: '1.277,59',
      net: '1.277,00',
    });

    const metadata = extractPayrollDocumentMetadata(text);

    expect(metadata.documentType).toBe('SALARY_ADVANCE');
    expect(metadata.documentSubtype).toBe('ADTO');
    expect(metadata.employeeCodeDetected).toBe('25');
    expect(metadata.employeeNameDetected).toBe('ADALTO JACINTO');
    expect(metadata.jobTitleDetected).toBe('TORNEIRO MECANICO');
    expect(metadata.cboDetected).toBe('721215');
    expect(metadata.companyNameDetected).toBe('ALQUI OBRAS LTDA');
    expect(metadata.cnpjDetected).toBe('14.464.586/0001-50');
    expect(metadata.competenciaDetected).toBe('2026-08');
    expect(metadata.netAmountDetected).toBe(1277);
    expect(metadata.duplicateCopiesDetected).toBe(2);
  });

  it.each([
    ['25', 'ADALTO JACINTO', '721215', 'TORNEIRO MECANICO', '1.277,59', '1.277,00', 1277],
    ['55', 'CRISTIAN RAFAEL SANTANA DOS SANTOS', '716610', 'AUXILIAR DE PINTOR', '848,21', '848,00', 848],
    ['40', 'DIEGO MARTINS SILVA SANTOS', '314120', 'TECNICO MECANICO PLENO', '1.210,82', '1.210,00', 1210],
    ['50', 'KAYKY CHAFI SERVILIO', '411010', 'ASSISTENTE ADM JUNIOR', '309,36', '309,00', 309],
    ['17', 'LEONEL DE SOUZA SANTOS', '910105', 'ENCARREGADO DE OFICINA', '2.320,21', '2.320,00', 2320],
    ['46', 'MARCELO SOARES BENTO', '414105', 'AUXILIAR OPERACIONAL PLENO', '1.064,09', '1.064,00', 1064],
    ['51', 'NACIEL SANTOS DA SILVA', '314120', 'TECNICO MECANICO JUNIOR', '365,65', '365,00', 365],
    ['53', 'RODRIGO DE SOUZA SABINO', '411010', 'ASSISTENTE ADM JUNIOR', '1.159,07', '1.159,00', 1159],
    ['45', 'TIAGO MOREIRA DA SILVA FERREIRA', '314120', 'TECNICO MECANICO PLENO', '1.210,13', '1.210,00', 1210],
  ])('extrai o Total Líquido da página de %s %s', (code, name, cbo, role, gross, net, expected) => {
    const text = pageText({ code, name, cbo, role, gross, net });
    expect(extractLikelyAmount(text)).toBe(expected);
    const metadata = extractPayrollDocumentMetadata(text);
    expect(metadata.employeeNameDetected).toBe(name);
    expect(metadata.cboDetected).toBe(cbo);
    expect(metadata.duplicateCopiesDetected).toBe(2);
  });
});
