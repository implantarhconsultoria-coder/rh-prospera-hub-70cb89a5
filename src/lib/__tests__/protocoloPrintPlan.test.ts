import { describe, expect, it } from 'vitest';
import { createProtocolPrintJobs } from '../protocoloPrintPlan';

describe('Protocolos individuais por equipamento', () => {
  it('um destino e dois ativos: dois protocolos exclusivos e duas vias cada', () => {
    const groups = [{
      cliente: 'Apeng', local: 'Penha',
      itens: [
        { patrimonio: 'A10.149', placa: 'CUI4B29', pdf: 'documento-1.pdf' },
        { patrimonio: '680.240', placa: 'CLJ5C69', pdf: 'documento-2.pdf' },
      ],
    }];
    const jobs = createProtocolPrintJobs(groups);
    expect(jobs).toHaveLength(2);
    expect(jobs.map(j => j.item.patrimonio)).toEqual(['A10.149', '680.240']);
    expect(jobs.map(j => j.item.pdf)).toEqual(['documento-1.pdf', 'documento-2.pdf']);
    expect(jobs.every(j => j.copies.join(',') === '1,2')).toBe(true);
    expect(jobs.map(j => j.sequence)).toEqual([1, 2]);
  });

  it('clientes diferentes: mantém o destino original de cada ativo no lote', () => {
    const jobs = createProtocolPrintJobs([
      { cliente: 'Apeng', local: 'Penha', itens: [{ patrimonio: 'A10.149' }] },
      { cliente: 'Cliente Sul', local: 'Santos', itens: [{ patrimonio: '680.240' }] },
    ]);
    expect(jobs).toHaveLength(2);
    expect(jobs.map(j => [j.group.cliente, j.group.local, j.item.patrimonio])).toEqual([
      ['Apeng', 'Penha', 'A10.149'],
      ['Cliente Sul', 'Santos', '680.240'],
    ]);
  });

  it('sem itens não gera vias vazias', () => {
    expect(createProtocolPrintJobs([{ itens: [] }])).toEqual([]);
  });
});
