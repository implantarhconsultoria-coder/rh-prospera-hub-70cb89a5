import { describe, expect, it } from 'vitest';
import {
  EPI_CODES,
  EPI_RESPONSIBILITY_TEXT,
  addMonthsIsoDate,
  buildEpiSnapshot,
  classifyEpiRole,
  consolidateEpiNeeds,
  getEligibleEpiCodes,
  isEpiRenewalAlert,
  isEpiRenewalOverdue,
} from '@/lib/epiRules';

const catalog = [
  { codigo: EPI_CODES.mascaraAirTox, nome: 'Máscara Respiratória Air Tox II', ca: '5757', grupo: 'Exclusivo Pintor', quantidade_padrao: 1, ordem: 10, ativo: true },
  { codigo: EPI_CODES.protetorSolar, nome: 'Protetor Solar', grupo: 'Exclusivo Externo', quantidade_padrao: 1, ordem: 20, ativo: true },
  { codigo: EPI_CODES.abafadorConcha, nome: 'Abafador de Ruídos (Tipo Concha)', grupo: 'Proteção Auditiva', quantidade_padrao: 1, ordem: 30, ativo: true },
  { codigo: EPI_CODES.cinta, nome: 'Cinta', grupo: 'Kit Básico', quantidade_padrao: 1, ordem: 40, ativo: true },
  { codigo: EPI_CODES.luvasSeguranca, nome: 'Luvas de segurança', grupo: 'Kit Básico', quantidade_padrao: 1, ordem: 50, ativo: true },
  { codigo: EPI_CODES.cremeProtetor, nome: 'Creme protetor', grupo: 'Kit Básico', quantidade_padrao: 1, ordem: 60, ativo: true },
  { codigo: EPI_CODES.oculosProtecao, nome: 'Óculos de proteção', grupo: 'Kit Básico', quantidade_padrao: 1, ordem: 70, ativo: true },
  { codigo: EPI_CODES.protetorAuricular, nome: 'Protetor auricular', grupo: 'Adicional', quantidade_padrao: 1, ordem: 80, ativo: true },
  { codigo: EPI_CODES.luvasProcedimento, nome: 'Luvas de procedimento', grupo: 'Adicional', quantidade_padrao: 1, ordem: 90, ativo: true },
  { codigo: EPI_CODES.cintoSeguranca, nome: 'Cinto de segurança (EPI)', grupo: 'Adicional', quantidade_padrao: 1, ordem: 100, ativo: true },
  { codigo: 'capacete', nome: 'Capacete de segurança', grupo: 'Legado', quantidade_padrao: 1, ordem: 110, ativo: false },
];

describe('epiRules', () => {
  it('aceita somente funções de mecânica, pintura ou oficina', () => {
    expect(classifyEpiRole('TÉCNICO MECANICO JUNIOR').eligible).toBe(true);
    expect(classifyEpiRole('AUXILIAR DE PINTOR - R$1.996,14 + INSALUBRIDADE').isPainter).toBe(true);
    expect(classifyEpiRole('ENCARREGADO DE OFICINA').isWorkshop).toBe(true);
    expect(classifyEpiRole('AUXILIAR ADMINISTRATIVO').eligible).toBe(false);
  });

  it('restringe Air Tox II a pintores', () => {
    expect(getEligibleEpiCodes('PINTOR', false)).toContain(EPI_CODES.mascaraAirTox);
    expect(getEligibleEpiCodes('MECANICO SENIOR', false)).not.toContain(EPI_CODES.mascaraAirTox);
  });

  it('restringe protetor solar a mecânico externo', () => {
    expect(getEligibleEpiCodes('MECANICO SENIOR', true)).toContain(EPI_CODES.protetorSolar);
    expect(getEligibleEpiCodes('MECANICO SENIOR', false)).not.toContain(EPI_CODES.protetorSolar);
    expect(getEligibleEpiCodes('PINTOR', true)).not.toContain(EPI_CODES.protetorSolar);
  });

  it('inclui kit básico, abafador e adicionais para todos os elegíveis', () => {
    const codes = getEligibleEpiCodes('ENCARREGADO DE OFICINA', false);
    [
      EPI_CODES.abafadorConcha,
      EPI_CODES.cinta,
      EPI_CODES.luvasSeguranca,
      EPI_CODES.cremeProtetor,
      EPI_CODES.oculosProtecao,
      EPI_CODES.protetorAuricular,
      EPI_CODES.luvasProcedimento,
      EPI_CODES.cintoSeguranca,
    ].forEach((code) => expect(codes).toContain(code));
  });

  it('remove capacete da ficha mesmo se existir resíduo legado', () => {
    const items = buildEpiSnapshot(catalog, 'MECANICO SENIOR', false);
    expect(items.some((item) => /capacete/i.test(item.nome))).toBe(false);
  });

  it('mantém CA 5757 na máscara Air Tox II', () => {
    const items = buildEpiSnapshot(catalog, 'PINTOR', false);
    expect(items.find((item) => item.codigo === EPI_CODES.mascaraAirTox)?.ca).toBe('5757');
  });

  it('consolida quantidades e separa por empresa', () => {
    const first = buildEpiSnapshot(catalog, 'MECANICO SENIOR', false);
    const second = buildEpiSnapshot(catalog, 'PINTOR', false);
    const total = consolidateEpiNeeds([
      { employeeId: '1', companyId: 'c1', employeeName: 'Mecânico', cargo: 'MECANICO', companyName: 'TOPAC', mecanicoExterno: false, items: first },
      { employeeId: '2', companyId: 'c2', employeeName: 'Pintor', cargo: 'PINTOR', companyName: 'ALQUI', mecanicoExterno: false, items: second },
    ]);
    expect(total.find((item) => item.codigo === EPI_CODES.oculosProtecao)?.quantidade).toBe(2);
    expect(total.find((item) => item.codigo === EPI_CODES.mascaraAirTox)?.quantidade).toBe(1);
    expect(total.find((item) => item.codigo === EPI_CODES.oculosProtecao)?.empresas).toEqual({ TOPAC: 1, ALQUI: 1 });
  });

  it('calcula reposição em seis meses preservando fim do mês', () => {
    expect(addMonthsIsoDate('2026-08-14', 6)).toBe('2027-02-14');
    expect(addMonthsIsoDate('2026-08-31', 6)).toBe('2027-02-28');
  });

  it('dispara alerta somente nos sete dias anteriores e identifica atraso', () => {
    expect(isEpiRenewalAlert('2026-08-21', '2026-08-14')).toBe(true);
    expect(isEpiRenewalAlert('2026-08-22', '2026-08-14')).toBe(false);
    expect(isEpiRenewalAlert('2026-08-13', '2026-08-14')).toBe(false);
    expect(isEpiRenewalOverdue('2026-08-13', '2026-08-14')).toBe(true);
  });

  it('mantém o termo obrigatório da entrega semestral', () => {
    expect(EPI_RESPONSIBILITY_TEXT).toContain('KIT DE EPIs NOVOS');
    expect(EPI_RESPONSIBILITY_TEXT).toContain('em especial a NR-6');
  });
});
