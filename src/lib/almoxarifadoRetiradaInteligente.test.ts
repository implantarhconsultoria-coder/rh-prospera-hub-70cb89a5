import { describe, expect, it } from 'vitest';
import { interpretRetirada, type RetiradaStockItem } from './almoxarifadoRetiradaInteligente';

const stock: RetiradaStockItem[] = [
  { id: 'fenda', codigo_topac: '324', nome: 'CHAVE  DE FENDA', saldo: 0 },
  { id: 'jogo', codigo_topac: '8101', nome: 'JOGO DE CHAVE FENDA/PHILIPS', saldo: 0 },
  { id: 'phillips', codigo_topac: '8271', nome: 'CHAVE PHILLIPS', saldo: 6 },
  { id: 'parafuso', codigo_topac: '8350', nome: 'PARAFUSO 6X15 CHAPA PHILIPS', saldo: 65 },
  { id: 'luva-m', codigo_topac: '10', nome: 'LUVA NITRILICA M', saldo: 10 },
  { id: 'luva-g', codigo_topac: '11', nome: 'LUVA NITRILICA G', saldo: 20 },
];

describe('interpretação inteligente da retirada', () => {
  it('identifica o produto exato mesmo sem saldo e não troca por outro semelhante', () => {
    const [line] = interpretRetirada('1 CHAVE DE FENDA', stock);
    expect(line.quantidade).toBe(1);
    expect(line.suggestedId).toBe('fenda');
    expect(line.candidates[0].item.saldo).toBe(0);
  });

  it('reconhece várias linhas, plurais e quantidades', () => {
    const lines = interpretRetirada('2 chaves Phillips\n3 parafusos 6x15', stock);
    expect(lines).toHaveLength(2);
    expect(lines[0].suggestedId).toBe('phillips');
    expect(lines[0].quantidade).toBe(2);
    expect(lines[1].suggestedId).toBe('parafuso');
    expect(lines[1].quantidade).toBe(3);
  });

  it('reconhece código sozinho sem confundi-lo com quantidade', () => {
    const [line] = interpretRetirada('324', stock);
    expect(line.suggestedId).toBe('fenda');
    expect(line.quantidade).toBe(1);
  });

  it('não inventa itens ausentes nem escolhe tamanho de luva por conta própria', () => {
    const [missing] = interpretRetirada('1 PRODUTO INEXISTENTE', stock);
    const [ambiguous] = interpretRetirada('2 luvas nitrilicas', stock);
    expect(missing.issue).toBe('material');
    expect(missing.suggestedId).toBe('');
    expect(ambiguous.issue).toBe('ambiguo');
    expect(ambiguous.suggestedId).toBe('');
    expect(ambiguous.candidates).toHaveLength(2);
  });
});
