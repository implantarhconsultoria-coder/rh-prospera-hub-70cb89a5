import { describe, expect, it } from 'vitest';
import { extrairCargaLivre, validarCargaLivre } from './almoxarifadoCargaLivre';

describe('Carga livre independente do estoque', () => {
 it('interpreta lista colada mesmo sem referência ao catálogo', () => {
   expect(extrairCargaLivre('1 chave de fenda\n2 chaves Phillips\n3 parafusos 6x15')).toEqual([
     { quantidade: 1, nome: 'chave de fenda' },
     { quantidade: 2, nome: 'chaves Phillips' },
     { quantidade: 3, nome: 'parafusos 6x15' },
   ]);
 });
 it('aceita descrições livres e lista mista', () => {
   expect(extrairCargaLivre('- 2x motor avulso\n• ferramenta sem cadastro\n4 - cabo 12mm')).toEqual([
     { quantidade: 2, nome: 'motor avulso' },
     { quantidade: 1, nome: 'ferramenta sem cadastro' },
     { quantidade: 4, nome: 'cabo 12mm' },
   ]);
 });
 it('não tenta consultar saldo, nem inventa correspondência', () => {
   const r = validarCargaLivre('1 item inexistente');
   expect(r.erro).toBeUndefined();
   expect(r.items).toEqual([{ nome:'item inexistente',quantidade:1 }]);
 });
 it('recusa lista vazia, excesso e quantidades incorretas', () => {
   expect(validarCargaLivre(' ').erro).toBeTruthy();
   expect(validarCargaLivre('0 - material').erro).toBeTruthy();
   expect(validarCargaLivre(Array(151).fill('1 teste').join('\n')).erro).toBeTruthy();
 });
});
