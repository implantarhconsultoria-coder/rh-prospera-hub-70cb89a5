import { describe, expect, it } from 'vitest';
import { calcularRescisao, getVacationEntitlementDays, inferVacationAcquisitionPeriod } from '@/lib/rescisaoCalc';

const baseInput = {
  salarioBase: 3600,
  dependentes: 0,
  dataAdmissao: '2025-01-01',
  dataDesligamento: '2026-08-15',
  tipo: 'sem_justa_causa' as const,
  aviso: 'dispensado' as const,
  saldoFgtsDepositado: 10000,
};

describe('motor de rescisão por período aquisitivo', () => {
  it('aplica a tabela de dias de férias conforme faltas no período', () => {
    expect(getVacationEntitlementDays(0)).toBe(30);
    expect(getVacationEntitlementDays(5)).toBe(30);
    expect(getVacationEntitlementDays(6)).toBe(24);
    expect(getVacationEntitlementDays(15)).toBe(18);
    expect(getVacationEntitlementDays(24)).toBe(12);
    expect(getVacationEntitlementDays(33)).toBe(0);
  });

  it('infere período legado sem fingir que ele veio confirmado do banco', () => {
    expect(inferVacationAcquisitionPeriod('2024-03-10', '2025-04-01')).toEqual({
      inicio: '2024-03-10',
      fim: '2025-03-09',
      origem: 'inferido',
    });
  });

  it('gera período integral e proporcional separadamente', () => {
    const result = calcularRescisao(baseInput);
    expect(result.periodosFerias).toHaveLength(2);
    expect(result.periodosFerias[0].situacao).toBe('Em aberto');
    expect(result.periodosFerias[1].situacao).toBe('Férias proporcionais');
    expect(result.periodosFerias[1].avos).toBe(8);
    expect(result.periodosFerias[1].saldoDias).toBe(20);
    expect(result.decimoTerceiroAvos).toBe(8);
  });

  it('considera férias registradas e reduz o saldo do período', () => {
    const result = calcularRescisao({
      ...baseInput,
      feriasRegistros: [{
        id: 'ferias-1',
        periodoAquisitivoInicio: '2025-01-01',
        periodoAquisitivoFim: '2025-12-31',
        periodoGozoInicio: '2026-02-01',
        periodoGozoFim: '2026-02-20',
        diasFerias: 20,
        diasAbono: 10,
        status: 'ja_tirou',
        statusPagamento: 'pago',
      }],
    });
    expect(result.periodosFerias[0].situacao).toBe('Quitado');
    expect(result.periodosFerias[0].diasJaUtilizados).toBe(20);
    expect(result.periodosFerias[0].diasAbono).toBe(10);
    expect(result.periodosFerias[0].saldoDias).toBe(0);
  });

  it('paga em dobro o saldo cujo período concessivo expirou', () => {
    const result = calcularRescisao({
      ...baseInput,
      dataAdmissao: '2023-01-01',
      dataDesligamento: '2026-08-15',
    });
    const expired = result.periodosFerias.find((period) => period.periodoAquisitivoInicio === '2023-01-01');
    expect(expired?.situacao).toBe('Férias vencidas');
    expect(expired?.adicionalDobro).toBe(3600);
    expect(expired?.valorFerias).toBe(7200);
    expect(expired?.tercoConstitucional).toBe(2400);
  });

  it('projeta aviso indenizado para férias e 13º e limita aviso a 90 dias', () => {
    const result = calcularRescisao({
      ...baseInput,
      dataAdmissao: '2000-01-01',
      dataDesligamento: '2026-08-01',
      aviso: 'indenizado',
    });
    expect(result.diasAviso).toBe(90);
    expect(result.dataProjetadaContrato).toBe('2026-10-30');
    expect(result.decimoTerceiroAvos).toBe(10);
  });

  it('aplica multa de FGTS de 40% e 20% conforme modalidade', () => {
    expect(calcularRescisao(baseInput).multaFgts).toBe(4000);
    expect(calcularRescisao({ ...baseInput, tipo: 'acordo_mutuo_484a' }).multaFgts).toBe(2000);
    expect(calcularRescisao({ ...baseInput, tipo: 'pedido_demissao' }).multaFgts).toBe(0);
  });

  it('transforma aviso descontado em desconto detalhado', () => {
    const result = calcularRescisao({ ...baseInput, tipo: 'pedido_demissao', aviso: 'descontado' });
    expect(result.avisoPrevioDesconto).toBe(3600);
    expect(result.descontosDetalhados.some((item) => item.tipo === 'aviso_previo_descontado' && item.valor === 3600)).toBe(true);
  });

  it('separa adiantamento de 13º e demais descontos', () => {
    const result = calcularRescisao({
      ...baseInput,
      descontos: [
        { id: 'a13', tipo: 'adiantamento_13', descricao: 'Adiantamento 13º', valor: 500 },
        { id: 'vt', tipo: 'vale_transporte', descricao: 'VT', valor: 120 },
      ],
    });
    expect(result.decimoTerceiroAdiantado).toBe(500);
    expect(result.outrosDescontos).toBe(620);
    expect(result.decimoTerceiro).toBe(result.decimoTerceiroBruto - 500);
  });

  it('registra override manual apenas quando existe motivo', () => {
    const result = calcularRescisao({
      ...baseInput,
      overrides: [{
        campo: 'saldoSalario',
        valorAutomatico: 0,
        valorManual: 1000,
        motivo: 'Ajuste conferido com folha',
      }],
    });
    expect(result.saldoSalario).toBe(1000);
    expect(result.alteracoesManuais[0].campo).toBe('saldoSalario');
    expect(result.alteracoesManuais[0].valorAutomatico).toBe(1800);
  });

  it('justa causa não gera férias proporcionais nem 13º proporcional', () => {
    const result = calcularRescisao({ ...baseInput, tipo: 'justa_causa' });
    expect(result.feriasProporcionais).toBe(0);
    expect(result.decimoTerceiroAvos).toBe(0);
    expect(result.decimoTerceiroBruto).toBe(0);
  });
});
