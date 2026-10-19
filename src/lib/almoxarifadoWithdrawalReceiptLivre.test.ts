import { describe, expect, it } from 'vitest';
import { withdrawalReceiptHtml } from './almoxarifadoWithdrawalReceipt';

const base = {
 id: 'abc',
 protocol: 'LIV-20261019-000001',
 createdAt: '2026-10-19T12:00:00Z',
 employee: 'Funcionário Teste',
 company: 'TOPAC MATRIZ',
 responsible: 'Almoxarifado',
 note: '',
 items: [{ codigo: 'LIVRE', nome: 'Item fora do catálogo', quantidade: 2 }],
};

describe('Ficha de carga livre', () => {
 it('diferencia documento sem estoque de baixa real', () => {
   const html = withdrawalReceiptHtml({ ...base, kind:'livre', originalText:'2 itens fora do estoque' });
   expect(html).toContain('FICHA DE CARGA LIVRE');
   expect(html).toContain('não efetua baixa');
   expect(html).toContain('TEXTO ORIGINAL DA SOLICITAÇÃO');
   expect(html).toContain('Item fora do catálogo');
 });
 it('mantém a ficha anterior para retiradas físicas', () => {
   const html = withdrawalReceiptHtml(base);
   expect(html).toContain('FICHA DE RETIRADA DE MATERIAIS');
   expect(html).not.toContain('FICHA DE CARGA LIVRE');
 });
 it('escapa HTML colado e impede markup injetado na impressão', () => {
   const html = withdrawalReceiptHtml({...base,kind:'livre',originalText:'<script>alert(1)</script>',items:[{codigo:'LIVRE',nome:'<img onerror=alert(1)>',quantidade:1}]});
   expect(html).not.toContain('<script>');
   expect(html).not.toContain('<img onerror=');
   expect(html).toContain('&lt;script&gt;');
 });
});
