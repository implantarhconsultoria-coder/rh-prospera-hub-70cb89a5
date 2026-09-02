import { describe, expect, it } from 'vitest';
import { mergeEmployeeSmartData, parseEmployeeTextLocally } from '../smartTextParser';

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

  it('extrai corretamente a mensagem bancária real sem atribuir conta falsa', () => {
    const result = parseEmployeeTextLocally(`O e-mail: erikjuan.1996@gmail.com conta bancária: Banco Bradesco agência:2466 conta corrente:33778-1
Chave Pix: 11966113197`);

    expect(result.data.email).toBe('erikjuan.1996@gmail.com');
    expect(result.data.banking.banco).toBe('Bradesco');
    expect(result.data.banking.agencia).toBe('2466');
    expect(result.data.banking.conta).toBe('33778');
    expect(result.data.banking.digito).toBe('1');
    expect(result.data.banking.chavePix).toBe('11966113197');
    expect(result.data.banking.titular).toBe('');
    expect(result.data.banking.cpfTitular).toBe('');
    expect(result.warnings).toContain('Identidade não confirmada; confira o funcionário de destino antes de aplicar.');
  });

  it('não permite que retorno remoto impreciso sobrescreva um campo determinístico', () => {
    const local = parseEmployeeTextLocally('Banco: Bradesco Agência: 2466 Conta corrente: 33778-1').data;
    const merged = mergeEmployeeSmartData(local, {
      banking: { ...local.banking, conta: 'banc', digito: '' },
    });

    expect(merged.banking.conta).toBe('33778');
    expect(merged.banking.digito).toBe('1');
  });

  it('mantem avisos quando campos essenciais nao sao identificados', () => {
    const result = parseEmployeeTextLocally('Telefone: 11999999999');
    expect(result.warnings).toContain('Nome não identificado.');
    expect(result.warnings).toContain('CPF não identificado.');
    expect(result.warnings).toContain('Cargo ou função não identificado.');
  });
});
