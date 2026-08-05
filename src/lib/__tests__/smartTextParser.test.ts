import { describe, expect, it } from 'vitest';
import { parseEmployeeTextLocally } from '../smartTextParser';

describe('parseEmployeeTextLocally', () => {
  it('preenche cadastro e dados bancarios a partir de mensagem bruta', () => {
    const result = parseEmployeeTextLocally(`
      Nome completo: Maria Clara de Souza
      CPF: 12345678901
      RG: 44.555.666-7
      Cargo: Analista Administrativa
      Salário: R$ 4.500,50
      Data de admissão: 15/08/2026
      Celular: (11) 99876-5432
      E-mail: maria.clara@example.com
      Endereço: Rua das Flores, 100 - São Paulo/SP
      Banco: Nubank
      Agência: 0001
      Conta: 123456-7
      Chave PIX: maria.clara@example.com
    `);

    expect(result.data.nome).toBe('Maria Clara de Souza');
    expect(result.data.cpf).toBe('123.456.789-01');
    expect(result.data.rg).toBe('44.555.666-7');
    expect(result.data.cargo).toBe('Analista Administrativa');
    expect(result.data.salarioBase).toBe('4500.5');
    expect(result.data.dataAdmissao).toBe('2026-08-15');
    expect(result.data.celular).toBe('(11) 99876-5432');
    expect(result.data.email).toBe('maria.clara@example.com');
    expect(result.data.banking.banco).toBe('Nubank');
    expect(result.data.banking.conta).toBe('123456');
    expect(result.data.banking.digito).toBe('7');
    expect(result.data.banking.chavePix).toBe('maria.clara@example.com');
  });

  it('mantem avisos quando campos essenciais nao sao identificados', () => {
    const result = parseEmployeeTextLocally('Telefone: 11999999999');
    expect(result.warnings).toContain('Nome não identificado.');
    expect(result.warnings).toContain('CPF não identificado.');
    expect(result.warnings).toContain('Cargo ou função não identificado.');
  });
});
