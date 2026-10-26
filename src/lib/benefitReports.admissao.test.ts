import { describe, expect, it } from 'vitest';
import { buildIndividualBenefitData, buildVRReportRows, buildVTReportRows } from './benefitReports';
import { getWorkingDays } from './workingDays';
import type { Employee, MonthlyEntry } from '@/types/database';

const funcionario = (dataAdmissao: string): Employee => ({
  id: 'func-1',
  companyId: 'empresa-1',
  dataAdmissao,
  vrAtivo: true,
  vtAtivo: true,
  vrDiario: 30,
  vtDiario: 12,
}) as Employee;

const fechar = (emp: Employee, previous: MonthlyEntry[] = []) => ({
  vr: buildVRReportRows([emp], previous, getWorkingDays('2026-10'), '2026-10'),
  vt: buildVTReportRows([emp], previous, getWorkingDays('2026-10'), '2026-10'),
});

describe('VR e VT proporcionais na admissão', () => {
  it('conta somente os dias úteis de 27/10 até 31/10 (4 dias)', () => {
    const { vr, vt } = fechar(funcionario('2026-10-27'));
    expect(vr).toHaveLength(1);
    expect(vt).toHaveLength(1);
    expect(vr[0].diasPrevistos).toBe(4);
    expect(vt[0].diasPrevistos).toBe(4);
    expect(vr[0].valorTotal).toBe(120);
    expect(vt[0].valorTotal).toBe(48);
    expect(vr[0].tipoCalculo).toBe('PROPORCIONAL_ADMISSAO');
    expect(vt[0].tipoCalculo).toBe('PROPORCIONAL_ADMISSAO');
    expect(vt[0].periodoFim).toBe('2026-10-31');
  });

  it('mantém o mês completo para admissões anteriores à competência', () => {
    const { vr, vt } = fechar(funcionario('2026-09-10'));
    expect(vr[0].diasPrevistos).toBe(getWorkingDays('2026-10'));
    expect(vt[0].diasPrevistos).toBe(getWorkingDays('2026-10'));
  });

  it('em admissão no primeiro dia útil, conta todos os dias do mês', () => {
    const { vr, vt } = fechar(funcionario('2026-10-01'));
    expect(vr[0].diasPrevistos).toBe(getWorkingDays('2026-10'));
    expect(vt[0].diasPrevistos).toBe(getWorkingDays('2026-10'));
  });

  it('não emite competência anterior à admissão', () => {
    const { vr, vt } = fechar(funcionario('2026-11-02'));
    expect(vr).toHaveLength(0);
    expect(vt).toHaveLength(0);
  });

  it('não usa dias de VR armazenados se não restarem dias úteis', () => {
    const emp = funcionario('2026-10-31'); // sábado, último dia do mês
    const entry = { employeeId: emp.id, companyId: emp.companyId, competencia: '2026-10', vrDias: 22 } as MonthlyEntry;
    const vr = buildVRReportRows([emp], [entry], 22, '2026-10');
    const vt = buildVTReportRows([emp], [entry], 22, '2026-10');
    expect(vr[0].diasPrevistos).toBe(0);
    expect(vr[0].valorTotal).toBe(0);
    expect(vt[0].diasPrevistos).toBe(0);
    expect(vt[0].valorTotal).toBe(0);
  });

  it('não aplica faltas da competência anterior a quem entrou agora', () => {
    const emp = funcionario('2026-10-27');
    const desconto = { employeeId: emp.id, companyId: emp.companyId,
      competencia: '2026-09', faltasDias: 3, statusConferencia: 'conferido' } as MonthlyEntry;
    const { vr, vt } = fechar(emp, [desconto]);
    expect(vr[0].diasDescontados).toBe(0);
    expect(vt[0].diasDescontados).toBe(0);
  });

  it('preserva abatimento de faltas do mês anterior para antigos', () => {
    const emp = funcionario('2026-09-01');
    const desconto = { employeeId: emp.id, companyId: emp.companyId,
      competencia: '2026-09', faltasDias: 2, statusConferencia: 'conferido' } as MonthlyEntry;
    const { vr, vt } = fechar(emp, [desconto]);
    expect(vr[0].diasDescontados).toBe(2);
    expect(vt[0].diasDescontados).toBe(2);
  });

  it('mantém o valor proporcional na ficha individual de VR e VT', () => {
    const emp = funcionario('2026-10-27');
    const diasUteis = getWorkingDays('2026-10');
    const vr = buildIndividualBenefitData({ emp, diasUteis, type: 'vr', competencia: '2026-10' });
    const vt = buildIndividualBenefitData({ emp, diasUteis, type: 'vt', competencia: '2026-10' });
    expect(vr?.diasPrevistos).toBe(4);
    expect(vt?.diasPrevistos).toBe(4);
    expect(vr?.valorTotal).toBe(120);
    expect(vt?.valorTotal).toBe(48);
  });
});
