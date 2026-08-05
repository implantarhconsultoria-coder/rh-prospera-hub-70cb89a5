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

  it('interpreta conta bancária compacta sem capturar a palavra bancária como número', () => {
    const result = parseBankingText(`O e-mail: erikjuan.1996@gmail.com conta bancária: Banco Bradesco agência:2466 conta corrente:33778-1
Chave Pix: 11966113197`);

    expect(result.data.banco).toBe('Bradesco');
    expect(result.data.bancoCodigo).toBe('237');
    expect(result.data.agencia).toBe('2466');
    expect(result.data.conta).toBe('33778');
    expect(result.data.digito).toBe('1');
    expect(result.data.tipoConta).toBe('Corrente');
    expect(result.data.chavePix).toBe('11966113197');
    expect(result.data.conta).not.toBe('banc');
    expect(result.warnings).toContain('Tipo da chave PIX ambíguo; revise antes de salvar.');
  });

  it('mantém avisos quando campos não são identificados', () => {
    const result = parseBankingText('Banco Nubank, chave pix 11999999999');
    expect(result.data.banco).toBe('Nubank');
    expect(result.warnings).toContain('Agência não identificada.');
    expect(result.warnings).toContain('Conta não identificada.');
  });
});
