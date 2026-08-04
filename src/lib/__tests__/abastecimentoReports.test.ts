import { describe, expect, it } from 'vitest';
import { buildConsolidatedFuelReport, resolveFuelPeriod, type FuelReportRecord } from '@/lib/abastecimentoReports';

const base = {
  filial: null, placa: null, hora: '10:00:00', combustivel: 'Diesel', litros: 10, valor_por_litro: 5,
  km_atual: null, km_rodado: null, posto_nome: null, posto_cnpj: null, posto_endereco: null,
  posto_telefone: null, foto_bomba_url: null, foto_painel_url: null, recibo_pdf_url: null,
  observacao: null, status: 'concluido', created_at: null,
};

describe('buildConsolidatedFuelReport', () => {
  it('agrupa por empresa e funcionário com totais corretos', () => {
    const records: FuelReportRecord[] = [
      { ...base, id: '1', funcionario_id: 'f1', funcionario_nome: 'Ana', empresa_id: 'e1', empresa_nome: 'TOPAC', empresa: 'TOPAC', data: '2026-06-01', valor: 100 },
      { ...base, id: '2', funcionario_id: 'f1', funcionario_nome: 'Ana', empresa_id: 'e1', empresa_nome: 'TOPAC', empresa: 'TOPAC', data: '2026-06-02', valor: 80 },
      { ...base, id: '3', funcionario_id: 'f2', funcionario_nome: 'Bruno', empresa_id: 'e1', empresa_nome: 'TOPAC', empresa: 'TOPAC', data: '2026-06-03', valor: 50 },
    ];
    const result = buildConsolidatedFuelReport(records, [{ id: 'e1', nome: 'TOPAC', cnpj: '00' }]);
    expect(result).toHaveLength(1);
    expect(result[0].quantidadeTotal).toBe(3);
    expect(result[0].valorTotal).toBe(230);
    expect(result[0].funcionarios.find((item) => item.nome === 'Ana')).toMatchObject({ quantidade: 2, valorTotal: 180 });
  });
});

describe('resolveFuelPeriod', () => {
  it('resolve mês completo', () => {
    expect(resolveFuelPeriod({ mode: 'month', month: '2026-02', year: '2026', startDate: '', endDate: '' })).toMatchObject({
      startDate: '2026-02-01', endDate: '2026-02-28',
    });
  });

  it('resolve ano completo', () => {
    expect(resolveFuelPeriod({ mode: 'year', month: '', year: '2025', startDate: '', endDate: '' })).toMatchObject({
      startDate: '2025-01-01', endDate: '2025-12-31',
    });
  });
});
