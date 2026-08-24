import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildConsolidatedFuelReport, buildKmReportGroups, resolveFuelPeriod, type FuelReportRecord, type KmReportRecord } from '@/lib/abastecimentoReports';

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

  it('mantém os três PDFs executivos em A4 paisagem', () => {
    const source = readFileSync('src/lib/abastecimentoReports.ts', 'utf8');
    const landscapeDefinitions = source.match(/orientation:\s*['"]landscape['"]/g) || [];
    expect(landscapeDefinitions).toHaveLength(3);
    expect(source.match(/format:\s*['"]a4['"]/g) || []).toHaveLength(3);
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

describe('buildKmReportGroups', () => {
  const kmBase: Omit<KmReportRecord, 'id' | 'data' | 'km_inicial' | 'km_final' | 'total_rodado' | 'motivo_rota'> = {
    funcionario_id: 'f1',
    funcionario_nome: 'Carlos Mecânico',
    empresa_id: 'e1',
    empresa_nome: 'TOPAC',
    empresa: 'TOPAC',
    filial: 'Matriz',
    placa: 'ABC1D23',
    hora: '08:00:00',
    fonte_km: 'sequencia',
    status: 'concluido',
    created_at: null,
  };

  it('separa por colaborador e placa, preserva a sequência e soma somente totais válidos', () => {
    const records: KmReportRecord[] = [
      { ...kmBase, id: '2', data: '2026-08-02', km_inicial: 10100, km_final: 10250, total_rodado: 150, motivo_rota: 'Obra B' },
      { ...kmBase, id: '1', data: '2026-08-01', km_inicial: 10000, km_final: 10100, total_rodado: 100, motivo_rota: 'Obra A' },
      { ...kmBase, id: '3', data: '2026-08-03', placa: 'XYZ9Z99', km_inicial: null, km_final: 5000, total_rodado: null, motivo_rota: 'Primeira leitura', fonte_km: 'sem_base' },
    ];

    const groups = buildKmReportGroups(records);
    expect(groups).toHaveLength(2);
    expect(groups[0].placa).toBe('ABC1D23');
    expect(groups[0].records.map((record) => record.id)).toEqual(['1', '2']);
    expect(groups[0].totalRodado).toBe(250);
    expect(groups[1].totalRodado).toBe(0);
  });

  it('usa quebra de texto no PDF de KM e não corta o motivo/rota por slice', () => {
    const source = readFileSync('src/lib/abastecimentoReports.ts', 'utf8');
    const kmPdf = source.slice(source.indexOf('export const generateKmReportPdf'));
    expect(kmPdf).toContain('splitTextToSize');
    expect(kmPdf).not.toContain('motivo_rota.slice');
  });
});
