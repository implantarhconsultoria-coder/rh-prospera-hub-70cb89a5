import { describe, expect, it } from 'vitest';
import { parseBankingText } from '@/lib/bankingParser';

describe('parseBankingText', () => {
  it('identifica dados bancários rotulados', () => {
    const result = parseBankingText(`
      Banco: Itaú
      Agência: 1234
      Conta corrente: 98765-4
      Titular: JOAO DA SILVA
      CPF: 123.456.789-01
      Chave PIX: joao@exemplo.com
    `);
    expect(result.data.banco).toBe('Itaú Unibanco');
    expect(result.data.bancoCodigo).toBe('341');
    expect(result.data.agencia).toBe('1234');
    expect(result.data.conta).toBe('98765');
    expect(result.data.digito).toBe('4');
    expect(result.data.tipoConta.toLowerCase()).toContain('corrente');
    expect(result.data.cpfTitular).toBe('123.456.789-01');
    expect(result.data.tipoChavePix).toBe('E-mail');
  });

  it('mantém avisos quando campos não são identificados', () => {
    const result = parseBankingText('Banco Nubank, chave pix 11999999999');
    expect(result.data.banco).toBe('Nubank');
    expect(result.warnings).toContain('Agência não identificada.');
    expect(result.warnings).toContain('Conta não identificada.');
  });
});
